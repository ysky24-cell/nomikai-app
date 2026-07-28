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

function emptyMaps() {
  return { selfSelections: {}, selfSubmitted: {}, peerSelections: {}, peerSubmitted: {} };
}

function makeEnvelope(johari, updatedBy) {
  const stepNumber = { setup: 1, self: 2, peer: 3, result: 4, complete: 5 };
  return {
    phase: johari.step === "complete" ? "complete" : "playing",
    gameKey: "johari-window",
    gameTitle: "ジョハリの窓",
    step: stepNumber[johari.step],
    message: "監査",
    updatedBy,
    updatedAt: new Date().toISOString(),
    johari,
  };
}

function emitUpdate(socket, roomCode, participant, johari, expectedStep, predicate = () => true) {
  const updated = waitFor(socket, "room:updated", (payload) => payload?.room?.state?.johari?.step === expectedStep && predicate(payload));
  socket.emit("room:state:update", {
    roomCode,
    currentGame: "johari-window",
    state: makeEnvelope(johari, participant.id),
    commandId: commandId(expectedStep),
  });
  return updated;
}

function expectNotReady(socket, roomCode, participant, johari) {
  const rejected = waitFor(socket, "room:error", (payload) => payload?.error === "game_not_ready");
  socket.emit("room:state:update", {
    roomCode,
    currentGame: "johari-window",
    state: makeEnvelope(johari, participant.id),
    commandId: commandId("early"),
  });
  return rejected;
}

async function main() {
  const created = await request("POST", "/rooms", { body: { hostName: "Johari Audit Host" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  const host = { ...created.data.host, token: created.data.participantToken };
  const players = [host];
  for (const name of ["Johari Alice", "Johari Bob"]) {
    const joined = await request("POST", `/rooms/${roomCode}/join`, { body: { name } });
    assert.equal(joined.response.status, 201);
    players.push({ ...joined.data.participant, token: joined.data.participantToken });
  }

  const started = await request("POST", `/rooms/${roomCode}/game/start`, {
    token: host.token,
    body: { participantId: host.id, gameKey: "johari-window", gameTitle: "ジョハリの窓" },
  });
  assert.equal(started.response.status, 200);

  const participantSockets = new Map();
  for (const participant of players) participantSockets.set(participant.id, (await connectParticipant(roomCode, participant)).socket);
  const hostSocket = participantSockets.get(host.id);

  const playerList = players.map(({ id, name }) => ({ id, name }));
  const base = {
    players: playerList,
    category: "all",
    wordCount: 3,
    targetIndex: 0,
    peerIndex: 0,
    deckWordIds: ["w1", "w2", "w3"],
    selfWordIds: [],
    ...emptyMaps(),
  };

  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "self" }, "self");
  await expectNotReady(hostSocket, roomCode, host, {
    ...base,
    step: "peer",
    selfSubmitted: { [host.id]: true, [players[1].id]: false, [players[2].id]: true },
  });

  const selfUpdates = players.map((participant, index) => {
    const socket = participantSockets.get(participant.id);
    const own = { [participant.id]: [`w${index + 1}`] };
    return emitUpdate(socket, roomCode, participant, {
      ...base,
      step: "self",
      selfSelections: own,
      selfSubmitted: { [participant.id]: true },
    }, "self", (payload) => payload?.room?.state?.johari?.selfSubmitted?.[participant.id] === true);
  });
  await Promise.all(selfUpdates);

  const alice = players[1];
  const aliceSocket = participantSockets.get(alice.id);
  aliceSocket.disconnect();
  const reconnectedAlice = await connectParticipant(roomCode, alice);
  const reconnectedAliceSocket = reconnectedAlice.socket;
  participantSockets.set(alice.id, reconnectedAliceSocket);
  const restored = reconnectedAlice.snapshot;
  assert.equal(restored.room.state.johari.step, "self");
  assert.equal(restored.room.state.johari.selfSubmitted[alice.id], true);
  assert.deepEqual(Object.keys(restored.room.state.johari.selfSelections), [alice.id]);

  const selfSubmitted = Object.fromEntries(players.map(({ id }) => [id, true]));
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "peer", selfSubmitted }, "peer");

  const nonHostPeerUpdates = players.slice(1).flatMap((participant, participantIndex) => {
    const socket = participantSockets.get(participant.id);
    return players.filter((target) => target.id !== participant.id).map((target, targetIndex) => emitUpdate(socket, roomCode, participant, {
      ...base,
      step: "peer",
      selfSubmitted,
      peerSelections: { [target.id]: { [participant.id]: [`w${participantIndex + targetIndex + 1}`] } },
      peerSubmitted: { [target.id]: { [participant.id]: true } },
    }, "peer", (payload) => payload?.room?.state?.johari?.peerSubmitted?.[target.id]?.[participant.id] === true));
  });
  await Promise.all(nonHostPeerUpdates);

  const allPeerSelections = Object.fromEntries(players.map((target, targetIndex) => [
    target.id,
    Object.fromEntries(players.filter((peer) => peer.id !== target.id).map((peer, peerIndex) => [peer.id, [`w${targetIndex + peerIndex + 1}`]])),
  ]));
  const allPeerSubmitted = Object.fromEntries(players.map((target) => [
    target.id,
    Object.fromEntries(players.filter((peer) => peer.id !== target.id).map((peer) => [peer.id, true])),
  ]));
  await emitUpdate(hostSocket, roomCode, host, {
    ...base,
    step: "peer",
    selfSubmitted,
    peerSelections: allPeerSelections,
    peerSubmitted: allPeerSubmitted,
  }, "peer", (payload) => payload?.room?.state?.johari?.peerSubmitted?.[players[1].id]?.[host.id] === true);

  const partialPeerSubmitted = {
    [host.id]: { [players[1].id]: true },
    [players[1].id]: { [host.id]: true, [players[2].id]: true },
    [players[2].id]: { [host.id]: true, [players[1].id]: true },
  };
  await expectNotReady(hostSocket, roomCode, host, { ...base, step: "result", selfSubmitted, peerSubmitted: partialPeerSubmitted });

  const peerSubmitted = allPeerSubmitted;
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "result", selfSubmitted, peerSubmitted }, "result");
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "result", targetIndex: 1, selfSubmitted, peerSubmitted }, "result");
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "result", targetIndex: 2, selfSubmitted, peerSubmitted }, "result");
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "complete", targetIndex: players.length - 1, selfSubmitted, peerSubmitted }, "complete");
  await emitUpdate(hostSocket, roomCode, host, { ...base, step: "self" }, "self");

  const closed = await request("POST", `/rooms/${roomCode}/close`, { token: host.token, body: { participantId: host.id } });
  assert.equal(closed.response.status, 200);
  console.log(JSON.stringify({ ok: true, checks: ["multi-device self input", "early self phase rejected", "self input survives reconnect with masking", "multi-device peer input", "early peer result rejected", "all peer submissions unlock results", "final completion and restart"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => { for (const socket of sockets) socket.disconnect(); });
