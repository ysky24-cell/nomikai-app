#!/usr/bin/env node
import assert from "node:assert/strict";

const apiUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

async function request(method, path, { token, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { "x-room-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${data?.error ?? response.status}`);
  return data;
}

function command(roomCode, expectedVersion, kind, participantId, extra = {}) {
  return {
    roomCode,
    commandId: `${kind}-${participantId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    expectedVersion,
    kind,
    participantId,
    ...extra,
  };
}

async function main() {
  const created = await request("POST", "/v2/rooms", { body: { hostName: "Johari v2 Check Host" } });
  const roomCode = created.room.code;
  const host = { id: created.room.self.id, token: created.hostToken };
  const players = [host];
  let version = created.room.version;
  for (const name of ["Johari v2 Alice", "Johari v2 Bob"]) {
    const joined = await request("POST", `/v2/rooms/${roomCode}/commands`, {
      body: command(roomCode, version, "join", "join", { joinNonce: `${name}-${Date.now()}-${Math.random()}`, name }),
    });
    players.push({ id: joined.credentials.participantId, token: joined.credentials.reconnectToken });
    version = joined.version;
  }

  const locked = await request("POST", `/v2/rooms/${roomCode}/commands`, {
    token: host.token,
    body: command(roomCode, version, "start", host.id),
  });
  const started = await request("POST", `/v2/rooms/${roomCode}/commands`, {
    token: host.token,
    body: command(roomCode, locked.version, "game_start", host.id, {
      gameKind: "johari-window",
      prompt: "自分と周りから見た特徴",
      johariDeckWordIds: ["w1", "w2", "w3", "w4"],
    }),
  });
  assert.equal(started.game.kind, "johari-window");
  assert.equal(started.game.phase, "self");

  const selfSelections = [["w1", "w2"], ["w2"], ["w3"]];
  const selfResults = await Promise.all(players.map((player, index) => request("POST", `/v2/rooms/${roomCode}/commands`, {
    token: player.token,
    body: command(roomCode, started.version, "johari_self_submit", player.id, { selectedWordIds: selfSelections[index] }),
  })));
  const peerStage = selfResults.find((result) => result.game.phase === "peer");
  assert.ok(peerStage);
  const publicPeer = await request("GET", `/v2/rooms/${roomCode}`);
  assert.equal(publicPeer.game.phase, "peer");
  assert.equal("ownSelfSelection" in publicPeer.game, false);
  assert.equal("ownPeerSelections" in publicPeer.game, false);

  const peerSelections = [
    [0, 1, ["w2"]], [0, 2, ["w3"]],
    [1, 0, ["w1", "w3"]], [1, 2, ["w1"]],
    [2, 0, ["w2"]], [2, 1, ["w2", "w4"]],
  ];
  const resultCommands = await Promise.all(peerSelections.map(([voterIndex, targetIndex, selectedWordIds]) => {
    const voter = players[voterIndex];
    return request("POST", `/v2/rooms/${roomCode}/commands`, {
      token: voter.token,
      body: command(roomCode, peerStage.version, "johari_peer_submit", voter.id, {
        targetParticipantId: players[targetIndex].id,
        selectedWordIds,
      }),
    });
  }));
  const result = resultCommands.find((candidate) => candidate.game.phase === "result");
  assert.ok(result);
  assert.equal(result.status, "finished");
  assert.deepEqual(result.game.result[players[0].id], { open: ["w1", "w2"], hidden: [], blind: ["w3"], unknown: ["w4"] });
  assert.deepEqual(result.game.result[players[1].id], { open: ["w2"], hidden: [], blind: ["w4"], unknown: ["w1", "w3"] });

  const reset = await request("POST", `/v2/rooms/${roomCode}/commands`, {
    token: host.token,
    body: command(roomCode, result.version, "reset", host.id),
  });
  assert.equal(reset.status, "waiting");
  assert.equal(reset.game, undefined);
  console.log(JSON.stringify({ ok: true, roomCode, checks: ["host respondent", "private self/peer projection", "automatic self-to-peer gate", "automatic deterministic result", "reset"] }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
