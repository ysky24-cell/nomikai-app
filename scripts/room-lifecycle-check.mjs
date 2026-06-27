#!/usr/bin/env node
import assert from "node:assert/strict";
import { io } from "socket.io-client";

const apiUrl = normalizeBaseUrl(process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000");
const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS ?? "8000", 10);
const gameKey = process.env.GAME_KEY ?? "word-wolf";
const gameTitle = process.env.GAME_TITLE ?? "Word Wolf";

const sockets = [];

async function main() {
  log(`API: ${apiUrl}`);

  await step("health check", async () => {
    const result = await request("GET", "/health");
    assert.equal(result.data?.ok, true, "health response must be ok");
  });

  let roomCode;
  let host;
  let player;

  await step("create room", async () => {
    const result = await request("POST", "/rooms", {
      body: { hostName: "Lifecycle Host" },
    });
    roomCode = result.data?.room?.code;
    host = result.data?.host;
    assert.ok(roomCode, "room code is required");
    assert.ok(host?.id, "host participant id is required");
  });

  await step("reject unsupported game start", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/game/start`, {
      body: { participantId: host.id, gameKey: "unsupported-test-game", gameTitle: "Unsupported Test Game" },
    });
    assert.equal(result.response.status, 400);
    assert.equal(result.data?.error, "unsupported_game");
  });

  await step("join player", async () => {
    const result = await request("POST", `/rooms/${roomCode}/join`, {
      body: { name: "Lifecycle Player" },
    });
    player = result.data?.participant;
    assert.ok(player?.id, "player participant id is required");
  });

  let claimedTransferCode;
  let blockedTransferCode;
  let supersededTransferCode;

  await step("reject transfer code issue by non-host", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/participants/${player.id}/transfer-code`, {
      body: { participantId: player.id },
    });
    assert.equal(result.response.status, 403);
    assert.equal(result.data?.error, "host_required");
  });

  await step("issue and claim participant transfer code", async () => {
    const issueResult = await request("POST", `/rooms/${roomCode}/participants/${player.id}/transfer-code`, {
      body: { participantId: host.id },
    });
    claimedTransferCode = issueResult.data?.transferCode;
    assert.equal(issueResult.data?.participant?.id, player.id, "transfer code must target the requested participant");
    assert.match(claimedTransferCode ?? "", /^[A-Z2-9]{8}$/);
    assert.ok(issueResult.data?.expiresAt, "transfer code response must include expiresAt");

    const claimResult = await request("POST", `/rooms/${roomCode}/claim-transfer`, {
      body: { transferCode: claimedTransferCode },
    });
    assert.equal(claimResult.data?.participant?.id, player.id, "claimed participant id must match original player");
    assert.equal(claimResult.data?.participant?.role, player.role, "claimed participant role must match original player");
    assert.equal(claimResult.data?.room?.code, roomCode, "claim response must include the room code");
  });

  await step("reject reused participant transfer code", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/claim-transfer`, {
      body: { transferCode: claimedTransferCode },
    });
    assert.equal(result.response.status, 404);
    assert.equal(result.data?.error, "transfer_code_invalid");
  });

  await step("reject superseded participant transfer code", async () => {
    const firstIssueResult = await request("POST", `/rooms/${roomCode}/participants/${player.id}/transfer-code`, {
      body: { participantId: host.id },
    });
    supersededTransferCode = firstIssueResult.data?.transferCode;
    assert.match(supersededTransferCode ?? "", /^[A-Z2-9]{8}$/);

    const secondIssueResult = await request("POST", `/rooms/${roomCode}/participants/${player.id}/transfer-code`, {
      body: { participantId: host.id },
    });
    blockedTransferCode = secondIssueResult.data?.transferCode;
    assert.match(blockedTransferCode ?? "", /^[A-Z2-9]{8}$/);
    assert.notEqual(blockedTransferCode, supersededTransferCode, "a reissued transfer code should be newly generated");

    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/claim-transfer`, {
      body: { transferCode: supersededTransferCode },
    });
    assert.equal(result.response.status, 404);
    assert.equal(result.data?.error, "transfer_code_invalid");
  });

  const spectator = await step("connect spectator socket without adding participant", async () => {
    const socket = await connectSocket("spectator");
    socket.emit("room:join", { roomCode });
    const snapshot = await waitForEvent(
      socket,
      "room:updated",
      (payload) => payload?.room?.code === roomCode,
      "spectator initial room:updated",
    );
    assert.equal(snapshot.participants.length, 2, "spectator must not be added as a participant");
    return socket;
  });

  const hostSocket = await step("connect host socket", async () => {
    const socket = await connectSocket("host");
    socket.emit("room:join", { roomCode, participantId: host.id });
    const snapshot = await waitForEvent(
      socket,
      "room:updated",
      (payload) => payload?.room?.code === roomCode,
      "host initial room:updated",
    );
    assert.ok(snapshot.participants.some((item) => item.id === host.id && item.connected), "host must be connected");
    return socket;
  });

  await step("start game", async () => {
    const result = await request("POST", `/rooms/${roomCode}/game/start`, {
      body: { participantId: host.id, gameKey, gameTitle },
    });
    const snapshot = requireSnapshot(result.data, "game start response");
    assert.equal(snapshot.room.status, "playing");
    assert.equal(snapshot.room.currentGame, gameKey);
  });

  await step("advance game", async () => {
    const result = await request("POST", `/rooms/${roomCode}/game/advance`, {
      body: { participantId: host.id },
    });
    const snapshot = requireSnapshot(result.data, "game advance response");
    assert.equal(snapshot.room.status, "playing");
    assert.equal(snapshot.room.state?.step, 2);
  });

  await step("complete game", async () => {
    const result = await request("POST", `/rooms/${roomCode}/game/complete`, {
      body: { participantId: host.id },
    });
    const snapshot = requireSnapshot(result.data, "game complete response");
    assert.equal(snapshot.room.status, "complete");
    assert.equal(snapshot.room.state?.phase, "complete");
  });

  await step("reset game", async () => {
    const result = await request("POST", `/rooms/${roomCode}/game/reset`, {
      body: { participantId: host.id },
    });
    const snapshot = requireSnapshot(result.data, "game reset response");
    assert.equal(snapshot.room.status, "waiting");
    assert.equal(snapshot.room.currentGame, null);
  });

  let closeSnapshot;

  await step("close room and notify spectator", async () => {
    const spectatorCloseUpdate = waitForEvent(
      spectator,
      "room:updated",
      isClosedSnapshot,
      "spectator room close notification",
      timeoutMs,
      { rejectOnRoomError: true },
    );

    const result = await request("POST", `/rooms/${roomCode}/close`, {
      body: { participantId: host.id },
    });
    closeSnapshot = requireSnapshot(result.data, "room close response");
    assert.equal(closeSnapshot.room.status, "closed");

    const spectatorSnapshot = await spectatorCloseUpdate;
    assert.equal(spectatorSnapshot.room.status, "closed");
  });

  await step("fetch room event history", async () => {
    const result = await request(
      "GET",
      `/rooms/${roomCode}/events?participantId=${encodeURIComponent(host.id)}`,
    );
    const events = extractEvents(result.data);
    const eventTypes = events.map((event) => event.eventType ?? event.event_type ?? event.type);
    for (const expected of [
      "room_created",
      "participant_joined",
      "game_started",
      "game_advanced",
      "game_completed",
      "game_reset",
      "room_closed",
      "participant_transfer_code_created",
      "participant_transfer_claimed",
    ]) {
      assert.ok(eventTypes.includes(expected), `event history must include ${expected}`);
    }
    assert.equal(
      JSON.stringify(events).includes(claimedTransferCode) ||
        JSON.stringify(events).includes(blockedTransferCode) ||
        JSON.stringify(events).includes(supersededTransferCode),
      false,
      "event history must not expose raw transfer codes",
    );
  });

  await step("reject game start after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/game/start`, {
      body: { participantId: host.id, gameKey, gameTitle },
    });
    assert.equal(result.response.status, 409);
  });

  await step("reject game advance after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/game/advance`, {
      body: { participantId: host.id },
    });
    assert.equal(result.response.status, 409);
  });

  await step("reject player join after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/join`, {
      body: { name: "Late Player" },
    });
    assert.equal(result.response.status, 409);
  });

  await step("reject host transfer after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/host/transfer`, {
      body: { participantId: host.id, targetParticipantId: player.id },
    });
    assert.equal(result.response.status, 409);
  });

  await step("reject participant removal after room close", async () => {
    const result = await expectHttpFailure("DELETE", `/rooms/${roomCode}/participants/${player.id}`, {
      body: { participantId: host.id },
    });
    assert.equal(result.response.status, 409);
  });

  await step("reject transfer code issue after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/participants/${player.id}/transfer-code`, {
      body: { participantId: host.id },
    });
    assert.equal(result.response.status, 409);
    assert.equal(result.data?.error, "room_closed");
  });

  await step("reject transfer code claim after room close", async () => {
    const result = await expectHttpFailure("POST", `/rooms/${roomCode}/claim-transfer`, {
      body: { transferCode: blockedTransferCode },
    });
    assert.equal(result.response.status, 409);
    assert.equal(result.data?.error, "room_closed");
  });

  await step("reject socket state update after room close", async () => {
    const errorPromise = waitForEvent(
      hostSocket,
      "room:error",
      (payload) => Boolean(payload?.error),
      "room:error after closed socket state update",
      timeoutMs,
      { rejectOnRoomError: false },
    );
    hostSocket.emit("room:state:update", {
      roomCode,
      currentGame: gameKey,
      state: {
        phase: "playing",
        marker: `after-close-${Date.now()}`,
      },
    });

    const payload = await errorPromise;
    assert.ok(payload.error, "socket state update after close must emit room:error");
  });

  log("[ok] room lifecycle check passed");
}

async function step(label, action) {
  process.stdout.write(`- ${label}... `);
  try {
    const result = await action();
    process.stdout.write("ok\n");
    return result;
  } catch (error) {
    process.stdout.write("failed\n");
    throw addContext(error, label);
  }
}

async function request(method, path, options = {}) {
  const url = new URL(path, `${apiUrl}/`);
  const init = {
    method,
    headers: {},
  };

  if (Object.hasOwn(options, "body")) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await safeFetch(url, init);
  const text = await response.text();
  const data = parseJsonBody(text);

  if (!response.ok) {
    throw new Error(`${method} ${url.pathname}${url.search} returned ${response.status}: ${formatData(data)}`);
  }

  return { response, data };
}

async function expectHttpFailure(method, path, options = {}) {
  const url = new URL(path, `${apiUrl}/`);
  const init = {
    method,
    headers: {},
  };

  if (Object.hasOwn(options, "body")) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }

  const response = await safeFetch(url, init);
  const text = await response.text();
  const data = parseJsonBody(text);

  if (response.ok) {
    throw new Error(`${method} ${url.pathname}${url.search} should fail, got ${response.status}`);
  }

  return { response, data };
}

async function safeFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot reach API at ${url.origin}. Start Docker services and retry. (${message})`);
  }
}

async function connectSocket(label) {
  const socket = io(apiUrl, {
    transports: ["websocket", "polling"],
    timeout: timeoutMs,
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} socket did not connect within ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
    }

    function onConnect() {
      cleanup();
      resolve();
    }

    function onConnectError(error) {
      cleanup();
      reject(error);
    }

    socket.once("connect", onConnect);
    socket.once("connect_error", onConnectError);
  });

  return socket;
}

function waitForEvent(socket, eventName, predicate, description, ms = timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${description}`));
    }, ms);

    function cleanup() {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      socket.off("room:error", onRoomError);
      socket.off("disconnect", onDisconnect);
    }

    function onEvent(payload) {
      if (!predicate || predicate(payload)) {
        cleanup();
        resolve(payload);
      }
    }

    function onRoomError(payload) {
      if (eventName === "room:error" || options.rejectOnRoomError === false) return;
      cleanup();
      reject(new Error(`room:error while waiting for ${description}: ${formatData(payload)}`));
    }

    function onDisconnect(reason) {
      cleanup();
      reject(new Error(`socket disconnected while waiting for ${description}: ${reason}`));
    }

    socket.on(eventName, onEvent);
    socket.on("room:error", onRoomError);
    socket.on("disconnect", onDisconnect);
  });
}

function requireSnapshot(data, context) {
  if (data?.room && Array.isArray(data?.participants)) return data;
  if (data?.snapshot?.room && Array.isArray(data?.snapshot?.participants)) return data.snapshot;
  throw new Error(`${context} must include { room, participants }`);
}

function isClosedSnapshot(payload) {
  return payload?.room?.status === "closed" || payload?.room?.state?.phase === "closed";
}

function extractEvents(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.roomEvents)) return data.roomEvents;
  throw new Error("event history response must be an array or include an events array");
}

function parseJsonBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function formatData(data) {
  if (typeof data === "string") return data;
  return JSON.stringify(data);
}

function addContext(error, label) {
  if (error instanceof Error) {
    error.message = `${label}: ${error.message}`;
  }
  return error;
}

function log(message) {
  console.log(message);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[failed] ${message}`);
  if (process.env.DEBUG) {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  for (const socket of sockets) {
    socket.disconnect();
  }
}
