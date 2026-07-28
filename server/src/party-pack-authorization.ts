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

/** Validates host-only Johari phase transitions and returns the legacy API error. */
export function validateJohariHostTransition(current: PartyPackState | null, next: PartyPackState | null) {
  const validateFreshSelf = (state: PartyPackState) => {
    const ids = playerIds(state);
    const deck = Array.isArray(state.deckWordIds) ? state.deckWordIds : [];
    const emptyMap = (value: unknown) => {
      const map = asRecord(value);
      return map !== null && Object.keys(map).length === 0;
    };
    const targetIndex = typeof state.targetIndex === "number" ? state.targetIndex : -1;
    const peerIndex = typeof state.peerIndex === "number" ? state.peerIndex : -1;
    return ids.length >= 3 && deck.length > 0 && targetIndex === 0 && peerIndex === 0 &&
      emptyMap(state.selfSelections) && emptyMap(state.selfSubmitted) &&
      emptyMap(state.peerSelections) && emptyMap(state.peerSubmitted)
      ? null
      : "host_required" as const;
  };
  if (!current && next && readString(next.step) === "self") {
    return validateFreshSelf(next);
  }
  if (!current || !next) return "host_required" as const;
  const currentStep = readString(current.step);
  const nextStep = readString(next.step);
  const ids = playerIds(current);
  const adjacent = currentStep === nextStep ||
    (currentStep === "setup" && nextStep === "self") ||
    (currentStep === "self" && nextStep === "peer") ||
    (currentStep === "peer" && nextStep === "result") ||
    (currentStep === "result" && nextStep === "complete") ||
    (currentStep === "complete" && (nextStep === "setup" || nextStep === "self"));
  if (!adjacent) return "host_required" as const;
  if (currentStep === "self" && nextStep === "peer") {
    const submitted = asRecord(next.selfSubmitted) ?? {};
    return ids.length > 0 && ids.every((id) => submitted[id] === true) ? null : "game_not_ready" as const;
  }
  if ((currentStep === "setup" || currentStep === "complete") && nextStep === "self") {
    return validateFreshSelf(next);
  }
  if (currentStep === "peer" && nextStep === "result") {
    const submitted = asRecord(next.peerSubmitted) ?? {};
    const complete = ids.length > 1 && ids.every((targetId) => {
      const targetSubmitted = asRecord(submitted[targetId]) ?? {};
      return ids.filter((peerId) => peerId !== targetId).every((peerId) => targetSubmitted[peerId] === true);
    });
    return complete ? null : "game_not_ready" as const;
  }
  if (currentStep === "result" && nextStep === "complete") {
    const lastIndex = ids.length - 1;
    const currentIndex = typeof current.targetIndex === "number" ? current.targetIndex : -1;
    const nextIndex = typeof next.targetIndex === "number" ? next.targetIndex : -1;
    return ids.length > 0 && currentIndex === lastIndex && nextIndex === currentIndex ? null : "host_required" as const;
  }
  return null;
}
