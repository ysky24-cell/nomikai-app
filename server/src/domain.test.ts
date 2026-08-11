import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRoomRepository, RoomDomainError, RoomService, type RoomCommand } from "./domain/index.js";
import { validateLegacyInput } from "./domain/room.js";

function command(roomCode: string, commandId: string, expectedVersion: number, kind: RoomCommand["kind"], extra: Partial<RoomCommand> = {}): RoomCommand {
  return { roomCode, commandId, expectedVersion, kind, ...(kind === "join" ? { joinNonce: `test-${commandId}-nonce` } : {}), ...extra };
}

async function lockRoom(service: RoomService, roomCode: string, version: number, participantId: string, token: string, commandId: string) {
  return service.execute(command(roomCode, commandId, version, "start", { participantId }), token);
}

async function createRoomWithPlayers(names: string[]) {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions = [{ id: host.room.self!.id, token: host.hostToken }];
  let version = host.room.version;
  for (const [index, name] of names.entries()) {
    const joined = await service.execute(command(host.room.code, `native-join-${index}`, version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
    version = joined.version;
  }
  return { service, host, sessions, version };
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
  assert.equal(fulfilled.length, 2);
  assert.equal(rejected.length, 0);
  assert.equal((await service.getProjection(created.room.code, null))?.participants.length, 3);
});

test("keeps two-choice answers private until every participant answers", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  const locked = await lockRoom(service, host.room.code, joined.version, host.room.self!.id, host.hostToken, "lock-choice");
  const started = await service.execute(command(host.room.code, "start-choice", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "two-choice", prompt: "A or B?" }), host.hostToken);
  const playerAnswer = await service.execute(command(host.room.code, "answer-player", started.version, "game_answer", { participantId: playerId, choice: "A" }), playerToken);
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
  const hostAnswer = await service.execute(command(host.room.code, "answer-host", playerAnswer.version, "game_answer", { participantId: host.room.self!.id, choice: "B" }), host.hostToken);
  const revealed = await service.execute(command(host.room.code, "reveal", hostAnswer.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.deepEqual(revealed.game && revealed.game.kind === "two-choice" ? revealed.game.result : null, { A: 1, B: 1, pass: 0 });
});

test("impression ranking supports concurrent private votes, reconnect, and host-only reveal", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions: Array<{ id: string; token: string; host?: boolean }> = [{ id: host.room.self!.id, token: host.hostToken, host: true }];
  for (const name of ["Alice", "Bob"]) {
    const current = await service.getProjection(host.room.code, null);
    const joined = await service.execute(command(host.room.code, `join-${name}`, current!.version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }
  const locked = await lockRoom(service, host.room.code, 2, host.room.self!.id, host.hostToken, "lock-impression");
  const started = await service.execute(command(host.room.code, "start-impression", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "impression-ranking", prompt: "一番頼れそうな人は？" }), host.hostToken);
  assert.equal(started.game?.kind, "impression-ranking");
  await assert.rejects(
    service.execute(command(host.room.code, "early-reveal", started.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );

  const playerA = sessions[1];
  const playerB = sessions[2];
  const privateBeforeVote = await service.getProjection(host.room.code, playerA.id, playerA.token);
  assert.equal(privateBeforeVote?.game?.kind, "impression-ranking");
  assert.equal(privateBeforeVote.game.voteCount, 0);
  assert.equal("result" in privateBeforeVote.game, false);
  const simultaneous = await Promise.allSettled([
    service.execute(command(host.room.code, "vote-a", started.version, "game_vote", { participantId: playerA.id, voteTargetId: playerB.id }), playerA.token),
    service.execute(command(host.room.code, "vote-b", started.version, "game_vote", { participantId: playerB.id, voteTargetId: "skip" }), playerB.token),
  ]);
  assert.equal(simultaneous.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(simultaneous.filter((result) => result.status === "rejected").length, 0);
  const playerAVote = await service.getProjection(host.room.code, playerA.id, playerA.token);
  const playerBVote = await service.getProjection(host.room.code, playerB.id, playerB.token);
  assert.equal(playerAVote?.game?.kind, "impression-ranking");
  assert.equal(playerBVote?.game?.kind, "impression-ranking");
  if (!playerAVote.game.ownVote) {
    const current = await service.getProjection(host.room.code, null);
    await service.execute(command(host.room.code, "vote-a-retry", current!.version, "game_vote", { participantId: playerA.id, voteTargetId: playerB.id }), playerA.token);
  }
  if (!playerBVote.game.ownVote) {
    const current = await service.getProjection(host.room.code, null);
    await service.execute(command(host.room.code, "vote-b-retry", current!.version, "game_vote", { participantId: playerB.id, voteTargetId: "skip" }), playerB.token);
  }
  assert.equal((await service.getProjection(host.room.code, null))?.game?.kind, "impression-ranking");
  const publicBeforeReveal = await service.getProjection(host.room.code, null);
  assert.equal(publicBeforeReveal?.game?.kind, "impression-ranking");
  assert.equal("result" in publicBeforeReveal.game, false);
  const left = await service.execute(command(host.room.code, "leave-b", (await service.getProjection(host.room.code, null))!.version, "leave", { participantId: playerB.id }), playerB.token);
  assert.equal(left.participants.find((item) => item.id === playerB.id)?.connected, false);
  const reconnected = await service.execute(command(host.room.code, "reconnect-b", left.version, "reconnect", { participantId: playerB.id }), playerB.token);
  assert.equal(reconnected.participants.find((item) => item.id === playerB.id)?.connected, true);
  assert.equal(reconnected.game?.kind, "impression-ranking");
  assert.equal(reconnected.game.ownVote, undefined);
  const restoredVote = await service.execute(command(host.room.code, "vote-b-after-reconnect", reconnected.version, "game_vote", { participantId: playerB.id, voteTargetId: "skip" }), playerB.token);
  const voteHost = await service.execute(command(host.room.code, "vote-host", restoredVote.version, "game_vote", { participantId: host.room.self!.id, voteTargetId: playerA.id }), host.hostToken);
  assert.equal(voteHost.game?.kind, "impression-ranking");
  const revealed = await service.execute(command(host.room.code, "reveal", voteHost.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revealed.game?.kind, "impression-ranking");
  assert.equal(revealed.game.phase, "revealed");
  assert.deepEqual(revealed.game.result, { [playerA.id]: 1, [playerB.id]: 1, skip: 1 });
  const playerProjection = await service.getProjection(host.room.code, playerB.id, playerB.token);
  assert.equal(playerProjection?.game?.kind, "impression-ranking");
  assert.deepEqual(playerProjection.game.result, { [playerA.id]: 1, [playerB.id]: 1, skip: 1 });
});

test("majority room accepts simultaneous private votes and reveals the full result", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions: Array<{ id: string; token: string; host?: boolean }> = [{ id: host.room.self!.id, token: host.hostToken, host: true }];
  for (const name of ["Alice", "Bob"]) {
    const current = await service.getProjection(host.room.code, null);
    const joined = await service.execute(command(host.room.code, `join-${name}`, current!.version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }
  const locked = await lockRoom(service, host.room.code, 2, host.room.self!.id, host.hostToken, "lock-majority");
  const started = await service.execute(command(host.room.code, "start-majority", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "majority-game", prompt: "A or B?" }), host.hostToken);
  assert.equal(started.game?.kind, "majority-game");
  await assert.rejects(service.execute(command(host.room.code, "early-majority-reveal", started.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken), (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready");
  const votes = ["A", "B", "A"] as const;
  for (const [index, session] of sessions.entries()) {
    const current = await service.getProjection(host.room.code, null);
    await service.execute(command(host.room.code, `vote-${index}`, current!.version, "game_vote", { participantId: session.id, voteTargetId: votes[index] }), session.token);
  }
  const revealed = await service.execute(command(host.room.code, "reveal-majority", (await service.getProjection(host.room.code, null))!.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revealed.game?.kind, "majority-game");
  assert.deepEqual(revealed.game?.result, { A: 2, B: 1 });
  const playerProjection = await service.getProjection(host.room.code, sessions[1].id, sessions[1].token);
  assert.deepEqual(playerProjection?.game?.kind === "majority-game" ? playerProjection.game.result : null, { A: 2, B: 1 });
});

test("Johari v2 keeps host participation private, auto-advances both stages, and resets cleanly", async () => {
  const repository = new MemoryRoomRepository();
  const service = new RoomService(repository);
  const host = await service.createRoom("Host");
  const sessions: Array<{ id: string; token: string }> = [{ id: host.room.self!.id, token: host.hostToken }];
  for (const name of ["Alice", "Bob"]) {
    const current = await service.getProjection(host.room.code, null);
    const joined = await service.execute(command(host.room.code, `johari-join-${name}`, current!.version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }

  const hostId = sessions[0]!.id;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  const locked = await lockRoom(service, host.room.code, 2, hostId, host.hostToken, "johari-lock");
  const started = await service.execute(command(host.room.code, "johari-start", locked.version, "game_start", {
    participantId: hostId,
    gameKind: "johari-window",
    prompt: "自分と周りから見た特徴",
    johariDeckWordIds: ["w1", "w2", "w3", "w4"],
  }), host.hostToken);
  assert.equal(started.game?.kind, "johari-window");
  assert.equal(started.game.phase, "self");
  assert.equal(started.game.selfParticipantCount, 3);

  const aliceDraft = await service.execute(command(host.room.code, "johari-alice-draft", started.version, "johari_self_submit", {
    participantId: alice.id,
    selectedWordIds: ["w2"],
    submit: false,
  }), alice.token);
  assert.equal(aliceDraft.game?.kind, "johari-window");
  assert.deepEqual(aliceDraft.game.ownSelfSelection, ["w2"]);
  assert.equal(aliceDraft.game.ownSelfSubmitted, false);

  const publicSelf = await service.getProjection(host.room.code, null);
  assert.equal(publicSelf?.game?.kind, "johari-window");
  assert.equal("ownSelfSelection" in publicSelf!.game, false);
  assert.equal("ownPeerSelections" in publicSelf!.game, false);
  assert.equal("result" in publicSelf!.game, false);

  await repository.setParticipantConnected(host.room.code, alice.id, false);
  const reconnectedAlice = await service.reconnect(host.room.code, alice.id, alice.token);
  assert.equal(reconnectedAlice.game?.kind, "johari-window");
  assert.deepEqual(reconnectedAlice.game.ownSelfSelection, ["w2"]);
  assert.equal((await service.getProjection(host.room.code, hostId, host.hostToken))?.game?.kind, "johari-window");
  const hostViewBeforeSelf = await service.getProjection(host.room.code, hostId, host.hostToken);
  assert.equal(hostViewBeforeSelf?.game?.kind === "johari-window" ? hostViewBeforeSelf.game.ownSelfSelection : undefined, undefined);

  const selfResults = await Promise.all([
    service.execute(command(host.room.code, "johari-host-self", started.version, "johari_self_submit", { participantId: hostId, selectedWordIds: ["w1", "w2"] }), host.hostToken),
    service.execute(command(host.room.code, "johari-alice-self", started.version, "johari_self_submit", { participantId: alice.id, selectedWordIds: ["w2"] }), alice.token),
    service.execute(command(host.room.code, "johari-bob-self", started.version, "johari_self_submit", { participantId: bob.id, selectedWordIds: ["w3"] }), bob.token),
  ]);
  const peerStage = selfResults.find((result) => result.game?.kind === "johari-window" && result.game.phase === "peer") ?? selfResults.at(-1)!;
  assert.equal(peerStage.game?.kind, "johari-window");
  assert.equal(peerStage.game.phase, "peer");
  assert.equal(peerStage.game.selfSubmittedCount, 3);
  assert.equal(peerStage.game.peerSubmittedCount, 0);

  await assert.rejects(
    service.execute(command(host.room.code, "johari-self-too-late", peerStage.version, "johari_self_submit", { participantId: hostId, selectedWordIds: ["w4"] }), host.hostToken),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );

  const hostPeerDraft = await service.execute(command(host.room.code, "johari-host-peer-draft", peerStage.version, "johari_peer_submit", {
    participantId: hostId,
    targetParticipantId: alice.id,
    selectedWordIds: ["w1"],
    submit: false,
  }), host.hostToken);
  assert.equal(hostPeerDraft.game?.kind, "johari-window");
  assert.equal(hostPeerDraft.game.peerSubmittedCount, 0);
  assert.deepEqual(hostPeerDraft.game.ownPeerSelections?.[alice.id], ["w1"]);
  const publicPeer = await service.getProjection(host.room.code, null);
  assert.equal(publicPeer?.game?.kind, "johari-window");
  assert.equal("ownPeerSelections" in publicPeer!.game, false);
  const alicePeerView = await service.getProjection(host.room.code, alice.id, alice.token);
  assert.equal(alicePeerView?.game?.kind, "johari-window");
  assert.deepEqual(alicePeerView.game.ownPeerSelections?.[hostId], []);

  const hostPeerSubmit = await service.execute(command(host.room.code, "johari-host-peer", peerStage.version, "johari_peer_submit", {
    participantId: hostId,
    targetParticipantId: alice.id,
    selectedWordIds: ["w2"],
  }), host.hostToken);
  assert.equal(hostPeerSubmit.game?.kind, "johari-window");
  assert.equal(hostPeerSubmit.game.phase, "peer");
  assert.equal(hostPeerSubmit.game.peerSubmittedCount, 1);
  assert.equal("result" in hostPeerSubmit.game, false);

  const remainingPeerSubmissions = [
    [hostId, host.hostToken, "johari-host-bob", bob.id, ["w3"]],
    [alice.id, alice.token, "johari-alice-host", hostId, ["w1", "w3"]],
    [alice.id, alice.token, "johari-alice-bob", bob.id, ["w1"]],
    [bob.id, bob.token, "johari-bob-host", hostId, ["w2"]],
    [bob.id, bob.token, "johari-bob-alice", alice.id, ["w2", "w4"]],
  ] as const;
  const resultCommands = await Promise.all(remainingPeerSubmissions.map(([participantId, token, id, targetParticipantId, selectedWordIds]) =>
    service.execute(command(host.room.code, id, peerStage.version, "johari_peer_submit", { participantId, targetParticipantId, selectedWordIds: [...selectedWordIds] }), token),
  ));
  const finished = resultCommands.find((result) => result.game?.kind === "johari-window" && result.game.phase === "result") ?? resultCommands.at(-1)!;
  assert.equal(finished.game?.kind, "johari-window");
  assert.equal(finished.game.phase, "result");
  assert.equal(finished.status, "finished");
  assert.deepEqual(finished.game.result?.[hostId], { open: ["w1", "w2"], hidden: [], blind: ["w3"], unknown: ["w4"] });
  assert.deepEqual(finished.game.result?.[alice.id], { open: ["w2"], hidden: [], blind: ["w4"], unknown: ["w1", "w3"] });
  assert.deepEqual(finished.game.result?.[bob.id], { open: ["w3"], hidden: [], blind: ["w1"], unknown: ["w2", "w4"] });

  const publicResult = await service.getProjection(host.room.code, null);
  assert.equal(publicResult?.game?.kind, "johari-window");
  assert.equal(Object.keys(publicResult!.game.result ?? {}).length, 3);
  assert.equal("ownSelfSelection" in publicResult!.game, false);
  assert.equal("ownPeerSelections" in publicResult!.game, false);
  const playerResult = await service.getProjection(host.room.code, alice.id, alice.token);
  assert.deepEqual(playerResult?.game?.kind === "johari-window" ? playerResult.game.result : null, finished.game.result);

  const reset = await service.execute(command(host.room.code, "johari-reset", finished.version, "reset", { participantId: hostId }), host.hostToken);
  assert.equal(reset.status, "waiting");
  assert.equal(reset.game, undefined);
  const relocked = await lockRoom(service, host.room.code, reset.version, hostId, host.hostToken, "johari-relock");
  const rematch = await service.execute(command(host.room.code, "johari-rematch", relocked.version, "game_start", {
    participantId: hostId,
    gameKind: "johari-window",
    prompt: "もう一度",
    johariDeckWordIds: ["w1", "w2"],
  }), host.hostToken);
  assert.equal(rematch.game?.kind, "johari-window");
  assert.equal(rematch.game.phase, "self");
  assert.equal(rematch.game.selfSubmittedCount, 0);
});

test("anonymous submissions never expose author identity and follow moderation states", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join", 0, "join", { name: "Alice" }));
  const playerId = joined.credentials!.participantId;
  const playerToken = joined.credentials!.reconnectToken;
  const locked = await lockRoom(service, host.room.code, joined.version, host.room.self!.id, host.hostToken, "lock-anon");
  const started = await service.execute(command(host.room.code, "start-anon", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "anonymous-box", prompt: "質問を投稿" }), host.hostToken);
  const submitted = await service.execute(command(host.room.code, "submit", started.version, "anonymous_submit", { participantId: playerId, text: "秘密の質問" }), playerToken);
  assert.equal(submitted.game?.kind, "anonymous-box");
  assert.equal(submitted.game.ownEntry?.text, "秘密の質問");
  const publicProjection = await service.getProjection(host.room.code, null);
  assert.equal(publicProjection?.game?.kind, "anonymous-box");
  assert.equal(publicProjection!.game.entries.length, 0);
  const hostProjection = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  const entry = hostProjection!.game?.kind === "anonymous-box" ? hostProjection!.game.entries[0] : null;
  assert.ok(entry);
  assert.equal("authorId" in entry, false);
  await service.execute(command(host.room.code, "display", submitted.version, "anonymous_moderate", { participantId: host.room.self!.id, targetEntryId: entry!.id, moderationStatus: "displayed" }), host.hostToken);
  const displayed = await service.getProjection(host.room.code, playerId, playerToken);
  assert.equal(displayed?.game?.kind, "anonymous-box");
  assert.equal(displayed!.game.entries[0]?.status, "displayed");
  assert.equal("authorId" in displayed!.game.entries[0]!, false);
});

test("word wolf assigns private topics and only reveals votes after the host closes voting", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions: Array<{ id: string; token: string }> = [{ id: host.room.self!.id, token: host.hostToken }];
  for (const name of ["Alice", "Bob", "Carol"]) {
    const current = await service.getProjection(host.room.code, null);
    const joined = await service.execute(command(host.room.code, `join-${name}`, current!.version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }
  const beforeStart = await service.getProjection(host.room.code, null);
  const locked = await lockRoom(service, host.room.code, beforeStart!.version, host.room.self!.id, host.hostToken, "lock-word-wolf");
  const started = await service.execute(command(host.room.code, "start", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "word-wolf", prompt: "同じ話題", majorityTopic: "海", minorityTopic: "山", minorityCount: 1 }), host.hostToken);
  const publicProjection = await service.getProjection(host.room.code, null);
  assert.equal(publicProjection?.version, started.version);
  assert.equal(publicProjection?.game?.kind, "word-wolf");
  assert.equal("ownTopic" in publicProjection!.game!, false);
  const privateProjection = await service.getProjection(host.room.code, sessions[1].id, sessions[1].token);
  assert.equal(privateProjection?.game?.kind, "word-wolf");
  assert.ok(privateProjection!.game?.ownTopic);
  await assert.rejects(service.execute(command(host.room.code, "early-vote", publicProjection!.version, "game_vote", { participantId: sessions[1].id, voteTargetId: host.room.self!.id }), sessions[1].token), (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready");
  await service.execute(command(host.room.code, "voting", publicProjection!.version, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  for (const [index, session] of sessions.entries()) {
    const current = await service.getProjection(host.room.code, null);
    const target = sessions.find((candidate) => candidate.id !== session.id)?.id ?? host.room.self!.id;
    await service.execute(command(host.room.code, `vote-${index}`, current!.version, "game_vote", { participantId: session.id, voteTargetId: target }), session.token);
  }
  const revealed = await service.execute(command(host.room.code, "reveal", (await service.getProjection(host.room.code, null))!.version, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revealed.game?.kind, "word-wolf");
  assert.equal(revealed.game?.phase, "revealed");
  assert.ok(revealed.game?.voteResults);
});

test("word wolf advances expired phases after reconnect using the server clock", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  for (const name of ["Alice", "Bob", "Carol"]) {
    const current = await service.getProjection(host.room.code, null);
    await service.execute(command(host.room.code, `join-${name}`, current!.version, "join", { name }));
  }
  const beforeStart = await service.getProjection(host.room.code, null);
  const locked = await lockRoom(service, host.room.code, beforeStart!.version, host.room.self!.id, host.hostToken, "lock-expired-word-wolf");
  await service.execute(command(host.room.code, "start", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "word-wolf", prompt: "話題", majorityTopic: "海", minorityTopic: "山", deadlineAt: 2_000 }), host.hostToken);
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
  const locked = await lockRoom(service, host.room.code, 3, host.room.self!.id, host.hostToken, "lock-werewolf");
  const started = await service.execute(command(host.room.code, "start", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "werewolf", prompt: "夜の議論" }), host.hostToken);
  const roles = new Map<string, string>();
  for (const session of sessions) {
    const privateProjection = await service.getProjection(host.room.code, session.id, session.id === host.room.self!.id ? host.reconnectToken : session.token);
    roles.set(session.id, privateProjection?.game?.kind === "werewolf" ? privateProjection.game.ownRole ?? "" : "");
  }
  const wolf = sessions.find((session) => roles.get(session.id) === "werewolf")!;
  const guard = sessions.find((session) => roles.get(session.id) === "guard")!;
  const target = sessions.find((session) => session.id !== wolf.id && session.id !== guard.id)!;
  const tokenFor = (session: { id: string; token: string }) => session.id === host.room.self!.id ? host.hostToken : session.token;
  const kill = await service.execute(command(host.room.code, "kill", started.version, "werewolf_action", { participantId: wolf.id, action: "kill", targetParticipantId: target.id }), tokenFor(wolf));
  const guardAction = await service.execute(command(host.room.code, "guard", kill.version, "werewolf_action", { participantId: guard.id, action: "guard", targetParticipantId: target.id }), tokenFor(guard));
  const day = await service.execute(command(host.room.code, "day", guardAction.version, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(day.game?.kind, "werewolf");
  assert.ok(day.game?.aliveIds.includes(target.id));
  const voting = await service.execute(command(host.room.code, "voting", day.version, "game_phase", { participantId: host.room.self!.id }), host.hostToken);
  const alive = day.game?.kind === "werewolf" ? day.game.aliveIds : [];
  const a = alive[0];
  const b = alive[1];
  let voteVersion = voting.version;
  for (const [index, session] of sessions.filter((item) => alive.includes(item.id)).entries()) {
    const vote = await service.execute(command(host.room.code, `vote-${index}`, voteVersion, "game_vote", { participantId: session.id, voteTargetId: index % 2 === 0 ? a : b }), session.id === host.room.self!.id ? host.hostToken : session.token);
    voteVersion = vote.version;
  }
  const revote = await service.execute(command(host.room.code, "tie", voteVersion, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(revote.game?.kind, "werewolf");
  assert.equal(revote.game?.phase, "revote");
  assert.equal(revote.game?.tiedTargetIds?.length, 2);
  const constrainedTarget = revote.game?.kind === "werewolf" ? revote.game.tiedTargetIds?.[0] : undefined;
  assert.ok(constrainedTarget);
  let revoteVersion = revote.version;
  for (const [index, session] of sessions.filter((item) => (revote.game?.kind === "werewolf" ? revote.game.aliveIds.includes(item.id) : false)).entries()) {
    const vote = await service.execute(command(host.room.code, `revote-${index}`, revoteVersion, "game_vote", { participantId: session.id, voteTargetId: constrainedTarget }), tokenFor(session));
    revoteVersion = vote.version;
  }
  const afterRevote = await service.execute(command(host.room.code, "resolve-revote", revoteVersion, "game_reveal", { participantId: host.room.self!.id }), host.hostToken);
  assert.equal(afterRevote.game?.kind, "werewolf");
  assert.equal(afterRevote.game.phase === "day" || afterRevote.game.phase === "finished", true);
  assert.equal(afterRevote.game.aliveIds.includes(constrainedTarget), false);
});

test("werewolf auto-advances expired night and voting phases on reconnect", async () => {
  let now = 1_000;
  const service = new RoomService(new MemoryRoomRepository(() => now), () => now);
  const host = await service.createRoom("Host");
  for (const name of ["Alice", "Bob", "Carol"]) await service.execute(command(host.room.code, `join-${name}`, (await service.getProjection(host.room.code, null))!.version, "join", { name }));
  const locked = await lockRoom(service, host.room.code, 3, host.room.self!.id, host.hostToken, "lock-expired-werewolf");
  await service.execute(command(host.room.code, "start", locked.version, "game_start", { participantId: host.room.self!.id, gameKind: "werewolf", prompt: "夜", deadlineAt: 2_000 }), host.hostToken);
  now = 2_001;
  const day = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(day?.game?.kind, "werewolf");
  assert.equal(day.game.phase, "day");
  now = 62_002;
  const voting = await service.getProjection(host.room.code, host.room.self!.id, host.reconnectToken);
  assert.equal(voting?.game?.kind, "werewolf");
  assert.equal(voting.game.phase, "voting");
});

test("all catalog games can use the generic synced input bridge", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const sessions = [{ id: host.room.self!.id, token: host.hostToken }];
  for (const name of ["Alice", "Bob"]) {
    const joined = await service.execute(command(host.room.code, `join-${name}`, (await service.getProjection(host.room.code, null))!.version, "join", { name }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
  }
  const locked = await lockRoom(service, host.room.code, 2, sessions[0].id, sessions[0].token, "lock-legacy");
  const started = await service.execute(command(host.room.code, "legacy-start", locked.version, "game_start", { participantId: sessions[0].id, gameKind: "legacy-game", legacyGameKey: "reverse-word-game", mode: "reverse", prompt: "お題" }), sessions[0].token);
  assert.equal(started.game?.kind, "legacy-game");
  const early = await service.execute(command(host.room.code, "legacy-early", started.version, "game_reveal", { participantId: sessions[0].id }), sessions[0].token).catch((error) => error);
  assert.equal(early.code, "game_not_ready");
  let version = started.version;
  let finished = started;
  for (const [index, session] of sessions.entries()) {
    const result = await service.execute(command(host.room.code, `legacy-input-${index}`, version, "legacy_input", { participantId: session.id, input: `answer-${index}` }), session.token);
    version = result.version;
    finished = result;
  }
  assert.equal(finished.game?.kind, "legacy-game");
  assert.equal(finished.game.phase, "finished");
  assert.equal(finished.game.result?.inputs[sessions[1].id], "answer-1");
  assert.match(finished.game.result?.summary ?? "", /正解/);
});

test("priority legacy games enforce typed input contracts", () => {
  assert.equal(validateLegacyInput("truth-lie-game", "2"), true);
  assert.equal(validateLegacyInput("truth-lie-game", "free text"), false);
  assert.equal(validateLegacyInput("count-up-game", "1,2,3"), true);
  assert.equal(validateLegacyInput("count-up-game", "0,2"), false);
  assert.equal(validateLegacyInput("reverse-word-game", "olleh"), true);
  assert.equal(validateLegacyInput("typing-speed-game", "入力結果|1200"), true);
  assert.equal(validateLegacyInput("typing-speed-game", "入力結果"), false);
  assert.equal(validateLegacyInput("value-meter-game", "72|甘め"), true);
  assert.equal(validateLegacyInput("value-meter-game", "72"), false);
});

test("reverse-word-game follows the turn-based room UX", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "reverse-join", 0, "join", { name: "Alice" }));
  const hostId = host.room.self!.id;
  const playerId = joined.credentials!.participantId;
  const locked = await lockRoom(service, host.room.code, joined.version, hostId, host.hostToken, "reverse-lock");
  const started = await service.execute(
    command(host.room.code, "reverse-start", locked.version, "game_start", {
      participantId: hostId,
      gameKind: "legacy-game",
      legacyGameKey: "reverse-word-game",
      prompt: "hello",
    }),
    host.hostToken,
  );
  assert.equal(started.game?.kind, "legacy-game");
  assert.equal(started.game?.progression, "turn");
  assert.equal(started.game?.currentPlayerId, hostId);

  await assert.rejects(
    service.execute(
      command(host.room.code, "reverse-out-of-turn", started.version, "legacy_input", {
        participantId: playerId,
        input: "olleh",
      }),
      joined.credentials!.reconnectToken,
    ),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
  );

  const hostInput = await service.execute(
    command(host.room.code, "reverse-host-input", started.version, "legacy_input", {
      participantId: hostId,
      input: "olleh",
    }),
    host.hostToken,
  );
  if (!hostInput.game || hostInput.game.kind !== "legacy-game") throw new Error("reverse game disappeared after host input");
  assert.equal(hostInput.game?.phase, "playing");
  assert.equal(hostInput.game?.currentPlayerId, playerId);

  const finished = await service.execute(
    command(host.room.code, "reverse-player-input", hostInput.version, "legacy_input", {
      participantId: playerId,
      input: "wrong",
    }),
    joined.credentials!.reconnectToken,
  );
  if (!finished.game || finished.game.kind !== "legacy-game") throw new Error("reverse game did not finish");
  assert.equal(finished.game?.phase, "finished");
  assert.equal(finished.game?.result?.inputs[hostId], "olleh");
  assert.equal(finished.game?.result?.scores[hostId], 1);
});

test("turn-based catalog games advance to the next player and finish a round automatically", async () => {
  const service = new RoomService(new MemoryRoomRepository());
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join-turn", 0, "join", { name: "Alice" }));
  const hostId = host.room.self!.id;
  const playerId = joined.credentials!.participantId;
  const locked = await lockRoom(service, host.room.code, joined.version, hostId, host.hostToken, "lock-turn");
  const started = await service.execute(command(host.room.code, "start-turn", locked.version, "game_start", { participantId: hostId, gameKind: "legacy-game", legacyGameKey: "yamanote", prompt: "駅名" }), host.hostToken);
  assert.equal(started.game?.kind, "legacy-game");
  assert.equal(started.game?.progression, "turn");
  const first = await service.execute(command(host.room.code, "turn-host", started.version, "legacy_input", { participantId: hostId, input: "新宿" }), host.hostToken);
  assert.equal(first.game?.kind, "legacy-game");
  assert.equal(first.game?.phase, "playing");
  assert.equal(first.game?.currentPlayerId, playerId);
  const second = await service.execute(command(host.room.code, "turn-player", first.version, "legacy_input", { participantId: playerId, input: "渋谷" }), joined.credentials!.reconnectToken);
  assert.equal(second.game?.kind, "legacy-game");
  assert.equal(second.game?.phase, "finished");
  assert.equal(second.game?.result?.inputs[playerId], "渋谷");
});

test("safe departure keeps turn and count-up games playable", async () => {
  const turnService = new RoomService(new MemoryRoomRepository());
  const turnHost = await turnService.createRoom("Host");
  const turnAlice = await turnService.execute(command(turnHost.room.code, "turn-join-a", 0, "join", { name: "Alice" }));
  const turnBob = await turnService.execute(command(turnHost.room.code, "turn-join-b", turnAlice.version, "join", { name: "Bob" }));
  const turnHostId = turnHost.room.self!.id;
  const turnAliceId = turnAlice.credentials!.participantId;
  const turnLocked = await lockRoom(turnService, turnHost.room.code, turnBob.version, turnHostId, turnHost.hostToken, "turn-departure-lock");
  const turnStarted = await turnService.execute(command(turnHost.room.code, "turn-departure-start", turnLocked.version, "game_start", {
    participantId: turnHostId,
    gameKind: "legacy-game",
    legacyGameKey: "yamanote",
    prompt: "駅名",
  }), turnHost.hostToken);
  const turnAfterHost = await turnService.execute(command(turnHost.room.code, "turn-departure-input", turnStarted.version, "legacy_input", { participantId: turnHostId, input: "新宿" }), turnHost.hostToken);
  const turnAfterLeave = await turnService.execute(command(turnHost.room.code, "turn-departure-leave", turnAfterHost.version, "leave", { participantId: turnAliceId }), turnAlice.credentials!.reconnectToken);
  assert.equal(turnAfterLeave.game?.kind, "legacy-game");
  assert.equal(turnAfterLeave.game?.currentPlayerId, turnBob.credentials!.participantId);

  const countService = new RoomService(new MemoryRoomRepository());
  const countHost = await countService.createRoom("Host");
  const countAlice = await countService.execute(command(countHost.room.code, "count-join-a", 0, "join", { name: "Alice" }));
  const countBob = await countService.execute(command(countHost.room.code, "count-join-b", countAlice.version, "join", { name: "Bob" }));
  const countHostId = countHost.room.self!.id;
  const countAliceId = countAlice.credentials!.participantId;
  const countLocked = await lockRoom(countService, countHost.room.code, countBob.version, countHostId, countHost.hostToken, "count-departure-lock");
  const countStarted = await countService.execute(command(countHost.room.code, "count-departure-start", countLocked.version, "game_start", {
    participantId: countHostId,
    gameKind: "legacy-game",
    legacyGameKey: "count-up-game",
    prompt: "目標30",
  }), countHost.hostToken);
  const countAfterHost = await countService.execute(command(countHost.room.code, "count-departure-host-input", countStarted.version, "legacy_input", { participantId: countHostId, input: "1,2,3" }), countHost.hostToken);
  const countAfterAlice = await countService.execute(command(countHost.room.code, "count-departure-alice-input", countAfterHost.version, "legacy_input", { participantId: countAliceId, input: "1,2,3" }), countAlice.credentials!.reconnectToken);
  const countAfterLeave = await countService.execute(command(countHost.room.code, "count-departure-leave", countAfterAlice.version, "leave", { participantId: countAliceId }), countAlice.credentials!.reconnectToken);
  assert.equal(countAfterLeave.game?.kind, "legacy-game");
  assert.equal(countAfterLeave.game?.currentTotal, 6);
  assert.equal(countAfterLeave.game?.currentPlayerId, countBob.credentials!.participantId);
});

test("legacy rooms created before progression was stored remain playable after reconnect", async () => {
  const repository = new MemoryRoomRepository();
  const service = new RoomService(repository);
  const host = await service.createRoom("Host");
  const joined = await service.execute(command(host.room.code, "join-old-turn", 0, "join", { name: "Alice" }));
  const hostId = host.room.self!.id;
  const locked = await lockRoom(service, host.room.code, joined.version, hostId, host.hostToken, "lock-old-turn");
  const started = await service.execute(command(host.room.code, "start-old-turn", locked.version, "game_start", { participantId: hostId, gameKind: "legacy-game", legacyGameKey: "yamanote", prompt: "駅名" }), host.hostToken);
  const oldRoom = await repository.get(host.room.code);
  assert.ok(oldRoom?.game && oldRoom.game.kind === "legacy-game");
  delete (oldRoom.game as { progression?: string }).progression;
  await repository.save(oldRoom);
  const restored = await service.getProjection(host.room.code, hostId, host.hostToken);
  assert.equal(restored?.game?.kind, "legacy-game");
  assert.equal(restored?.game?.progression, "turn");
  const submitted = await service.execute(command(host.room.code, "old-turn-answer", started.version, "legacy_input", { participantId: hostId, input: "新宿" }), host.hostToken);
  assert.equal(submitted.game?.kind, "legacy-game");
  if (submitted.game?.kind === "legacy-game") assert.equal(submitted.game.currentPlayerId, joined.credentials!.participantId);
});

test("priority legacy games resolve game-specific results after the shared reveal gate", async () => {
  const cases = [
    { key: "truth-lie-game", prompt: "お題", inputs: ["2", "2"], summary: /正解者1人/ },
    { key: "count-up-game", prompt: "目標9", inputs: ["1,2,3", "1,2"], summary: /目標9、合計9/ },
    { key: "reverse-word-game", prompt: "hello", inputs: ["olleh", "wrong"], summary: /正解者1人/ },
    { key: "typing-speed-game", prompt: "same text", inputs: ["same text|1200", "same|800"], summary: /正確入力1人、最速1200ms/ },
    { key: "value-meter-game", prompt: "今日の甘さ", inputs: ["72|甘め", "48|ふつう"], summary: /平均60.0/ },
  ] as const;
  for (const [index, game] of cases.entries()) {
    const service = new RoomService(new MemoryRoomRepository());
    const host = await service.createRoom(`Host-${index}`);
    const sessions = [{ id: host.room.self!.id, token: host.hostToken }];
    const joined = await service.execute(command(host.room.code, `join-${index}`, (await service.getProjection(host.room.code, null))!.version, "join", { name: `Player-${index}` }));
    sessions.push({ id: joined.credentials!.participantId, token: joined.credentials!.reconnectToken });
    const locked = await lockRoom(service, host.room.code, joined.version, sessions[0].id, sessions[0].token, `lock-${index}`);
    const started = await service.execute(command(host.room.code, `start-${index}`, locked.version, "game_start", { participantId: sessions[0].id, gameKind: "legacy-game", legacyGameKey: game.key, prompt: game.prompt }), sessions[0].token);
    let version = started.version;
    let finished = started;
    for (const [playerIndex, session] of sessions.entries()) {
      const result = await service.execute(command(host.room.code, `input-${index}-${playerIndex}`, version, "legacy_input", { participantId: session.id, input: game.inputs[playerIndex] }), session.token);
      version = result.version;
      finished = result;
    }
    if (game.key === "count-up-game") finished = (await service.getProjection(host.room.code, sessions[0].id, sessions[0].token))!;
    assert.ok(finished);
    assert.equal(finished.game?.kind, "legacy-game");
    assert.match(finished.game.result?.summary ?? "", game.summary);
    assert.equal(Object.keys(finished.game.result?.scores ?? {}).length, sessions.length);
  }
});

test("native NG word keeps each actor masked, records safe hits, and reconnects without leaks", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "ng-lock");
  const started = await service.execute(command(host.room.code, "ng-start", locked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "ng-word",
    prompt: "会話を楽しもう",
    ngWordDifficulty: "normal",
  }), hostSession.token);
  assert.equal(started.game?.kind, "ng-word");

  const publicView = await service.getProjection(host.room.code, null);
  if (!publicView?.game || publicView.game.kind !== "ng-word") throw new Error("NG word public projection missing");
  assert.ok(Object.values(publicView.game.assignments).every((word) => word === null));

  const aliceView = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!aliceView?.game || aliceView.game.kind !== "ng-word") throw new Error("NG word player projection missing");
  assert.equal(aliceView.game.assignments[alice.id], null);
  assert.ok(aliceView.game.assignments[bob.id]);
  assert.equal("result" in aliceView.game, false);

  await assert.rejects(
    service.execute(command(host.room.code, "ng-player-phase", started.version, "game_phase", { participantId: alice.id }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "host_required",
  );
  const playing = await service.execute(command(host.room.code, "ng-play", started.version, "game_phase", { participantId: hostSession.id }), hostSession.token);
  const hit = await service.execute(command(host.room.code, "ng-hit", playing.version, "ng_word_hit", {
    participantId: alice.id,
    targetParticipantId: bob.id,
  }), alice.token);
  if (!hit.game || hit.game.kind !== "ng-word") throw new Error("NG word hit projection missing");
  assert.equal(hit.game.hits.length, 1);
  assert.equal(hit.game.hits[0]?.markerParticipantId, alice.id);
  assert.equal(hit.game.hits[0]?.targetParticipantId, bob.id);

  const left = await service.execute(command(host.room.code, "ng-leave", hit.version, "leave", { participantId: alice.id }), alice.token);
  const reconnected = await service.execute(command(host.room.code, "ng-reconnect", left.version, "reconnect", { participantId: alice.id }), alice.token);
  if (!reconnected.game || reconnected.game.kind !== "ng-word") throw new Error("NG word reconnect projection missing");
  assert.equal(reconnected.game.assignments[alice.id], null);
  assert.ok(reconnected.game.assignments[bob.id]);
  assert.equal(reconnected.game.hits.length, 1);

  const revealed = await service.execute(command(host.room.code, "ng-reveal", reconnected.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(revealed.status, "finished");
  if (!revealed.game || revealed.game.kind !== "ng-word") throw new Error("NG word result projection missing");
  assert.ok(revealed.game.result);
  assert.equal("penalties" in revealed.game, false);
  assert.ok(revealed.game.result?.assignments[alice.id]);
});

test("native turtle soup keeps truth facilitator-only, shares classified questions, and supports rematch", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "turtle-lock");
  const started = await service.execute(command(host.room.code, "turtle-start", locked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "turtle-soup",
    prompt: "傘が盗まれた？",
    turtleSoupTruth: "答えは、主人公が傘を置き忘れたからです。",
    turtleSoupHints: ["盗難ではありません。", "置き忘れです。"],
  }), hostSession.token);
  if (!started.game || started.game.kind !== "turtle-soup") throw new Error("turtle soup start projection missing");
  assert.equal(started.game.hostTruth, "答えは、主人公が傘を置き忘れたからです。");

  const aliceBefore = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!aliceBefore?.game || aliceBefore.game.kind !== "turtle-soup") throw new Error("turtle soup player projection missing");
  assert.equal("hostTruth" in aliceBefore.game, false);
  assert.equal("truth" in aliceBefore.game, false);

  const question = await service.execute(command(host.room.code, "turtle-question", started.version, "turtle_soup_question", {
    participantId: alice.id,
    text: "誰かに盗まれましたか？",
  }), alice.token);
  if (!question.game || question.game.kind !== "turtle-soup") throw new Error("turtle soup question projection missing");
  const questionId = question.game.questions[0]?.id;
  if (!questionId) throw new Error("turtle soup question id missing");
  await assert.rejects(
    service.execute(command(host.room.code, "turtle-player-classify", question.version, "turtle_soup_classify", {
      participantId: alice.id,
      turtleSoupQuestionId: questionId,
      turtleSoupClassification: "yes",
    }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "host_required",
  );
  const hinted = await service.execute(command(host.room.code, "turtle-hint", question.version, "turtle_soup_hint", {
    participantId: hostSession.id,
    turtleSoupHintIndex: 0,
  }), hostSession.token);
  if (!hinted.game || hinted.game.kind !== "turtle-soup") throw new Error("turtle soup hint projection missing");
  assert.deepEqual(hinted.game.hints, ["盗難ではありません。"]);
  await assert.rejects(
    service.execute(command(host.room.code, "turtle-early-reveal", hinted.version, "game_reveal", { participantId: hostSession.id }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );

  const classified = await service.execute(command(host.room.code, "turtle-classify", hinted.version, "turtle_soup_classify", {
    participantId: hostSession.id,
    turtleSoupQuestionId: questionId,
    turtleSoupClassification: "yes",
  }), hostSession.token);
  const revealed = await service.execute(command(host.room.code, "turtle-reveal", classified.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(revealed.status, "finished");
  const publicResult = await service.getProjection(host.room.code, null);
  if (!publicResult?.game || publicResult.game.kind !== "turtle-soup") throw new Error("turtle soup result projection missing");
  assert.equal(publicResult.game.truth, "答えは、主人公が傘を置き忘れたからです。");

  const reset = await service.execute(command(host.room.code, "turtle-reset", revealed.version, "reset", { participantId: hostSession.id }), hostSession.token);
  const rematchLock = await lockRoom(service, host.room.code, reset.version, hostSession.id, hostSession.token, "turtle-rematch-lock");
  const rematch = await service.execute(command(host.room.code, "turtle-rematch", rematchLock.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "turtle-soup",
    prompt: "もう一度？",
  }), hostSession.token);
  assert.equal(rematch.game?.kind, "turtle-soup");
  assert.equal(rematch.status, "playing");
});

test("native Yamanote enforces roster turns, duplicate answers, and safe current-player departure", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob", "Carol"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  const carol = sessions[3]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "yamanote-lock");
  const started = await service.execute(command(host.room.code, "yamanote-start", locked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "yamanote",
    prompt: "東京の駅名",
  }), hostSession.token);
  if (!started.game || started.game.kind !== "yamanote") throw new Error("Yamanote start projection missing");
  assert.equal(started.game.currentPlayerId, hostSession.id);
  await assert.rejects(
    service.execute(command(host.room.code, "yamanote-out-of-turn", started.version, "yamanote_answer", { participantId: alice.id, yamanoteAction: "pass" }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
  );
  const hostAnswer = await service.execute(command(host.room.code, "yamanote-host-answer", started.version, "yamanote_answer", {
    participantId: hostSession.id,
    yamanoteAction: "answer",
    input: "新宿",
  }), hostSession.token);
  assert.equal(hostAnswer.game?.kind, "yamanote");
  assert.equal(hostAnswer.game?.currentPlayerId, alice.id);
  await assert.rejects(
    service.execute(command(host.room.code, "yamanote-duplicate", hostAnswer.version, "yamanote_answer", { participantId: alice.id, yamanoteAction: "answer", input: "新宿" }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "duplicate_answer",
  );
  const alicePass = await service.execute(command(host.room.code, "yamanote-alice-pass", hostAnswer.version, "yamanote_answer", { participantId: alice.id, yamanoteAction: "pass" }), alice.token);
  assert.equal(alicePass.game?.kind, "yamanote");
  assert.equal(alicePass.game?.currentPlayerId, bob.id);
  const bobLeft = await service.execute(command(host.room.code, "yamanote-bob-leave", alicePass.version, "leave", { participantId: bob.id }), bob.token);
  if (!bobLeft.game || bobLeft.game.kind !== "yamanote") throw new Error("Yamanote departure projection missing");
  assert.equal(bobLeft.game.phase, "playing");
  assert.equal(bobLeft.game.currentPlayerId, carol.id);
  assert.equal(bobLeft.game.playerOrder.includes(bob.id), false);

  const finished = await service.execute(command(host.room.code, "yamanote-carol-out", bobLeft.version, "yamanote_answer", { participantId: carol.id, yamanoteAction: "out" }), carol.token);
  assert.equal(finished.status, "finished");
  if (!finished.game || finished.game.kind !== "yamanote") throw new Error("Yamanote result projection missing");
  assert.equal(finished.game.phase, "finished");
  assert.deepEqual(finished.game.outIds, [carol.id]);
  assert.equal(finished.game.result?.answerHistory.length, 3);
});

test("native party pack supports private simultaneous answers, turn progression, deterministic reveal, and rematch", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "party-lock");
  const started = await service.execute(command(host.room.code, "party-start", locked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "party-pack",
    partyPackMode: "truth-lie",
    partyPackPromptId: "truth-lie-01",
    prompt: "3つの話のうち嘘はどれ？",
  }), hostSession.token);
  if (!started.game || started.game.kind !== "party-pack") throw new Error("party pack start projection missing");
  assert.equal(started.game.progression, "simultaneous");
  const hostPrivate = await service.getProjection(host.room.code, hostSession.id, hostSession.token);
  const alicePrivate = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!hostPrivate?.game || hostPrivate.game.kind !== "party-pack") throw new Error("party pack host projection missing");
  if (!alicePrivate?.game || alicePrivate.game.kind !== "party-pack") throw new Error("party pack player projection missing");
  assert.equal(hostPrivate.game.hostAnswer, "2");
  assert.equal("hostAnswer" in alicePrivate.game, false);

  const aliceInput = await service.execute(command(host.room.code, "party-alice-input", started.version, "party_pack_action", { participantId: alice.id, input: "1" }), alice.token);
  const bobInput = await service.execute(command(host.room.code, "party-bob-input", aliceInput.version, "party_pack_action", { participantId: bob.id, input: "2" }), bob.token);
  const aliceAfter = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!aliceAfter?.game || aliceAfter.game.kind !== "party-pack") throw new Error("party pack private answer missing");
  assert.equal(aliceAfter.game.ownInput, "1");
  assert.equal("result" in aliceAfter.game, false);
  await assert.rejects(
    service.execute(command(host.room.code, "party-early-reveal", bobInput.version, "game_reveal", { participantId: hostSession.id }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );
  const hostInput = await service.execute(command(host.room.code, "party-host-input", bobInput.version, "party_pack_action", { participantId: hostSession.id, input: "2" }), hostSession.token);
  const simultaneousResult = await service.execute(command(host.room.code, "party-reveal", hostInput.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(simultaneousResult.status, "finished");
  if (!simultaneousResult.game || simultaneousResult.game.kind !== "party-pack") throw new Error("party pack simultaneous result missing");
  assert.equal(simultaneousResult.game.result?.answer, "2");
  assert.equal(simultaneousResult.game.result?.scores[hostSession.id], 1);
  assert.equal(simultaneousResult.game.result?.scores[alice.id], 0);
  assert.equal(simultaneousResult.game.result?.scores[bob.id], 1);

  const reset = await service.execute(command(host.room.code, "party-reset", simultaneousResult.version, "reset", { participantId: hostSession.id }), hostSession.token);
  const rematchLock = await lockRoom(service, host.room.code, reset.version, hostSession.id, hostSession.token, "party-rematch-lock");
  const rematch = await service.execute(command(host.room.code, "party-rematch", rematchLock.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "party-pack",
    partyPackMode: "reverse-word",
    partyPackPromptId: "reverse-word-01",
    prompt: "さくら",
  }), hostSession.token);
  if (!rematch.game || rematch.game.kind !== "party-pack") throw new Error("party pack turn rematch missing");
  assert.equal(rematch.game.progression, "turn");
  assert.equal(rematch.game.currentPlayerId, hostSession.id);
  await assert.rejects(
    service.execute(command(host.room.code, "party-turn-out-of-turn", rematch.version, "party_pack_action", { participantId: alice.id, input: "らくさ" }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
  );
  const rematchHost = await service.execute(command(host.room.code, "party-turn-host", rematch.version, "party_pack_action", { participantId: hostSession.id, input: "らくさ" }), hostSession.token);
  const rematchAlice = await service.execute(command(host.room.code, "party-turn-alice", rematchHost.version, "party_pack_action", { participantId: alice.id, input: "くさ" }), alice.token);
  const rematchBob = await service.execute(command(host.room.code, "party-turn-bob", rematchAlice.version, "party_pack_action", { participantId: bob.id, input: "さく" }), bob.token);
  assert.equal(rematchBob.game?.kind, "party-pack");
  const rematchResult = await service.execute(command(host.room.code, "party-turn-reveal", rematchBob.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(rematchResult.status, "finished");
  assert.equal(rematchResult.game?.kind, "party-pack");
  if (rematchResult.game?.kind === "party-pack") assert.equal(rematchResult.game.result?.answer, "らくさ");
});

async function startFinalNativeGame(
  gameKind: Exclude<RoomCommand["gameKind"], "legacy-game" | undefined>,
  names: string[],
  extra: Partial<RoomCommand> = {},
) {
  const setup = await createRoomWithPlayers(names);
  const locked = await lockRoom(setup.service, setup.host.room.code, setup.version, setup.sessions[0]!.id, setup.sessions[0]!.token, `${gameKind}-lock`);
  const started = await setup.service.execute(command(setup.host.room.code, `${gameKind}-start`, locked.version, "game_start", { participantId: setup.sessions[0]!.id, gameKind, prompt: `${gameKind} prompt`, ...extra }), setup.sessions[0]!.token);
  return { ...setup, locked, started, version: started.version };
}

test("final native v2 games keep server ownership, privacy, gates, and safe lifecycle", async () => {
  const count = await startFinalNativeGame("count-up-game", ["Bob"], { countUpTarget: 3 });
  const host = count.sessions[0]!;
  const bob = count.sessions[1]!;
  await assert.rejects(count.service.execute(command(count.host.room.code, "count-wrong-turn", count.version, "count_up_increment", { participantId: bob.id, countUpIncrement: 1 }), bob.token), (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn");
  const hostOne = await count.service.execute(command(count.host.room.code, "count-one", count.version, "count_up_increment", { participantId: host.id, countUpIncrement: 1 }), host.token);
  const bobLeft = await count.service.execute(command(count.host.room.code, "count-leave", hostOne.version, "leave", { participantId: bob.id }), bob.token);
  assert.equal(bobLeft.game?.kind, "count-up-game");
  if (!bobLeft.game || bobLeft.game.kind !== "count-up-game") throw new Error("count-up departure projection missing");
  assert.equal(bobLeft.game.currentPlayerId, host.id);
  const countFinished = await count.service.execute(command(count.host.room.code, "count-last", bobLeft.version, "count_up_increment", { participantId: host.id, countUpIncrement: 2 }), host.token);
  assert.equal(countFinished.status, "finished");
  assert.equal(countFinished.game?.kind, "count-up-game");
  if (!countFinished.game || countFinished.game.kind !== "count-up-game" || !countFinished.game.result) throw new Error("count-up result missing");
  assert.equal(countFinished.game.result.loserId, host.id);
  const countReset = await count.service.execute(command(count.host.room.code, "count-reset", countFinished.version, "reset", { participantId: host.id }), host.token);
  assert.equal(countReset.status, "waiting");

  const dud = await startFinalNativeGame("dud-card-game", ["Alice", "Bob"]);
  const dudHost = dud.sessions[0]!;
  const dudPublic = dud.started.game;
  if (!dudPublic || dudPublic.kind !== "dud-card-game") throw new Error("dud start projection missing");
  assert.equal("result" in dudPublic, false);
  const dudPicks = dud.sessions.map((session, index) => dud.service.execute(command(dud.host.room.code, `dud-pick-${index}`, dud.version, "dud_card_pick", { participantId: session.id, dudCardPick: dudPublic.cardIds[index] }), session.token));
  const dudResults = await Promise.all(dudPicks);
  const dudResult = await dud.service.getProjection(dud.host.room.code, dudHost.id, dudHost.token);
  assert.equal(dudResults.length, dud.sessions.length);
  assert.equal(dudResult?.status, "finished");
  if (!dudResult?.game || dudResult.game.kind !== "dud-card-game" || !dudResult.game.result) throw new Error("dud result missing");
  assert.equal(dudResult.game.result.safeNeutral, true);
  assert.equal(Object.keys(dudResult.game.result.picks).length, dud.sessions.length);

  const safe = await startFinalNativeGame("safe-random-draw", ["Alice"]);
  if (!safe.started.game || safe.started.game.kind !== "safe-random-draw") throw new Error("safe draw start projection missing");
  const safeCards = safe.started.game.cardIds;
  const safeFirst = await safe.service.execute(command(safe.host.room.code, "safe-first", safe.version, "safe_random_pick", { participantId: safe.sessions[0]!.id, safeRandomPick: safeCards[0] }), safe.sessions[0]!.token);
  const safePrivate = await safe.service.getProjection(safe.host.room.code, safe.sessions[0]!.id, safe.sessions[0]!.token);
  const safeOther = await safe.service.getProjection(safe.host.room.code, safe.sessions[1]!.id, safe.sessions[1]!.token);
  assert.equal(safePrivate?.game?.kind, "safe-random-draw");
  if (!safePrivate?.game || safePrivate.game.kind !== "safe-random-draw" || !safeOther?.game || safeOther.game.kind !== "safe-random-draw") throw new Error("safe draw projection missing");
  assert.equal(safePrivate.game.ownPick, safeCards[0]);
  assert.equal(safeOther.game.ownPick, undefined);
  const safeDone = await safe.service.execute(command(safe.host.room.code, "safe-second", safeFirst.version, "safe_random_pick", { participantId: safe.sessions[1]!.id, safeRandomPick: safeCards[1] }), safe.sessions[1]!.token);
  assert.equal(safeDone.status, "finished");
  if (!safeDone.game || safeDone.game.kind !== "safe-random-draw" || !safeDone.game.result) throw new Error("safe draw result missing");
  assert.equal(safeDone.game.result.safeNeutral, true);
  assert.equal(Object.keys(safeDone.game.result.outcomes).length, safeCards.length);

  const territory = await startFinalNativeGame("territory-game", ["Alice"], { territoryBoardSize: 2 });
  const territoryHost = territory.sessions[0]!;
  const territoryBob = territory.sessions[1]!;
  let territoryVersion = territory.version;
  const territoryClaims: Array<[string, string, string]> = [[territoryHost.id, territoryHost.token, "A1"], [territoryBob.id, territoryBob.token, "A2"], [territoryHost.id, territoryHost.token, "B1"], [territoryBob.id, territoryBob.token, "B2"]];
  for (const [participantId, participantToken, cell] of territoryClaims) {
    const result = await territory.service.execute(command(territory.host.room.code, `territory-${cell}`, territoryVersion, "territory_claim", { participantId, territoryCell: cell }), participantToken);
    territoryVersion = result.version;
  }
  const territoryResult = await territory.service.getProjection(territory.host.room.code, territoryHost.id, territoryHost.token);
  assert.equal(territoryResult?.status, "finished");
  if (!territoryResult?.game || territoryResult.game.kind !== "territory-game" || !territoryResult.game.result) throw new Error("territory result missing");
  assert.deepEqual(territoryResult.game.result.winnerIds.sort(), [territoryHost.id, territoryBob.id].sort());

  const resource = await startFinalNativeGame("resource-negotiation-game", ["Alice", "Bob"]);
  const resourceHost = resource.sessions[0]!;
  const resourceBob = resource.sessions[1]!;
  const offerOne = await resource.service.execute(command(resource.host.room.code, "trade-one", resource.version, "resource_offer_create", { participantId: resourceHost.id, resourceOfferRecipientId: resourceBob.id, resourceOfferGive: "token:1", resourceOfferWant: "idea:1" }), resourceHost.token);
  if (!offerOne.game || offerOne.game.kind !== "resource-negotiation-game") throw new Error("resource offer projection missing");
  const offerId = offerOne.game.offers[0]!.id;
  await assert.rejects(resource.service.execute(command(resource.host.room.code, "trade-wrong-actor", offerOne.version, "resource_offer_accept", { participantId: resourceHost.id, resourceOfferId: offerId }), resourceHost.token), (error: unknown) => error instanceof RoomDomainError && error.code === "trade_recipient_required");
  const acceptedOne = await resource.service.execute(command(resource.host.room.code, "trade-accept-one", offerOne.version, "resource_offer_accept", { participantId: resourceBob.id, resourceOfferId: offerId }), resourceBob.token);
  const offerTwo = await resource.service.execute(command(resource.host.room.code, "trade-two", acceptedOne.version, "resource_offer_create", { participantId: resourceHost.id, resourceOfferRecipientId: resourceBob.id, resourceOfferGive: "token:1", resourceOfferWant: "idea:1" }), resourceHost.token);
  if (!offerTwo.game || offerTwo.game.kind !== "resource-negotiation-game") throw new Error("second resource offer projection missing");
  const offerTwoId = offerTwo.game.offers.find((offer) => offer.status === "pending")!.id;
  const resourceFinished = await resource.service.execute(command(resource.host.room.code, "trade-accept-two", offerTwo.version, "resource_offer_accept", { participantId: resourceBob.id, resourceOfferId: offerTwoId }), resourceBob.token);
  assert.equal(resourceFinished.status, "finished");
  if (!resourceFinished.game || resourceFinished.game.kind !== "resource-negotiation-game" || !resourceFinished.game.result) throw new Error("resource result missing");
  assert.equal(resourceFinished.game.result.winnerId, resourceHost.id);
  assert.equal(resourceFinished.game.result.inventories[resourceHost.id]?.idea, 3);

  const arm = await startFinalNativeGame("arm-wrestling-tournament", ["Alice", "Bob"]);
  if (!arm.started.game || arm.started.game.kind !== "arm-wrestling-tournament" || !arm.started.game.currentMatch) throw new Error("arm bracket match missing");
  const armGame = arm.started.game;
  const referee = arm.sessions.find((session) => session.id === armGame.refereeId)!;
  const competitor = arm.sessions.find((session) => session.id !== referee.id)!;
  await assert.rejects(arm.service.execute(command(arm.host.room.code, "arm-wrong-referee", arm.version, "arm_wrestling_record", { participantId: competitor.id, armWrestlingWinnerId: competitor.id }), competitor.token), (error: unknown) => error instanceof RoomDomainError && error.code === "referee_required");
  const armFinished = await arm.service.execute(command(arm.host.room.code, "arm-record", arm.version, "arm_wrestling_record", { participantId: referee.id, armWrestlingWinnerId: competitor.id }), referee.token);
  assert.equal(armFinished.status, "finished");
  if (!armFinished.game || armFinished.game.kind !== "arm-wrestling-tournament" || !armFinished.game.result) throw new Error("arm result missing");
  assert.equal(armFinished.game.result.winnerId, competitor.id);
  assert.ok(armFinished.game.result.safetyNotice.length > 0);

  const majority = await startFinalNativeGame("large-majority-game", Array.from({ length: 9 }, (_, index) => `Player-${index}`), { largeMajorityOptions: ["A", "B", "C"] });
  if (!majority.started.game || majority.started.game.kind !== "large-majority-game") throw new Error("large majority start projection missing");
  const majorityPlayers = majority.sessions;
  const majorityBase = majority.version;
  const majorityFirst = await majority.service.execute(command(majority.host.room.code, "majority-first", majorityBase, "large_majority_vote", { participantId: majorityPlayers[0]!.id, largeMajorityVote: "A" }), majorityPlayers[0]!.token);
  const majorityWaiting = await majority.service.getProjection(majority.host.room.code, majorityPlayers[1]!.id, majorityPlayers[1]!.token);
  assert.equal(majorityWaiting?.game?.kind, "large-majority-game");
  if (!majorityWaiting?.game || majorityWaiting.game.kind !== "large-majority-game") throw new Error("majority waiting projection missing");
  assert.equal(majorityWaiting.game.result, undefined);
  const remainingMajority = await Promise.all(majorityPlayers.slice(1).map((session, index) => majority.service.execute(command(majority.host.room.code, `majority-vote-${index}`, majorityFirst.version, "large_majority_vote", { participantId: session.id, largeMajorityVote: index % 2 === 0 ? "A" : "B" }), session.token)));
  const majorityFinished = await majority.service.getProjection(majority.host.room.code, majorityPlayers[0]!.id, majorityPlayers[0]!.token);
  assert.ok(remainingMajority.length === majorityPlayers.length - 1);
  assert.equal(majorityFinished?.status, "finished");
  if (!majorityFinished?.game || majorityFinished.game.kind !== "large-majority-game" || !majorityFinished.game.result) throw new Error("large majority result missing");
  assert.equal(majorityFinished.game.result.votes[majorityPlayers[0]!.id], "A");

  for (const kind of ["drinking-sugoroku", "life-event-sugoroku"] as const) {
    const sugoroku = await startFinalNativeGame(kind, ["Alice"], { sugorokuBoardLength: 6 });
    if (!sugoroku.started.game || sugoroku.started.game.kind !== kind) throw new Error(`${kind} start projection missing`);
    assert.match(sugoroku.started.game.safeNotice, /安全|休憩/);
    let version = sugoroku.version;
    let rounds = 0;
    while (true) {
      const view = await sugoroku.service.getProjection(sugoroku.host.room.code, sugoroku.sessions[0]!.id, sugoroku.sessions[0]!.token);
      const game = view?.game as { kind: typeof kind; phase: string; currentPlayerId: string | null; safeNotice: string } | undefined;
      if (!game || game.kind !== kind) throw new Error(`${kind} view missing`);
      if (game.phase === "revealed") break;
      const current = sugoroku.sessions.find((session) => session.id === game.currentPlayerId)!;
      const rolled = await sugoroku.service.execute(command(sugoroku.host.room.code, `${kind}-roll-${rounds}`, version, kind === "drinking-sugoroku" ? "drinking_sugoroku_roll" : "life_event_sugoroku_roll", { participantId: current.id }), current.token);
      version = rolled.version;
      rounds += 1;
      if (rounds > 30) throw new Error(`${kind} did not finish`);
    }
    const finished = await sugoroku.service.getProjection(sugoroku.host.room.code, sugoroku.sessions[0]!.id, sugoroku.sessions[0]!.token);
    assert.equal(finished?.status, "finished");
  }
});

test("native truth-lie keeps presenter secrets private, includes the host as a voter, and rematches cleanly", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const presenter = sessions[1]!;
  const bob = sessions[2]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "truth-native-lock");
  const started = await service.execute(command(host.room.code, "truth-native-start", locked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "truth-lie-game",
    prompt: "最近あった3つの出来事",
  }), hostSession.token);
  if (!started.game || started.game.kind !== "truth-lie-game") throw new Error("truth-lie start projection missing");
  assert.equal(started.game.presenterId, presenter.id);
  assert.equal(started.game.ownRole, "voter");
  const presenterBefore = await service.getProjection(host.room.code, presenter.id, presenter.token);
  if (!presenterBefore?.game || presenterBefore.game.kind !== "truth-lie-game") throw new Error("truth-lie presenter projection missing");
  assert.equal(presenterBefore.game.ownRole, "presenter");

  const presented = await service.execute(command(host.room.code, "truth-native-present", started.version, "truth_lie_present", {
    participantId: presenter.id,
    truthLieStatements: ["昨日は早起きした", "猫が話しかけてきた", "新しい店を見つけた"],
    truthLieLieIndex: 2,
  }), presenter.token);
  const bobBeforeVote = await service.getProjection(host.room.code, bob.id, bob.token);
  if (!bobBeforeVote?.game || bobBeforeVote.game.kind !== "truth-lie-game") throw new Error("truth-lie voter projection missing");
  assert.equal("ownLieIndex" in bobBeforeVote.game, false);
  assert.equal("result" in bobBeforeVote.game, false);
  assert.deepEqual(bobBeforeVote.game.statements, ["昨日は早起きした", "猫が話しかけてきた", "新しい店を見つけた"]);

  const hostVote = await service.execute(command(host.room.code, "truth-native-host-vote", presented.version, "truth_lie_vote", { participantId: hostSession.id, truthLieVote: 2 }), hostSession.token);
  await assert.rejects(
    service.execute(command(host.room.code, "truth-native-early-reveal", hostVote.version, "game_reveal", { participantId: hostSession.id }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );
  const bobVote = await service.execute(command(host.room.code, "truth-native-bob-vote", hostVote.version, "truth_lie_vote", { participantId: bob.id, truthLieVote: 1 }), bob.token);

  const presenterRestored = await service.execute(command(host.room.code, "truth-native-reconnect", bobVote.version, "reconnect", { participantId: presenter.id }), presenter.token);
  const presenterAfter = await service.getProjection(host.room.code, presenter.id, presenter.token);
  if (!presenterAfter?.game || presenterAfter.game.kind !== "truth-lie-game") throw new Error("truth-lie reconnect projection missing");
  assert.deepEqual(presenterAfter.game.ownStatements, ["昨日は早起きした", "猫が話しかけてきた", "新しい店を見つけた"]);
  assert.equal(presenterAfter.game.ownLieIndex, 2);
  const revealed = await service.execute(command(host.room.code, "truth-native-reveal", presenterRestored.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(revealed.status, "finished");
  if (!revealed.game || revealed.game.kind !== "truth-lie-game") throw new Error("truth-lie result projection missing");
  assert.equal(revealed.game.result?.correctCount, 1);
  assert.equal(revealed.game.result?.scores[hostSession.id], 1);
  assert.equal(revealed.game.result?.scores[presenter.id], 0);

  const reset = await service.execute(command(host.room.code, "truth-native-reset", revealed.version, "reset", { participantId: hostSession.id }), hostSession.token);
  const rematchLock = await lockRoom(service, host.room.code, reset.version, hostSession.id, hostSession.token, "truth-native-rematch-lock");
  const rematch = await service.execute(command(host.room.code, "truth-native-rematch", rematchLock.version, "game_start", { participantId: hostSession.id, gameKind: "truth-lie-game", prompt: "もう一度" }), hostSession.token);
  assert.equal(rematch.game?.kind, "truth-lie-game");
  assert.equal(rematch.status, "playing");
});

test("native reverse-word and loanword-ban keep roster turns valid across departure and record server-side outcomes", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  const locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "turn-native-lock");
  const started = await service.execute(command(host.room.code, "reverse-native-start", locked.version, "game_start", { participantId: hostSession.id, gameKind: "reverse-word-game", prompt: "hello" }), hostSession.token);
  if (!started.game || started.game.kind !== "reverse-word-game") throw new Error("reverse-word native start missing");
  assert.equal(started.game.currentPlayerId, hostSession.id);
  await assert.rejects(
    service.execute(command(host.room.code, "reverse-native-out-of-turn", started.version, "reverse_word_action", { participantId: alice.id, action: "pass" }), alice.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
  );
  const hostAnswer = await service.execute(command(host.room.code, "reverse-native-host", started.version, "reverse_word_action", { participantId: hostSession.id, action: "answer", input: "olleh" }), hostSession.token);
  assert.equal(hostAnswer.game?.kind, "reverse-word-game");
  assert.equal(hostAnswer.game?.currentPlayerId, alice.id);
  const aliceLeft = await service.execute(command(host.room.code, "reverse-native-alice-leave", hostAnswer.version, "leave", { participantId: alice.id }), alice.token);
  if (!aliceLeft.game || aliceLeft.game.kind !== "reverse-word-game") throw new Error("reverse-word departure projection missing");
  assert.equal(aliceLeft.game.currentPlayerId, bob.id);
  assert.equal(aliceLeft.game.playerOrder.includes(alice.id), false);
  const bobPass = await service.execute(command(host.room.code, "reverse-native-bob-pass", aliceLeft.version, "reverse_word_action", { participantId: bob.id, action: "pass" }), bob.token);
  assert.equal(bobPass.status, "finished");
  assert.equal(bobPass.game?.kind, "reverse-word-game");
  if (bobPass.game?.kind === "reverse-word-game") assert.equal(bobPass.game.result?.expected, "olleh");

  const reconnected = await service.execute(command(host.room.code, "turn-native-reconnect", bobPass.version, "reconnect", { participantId: alice.id }), alice.token);
  const reset = await service.execute(command(host.room.code, "turn-native-reset", reconnected.version, "reset", { participantId: hostSession.id }), hostSession.token);
  const rematchLock = await lockRoom(service, host.room.code, reset.version, hostSession.id, hostSession.token, "loanword-native-lock");
  const loanword = await service.execute(command(host.room.code, "loanword-native-start", rematchLock.version, "game_start", { participantId: hostSession.id, gameKind: "loanword-ban-game", prompt: "スマホ" }), hostSession.token);
  if (!loanword.game || loanword.game.kind !== "loanword-ban-game") throw new Error("loanword-ban native start missing");
  assert.equal(loanword.game.currentPlayerId, hostSession.id);
  assert.equal(loanword.game.ownPrompt, "スマホ");
  const struck = await service.execute(command(host.room.code, "loanword-native-strike", loanword.version, "loanword_ban_action", { participantId: hostSession.id, action: "answer", input: "スマホです" }), hostSession.token);
  if (!struck.game || struck.game.kind !== "loanword-ban-game") throw new Error("loanword-ban strike projection missing");
  assert.equal(struck.game.strikeCount, 1);
  assert.equal(struck.game.strikes[0]?.word, undefined);
  assert.equal(struck.game.currentPlayerId, alice.id);
  const alicePassAgain = await service.execute(command(host.room.code, "loanword-native-alice", struck.version, "loanword_ban_action", { participantId: alice.id, action: "pass" }), alice.token);
  const bobOut = await service.execute(command(host.room.code, "loanword-native-bob", alicePassAgain.version, "loanword_ban_action", { participantId: bob.id, action: "out" }), bob.token);
  assert.equal(bobOut.status, "finished");
  if (!bobOut.game || bobOut.game.kind !== "loanword-ban-game") throw new Error("loanword-ban result projection missing");
  assert.equal(bobOut.game.result?.strikes[0]?.participantId, hostSession.id);
});

test("native fast typing, memory drawing, value meter, and acting keep private submissions behind gates", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const alice = sessions[1]!;
  const bob = sessions[2]!;
  let locked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "simultaneous-native-lock-1");
  let started = await service.execute(command(host.room.code, "typing-native-start", locked.version, "game_start", { participantId: hostSession.id, gameKind: "fast-typing-game", prompt: "same text" }), hostSession.token);
  const aliceTyping = await service.execute(command(host.room.code, "typing-native-alice", started.version, "fast_typing_submit", { participantId: alice.id, fastTypingText: "same text" }), alice.token);
  const hostTyping = await service.execute(command(host.room.code, "typing-native-host", aliceTyping.version, "fast_typing_submit", { participantId: hostSession.id, fastTypingText: "same text" }), hostSession.token);
  const typingPrivate = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!typingPrivate?.game || typingPrivate.game.kind !== "fast-typing-game") throw new Error("fast typing private projection missing");
  assert.equal(typingPrivate.game.ownSubmission?.text, "same text");
  assert.equal("result" in typingPrivate.game, false);
  const typingPublic = await service.getProjection(host.room.code, null);
  if (!typingPublic?.game || typingPublic.game.kind !== "fast-typing-game") throw new Error("fast typing public projection missing");
  assert.equal("ownSubmission" in typingPublic.game, false);
  const typingResult = await service.execute(command(host.room.code, "typing-native-reveal", hostTyping.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(typingResult.status, "finished");
  assert.equal(typingResult.game?.kind, "fast-typing-game");
  if (typingResult.game?.kind === "fast-typing-game") assert.equal(typingResult.game.result?.leaderboard[0]?.participantId, alice.id);

  const resetTyping = await service.execute(command(host.room.code, "typing-native-reset", typingResult.version, "reset", { participantId: hostSession.id }), hostSession.token);
  locked = await lockRoom(service, host.room.code, resetTyping.version, hostSession.id, hostSession.token, "simultaneous-native-lock-2");
  started = await service.execute(command(host.room.code, "drawing-native-start", locked.version, "game_start", { participantId: hostSession.id, gameKind: "memory-drawing-game", prompt: "赤いりんご" }), hostSession.token);
  if (!started.game || started.game.kind !== "memory-drawing-game") throw new Error("memory drawing start missing");
  assert.equal(started.game.hostTarget, "赤いりんご");
  const drawingPublic = await service.getProjection(host.room.code, null);
  if (!drawingPublic?.game || drawingPublic.game.kind !== "memory-drawing-game") throw new Error("memory drawing public projection missing");
  assert.notEqual(drawingPublic.game.prompt, started.game.hostTarget);
  assert.equal("hostTarget" in drawingPublic.game, false);
  const drawingAlicePrivate = await service.getProjection(host.room.code, alice.id, alice.token);
  if (!drawingAlicePrivate?.game || drawingAlicePrivate.game.kind !== "memory-drawing-game") throw new Error("memory drawing private projection missing");
  assert.equal("hostTarget" in drawingAlicePrivate.game, false);
  const drawingVersion = started.version;
  const afterHostDrawing = await service.execute(command(host.room.code, "drawing-native-host", drawingVersion, "memory_drawing_submit", { participantId: hostSession.id, memoryDrawingDescription: "赤い丸い果物" }), hostSession.token);
  const afterAliceDrawing = await service.execute(command(host.room.code, "drawing-native-alice", afterHostDrawing.version, "memory_drawing_submit", { participantId: alice.id, memoryDrawingDescription: "赤い実" }), alice.token);
  const afterBobDrawing = await service.execute(command(host.room.code, "drawing-native-bob", afterAliceDrawing.version, "memory_drawing_submit", { participantId: bob.id, memoryDrawingDescription: "丸い食べ物" }), bob.token);
  const voting = await service.execute(command(host.room.code, "drawing-native-voting", afterBobDrawing.version, "game_phase", { participantId: hostSession.id }), hostSession.token);
  const hostDrawingVote = await service.execute(command(host.room.code, "drawing-native-host-vote", voting.version, "memory_drawing_vote", { participantId: hostSession.id, memoryDrawingVoteTargetId: alice.id }), hostSession.token);
  const aliceDrawingVote = await service.execute(command(host.room.code, "drawing-native-alice-vote", hostDrawingVote.version, "memory_drawing_vote", { participantId: alice.id, memoryDrawingVoteTargetId: bob.id }), alice.token);
  const bobDrawingVote = await service.execute(command(host.room.code, "drawing-native-bob-vote", aliceDrawingVote.version, "memory_drawing_vote", { participantId: bob.id, memoryDrawingVoteTargetId: alice.id }), bob.token);
  const drawingResult = await service.execute(command(host.room.code, "drawing-native-reveal", bobDrawingVote.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(drawingResult.status, "finished");
  if (drawingResult.game?.kind === "memory-drawing-game") assert.equal(drawingResult.game.result?.target, "赤いりんご");

  const resetDrawing = await service.execute(command(host.room.code, "drawing-native-reset", drawingResult.version, "reset", { participantId: hostSession.id }), hostSession.token);
  locked = await lockRoom(service, host.room.code, resetDrawing.version, hostSession.id, hostSession.token, "simultaneous-native-lock-3");
  started = await service.execute(command(host.room.code, "value-native-start", locked.version, "game_start", { participantId: hostSession.id, gameKind: "value-meter-game", prompt: "休日は予定を入れたい" }), hostSession.token);
  await assert.rejects(
    service.execute(command(host.room.code, "value-native-early", started.version, "game_reveal", { participantId: hostSession.id }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "game_not_ready",
  );
  const valueHost = await service.execute(command(host.room.code, "value-native-host", started.version, "value_meter_submit", { participantId: hostSession.id, valueMeterValue: 72, valueMeterPhrase: "外出が好き" }), hostSession.token);
  const valueAlice = await service.execute(command(host.room.code, "value-native-alice", valueHost.version, "value_meter_submit", { participantId: alice.id, valueMeterValue: 48, valueMeterPhrase: "家が好き" }), alice.token);
  const valueBob = await service.execute(command(host.room.code, "value-native-bob", valueAlice.version, "value_meter_submit", { participantId: bob.id, valueMeterValue: 60, valueMeterPhrase: "半々" }), bob.token);
  const valueResult = await service.execute(command(host.room.code, "value-native-reveal", valueBob.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  if (!valueResult.game || valueResult.game.kind !== "value-meter-game") throw new Error("value meter result missing");
  assert.equal(valueResult.game.result?.average, 60);

  const resetValue = await service.execute(command(host.room.code, "value-native-reset", valueResult.version, "reset", { participantId: hostSession.id }), hostSession.token);
  locked = await lockRoom(service, host.room.code, resetValue.version, hostSession.id, hostSession.token, "simultaneous-native-lock-4");
  started = await service.execute(command(host.room.code, "acting-native-start", locked.version, "game_start", { participantId: hostSession.id, gameKind: "acting-game", prompt: "大丈夫です" }), hostSession.token);
  if (!started.game || started.game.kind !== "acting-game") throw new Error("acting start missing");
  const performerId = started.game.performerId;
  const performerSession = sessions.find((session) => session.id === performerId)!;
  const performerView = await service.getProjection(host.room.code, performerId, performerSession.token);
  if (!performerView?.game || performerView.game.kind !== "acting-game") throw new Error("acting performer projection missing");
  assert.ok(performerView.game.ownEmotion);
  const actingHost = await service.execute(command(host.room.code, "acting-native-host", started.version, "acting_guess", { participantId: hostSession.id, actingGuess: performerView.game.ownEmotion }), hostSession.token);
  const actingBob = await service.execute(command(host.room.code, "acting-native-bob", actingHost.version, "acting_guess", { participantId: bob.id, actingGuess: "違う答え" }), bob.token);
  const actingResult = await service.execute(command(host.room.code, "acting-native-reveal", actingBob.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(actingResult.status, "finished");
  if (actingResult.game?.kind === "acting-game") assert.equal(actingResult.game.result?.scores[hostSession.id], 1);
});

test("native hint quiz family keeps role targets and guesses private through reconnect and reveal", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const facilitator = sessions[1]!;
  const bob = sessions[2]!;
  const cases = [
    { key: "song-association-quiz", prepare: "song_association_prepare", hint: "song_association_hint", guess: "song_association_guess" },
    { key: "emo-hint-game", prepare: "emo_hint_prepare", hint: "emo_hint_hint", guess: "emo_hint_guess" },
    { key: "person-hint-quiz", prepare: "person_hint_prepare", hint: "person_hint_hint", guess: "person_hint_guess" },
  ] as const;
  let currentVersion = version;

  for (const [index, gameCase] of cases.entries()) {
    const locked = await lockRoom(service, host.room.code, currentVersion, hostSession.id, hostSession.token, `hint-family-lock-${index}`);
    const started = await service.execute(command(host.room.code, `hint-family-start-${index}`, locked.version, "game_start", {
      participantId: hostSession.id,
      gameKind: gameCase.key,
      prompt: `${gameCase.key} prompt`,
    }), hostSession.token);
    if (!started.game || started.game.kind !== gameCase.key) throw new Error(`${gameCase.key} start projection missing`);
    assert.equal(started.game.facilitatorId, facilitator.id);
    if (index === 0) {
      await assert.rejects(
        service.execute(command(host.room.code, "song-hint-too-early", started.version, gameCase.hint, { participantId: facilitator.id, nativeQuizHint: "too early" }), facilitator.token),
        (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
      );
    }

    const target = `${gameCase.key} target`;
    const prepared = await service.execute(command(host.room.code, `hint-family-prepare-${index}`, started.version, gameCase.prepare, {
      participantId: facilitator.id,
      nativeQuizTarget: target,
      nativeQuizHint: "first hint",
    }), facilitator.token);
    const publicView = await service.getProjection(host.room.code, hostSession.id, hostSession.token);
    if (!publicView?.game || publicView.game.kind !== gameCase.key) throw new Error(`${gameCase.key} public projection missing`);
    assert.equal("ownTarget" in publicView.game, false);
    assert.equal("guesses" in publicView.game, false);
    const facilitatorView = await service.getProjection(host.room.code, facilitator.id, facilitator.token);
    if (!facilitatorView?.game || facilitatorView.game.kind !== gameCase.key) throw new Error(`${gameCase.key} facilitator projection missing`);
    assert.equal(facilitatorView.game.ownTarget, target);

    const reconnected = await service.execute(command(host.room.code, `hint-family-reconnect-${index}`, prepared.version, "reconnect", { participantId: facilitator.id }), facilitator.token);
    const afterReconnect = await service.getProjection(host.room.code, facilitator.id, facilitator.token);
    if (!afterReconnect?.game || afterReconnect.game.kind !== gameCase.key) throw new Error(`${gameCase.key} reconnect projection missing`);
    assert.equal(afterReconnect.game.ownTarget, target);
    const hinted = await service.execute(command(host.room.code, `hint-family-hint-${index}`, reconnected.version, gameCase.hint, {
      participantId: facilitator.id,
      nativeQuizHint: "second hint",
    }), facilitator.token);
    const hostGuess = await service.execute(command(host.room.code, `hint-family-host-guess-${index}`, hinted.version, gameCase.guess, {
      participantId: hostSession.id,
      nativeQuizGuess: target,
    }), hostSession.token);
    const bobGuess = await service.execute(command(host.room.code, `hint-family-bob-guess-${index}`, hinted.version, gameCase.guess, {
      participantId: bob.id,
      nativeQuizGuess: "wrong guess",
    }), bob.token);
    assert.ok(bobGuess.version > hostGuess.version);
    const revealed = await service.execute(command(host.room.code, `hint-family-reveal-${index}`, bobGuess.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
    assert.equal(revealed.status, "finished");
    if (!revealed.game || revealed.game.kind !== gameCase.key || !revealed.game.result) throw new Error(`${gameCase.key} result projection missing`);
    assert.equal(revealed.game.result.target, target);
    assert.equal(revealed.game.result.scores[hostSession.id], 1);
    assert.equal(revealed.game.result.scores[bob.id], 0);
    const reset = await service.execute(command(host.room.code, `hint-family-reset-${index}`, revealed.version, "reset", { participantId: hostSession.id }), hostSession.token);
    assert.equal(reset.status, "waiting");
    currentVersion = reset.version;
  }
});

test("native drawing, karuta, and humming games enforce safe gates and server ordering", async () => {
  const { service, host, sessions, version } = await createRoomWithPlayers(["Alice", "Bob"]);
  const hostSession = sessions[0]!;
  const artistOrSinger = sessions[1]!;
  const bob = sessions[2]!;

  const drawingLocked = await lockRoom(service, host.room.code, version, hostSession.id, hostSession.token, "quiz-family-drawing-lock");
  const drawingStarted = await service.execute(command(host.room.code, "quiz-family-drawing-start", drawingLocked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "drawing-quiz",
    prompt: "Draw a clue",
  }), hostSession.token);
  if (!drawingStarted.game || drawingStarted.game.kind !== "drawing-quiz") throw new Error("drawing quiz start projection missing");
  assert.equal(drawingStarted.game.artistId, artistOrSinger.id);
  await assert.rejects(
    service.execute(command(host.room.code, "quiz-family-drawing-host-prepare", drawingStarted.version, "drawing_quiz_prepare", { participantId: hostSession.id, drawingQuizTarget: "umbrella" }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "not_your_turn",
  );
  const bobReady = await service.execute(command(host.room.code, "quiz-family-drawing-ready", drawingStarted.version, "drawing_quiz_ready", { participantId: bob.id, drawingQuizReady: true }), bob.token);
  const drawingPrepared = await service.execute(command(host.room.code, "quiz-family-drawing-prepare", bobReady.version, "drawing_quiz_prepare", { participantId: artistOrSinger.id, drawingQuizTarget: "umbrella" }), artistOrSinger.token);
  const drawingPublic = await service.getProjection(host.room.code, hostSession.id, hostSession.token);
  if (!drawingPublic?.game || drawingPublic.game.kind !== "drawing-quiz") throw new Error("drawing quiz public projection missing");
  assert.equal("ownTarget" in drawingPublic.game, false);
  const bobDrawingGuess = await service.execute(command(host.room.code, "quiz-family-drawing-bob-guess", drawingPrepared.version, "drawing_quiz_guess", { participantId: bob.id, drawingQuizGuess: "umbrella" }), bob.token);
  const bobLeft = await service.execute(command(host.room.code, "quiz-family-drawing-bob-leave", bobDrawingGuess.version, "leave", { participantId: bob.id }), bob.token);
  if (!bobLeft.game || bobLeft.game.kind !== "drawing-quiz") throw new Error("drawing quiz departure projection missing");
  assert.equal(bobLeft.game.participantCount, 2);
  const hostDrawingGuess = await service.execute(command(host.room.code, "quiz-family-drawing-host-guess", bobLeft.version, "drawing_quiz_guess", { participantId: hostSession.id, drawingQuizGuess: "umbrella" }), hostSession.token);
  const drawingResult = await service.execute(command(host.room.code, "quiz-family-drawing-reveal", hostDrawingGuess.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(drawingResult.status, "finished");
  if (!drawingResult.game || drawingResult.game.kind !== "drawing-quiz" || !drawingResult.game.result) throw new Error("drawing quiz result projection missing");
  assert.equal(drawingResult.game.result.target, "umbrella");
  assert.equal(drawingResult.game.result.scores[hostSession.id], 1);
  const bobReconnected = await service.execute(command(host.room.code, "quiz-family-drawing-bob-reconnect", drawingResult.version, "reconnect", { participantId: bob.id }), bob.token);
  const drawingReset = await service.execute(command(host.room.code, "quiz-family-drawing-reset", bobReconnected.version, "reset", { participantId: hostSession.id }), hostSession.token);

  const karutaLocked = await lockRoom(service, host.room.code, drawingReset.version, hostSession.id, hostSession.token, "quiz-family-karuta-lock");
  const karutaStarted = await service.execute(command(host.room.code, "quiz-family-karuta-start", karutaLocked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "funny-line-karuta",
    prompt: "Complete the funny line",
  }), hostSession.token);
  const hostClaim = await service.execute(command(host.room.code, "quiz-family-karuta-host", karutaStarted.version, "funny_line_karuta_claim", { participantId: hostSession.id, funnyLineKarutaResponse: "host response" }), hostSession.token);
  await assert.rejects(
    service.execute(command(host.room.code, "quiz-family-karuta-host-duplicate", hostClaim.version, "funny_line_karuta_claim", { participantId: hostSession.id, funnyLineKarutaResponse: "second response" }), hostSession.token),
    (error: unknown) => error instanceof RoomDomainError && error.code === "claim_already_submitted",
  );
  const bobClaim = await service.execute(command(host.room.code, "quiz-family-karuta-bob", karutaStarted.version, "funny_line_karuta_claim", { participantId: bob.id, funnyLineKarutaResponse: "bob response" }), bob.token);
  const karutaResult = await service.execute(command(host.room.code, "quiz-family-karuta-reveal", bobClaim.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(karutaResult.status, "finished");
  if (!karutaResult.game || karutaResult.game.kind !== "funny-line-karuta" || !karutaResult.game.result) throw new Error("funny-line karuta result projection missing");
  assert.equal(karutaResult.game.result.claims.length, 2);
  assert.equal(karutaResult.game.result.winnerId, hostSession.id);
  assert.equal(karutaResult.game.result.scores[hostSession.id], 1);
  const karutaReset = await service.execute(command(host.room.code, "quiz-family-karuta-reset", karutaResult.version, "reset", { participantId: hostSession.id }), hostSession.token);

  const hummingLocked = await lockRoom(service, host.room.code, karutaReset.version, hostSession.id, hostSession.token, "quiz-family-humming-lock");
  const hummingStarted = await service.execute(command(host.room.code, "quiz-family-humming-start", hummingLocked.version, "game_start", {
    participantId: hostSession.id,
    gameKind: "humming-intro-quiz",
    prompt: "Hum the intro",
  }), hostSession.token);
  if (!hummingStarted.game || hummingStarted.game.kind !== "humming-intro-quiz") throw new Error("humming intro start projection missing");
  const hummingPrepared = await service.execute(command(host.room.code, "quiz-family-humming-prepare", hummingStarted.version, "humming_intro_prepare", { participantId: artistOrSinger.id, hummingIntroTarget: "Blue Monday" }), artistOrSinger.token);
  const hummingPublic = await service.getProjection(host.room.code, hostSession.id, hostSession.token);
  if (!hummingPublic?.game || hummingPublic.game.kind !== "humming-intro-quiz") throw new Error("humming intro public projection missing");
  assert.equal("ownTarget" in hummingPublic.game, false);
  const hummingHostGuess = await service.execute(command(host.room.code, "quiz-family-humming-host", hummingPrepared.version, "humming_intro_guess", { participantId: hostSession.id, hummingIntroGuess: "Blue Monday" }), hostSession.token);
  const hummingBobGuess = await service.execute(command(host.room.code, "quiz-family-humming-bob", hummingPrepared.version, "humming_intro_guess", { participantId: bob.id, hummingIntroGuess: "Blue Monday" }), bob.token);
  assert.ok(hummingBobGuess.version > hummingHostGuess.version);
  const hummingResult = await service.execute(command(host.room.code, "quiz-family-humming-reveal", hummingBobGuess.version, "game_reveal", { participantId: hostSession.id }), hostSession.token);
  assert.equal(hummingResult.status, "finished");
  if (!hummingResult.game || hummingResult.game.kind !== "humming-intro-quiz" || !hummingResult.game.result) throw new Error("humming intro result projection missing");
  assert.equal(hummingResult.game.result.leaderboard[0]?.participantId, hostSession.id);
  assert.equal(hummingResult.game.result.scores[hostSession.id], 2);
  assert.equal(hummingResult.game.result.scores[bob.id], 1);
  const hummingReset = await service.execute(command(host.room.code, "quiz-family-humming-reset", hummingResult.version, "reset", { participantId: hostSession.id }), hostSession.token);
  const rematchLocked = await lockRoom(service, host.room.code, hummingReset.version, hostSession.id, hostSession.token, "quiz-family-humming-rematch-lock");
  const rematch = await service.execute(command(host.room.code, "quiz-family-humming-rematch", rematchLocked.version, "game_start", { participantId: hostSession.id, gameKind: "humming-intro-quiz", prompt: "Rematch" }), hostSession.token);
  assert.equal(rematch.status, "playing");
  assert.equal(rematch.game?.kind, "humming-intro-quiz");
});
