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

async function main() {
  const created = await request("POST", "/rooms", { body: { hostName: "Party Audit Host" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  const host = created.data.host;
  const hostToken = created.data.participantToken;
  const players = [host];
  for (const name of ["Party Alice", "Party Bob"]) {
    const joined = await request("POST", `/rooms/${roomCode}/join`, { body: { name } });
    assert.equal(joined.response.status, 201);
    players.push(joined.data.participant);
  }

  const started = await request("POST", `/rooms/${roomCode}/game/start`, {
    token: hostToken,
    body: { participantId: host.id, gameKey: "party-pack", gameTitle: "定番ゲームパック" },
  });
  assert.equal(started.response.status, 200);

  const socket = io(apiUrl, { transports: ["websocket", "polling"], forceNew: true, reconnection: false });
  sockets.push(socket);
  await waitFor(socket, "connect");
  socket.emit("room:join", { roomCode, participantId: host.id, token: hostToken });
  await waitFor(socket, "room:updated", (payload) => payload?.room?.code === roomCode);

  const basePartyPack = {
    players: players.map(({ id, name }) => ({ id, name })),
    mode: "all",
    questionCount: 1,
    step: "prompt",
    promptId: "majority-01",
    deckPromptIds: ["majority-01"],
    deckIndex: 0,
    answerVisible: false,
    currentPlayerIndex: 0,
    votes: {},
    guesses: {},
    scoreCounts: Object.fromEntries(players.map(({ id }) => [id, 0])),
    safeCounts: Object.fromEntries(players.map(({ id }) => [id, 0])),
    missCounts: Object.fromEntries(players.map(({ id }) => [id, 0])),
    actionLog: [],
  };
  const envelope = (partyPack) => ({ phase: "playing", gameKey: "party-pack", gameTitle: "定番ゲームパック", step: 2, message: "監査", updatedBy: host.id, updatedAt: new Date().toISOString(), partyPack });
  socket.emit("room:state:update", { roomCode, currentGame: "party-pack", state: envelope(basePartyPack) });
  await waitFor(socket, "room:updated", (payload) => payload?.room?.state?.partyPack?.promptId === "majority-01");

  const earlyError = waitFor(socket, "room:error", (payload) => payload?.error === "game_not_ready");
  socket.emit("room:state:update", { roomCode, currentGame: "party-pack", state: envelope({ ...basePartyPack, answerVisible: true }) });
  await earlyError;

  const readyVotes = Object.fromEntries(players.map(({ id }, index) => [id, String(index % 2)]));
  const revealed = waitFor(socket, "room:updated", (payload) => payload?.room?.state?.partyPack?.answerVisible === true);
  socket.emit("room:state:update", { roomCode, currentGame: "party-pack", state: envelope({ ...basePartyPack, votes: readyVotes, answerVisible: true }) });
  await revealed;

  const closed = await request("POST", `/rooms/${roomCode}/close`, { token: hostToken, body: { participantId: host.id } });
  assert.equal(closed.response.status, 200);
  console.log(JSON.stringify({ ok: true, checks: ["legacy synced room", "early majority result rejected", "all participant votes unlock result"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => { for (const socket of sockets) socket.disconnect(); });
