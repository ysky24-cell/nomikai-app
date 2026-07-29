import assert from "node:assert/strict";
import fs from "node:fs";

const api = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const source = fs.readFileSync(new URL("../src/syncRoomCatalog.ts", import.meta.url), "utf8");
const keys = [...source.matchAll(/^\s*"([a-z0-9-]+)",?$/gm)].map((match) => match[1]);
const native = new Set(["two-choice", "impression-ranking", "majority-game", "anonymous-box", "word-wolf", "werewolf-game"]);
const requestedKeys = (process.argv[3] || process.env.NOMIKAI_SHARED_KEYS || "").split(",").map((key) => key.trim()).filter(Boolean);
const legacyKeys = keys.filter((key) => !native.has(key) && (requestedKeys.length === 0 || requestedKeys.includes(key)));
const turnKeys = new Set([
  "yamanote", "ng-word", "party-pack", "turtle-soup", "song-association-quiz", "drawing-quiz", "hazard-card-game", "acting-phrase-game", "party-sugoroku", "territory-board-game", "life-event-sugoroku", "arm-wrestling-tournament", "safe-random-draw", "person-hint-quiz", "humming-intro-quiz", "loanword-ban-game",
]);

async function json(path, options = {}) {
  const response = await fetch(`${api}${path}`, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error ?? `${response.status}: ${path}`);
  return body;
}

async function command(room, token, body) {
  return json(`/v2/rooms/${room.code}/commands`, { method: "POST", headers: { "x-room-token": token }, body: JSON.stringify(body) });
}

const checks = [];
const priorityInputs = {
  "truth-lie-game": ["2", "1"],
  "count-up-game": ["1,2,3", "1,2"],
  "reverse-word-game": ["olleh", "dlrow"],
  "typing-speed-game": ["same text|1200", "same text|1500"],
  "value-meter-game": ["72|甘め", "48|ふつう"],
};
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
  const prompt = gameKey === "count-up-game" ? "目標12" : `${gameKey} acceptance`;
  const started = await command(created.room, host.token, { commandId: `${gameKey}-start`, expectedVersion: version, kind: "game_start", participantId: host.id, gameKind: "legacy-game", legacyGameKey: gameKey, mode: "shared-input", prompt });
  version = started.version;
  const early = await fetch(`${api}/v2/rooms/${created.room.code}/commands`, { method: "POST", headers: { "content-type": "application/json", "x-room-token": host.token }, body: JSON.stringify({ commandId: `${gameKey}-early`, expectedVersion: version, kind: "game_reveal", participantId: host.id }) });
  assert.ok([400, 409].includes(early.status), `${gameKey}: early reveal accepted`);
  const inputResults = gameKey === "count-up-game" || turnKeys.has(gameKey) ? await (async () => {
    let nextVersion = version;
    for (const [index, player] of players.entries()) {
      const input = gameKey === "count-up-game" ? "1,2,3" : priorityInputs[gameKey]?.[index] ?? `answer-${index}`;
      const submitted = await command(created.room, player.token, { commandId: `${gameKey}-turn-${index}`, expectedVersion: nextVersion, kind: "legacy_input", participantId: player.id, input });
      nextVersion = submitted.version;
    }
    return players.map(() => ({ version: nextVersion }));
  })() : await (async () => {
    const firstPlayer = players[0];
    const firstInput = priorityInputs[gameKey]?.[0] ?? "answer-0";
    const firstSubmitted = await command(created.room, firstPlayer.token, { commandId: `${gameKey}-input-0`, expectedVersion: version, kind: "legacy_input", participantId: firstPlayer.id, input: firstInput });
    const waitingView = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(players[1].id)}`, { headers: { "x-room-token": players[1].token } });
    assert.equal(waitingView.game?.phase, "playing", `${gameKey}: finished before every participant answered`);
    assert.equal(waitingView.game?.ownInput, undefined, `${gameKey}: another participant's input leaked`);
    assert.equal(waitingView.game?.result, undefined, `${gameKey}: result leaked before every participant answered`);
    const remaining = await Promise.all(players.slice(1).map(async (player, relativeIndex) => {
      const index = relativeIndex + 1;
    const input = priorityInputs[gameKey]?.[index] ?? `answer-${index}`;
      let expectedVersion = firstSubmitted.version;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const submitted = await command(created.room, player.token, { commandId: `${gameKey}-input-${index}-${attempt}`, expectedVersion, kind: "legacy_input", participantId: player.id, input });
        const privateAfter = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(player.id)}`, { headers: { "x-room-token": player.token } });
        assert.equal(privateAfter.game?.ownInput, input, `${gameKey}: own input was not restored`);
        return submitted;
      } catch (error) {
        if (!String(error).includes("version_conflict")) throw error;
        const latest = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(player.id)}`, { headers: { "x-room-token": player.token } });
        expectedVersion = latest.version;
      }
    }
    throw new Error(`${gameKey}: concurrent input did not converge`);
    }));
    return [firstSubmitted, ...remaining];
  })();
  version = Math.max(...inputResults.map((result) => result.version));
  const hostView = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(host.id)}`, { headers: { "x-room-token": host.token } });
  assert.equal(hostView.game?.phase, "finished", `${gameKey}: automatic result did not finish`);
  const disconnected = players[1];
  const left = await command(created.room, disconnected.token, { commandId: `${gameKey}-leave`, expectedVersion: version, kind: "leave", participantId: disconnected.id });
  version = left.version;
  const reconnected = await command(created.room, disconnected.token, { commandId: `${gameKey}-reconnect`, expectedVersion: version, kind: "reconnect", participantId: disconnected.id });
  version = reconnected.version;
  const restored = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(disconnected.id)}`, { headers: { "x-room-token": disconnected.token } });
  const expectedReconnectInput = gameKey === "count-up-game" ? "1,2,3" : priorityInputs[gameKey]?.[1] ?? "answer-1";
  assert.equal(restored.game?.ownInput, expectedReconnectInput, `${gameKey}: reconnect lost own input`);
  const finished = await json(`/v2/rooms/${created.room.code}?participantId=${encodeURIComponent(host.id)}`, { headers: { "x-room-token": host.token } });
  assert.equal(finished.game?.phase, "finished", `${gameKey}: result did not finish`);
  checks.push(gameKey);
}

console.log(JSON.stringify({ ok: true, keys: checks.length, checks, priority: Object.keys(priorityInputs) }));
