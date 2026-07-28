#!/usr/bin/env node
import assert from "node:assert/strict";
import { io } from "socket.io-client";

const apiUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const sockets = [];

async function request(method, path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.token ? { "x-room-token": options.token } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function commandId(label) { return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function waitFor(socket, event, predicate, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${event}`)); }, timeout);
    const onEvent = (payload) => { if (!predicate || predicate(payload)) { cleanup(); resolve(payload); } };
    const onError = (payload) => { cleanup(); reject(new Error(`room:error: ${payload?.error ?? "unknown"}`)); };
    const cleanup = () => { clearTimeout(timer); socket.off(event, onEvent); socket.off("room:error", onError); };
    socket.on(event, onEvent);
    socket.on("room:error", onError);
  });
}

async function connectParticipant(roomCode, participant) {
  const socket = io(apiUrl, { transports: ["websocket", "polling"], forceNew: true, reconnection: false });
  sockets.push(socket);
  await waitFor(socket, "connect");
  const joined = waitFor(socket, "room:updated", (payload) => payload?.room?.code === roomCode);
  socket.emit("room:join", { roomCode, participantId: participant.id, token: participant.token });
  return { socket, snapshot: await joined };
}

function makeEnvelope(inner, updatedBy) {
  const stepNumber = { setup: 1, play: 2, result: 3, complete: 4 };
  return {
    phase: inner.step === "complete" ? "complete" : "playing",
    gameKey: "majority-game",
    gameTitle: "マジョリティゲーム",
    step: stepNumber[inner.step],
    message: "majority audit",
    updatedBy,
    updatedAt: new Date().toISOString(),
    urlCandidate: { key: "majority-game", state: inner },
  };
}

function emitUpdate(socket, roomCode, participant, inner, expectedStep, predicate = () => true) {
  const updated = waitFor(socket, "room:updated", (payload) => payload?.room?.state?.urlCandidate?.state?.step === expectedStep && predicate(payload));
  socket.emit("room:state:update", {
    roomCode,
    currentGame: "majority-game",
    state: makeEnvelope(inner, participant.id),
    commandId: commandId(expectedStep),
  });
  return updated;
}

async function expectNotReady(socket, roomCode, participant, inner) {
  const rejected = waitFor(socket, "room:error", (payload) => payload?.error === "game_not_ready");
  socket.emit("room:state:update", {
    roomCode,
    currentGame: "majority-game",
    state: makeEnvelope(inner, participant.id),
    commandId: commandId("early-result"),
  });
  await rejected;
}

async function main() {
  const created = await request("POST", "/rooms", { body: { hostName: "Majority Audit Host" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  const host = { ...created.data.host, token: created.data.participantToken };
  const players = [host];
  for (const name of ["Majority Alice", "Majority Bob"]) {
    const joined = await request("POST", `/rooms/${roomCode}/join`, { body: { name } });
    assert.equal(joined.response.status, 201);
    players.push({ ...joined.data.participant, token: joined.data.participantToken });
  }

  const started = await request("POST", `/rooms/${roomCode}/game/start`, {
    token: host.token,
    body: { participantId: host.id, gameKey: "majority-game", gameTitle: "マジョリティゲーム" },
  });
  assert.equal(started.response.status, 200);

  const participantSockets = new Map();
  for (const participant of players) participantSockets.set(participant.id, (await connectParticipant(roomCode, participant)).socket);
  const hostSocket = participantSockets.get(host.id);
  const playerList = players.map(({ id, name }) => ({ id, name }));
  const base = {
    players: playerList,
    includeAdultTopics: false,
    questionCount: 1,
    step: "play",
    deckPromptIds: ["majority-audit-1"],
    deckIndex: 0,
    answerVisible: false,
    currentPlayerIndex: 0,
    votes: {},
    safeCounts: {},
    missCounts: {},
    guesses: {},
    scoreCounts: {},
    resourceCounts: {},
    positions: {},
    territory: {},
    drawnCount: 0,
    hazardIndex: 4,
    lastDrawResult: null,
    lastDrawPlayerName: null,
    completedPairs: 0,
    actionLog: [],
    numberValue: 0,
  };
  await emitUpdate(hostSocket, roomCode, host, base, "play");

  const voteUpdates = players.map((participant, index) => {
    const socket = participantSockets.get(participant.id);
    const vote = String(index % 2);
    return emitUpdate(socket, roomCode, participant, { ...base, votes: { [participant.id]: vote } }, "play", (payload) => payload?.room?.state?.urlCandidate?.state?.votes?.[participant.id] === vote);
  });
  const voteSnapshots = await Promise.all(voteUpdates);
  for (const [index, snapshot] of voteSnapshots.entries()) {
    const participantId = players[index].id;
    assert.deepEqual(Object.keys(snapshot.room.state.urlCandidate.state.votes), [participantId]);
  }

  const alice = players[1];
  participantSockets.get(alice.id).disconnect();
  const reconnectedAlice = await connectParticipant(roomCode, alice);
  participantSockets.set(alice.id, reconnectedAlice.socket);
  assert.equal(reconnectedAlice.snapshot.room.state.urlCandidate.state.votes[alice.id], "1");
  assert.deepEqual(Object.keys(reconnectedAlice.snapshot.room.state.urlCandidate.state.votes), [alice.id]);

  await expectNotReady(hostSocket, roomCode, host, { ...base, votes: { [host.id]: "0", [alice.id]: "1" } });

  const allVotes = Object.fromEntries(players.map((participant, index) => [participant.id, String(index % 2)]));
  const resultSnapshotsReady = players.map((participant) =>
    waitFor(participantSockets.get(participant.id), "room:updated", (payload) => payload?.room?.state?.urlCandidate?.state?.step === "result"),
  );
  participantSockets.get(host.id).emit("room:state:update", {
    roomCode,
    currentGame: "majority-game",
    state: makeEnvelope({ ...base, votes: allVotes, step: "result" }, host.id),
    commandId: commandId("result"),
  });
  const resultSnapshots = await Promise.all(resultSnapshotsReady);
  assert.equal(resultSnapshots[1].room.state.urlCandidate.state.votes[host.id], "0");
  assert.equal(resultSnapshots[2].room.state.urlCandidate.state.votes[alice.id], "1");

  await emitUpdate(hostSocket, roomCode, host, { ...base, votes: allVotes, step: "complete" }, "complete");
  const closed = await request("POST", `/rooms/${roomCode}/close`, { token: host.token, body: { participantId: host.id } });
  assert.equal(closed.response.status, 200);
  console.log(JSON.stringify({ ok: true, checks: ["simultaneous votes merge", "own vote survives reconnect with masking", "early result rejected", "all votes reveal result to every device", "completion and room close"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => { for (const socket of sockets) socket.disconnect(); });
