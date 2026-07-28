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

function makeEnvelope(anonymousQuestion, updatedBy) {
  return {
    phase: anonymousQuestion.step === "complete" ? "complete" : "playing",
    gameKey: "anonymous-box",
    gameTitle: "匿名質問箱",
    step: anonymousQuestion.step === "setup" ? 1 : anonymousQuestion.step === "question" ? 2 : 3,
    message: "匿名質問箱の監査",
    updatedBy,
    updatedAt: new Date().toISOString(),
    anonymousQuestion,
  };
}

function emitUpdate(socket, roomCode, participant, anonymousQuestion, predicate = () => true) {
  const updated = waitFor(socket, "room:updated", (payload) => payload?.room?.state?.anonymousQuestion && predicate(payload));
  socket.emit("room:state:update", {
    roomCode,
    currentGame: "anonymous-box",
    state: makeEnvelope(anonymousQuestion, participant.id),
    commandId: commandId("anonymous"),
  });
  return updated;
}

function questionsFor(players) {
  return {
    players: players.map(({ id, name }) => ({ id, name })),
    category: "all",
    questionCount: 3,
    step: "setup",
    customQuestions: [],
    deckQuestionIds: [],
    deckIndex: 0,
  };
}

async function main() {
  const created = await request("POST", "/rooms", { body: { hostName: "Anonymous Audit Host" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  const host = { ...created.data.host, token: created.data.participantToken };
  const players = [host];
  for (const name of ["Anonymous Alice", "Anonymous Bob"]) {
    const joined = await request("POST", `/rooms/${roomCode}/join`, { body: { name } });
    assert.equal(joined.response.status, 201);
    players.push({ ...joined.data.participant, token: joined.data.participantToken });
  }

  const started = await request("POST", `/rooms/${roomCode}/game/start`, {
    token: host.token,
    body: { participantId: host.id, gameKey: "anonymous-box", gameTitle: "匿名質問箱" },
  });
  assert.equal(started.response.status, 200);

  const participantSockets = new Map();
  const joinedSnapshots = await Promise.all(players.map(async (participant) => {
    const connected = await connectParticipant(roomCode, participant);
    participantSockets.set(participant.id, connected.socket);
    return connected.snapshot;
  }));
  assert.equal(joinedSnapshots.length, players.length);
  const hostSocket = participantSockets.get(host.id);
  const base = questionsFor(players);
  await emitUpdate(hostSocket, roomCode, host, base, (payload) => payload.room.state.anonymousQuestion.step === "setup");

  const alice = players[1];
  const bob = players[2];
  const aliceSocket = participantSockets.get(alice.id);
  const bobSocket = participantSockets.get(bob.id);
  const aliceQuestion = { id: "custom-alice", text: "最近いちばん嬉しかったことは？" };
  const bobQuestion = { id: "custom-bob", text: "今いちばん行きたい場所は？" };
  await Promise.all([
    emitUpdate(aliceSocket, roomCode, alice, { ...base, customQuestions: [aliceQuestion] }, (payload) => payload.room.state.anonymousQuestion.customQuestions.length >= 1),
    emitUpdate(bobSocket, roomCode, bob, { ...base, customQuestions: [bobQuestion] }, (payload) => payload.room.state.anonymousQuestion.customQuestions.length >= 1),
  ]);

  const aliceThird = { id: "custom-alice-third", text: "最近笑ったことは？" };
  await emitUpdate(aliceSocket, roomCode, alice, {
    ...base,
    customQuestions: [{ ...aliceQuestion, text: "" }, { ...bobQuestion, text: "" }, aliceThird],
  }, (payload) => payload.room.state.anonymousQuestion.customQuestions.length >= 3);

  const hostSnapshot = (await request("GET", `/rooms/${roomCode}?participantId=${encodeURIComponent(host.id)}`, { token: host.token })).data;
  const storedQuestions = hostSnapshot.room.state.anonymousQuestion.customQuestions;
  assert.deepEqual(storedQuestions.map((question) => question.id), ["custom-alice", "custom-bob", "custom-alice-third"]);
  assert.ok(storedQuestions.every((question) => question.text.length > 0));

  const participantSnapshot = (await request("GET", `/rooms/${roomCode}?participantId=${encodeURIComponent(alice.id)}`, { token: alice.token })).data;
  const maskedQuestions = participantSnapshot.room.state.anonymousQuestion.customQuestions;
  assert.equal(maskedQuestions.find((question) => question.id === "custom-alice")?.text, "");
  assert.equal(maskedQuestions.find((question) => question.id === "custom-bob")?.text, "");

  const deck = ["custom-alice", "custom-bob", "custom-alice-third"];
  await emitUpdate(hostSocket, roomCode, host, { ...base, customQuestions: storedQuestions, step: "question", deckQuestionIds: deck, deckIndex: 0 }, (payload) => payload.room.state.anonymousQuestion.step === "question");
  const questionProjection = (await request("GET", `/rooms/${roomCode}?participantId=${encodeURIComponent(alice.id)}`, { token: alice.token })).data;
  const projectedQuestions = questionProjection.room.state.anonymousQuestion.customQuestions;
  assert.equal(projectedQuestions.find((question) => question.id === "custom-alice")?.text, aliceQuestion.text);
  assert.equal(projectedQuestions.find((question) => question.id === "custom-bob")?.text, "");

  await emitUpdate(hostSocket, roomCode, host, { ...base, customQuestions: storedQuestions, step: "complete", deckQuestionIds: deck, deckIndex: 2 }, (payload) => payload.room.state.anonymousQuestion.step === "complete");
  const closed = await request("POST", `/rooms/${roomCode}/close`, { token: host.token, body: { participantId: host.id } });
  assert.equal(closed.response.status, 200);
  console.log(JSON.stringify({ ok: true, checks: ["concurrent anonymous submissions merge", "masked question text for participants", "new submission survives masked reconnect state", "active custom question is revealed only when current", "completion and room close"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => { for (const socket of sockets) socket.disconnect(); });
