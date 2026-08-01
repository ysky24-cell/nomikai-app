import assert from "node:assert/strict";
import test from "node:test";
import {
  MemoryRoomRepository,
  RoomDomainError,
  RoomService,
  type RoomCommand,
  type RoomRecord,
  type RoomRepository,
} from "./domain/room.js";

function command(roomCode: string, commandId: string, expectedVersion: number, kind: RoomCommand["kind"], extra: Partial<RoomCommand> = {}): RoomCommand {
  return { roomCode, commandId, expectedVersion, kind, ...(kind === "join" ? { joinNonce: `test-${commandId}-nonce` } : {}), ...extra };
}

async function addPlayers(service: RoomService, roomCode: string, version: number, names: string[]) {
  let currentVersion = version;
  const sessions: Array<{ id: string; token: string }> = [];
  for (const [index, name] of names.entries()) {
    const joined = await service.execute(command(roomCode, `join-${index}`, currentVersion, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
    currentVersion = joined.version;
  }
  return { sessions, version: currentVersion };
}

async function createWordWolfScenario() {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const added = await addPlayers(service, host.room.code, host.room.version, ["Alice", "Bob", "Carol"]);
  const hostId = host.room.self!.id;
  const locked = await service.execute(command(host.room.code, "word-wolf-lock", added.version, "start", { participantId: hostId }), host.hostToken);
  const started = await service.execute(command(host.room.code, "word-wolf-start", locked.version, "game_start", {
    participantId: hostId,
    gameKind: "word-wolf",
    prompt: "Discuss the topic",
    majorityTopic: "cats",
    minorityTopic: "dogs",
    minorityCount: 1,
  }), host.hostToken);
  const sessions = [{ id: hostId, token: host.hostToken }, ...added.sessions];
  const privateTopics = await Promise.all(sessions.map(async (session) => ({
    id: session.id,
    projection: await service.getProjection(host.room.code, session.id, session.token),
  })));
  const minorityIds = privateTopics
    .filter((entry) => entry.projection?.game?.kind === "word-wolf" && entry.projection.game.ownTopic === "dogs")
    .map((entry) => entry.id);
  assert.equal(minorityIds.length, 1);
  const voting = await service.execute(command(host.room.code, "word-wolf-voting", started.version, "game_phase", { participantId: hostId }), host.hostToken);
  return { service, host, sessions, minorityIds, voting };
}

async function finishWordWolf(outcome: "majority" | "minority" | "draw") {
  const { service, host, sessions, minorityIds, voting } = await createWordWolfScenario();
  const minorityId = minorityIds[0]!;
  const majorityIds = sessions.filter((session) => session.id !== minorityId).map((session) => session.id);
  let version = voting.version;
  for (const [index, session] of sessions.entries()) {
    let target: string;
    if (outcome === "majority") {
      target = session.id === minorityId ? majorityIds[0]! : minorityId;
    } else if (outcome === "minority") {
      target = session.id === majorityIds[0] ? majorityIds[1]! : majorityIds[0]!;
    } else {
      const firstTarget = sessions[0]!.id;
      const secondTarget = sessions[1]!.id;
      target = index % 2 === 0 ? secondTarget : firstTarget;
    }
    const voted = await service.execute(command(host.room.code, `word-wolf-${outcome}-vote-${index}`, version, "game_vote", {
      participantId: session.id,
      voteTargetId: target,
    }), session.token);
    version = voted.version;
  }
  return service.execute(command(host.room.code, `word-wolf-${outcome}-reveal`, version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
}

test("word-wolf enforces its minimum, topics, and minorityCount", async () => {
  const tooSmallService = new RoomService(new MemoryRoomRepository());
  const tooSmallHost = await tooSmallService.createRoom("Host");
  const tooSmallPlayers = await addPlayers(tooSmallService, tooSmallHost.room.code, tooSmallHost.room.version, ["Alice", "Bob"]);
  const tooSmallLocked = await tooSmallService.execute(command(tooSmallHost.room.code, "word-wolf-too-small-lock", tooSmallPlayers.version, "start", { participantId: tooSmallHost.room.self!.id }), tooSmallHost.hostToken);
  await assert.rejects(
    tooSmallService.execute(command(tooSmallHost.room.code, "word-wolf-too-small", tooSmallLocked.version, "game_start", {
      participantId: tooSmallHost.room.self!.id,
      gameKind: "word-wolf",
      prompt: "Discuss",
      majorityTopic: "cats",
      minorityTopic: "dogs",
    }), tooSmallHost.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_enough_participants",
  );

  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const added = await addPlayers(service, host.room.code, host.room.version, ["Alice", "Bob", "Carol"]);
  const locked = await service.execute(command(host.room.code, "word-wolf-validation-lock", added.version, "start", { participantId: host.room.self!.id }), host.hostToken);

  await assert.rejects(
    service.execute(command(host.room.code, "word-wolf-missing-topics", locked.version, "game_start", {
      participantId: host.room.self!.id,
      gameKind: "word-wolf",
      prompt: "Discuss",
      majorityTopic: "cats",
    }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "topic_required",
  );
  for (const [commandId, minorityCount] of [["word-wolf-zero-minority", 0], ["word-wolf-too-many-minority", 4], ["word-wolf-fractional-minority", 1.5]] as const) {
    await assert.rejects(
      service.execute(command(host.room.code, commandId, locked.version, "game_start", {
        participantId: host.room.self!.id,
        gameKind: "word-wolf",
        prompt: "Discuss",
        majorityTopic: "cats",
        minorityTopic: "dogs",
        minorityCount,
      }), host.hostToken),
      (error: unknown) => error instanceof RoomDomainError && error.code === "minority_count_invalid",
    );
  }

  await service.execute(command(host.room.code, "word-wolf-valid", locked.version, "game_start", {
    participantId: host.room.self!.id,
    gameKind: "word-wolf",
    prompt: "Discuss the topic",
    majorityTopic: "cats",
    minorityTopic: "dogs",
    minorityCount: 2,
  }), host.hostToken);
  const sessions = [{ id: host.room.self!.id, token: host.hostToken }, ...added.sessions];
  const privateTopics = await Promise.all(sessions.map(async (session) => service.getProjection(host.room.code, session.id, session.token)));
  assert.equal(privateTopics.filter((projection) => projection?.game?.kind === "word-wolf" && projection.game.ownTopic === "dogs").length, 2);
});

test("word-wolf resolves majority, minority, and draw outcomes", async () => {
  for (const outcome of ["majority", "minority", "draw"] as const) {
    const revealed = await finishWordWolf(outcome);
    assert.equal(revealed.status, "finished");
    assert.equal(revealed.game?.kind, "word-wolf");
    assert.equal(revealed.game?.winner, outcome);
  }
});

test("werewolf accepts four or six-plus participants but rejects five", async () => {
  for (const [count, shouldStart] of [[4, true], [5, false], [6, true]] as const) {
    const service = new RoomService(new MemoryRoomRepository());
    const host = await service.createRoom("Host");
    const added = await addPlayers(
      service,
      host.room.code,
      host.room.version,
      Array.from({ length: count - 1 }, (_, index) => `Player ${index + 1}`),
    );
    const locked = await service.execute(
      command(host.room.code, `werewolf-lock-${count}`, added.version, "start", {
        participantId: host.room.self!.id,
      }),
      host.hostToken,
    );
    const start = service.execute(
      command(host.room.code, `werewolf-start-${count}`, locked.version, "game_start", {
        participantId: host.room.self!.id,
        gameKind: "werewolf",
        prompt: "Night",
      }),
      host.hostToken,
    );
    if (shouldStart) {
      const started = await start;
      assert.equal(started.game?.kind, "werewolf");
    } else {
      await assert.rejects(
        start,
        (error: unknown) => error instanceof RoomDomainError && error.code === "werewolf_player_count_invalid",
      );
    }
  }
});

test("closed rooms stay terminal after expired game deadlines", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "closed-join", host.room.version, "join", { name: "Alice" }));
  const locked = await service.execute(command(host.room.code, "closed-lock", joined.version, "start", { participantId: host.room.self!.id }), host.hostToken);
  const started = await service.execute(command(host.room.code, "closed-start", locked.version, "game_start", {
    participantId: host.room.self!.id,
    gameKind: "two-choice",
    prompt: "A/B",
    deadlineAt: 2_000,
  }), host.hostToken);
  const closed = await service.execute(command(host.room.code, "closed-close", started.version, "close", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(closed.status, "closed");
  now = 3_000;
  const projection = await service.getProjection(host.room.code, null);
  assert.equal(projection?.status, "closed");
  assert.equal(projection?.game?.kind, "two-choice");
  await assert.rejects(
    service.execute(command(host.room.code, "closed-after-deadline", closed.version, "start", { participantId: host.room.self!.id }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_closed",
  );
});

test("join replay is scoped by a client nonce and never by a bare command id", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const first = await service.execute(command(host.room.code, "join-replay", host.room.version, "join", {
    name: "Alice",
    joinNonce: "nonce-for-alice-123456",
  }));
  const replay = await service.execute(command(host.room.code, "join-replay", host.room.version, "join", {
    name: "Alice",
    joinNonce: "nonce-for-alice-123456",
  }));
  assert.equal(replay.credentials?.participantId, first.credentials?.participantId);
  await assert.rejects(
    service.execute(command(host.room.code, "join-replay", host.room.version, "join", {
      name: "Bob",
      joinNonce: "nonce-for-alice-123456",
    })),
    (error: unknown) => error instanceof RoomDomainError && error.code === "command_id_reuse",
  );
  const differentNonce = await service.execute(command(host.room.code, "join-replay", first.version, "join", {
    name: "Bob",
    joinNonce: "nonce-for-bob-123456789",
  }));
  assert.notEqual(differentNonce.credentials?.participantId, first.credentials?.participantId);
});

test("room lifecycle uses locked and finished states and permits a safe next game", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const hostId = host.room.self!.id;
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  await assert.rejects(
    service.execute(command(host.room.code, "waiting-game-start", joined.version, "game_start", { participantId: hostId, gameKind: "two-choice", prompt: "A/B" }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_not_locked",
  );
  const locked = await service.execute(command(host.room.code, "lock", joined.version, "start", { participantId: hostId }), host.hostToken);
  assert.equal(locked.status, "locked");
  await assert.rejects(
    service.execute(command(host.room.code, "too-small", locked.version, "game_start", {
      participantId: hostId,
      gameKind: "word-wolf",
      prompt: "A/B",
      majorityTopic: "cats",
      minorityTopic: "dogs",
    }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_enough_participants",
  );
  await assert.rejects(
    service.execute(command(host.room.code, "late-join", locked.version, "join", { name: "Bob" })),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_not_joinable",
  );
  const started = await service.execute(command(host.room.code, "start-choice", locked.version, "game_start", { participantId: hostId, gameKind: "two-choice", prompt: "A/B" }), host.hostToken);
  assert.equal(started.status, "playing");
  const hostAnswer = await service.execute(command(host.room.code, "answer-host", started.version, "game_answer", { participantId: hostId, choice: "A" }), host.hostToken);
  const playerAnswer = await service.execute(command(host.room.code, "answer-player", hostAnswer.version, "game_answer", { participantId: playerId, choice: "B" }), playerToken);
  const finished = await service.execute(command(host.room.code, "reveal", playerAnswer.version, "game_reveal", { participantId: hostId }), host.hostToken);
  assert.equal(finished.status, "finished");
  const waiting = await service.execute(command(host.room.code, "next-lobby", finished.version, "start", { participantId: hostId }), host.hostToken);
  assert.equal(waiting.status, "waiting");
  assert.equal("game" in waiting, false);
  const rematchLocked = await service.execute(command(host.room.code, "next-lock", waiting.version, "start", { participantId: hostId }), host.hostToken);
  assert.equal(rematchLocked.status, "locked");
  const nextGame = await service.execute(command(host.room.code, "next-game", rematchLocked.version, "game_start", { participantId: hostId, gameKind: "two-choice", prompt: "Again" }), host.hostToken);
  assert.equal(nextGame.status, "playing");
  const closed = await service.execute(command(host.room.code, "close", nextGame.version, "close", { participantId: hostId }), host.hostToken);
  await assert.rejects(
    service.execute(command(host.room.code, "after-close", closed.version, "game_start", { participantId: hostId, gameKind: "two-choice", prompt: "No" }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_closed",
  );
});

class CountingRepository implements RoomRepository {
  readonly inner: MemoryRoomRepository;
  saves = 0;

  constructor(now: () => number) {
    this.inner = new MemoryRoomRepository(now);
  }

  create(room: RoomRecord) { return this.inner.create(room); }
  get(code: string) { return this.inner.get(code); }
  async save(room: RoomRecord) {
    this.saves += 1;
    await this.inner.save(room);
  }
}

class FlakySaveRepository implements RoomRepository {
  readonly inner = new MemoryRoomRepository();
  saveAttempts = 0;
  private conflictsRemaining: number;

  constructor(conflicts = 1) {
    this.conflictsRemaining = conflicts;
  }

  create(room: RoomRecord) { return this.inner.create(room); }
  get(code: string) { return this.inner.get(code); }
  async save(room: RoomRecord) {
    this.saveAttempts += 1;
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      throw new Error("version_conflict");
    }
    await this.inner.save(room);
  }
}

test("RoomService retries an injected repository version_conflict", async () => {
  const repository = new FlakySaveRepository();
  const service = new RoomService(repository);
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "retry-join", host.room.version, "join", { name: "Alice" }));
  assert.equal(repository.saveAttempts, 2);
  assert.equal(joined.version, 1);
  assert.equal((await repository.inner.get(host.room.code))?.participants.length, 2);
});

test("MemoryRoomRepository keeps expiry deletion in cleanup and lists active codes", async () => {
  let now = 1_000;
  const repository = new MemoryRoomRepository(() => now);
  const service = new RoomService(repository, () => now);
  const host = await service.createRoom("Host");
  assert.deepEqual(await repository.listActiveCodes?.(now), [host.room.code]);
  now += 6 * 60 * 60 * 1000 + 1;
  assert.deepEqual(await repository.listActiveCodes?.(now), []);
  assert.equal(await repository.get(host.room.code), null);
  assert.equal(await service.cleanupExpired(), 1);
  assert.equal(await service.cleanupExpired(), 0);
});

test("getProjection previews expiry without saving and tick is the durable expiry path", async () => {
  let now = 1_000;
  const repository = new CountingRepository(() => now);
  const service = new RoomService(repository, () => now);
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const locked = await service.execute(command(host.room.code, "deadline-lock", joined.version, "start", { participantId: host.room.self!.id }), host.hostToken);
  const started = await service.execute(command(host.room.code, "deadline", locked.version, "game_start", {
    participantId: host.room.self!.id,
    gameKind: "two-choice",
    prompt: "Deadline",
    deadlineAt: 2_000,
  }), host.hostToken);
  assert.equal(repository.saves, 3);
  now = 2_001;
  const preview = await service.getProjection(host.room.code, null);
  assert.equal(repository.saves, 3);
  assert.equal(preview?.status, "finished");
  assert.equal(preview?.game?.kind, "two-choice");
  assert.equal(preview.game.phase, "revealed");
  const ticked = await service.tick(host.room.code);
  assert.equal(repository.saves, 4);
  assert.equal(ticked?.status, "finished");
  const persisted = await repository.inner.get(host.room.code);
  assert.equal(persisted?.status, "finished");
  assert.equal(persisted?.version, started.version + 1);
});

test("safe departure corrects reconnectable state while hidden-role departure is rejected", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  const locked = await service.execute(command(host.room.code, "choice-lock", joined.version, "start", { participantId: host.room.self!.id }), host.hostToken);
  const started = await service.execute(command(host.room.code, "choice", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "two-choice", prompt: "A/B" }), host.hostToken);
  const answered = await service.execute(command(host.room.code, "player-answer", started.version, "game_answer", { participantId: playerId, choice: "A" }), playerToken);
  const left = await service.execute(command(host.room.code, "leave", answered.version, "leave", { participantId: playerId }), playerToken);
  assert.equal(left.participants.find((participant) => participant.id === playerId)?.connected, false);
  const reconnected = await service.reconnect(host.room.code, playerId, playerToken);
  assert.equal(reconnected.version, left.version);
  assert.equal(reconnected.game?.kind, "two-choice");
  assert.equal(reconnected.game.ownAnswer, undefined);
  const resubmitted = await service.execute(command(host.room.code, "player-answer-again", reconnected.version, "game_answer", { participantId: playerId, choice: "A" }), playerToken);
  assert.equal(resubmitted.game?.kind, "two-choice");
  assert.equal(resubmitted.game.ownAnswer, "A");

  const hidden = new RoomService(new MemoryRoomRepository());
  const hiddenHost = await hidden.createRoom("Host");
  const hiddenPlayers = await addPlayers(hidden, hiddenHost.room.code, 0, ["Alice", "Bob", "Carol"]);
  const hiddenLocked = await hidden.execute(command(hiddenHost.room.code, "werewolf-lock", hiddenPlayers.version, "start", { participantId: hiddenHost.room.self!.id }), hiddenHost.hostToken);
  const hiddenStart = await hidden.execute(command(hiddenHost.room.code, "werewolf", hiddenLocked.version, "game_start", { participantId: hiddenHost.room.self!.id, gameKind: "werewolf", prompt: "Night" }), hiddenHost.hostToken);
  await assert.rejects(
    hidden.execute(command(hiddenHost.room.code, "dangerous-leave", hiddenStart.version, "leave", { participantId: hiddenPlayers.sessions[0]!.id }), hiddenPlayers.sessions[0]!.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_in_progress",
  );
});

test("stale new answer and vote commands cannot overwrite an existing submission", async () => {
  const answerService = new RoomService(new MemoryRoomRepository());
  const answerHost = await answerService.createRoom("Host");
  const answerJoined = await answerService.execute(command(answerHost.room.code, "answer-join", 0, "join", { name: "Alice" }));
  const answerLocked = await answerService.execute(command(answerHost.room.code, "answer-lock", answerJoined.version, "start", { participantId: answerHost.room.self!.id }), answerHost.hostToken);
  const answerStarted = await answerService.execute(command(answerHost.room.code, "answer-start", answerLocked.version, "game_start", {
    participantId: answerHost.room.self!.id,
    gameKind: "two-choice",
    prompt: "A/B",
  }), answerHost.hostToken);
  const firstAnswer = command(answerHost.room.code, "answer-first", answerStarted.version, "game_answer", {
    participantId: answerHost.room.self!.id,
    choice: "A",
  });
  const answered = await answerService.execute(firstAnswer, answerHost.hostToken);
  await assert.rejects(
    answerService.execute(command(answerHost.room.code, "answer-current-new", answered.version, "game_answer", {
      participantId: answerHost.room.self!.id,
      choice: "B",
    }), answerHost.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "answer_already_submitted",
  );
  await assert.rejects(
    answerService.execute(command(answerHost.room.code, "answer-stale-new", answerStarted.version, "game_answer", {
      participantId: answerHost.room.self!.id,
      choice: "B",
    }), answerHost.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "version_conflict",
  );
  const answerProjection = await answerService.getProjection(answerHost.room.code, answerHost.room.self!.id, answerHost.hostToken);
  assert.equal(answerProjection?.game?.kind === "two-choice" ? answerProjection.game.ownAnswer : undefined, "A");
  assert.deepEqual(await answerService.execute(firstAnswer, answerHost.hostToken), answered);

  const voteService = new RoomService(new MemoryRoomRepository());
  const voteHost = await voteService.createRoom("Host");
  const voteAdded = await addPlayers(voteService, voteHost.room.code, voteHost.room.version, ["Alice", "Bob"]);
  const voteLocked = await voteService.execute(command(voteHost.room.code, "vote-lock", voteAdded.version, "start", { participantId: voteHost.room.self!.id }), voteHost.hostToken);
  const voteStarted = await voteService.execute(command(voteHost.room.code, "vote-start", voteLocked.version, "game_start", {
    participantId: voteHost.room.self!.id,
    gameKind: "majority-game",
    prompt: "A/B",
  }), voteHost.hostToken);
  const firstVote = command(voteHost.room.code, "vote-first", voteStarted.version, "game_vote", {
    participantId: voteHost.room.self!.id,
    voteTargetId: "A",
  });
  const voted = await voteService.execute(firstVote, voteHost.hostToken);
  await assert.rejects(
    voteService.execute(command(voteHost.room.code, "vote-current-new", voted.version, "game_vote", {
      participantId: voteHost.room.self!.id,
      voteTargetId: "B",
    }), voteHost.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "vote_already_submitted",
  );
  await assert.rejects(
    voteService.execute(command(voteHost.room.code, "vote-stale-new", voteStarted.version, "game_vote", {
      participantId: voteHost.room.self!.id,
      voteTargetId: "B",
    }), voteHost.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "version_conflict",
  );
  const voteProjection = await voteService.getProjection(voteHost.room.code, voteHost.room.self!.id, voteHost.hostToken);
  assert.equal(voteProjection?.game?.kind === "majority-game" ? voteProjection.game.ownVote : undefined, "A");
  assert.deepEqual(await voteService.execute(firstVote, voteHost.hostToken), voted);
});

test("command replay is actor-bound, body-sensitive, and expires from the memory cache", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  const joinCommand = command(host.room.code, "join-once", 0, "join", { name: "Alice" });
  const first = await service.execute(joinCommand);
  assert.deepEqual(await service.execute(joinCommand), first);
  await assert.rejects(
    service.execute({ ...joinCommand, name: "Bob" }),
    (error: unknown) => error instanceof RoomDomainError && error.code === "command_id_reuse",
  );
  const player = first.credentials!;
  await assert.rejects(
    service.execute(command(host.room.code, "host-only", first.version, "start", { participantId: player.participantId }), player.reconnectToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "host_required",
  );
  now += 10 * 60 * 1000 + 1;
  const next = await service.execute(command(host.room.code, "join-after-ttl", first.version, "join", { name: "Bob" }));
  assert.equal(next.participants.length, 3);
  const stored = (service as unknown as { commandResults: Map<string, unknown> }).commandResults;
  assert.equal([...stored.keys()].some((key) => key.includes("join-once")), false);
});
