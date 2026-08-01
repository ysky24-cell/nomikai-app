#!/usr/bin/env node
import assert from "node:assert/strict";

const apiUrl = (process.env.API_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let sequence = 0;

async function request(path, options = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.token ? { "x-room-token": options.token } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function command(roomCode, participant, projection, kind, extra = {}) {
  const result = await request(`/v2/rooms/${roomCode}/commands`, {
    method: "POST",
    token: participant.token,
    body: { commandId: `${kind}-${++sequence}`, expectedVersion: projection.version, kind, participantId: participant.id, ...extra },
  });
  return result;
}

async function main() {
  const created = await request("/v2/rooms", { method: "POST", body: { hostName: "新同期マジョリティ監査ホスト" } });
  assert.equal(created.response.status, 201);
  const roomCode = created.data.room.code;
  const host = { id: created.data.room.self.id, token: created.data.hostToken };
  const participants = [host];
  let projection = created.data.room;
  for (const name of ["監査Alice", "監査Bob"]) {
    const joined = await command(roomCode, { token: "" }, projection, "join", { name });
    assert.equal(joined.response.status, 200);
    participants.push({ id: joined.data.credentials.participantId, token: joined.data.credentials.reconnectToken });
    projection = joined.data;
  }

  const locked = await command(roomCode, host, projection, "start");
  assert.equal(locked.response.status, 200);
  projection = locked.data;
  const started = await command(roomCode, host, projection, "game_start", { gameKind: "majority-game", prompt: "AとB、どちらが多数派？" });
  assert.equal(started.response.status, 200);
  projection = started.data;

  const early = await command(roomCode, host, projection, "game_reveal");
  assert.ok([400, 409].includes(early.response.status));
  assert.equal(early.data.error, "game_not_ready");

  for (const [index, participant] of participants.entries()) {
    const privateProjection = await request(`/v2/rooms/${roomCode}?participantId=${encodeURIComponent(participant.id)}`, { token: participant.token });
    assert.equal(privateProjection.response.status, 200);
    const voted = await command(roomCode, participant, privateProjection.data, "game_vote", { voteTargetId: index === 1 ? "B" : "A" });
    assert.equal(voted.response.status, 200);
  }

  const afterVotes = await request(`/v2/rooms/${roomCode}?participantId=${encodeURIComponent(host.id)}`, { token: host.token });
  const revealed = await command(roomCode, host, afterVotes.data, "game_reveal");
  assert.equal(revealed.response.status, 200);
  assert.equal(revealed.data.game.kind, "majority-game");
  assert.deepEqual(revealed.data.game.result, { A: 2, B: 1 });

  const playerProjection = await request(`/v2/rooms/${roomCode}?participantId=${encodeURIComponent(participants[1].id)}`, { token: participants[1].token });
  assert.deepEqual(playerProjection.data.game.result, { A: 2, B: 1 });
  console.log(JSON.stringify({ ok: true, checks: ["new sync room majority start", "early reveal rejected", "private vote ownership", "all votes reveal result to every device"] }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
