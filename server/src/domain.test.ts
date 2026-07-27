import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRoomRepository, RoomDomainError, RoomService, type RoomCommand } from "./domain/index.js";

function command(roomCode: string, commandId: string, expectedVersion: number, kind: RoomCommand["kind"], extra: Partial<RoomCommand> = {}): RoomCommand {
  return { roomCode, commandId, expectedVersion, kind, ...extra };
}

test("creates readable room credentials and keeps projection secrets private", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const created = await service.createRoom(" Host ");
  assert.match(created.room.code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.notEqual(created.hostToken, created.reconnectToken);
  assert.equal(created.room.participants[0]?.name, "Host");
  assert.equal("state" in created.room, false);
  assert.equal("hostToken" in created.room, false);
  assert.equal("reconnectToken" in created.room, false);
});

test("supports join, reconnect, permission checks, version checks and idempotent commands", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  const code = host.room.code;
  const joined = await service.execute(command(code, "join-1", 0, "join", { name: " Alice " }));
  assert.equal(joined.participants.length, 2);
  assert.ok(joined.credentials);
  assert.equal("state" in joined, false);
  const replay = await service.execute(command(code, "join-1", 0, "join", { name: " Alice " }));
  assert.deepEqual(replay, joined);
  assert.equal((await service.getProjection(code, null))?.version, 1);

  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  await assert.rejects(
    service.execute(command(code, "start-as-player", 1, "start", { participantId: playerId }), playerToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "host_required",
  );
  await assert.rejects(
    service.execute(command(code, "start-bad-token", 1, "start", { participantId: host.room.self!.id }), playerToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "token_invalid",
  );
  await assert.rejects(
    service.execute(command(code, "stale", 0, "start", { participantId: host.room.self!.id }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "version_conflict",
  );

  const left = await service.execute(command(code, "leave", 1, "leave", { participantId: playerId }), playerToken);
  assert.equal(left.participants.find((participant) => participant.id === playerId)?.connected, false);
  await assert.rejects(
    service.execute(command(code, "reconnect-bad", 2, "reconnect", { participantId: playerId }), "wrong-token"),
    (error: unknown) => error instanceof RoomDomainError && error.code === "reconnect_token_invalid",
  );
  const reconnected = await service.execute(command(code, "reconnect", 2, "reconnect", { participantId: playerId }), playerToken);
  assert.equal(reconnected.participants.find((participant) => participant.id === playerId)?.connected, true);
  await assert.rejects(
    service.execute(command(code, "kick-missing", 3, "kick", { participantId: host.room.self!.id, targetParticipantId: "missing" }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "participant_not_found",
  );
  await assert.rejects(
    service.execute(command(code, "kick-host", 3, "kick", { participantId: host.room.self!.id, targetParticipantId: host.room.self!.id }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "host_required",
  );

  now += 60_000;
  const second = await service.createRoom("Other host");
  const sameCommandId = await service.execute(command(second.room.code, "join-1", 0, "join", { name: "Alice" }));
  assert.equal(sameCommandId.participants.length, 2);
});

test("rejects duplicate nicknames and expires rooms", async () => {
  let now = 10_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const created = await service.createRoom("Host");
  await service.execute(command(created.room.code, "join", 0, "join", { name: "Alice" }));
  await assert.rejects(
    service.execute(command(created.room.code, "join-duplicate", 1, "join", { name: " ａｌｉｃｅ " })),
    (error: unknown) => error instanceof RoomDomainError && error.code === "nickname_taken",
  );
  now += 6 * 60 * 60 * 1000 + 1;
  await assert.rejects(
    service.execute(command(created.room.code, "late", 1, "join", { name: "Bob" })),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_not_found",
  );
});

test("rejects new participants after the host closes the room", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const created = await service.createRoom("Host");
  await service.execute(command(created.room.code, "close", 0, "close", { participantId: created.room.self!.id }), created.hostToken);
  await assert.rejects(
    service.execute(command(created.room.code, "late-join", 1, "join", { name: "Alice" })),
    (error: unknown) => error instanceof RoomDomainError && error.code === "room_not_joinable",
  );
});

test("serializes concurrent commands so no participant update is lost", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const created = await service.createRoom("Host");
  const [first, second] = await Promise.allSettled([
    service.execute(command(created.room.code, "join-a", 0, "join", { name: "Alice" })),
    service.execute(command(created.room.code, "join-b", 0, "join", { name: "Bob" })),
  ]);
  const fulfilled = [first, second].filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<RoomService["execute"]>>> => result.status === "fulfilled");
  const rejected = [first, second].filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0] as PromiseRejectedResult).reason.code, "version_conflict");
  assert.equal((await service.getProjection(created.room.code, null))?.participants.length, 2);
});

test("keeps two-choice answers private until every participant answers", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  await service.execute(command(host.room.code, "start-choice", 1, "game_start", { participantId: host.room.self!.id, gameKind: "two-choice", prompt: "A or B?" }), host.hostToken);
  const playerAnswer = await service.execute(command(host.room.code, "answer-player", 2, "game_answer", { participantId: playerId, choice: "A" }), playerToken);
  assert.equal(playerAnswer.game?.kind, "two-choice");
  assert.equal(playerAnswer.game.ownAnswer, "A");
  assert.equal("result" in playerAnswer.game, false);
  const publicProjection = await service.getProjection(host.room.code, null);
  assert.equal(publicProjection?.game?.kind, "two-choice");
  assert.equal("ownAnswer" in publicProjection!.game!, false);
  assert.equal("result" in publicProjection!.game!, false);
  await assert.rejects(
    service.getProjection(host.room.code, playerId),
    (error: unknown) => error instanceof RoomDomainError && error.code === "token_invalid",
  );
  await service.execute(command(host.room.code, "answer-host", 3, "game_answer", { participantId: host.room.self!.id, choice: "B" }), host.hostToken);
  const revealed = await service.execute(command(host.room.code, "reveal", 4, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.deepEqual(revealed.game && revealed.game.kind === "two-choice" ? revealed.game.result : null, { A: 1, B: 1, pass: 0 });
});

test("anonymous submissions never expose author identity and follow moderation states", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  await service.execute(command(host.room.code, "start-anon", 1, "game_start", { participantId: host.room.self!.id, gameKind: "anonymous-box", prompt: "質問を投稿" }), host.hostToken);
  const submitted = await service.execute(command(host.room.code, "submit", 2, "anonymous_submit", { participantId: playerId, text: "秘密の質問" }), playerToken);
  assert.equal(submitted.game?.kind, "anonymous-box");
  assert.equal(submitted.game.ownEntry?.text, "秘密の質問");
  const publicProjection = await service.getProjection(host.room.code, null);
  assert.equal(publicProjection?.game?.kind, "anonymous-box");
  assert.equal(publicProjection!.game.entries.length, 0);
  const hostProjection = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  const entry = hostProjection!.game?.kind === "anonymous-box" ? hostProjection!.game.entries[0] : null;
  assert.ok(entry);
  assert.equal("authorId" in entry, false);
  await service.execute(command(host.room.code, "display", 3, "anonymous_moderate", { participantId: host.room.self!.id, targetEntryId: entry!.id, moderationStatus: "displayed" }), host.hostToken);
  const displayed = await service.getProjection(host.room.code, playerId, playerToken);
  assert.equal(displayed?.game?.kind, "anonymous-box");
  assert.equal(displayed!.game.entries[0]?.status, "displayed");
  assert.equal("authorId" in displayed!.game.entries[0]!, false);
});

test("word wolf assigns private topics and only reveals votes after the host closes voting", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  await service.execute(command(host.room.code, "start", 1, "game_start", { participantId: host.room.self!.id, gameKind: "word-wolf", prompt: "同じ話題", majorityTopic: "海", minorityTopic: "山", minorityCount: 1 }), host.hostToken);
  const publicProjection = await service.getProjection(host.room.code, null);
  assert.equal(publicProjection?.game?.kind, "word-wolf");
  assert.equal("ownTopic" in publicProjection!.game!, false);
  const privateProjection = await service.getProjection(host.room.code, playerId, playerToken);
  assert.equal(privateProjection?.game?.kind, "word-wolf");
  assert.ok(privateProjection!.game?.ownTopic);
  await assert.rejects(service.execute(command(host.room.code, "early-vote", 2, "game_vote", { participantId: playerId, voteTargetId: host.room.self!.id }), playerToken), (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready");
  await service.execute(command(host.room.code, "voting", 2, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  await service.execute(command(host.room.code, "vote-player", 3, "game_vote", { participantId: playerId, voteTargetId: host.room.self!.id }), playerToken);
  await service.execute(command(host.room.code, "vote-host", 4, "game_vote", { participantId: host.room.self!.id, voteTargetId: playerId }), host.hostToken);
  const revealed = await service.execute(command(host.room.code, "reveal", 5, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revealed.game?.kind, "word-wolf");
  assert.equal(revealed.game?.phase, "revealed");
  assert.ok(revealed.game?.voteResults);
});

test("word wolf advances expired phases after reconnect using the server clock", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  await service.execute(command(host.room.code, "start", 0, "game_start", { participantId: host.room.self!.id, gameKind: "word-wolf", prompt: "話題", deadlineAt: 2_000 }), host.hostToken);
  now = 2_001;
  const voting = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(voting?.game?.kind, "word-wolf");
  assert.equal(voting.game.phase, "voting");
  now = 62_002;
  const revealed = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(revealed?.game?.kind, "word-wolf");
  assert.equal(revealed.game.phase, "revealed");
});

test("werewolf resolves guard success and tied votes into a constrained revote", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions: Array<{ id: string; token: string; hostToken?: string }> = [{ id: host.room.self!.id, token: host.reconnectToken, hostToken: host.hostToken }];
  for (const name of ["Alice", "Bob", "Carol"]) {
    const joined = await service.execute(command(host.room.code, `join-${name}`, sessions.length - 1, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }
  await service.execute(command(host.room.code, "start", 3, "game_start", { participantId: host.room.self!.id, gameKind: "werewolf", prompt: "夜の議論" }), host.hostToken);
  const roles = new Map<string, string>();
  for (const session of sessions) {
    const privateProjection = await service.getProjection(host.room.code, session.id, session.id === host.room.self!.id ? host.reconnectToken : session.token);
    roles.set(session.id, privateProjection?.game?.kind === "werewolf" ? privateProjection.game.ownRole ?? "" : "");
  }
  const wolf = sessions.find((session) => roles.get(session.id) === "werewolf")!;
  const guard = sessions.find((session) => roles.get(session.id) === "guard")!;
  const target = sessions.find((session) => session.id !== wolf.id && session.id !== guard.id)!;
  const tokenFor = (session: { id: string; token: string }) => session.id === host.room.self!.id ? host.hostToken : session.token;
  await service.execute(command(host.room.code, "kill", 4, "werewolf_action", { participantId: wolf.id, action: "kill", targetParticipantId: target.id }), tokenFor(wolf));
  await service.execute(command(host.room.code, "guard", 5, "werewolf_action", { participantId: guard.id, action: "guard", targetParticipantId: target.id }), tokenFor(guard));
  const day = await service.execute(command(host.room.code, "day", 6, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(day.game?.kind, "werewolf");
  assert.ok(day.game?.aliveIds.includes(target.id));
  await service.execute(command(host.room.code, "voting", 7, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  const alive = day.game?.kind === "werewolf" ? day.game.aliveIds : [];
  const a = alive[0];
  const b = alive[1];
  for (const [index, session] of sessions.filter((item) => alive.includes(item.id)).entries()) {
    await service.execute(command(host.room.code, `vote-${index}`, 8 + index, "game_vote", { participantId: session.id, voteTargetId: index % 2 === 0 ? a : b }), session.id === host.room.self!.id ? host.hostToken : session.token);
  }
  const revote = await service.execute(command(host.room.code, "tie", 12, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revote.game?.kind, "werewolf");
  assert.equal(revote.game?.phase, "revote");
  assert.equal(revote.game?.tiedTargetIds?.length, 2);
  const constrainedTarget = revote.game?.kind === "werewolf" ? revote.game.tiedTargetIds?.[0] : undefined;
  assert.ok(constrainedTarget);
  for (const [index, session] of sessions.filter((item) => (revote.game?.kind === "werewolf" ? revote.game.aliveIds.includes(item.id) : false)).entries()) {
    await service.execute(command(host.room.code, `revote-${index}`, 13 + index, "game_vote", { participantId: session.id, voteTargetId: constrainedTarget }), tokenFor(session));
  }
  const afterRevote = await service.execute(command(host.room.code, "resolve-revote", 17, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(afterRevote.game?.kind, "werewolf");
  assert.equal(afterRevote.game.phase === "day" || afterRevote.game.phase === "finished", true);
  assert.equal(afterRevote.game.aliveIds.includes(constrainedTarget), false);
});

test("werewolf auto-advances expired night and voting phases on reconnect", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  for (const name of ["Alice", "Bob", "Carol"]) await service.execute(command(host.room.code, `join-${name}`, (await service.getProjection(host.room.code, null))!.version, "join", { name }));
  await service.execute(command(host.room.code, "start", 3, "game_start", { participantId: host.room.self!.id, gameKind: "werewolf", prompt: "夜", deadlineAt: 2_000 }), host.hostToken);
  now = 2_001;
  const day = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(day?.game?.kind, "werewolf");
  assert.equal(day.game.phase, "day");
  now = 62_002;
  const voting = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(voting?.game?.kind, "werewolf");
  assert.equal(voting.game.phase, "voting");
});
