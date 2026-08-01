import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";

const baseUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-room-token": token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
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

async function connect() {
  const socket = io(baseUrl, { transports: ["websocket"], reconnection: false });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("socket_connect_timeout")), 3_000);
    socket.once("connect", () => { clearTimeout(timeout); resolve(); });
    socket.once("connect_error", reject);
  });
  return socket;
}

let hostSocket;
let playerSocket;
try {
  const created = (await request("/v2/rooms", { hostName: `kick-${randomUUID().slice(0, 8)}` })).body;
  const roomCode = created.room.code;
  const hostId = created.room.self.id;
  const hostToken = created.hostToken;
  const joined = await request(`/v2/rooms/${roomCode}/commands`, {
    kind: "join",
    commandId: randomUUID(),
    joinNonce: randomUUID(),
    expectedVersion: created.room.version,
    name: `player-${randomUUID().slice(0, 6)}`,
  });
  if (joined.status !== 200) throw new Error(`join_failed:${joined.status}`);
  const playerId = joined.body.credentials.participantId;
  const playerToken = joined.body.credentials.reconnectToken;

  hostSocket = await connect();
  playerSocket = await connect();
  if ((await subscribe(hostSocket, roomCode, hostId, hostToken))?.ok !== true) throw new Error("host_subscribe_failed");
  if ((await subscribe(playerSocket, roomCode, playerId, playerToken))?.ok !== true) throw new Error("player_subscribe_failed");
  await sleep(100);

  let playerProjectionsAfterKick = 0;
  playerSocket.on("v2:projection", () => { playerProjectionsAfterKick += 1; });
  const kicked = await request(`/v2/rooms/${roomCode}/commands`, {
    kind: "kick",
    commandId: randomUUID(),
    expectedVersion: joined.body.version,
    participantId: hostId,
    targetParticipantId: playerId,
  }, hostToken);
  if (kicked.status !== 200) throw new Error(`kick_failed:${kicked.status}`);
  await sleep(200);
  const resubscribe = await subscribe(playerSocket, roomCode, playerId, playerToken);
  const detached = playerProjectionsAfterKick === 0 && resubscribe?.ok === false && resubscribe?.error === "participant_not_found";
  console.log(JSON.stringify({ ok: detached, checks: ["kick removes target socket from room", "kicked socket receives no later projection", "kicked identity cannot resubscribe"] }));
  process.exitCode = detached ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  hostSocket?.disconnect();
  playerSocket?.disconnect();
}
