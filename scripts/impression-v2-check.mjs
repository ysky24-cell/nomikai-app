#!/usr/bin/env node
import assert from "node:assert/strict";

const baseUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const sessions = [];

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { "x-room-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

function commandId(label) { return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function sessionToken(session) { return session.role === "host" ? session.hostToken : session.reconnectToken; }
function assertProjection(data) { assert.ok(data && data.code && Array.isArray(data.participants), "projection required"); return data; }

async function command(roomCode, session, kind, expectedVersion, extra = {}) {
  const result = await request(`/v2/rooms/${encodeURIComponent(roomCode)}/commands`, {
    method: "POST",
    token: sessionToken(session),
    body: { commandId: commandId(kind), expectedVersion, kind, participantId: session.id, ...extra },
  });
  return result;
}

async function main() {
  const health = await request("/health");
  assert.equal(health.data?.ok, true, "health must be ok");

  const created = await request("/v2/rooms", { method: "POST", body: { hostName: "Audit Host" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  sessions.push({ id: created.data.room.self.id, role: "host", hostToken: created.data.hostToken, reconnectToken: created.data.reconnectToken });

  for (const name of ["Audit Alice", "Audit Bob"]) {
    const current = assertProjection((await request(`/v2/rooms/${roomCode}`)).data);
    const joined = await command(roomCode, sessions[0], "join", current.version, { name });
    assert.equal(joined.response.status, 200);
    sessions.push({ id: joined.data.credentials.participantId, role: "player", reconnectToken: joined.data.credentials.reconnectToken });
  }

  let current = assertProjection((await request(`/v2/rooms/${roomCode}`)).data);
  const started = await command(roomCode, sessions[0], "game_start", current.version, { gameKind: "impression-ranking", prompt: "誰が一番頼れそう？" });
  assert.equal(started.response.status, 200);
  current = assertProjection(started.data);

  const early = await command(roomCode, sessions[0], "game_reveal", current.version);
  assert.equal(early.response.status, 409);
  assert.equal(early.data?.error, "game_not_ready");

  const voteVersion = current.version;
  const voteRequests = [
    command(roomCode, sessions[0], "game_vote", voteVersion, { voteTargetId: sessions[1].id }),
    command(roomCode, sessions[1], "game_vote", voteVersion, { voteTargetId: sessions[2].id }),
    command(roomCode, sessions[2], "game_vote", voteVersion, { voteTargetId: "skip" }),
  ];
  const simultaneous = await Promise.all(voteRequests);
  assert.equal(simultaneous.filter((item) => item.response.status === 200).length, 1, "one concurrent vote should win the version race");
  assert.equal(simultaneous.filter((item) => item.response.status === 409 && item.data?.error === "version_conflict").length, 2, "other concurrent votes should report version conflict");

  for (const [index, session] of sessions.entries()) {
    const privateProjection = assertProjection((await request(`/v2/rooms/${roomCode}?participantId=${encodeURIComponent(session.id)}`, { token: sessionToken(session) })).data);
    if (privateProjection.game?.ownVote) continue;
    const latest = assertProjection((await request(`/v2/rooms/${roomCode}`)).data);
    const target = index === 0 ? sessions[1].id : index === 1 ? sessions[2].id : "skip";
    const retried = await command(roomCode, session, "game_vote", latest.version, { voteTargetId: target });
    assert.equal(retried.response.status, 200);
  }

  current = assertProjection((await request(`/v2/rooms/${roomCode}`)).data);
  assert.equal(current.game?.kind, "impression-ranking");
  assert.equal(current.game.voteCount, 3);
  assert.equal("result" in current.game, false, "votes stay private before reveal");

  const bob = sessions[2];
  const left = await command(roomCode, bob, "leave", current.version);
  assert.equal(left.response.status, 200);
  const reconnected = await command(roomCode, bob, "reconnect", left.data.version);
  assert.equal(reconnected.response.status, 200);
  assert.equal(reconnected.data.game?.ownVote, "skip");

  const revealed = await command(roomCode, sessions[0], "game_reveal", reconnected.data.version);
  assert.equal(revealed.response.status, 200);
  assert.equal(revealed.data.game?.phase, "revealed");
  assert.equal(Object.values(revealed.data.game.result).reduce((sum, count) => sum + count, 0), 3);
  const playerResult = assertProjection((await request(`/v2/rooms/${roomCode}?participantId=${encodeURIComponent(sessions[1].id)}`, { token: sessionToken(sessions[1]) })).data);
  assert.equal(playerResult.game?.phase, "revealed");
  assert.deepEqual(playerResult.game.result, revealed.data.game.result);

  await command(roomCode, sessions[0], "close", revealed.data.version);
  console.log(JSON.stringify({ ok: true, checks: ["3 simultaneous votes", "pre-result privacy", "early reveal rejected", "reconnect recovery", "all-device result"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
