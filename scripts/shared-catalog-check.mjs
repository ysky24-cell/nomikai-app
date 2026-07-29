import assert from "node:assert/strict";
import fs from "node:fs";

const api = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const source = fs.readFileSync(new URL("../src/syncRoomCatalog.ts", import.meta.url), "utf8");
const keys = [...source.matchAll(/^\s*"([a-z0-9-]+)",?$/gm)].map((match) => match[1]);
const native = new Set(["two-choice", "impression-ranking", "majority-game", "anonymous-box", "word-wolf", "werewolf-game"]);
const legacyKeys = keys.filter((key) => !native.has(key));

async function json(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: ${JSON.stringify(body)}`);
  return body;
}

async function command(room, token, body) {
  return json(`/v2/rooms/${room.code}/commands`, { method: "POST", headers: { "x-room-token": token }, body: JSON.stringify(body) });
}

const checks = [];
for (const gameKey of legacyKeys) {
  const minimum = gameKey === "large-majority-game" ? 10 : gameKey === "word-wolf" || gameKey === "ng-word" || gameKey === "party-pack" || gameKey === "johari-window" || gameKey === "acting-phrase-game" || gameKey === "resource-negotiation-game" || gameKey === "emo-hint-game" ? 3 : 2;
  const created = await json("/v2/rooms", { method: "POST", body: JSON.stringify({ hostName: `check-${gameKey}` }) });
  const host = { id: created.room.self.id, token: created.hostToken };
  const players = [host];
  let version = created.room.version;
  for (let index = 1; index < minimum; index += 1) {
    const joined = await command(created.room, undefined, { commandId: `${gameKey}-join-${index}`, expectedVersion: version, kind: "join", name: `${gameKey}-${index}` });
    version = joined.version;
    players.push({ id: joined.credentials.participantId, token: joined.credentials.reconnectToken });
  }
  const started = await command(created.room, host.token, { commandId: `${gameKey}-start`, expectedVersion: version, kind: "game_start", participantId: host.id, gameKind: "legacy-game", legacyGameKey: gameKey, mode: "shared-input", prompt: `${gameKey} acceptance` });
  version = started.version;
  const early = await fetch(`${api}/v2/rooms/${created.room.code}/commands`, { method: "POST", headers: { "content-type": "application/json", "x-room-token": host.token }, body: JSON.stringify({ commandId: `${gameKey}-early`, expectedVersion: version, kind: "game_reveal", participantId: host.id }) });
  assert.ok([400, 409].includes(early.status), `${gameKey}: early reveal accepted`);
  await Promise.all(players.map(async (player, index) => {
    let expectedVersion = version;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await command(created.room, player.token, { commandId: `${gameKey}-input-${index}-${attempt}`, expectedVersion, kind: "legacy_input", participantId: player.id, input: `answer-${index}` });
        return;
      } catch (error) {
        if (!String(error).includes("version_conflict")) throw error;
        const latest = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(player.id)}`, { headers: { "x-room-token": player.token } });
        expectedVersion = latest.version;
        await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 10));
      }
    }
    throw new Error(`${gameKey}: concurrent input did not converge`);
  }));
  const latest = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(host.id)}`, { headers: { "x-room-token": host.token } });
  const finished = await command(created.room, host.token, { commandId: `${gameKey}-finish`, expectedVersion: latest.version, kind: "game_reveal", participantId: host.id });
  assert.equal(finished.game?.phase, "finished", `${gameKey}: result did not finish`);
  checks.push(gameKey);
}

console.log(JSON.stringify({ ok: true, keys: checks.length, checks }));
