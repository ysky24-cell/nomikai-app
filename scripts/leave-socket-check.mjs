import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const baseUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function post(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-room-token": token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("socket_connect_timeout")), 3_000);
    socket.once("connect", () => { clearTimeout(timeout); resolve(); });
    socket.once("connect_error", reject);
  });
}

function emitCommand(socket, command, token) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("command_ack_timeout")), 3_000);
    socket.emit("v2:command", { command, token }, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

function subscribe(socket, roomCode, participantId, token) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("subscribe_ack_timeout")), 3_000);
    socket.emit("v2:subscribe", { roomCode, participantId, token }, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

let hostSocket;
let playerSocketA;
let playerSocketB;
try {
  const created = (await post("/v2/rooms", { hostName: `leave-${randomUUID().slice(0, 8)}` })).body;
  const roomCode = created.room.code;
  const hostId = created.room.self.id;
  const hostToken = created.hostToken;
  const joined = await post(`/v2/rooms/${roomCode}/commands`, {
    kind: "join",
    commandId: randomUUID(),
    joinNonce: randomUUID(),
    expectedVersion: created.room.version,
    name: `player-${randomUUID().slice(0, 6)}`,
  });
  if (joined.status !== 200) throw new Error(`join_failed:${joined.status}`);
  const playerId = joined.body.credentials.participantId;
  const playerToken = joined.body.credentials.reconnectToken;

  hostSocket = io(baseUrl, { transports: ["websocket"], reconnection: false });
  playerSocketA = io(baseUrl, { transports: ["websocket"], reconnection: false });
  playerSocketB = io(baseUrl, { transports: ["websocket"], reconnection: false });
  await Promise.all([waitForConnect(hostSocket), waitForConnect(playerSocketA), waitForConnect(playerSocketB)]);
  const [hostAck, playerAckA, playerAckB] = await Promise.all([
    subscribe(hostSocket, roomCode, hostId, hostToken),
    subscribe(playerSocketA, roomCode, playerId, playerToken),
    subscribe(playerSocketB, roomCode, playerId, playerToken),
  ]);
  if (hostAck?.ok !== true || playerAckA?.ok !== true || playerAckB?.ok !== true) throw new Error("subscribe_failed");
  await sleep(100);

  let secondSocketProjectionCount = 0;
  playerSocketB.on("v2:projection", () => { secondSocketProjectionCount += 1; });
  const leaveAck = await emitCommand(playerSocketA, {
    kind: "leave",
    commandId: randomUUID(),
    expectedVersion: joined.body.version,
    participantId: playerId,
    roomCode,
  }, playerToken);
  if (leaveAck?.ok !== true) throw new Error(`leave_failed:${leaveAck?.error ?? "unknown"}`);
  await sleep(100);
  secondSocketProjectionCount = 0;
  const closed = await post(`/v2/rooms/${roomCode}/commands`, {
    kind: "close",
    commandId: randomUUID(),
    expectedVersion: leaveAck.projection.version,
    participantId: hostId,
  }, hostToken);
  if (closed.status !== 200) throw new Error(`close_failed:${closed.status}`);
  await sleep(200);
  const detached = secondSocketProjectionCount === 0;
  console.log(JSON.stringify({ ok: detached, secondSocketProjectionCount, leaveAck, closeStatus: closed.status, checks: ["socket leave detaches every tab for the participant", "detached tab receives no later room projection"] }));
  process.exitCode = detached ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  hostSocket?.disconnect();
  playerSocketA?.disconnect();
  playerSocketB?.disconnect();
}
