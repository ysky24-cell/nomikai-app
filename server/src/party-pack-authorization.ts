type PartyPackState = Record<string, unknown>;

const promptModes = new Set([
  "yamanote",
  "majority",
  "truth-lie",
  "reverse-word",
  "loanword-ban",
  "typing",
  "memory-drawing",
  "value-meter",
  "acting",
  "hint-quiz",
]);

const participantRevealModes = new Set(["typing", "hint-quiz"]);

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asRecord(value: unknown): PartyPackState | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PartyPackState : null;
}

function currentPlayerId(state: PartyPackState, playerIds: string[]) {
  const index = typeof state.currentPlayerIndex === "number" && Number.isInteger(state.currentPlayerIndex) && state.currentPlayerIndex >= 0
    ? state.currentPlayerIndex
    : 0;
  return playerIds.length > 0 ? playerIds[index % playerIds.length] ?? null : null;
}

export function readPartyPackPromptMode(value: unknown) {
  const promptId = readString(value);
  if (!promptId) return null;
  const mode = promptId.replace(/-\d+$/, "");
  return promptModes.has(mode) ? mode : null;
}

function playerIds(state: PartyPackState) {
  const players = Array.isArray(state.players) ? state.players : [];
  return players
    .map((player) => asRecord(player)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

function allHave(ids: string[], map: PartyPackState) {
  return ids.length > 0 && ids.every((id) => Object.prototype.hasOwnProperty.call(map, id) && map[id] !== "" && map[id] !== null && typeof map[id] !== "undefined");
}

/** Returns the legacy API error when a host tries to reveal an incomplete result. */
export function validatePartyPackHostReveal(current: PartyPackState | null, next: PartyPackState | null) {
  if (!current || !next || current.step !== "prompt" || next.step !== "prompt" || current.answerVisible === true || next.answerVisible !== true) return null;
  const mode = readPartyPackPromptMode(current.promptId);
  const ids = playerIds(current);
  const voterIds = ids.filter((id) => id !== currentPlayerId(current, ids));
  const votes = asRecord(next.votes) ?? {};
  const guesses = asRecord(next.guesses) ?? {};
  if (mode === "majority" && !allHave(ids, votes)) return "game_not_ready" as const;
  if (mode === "truth-lie" && (!readString(guesses.truthLieAnswer) || !allHave(voterIds, votes))) return "game_not_ready" as const;
  if (mode === "acting" && (!readString(guesses.actingEmotion) || !allHave(voterIds, votes))) return "game_not_ready" as const;
  if (mode === "value-meter" && (!allHave(ids, votes) || !allHave(ids, guesses))) return "game_not_ready" as const;
  return null;
}

export function canPartyPackParticipantReveal(mode: string | null, requesterId: string, currentId: string | null, changedKeys: string[], nextAnswerVisible: unknown) {
  return requesterId === currentId && mode !== null && participantRevealModes.has(mode) && changedKeys.length === 1 && changedKeys[0] === "answerVisible" && typeof nextAnswerVisible === "boolean";
}
