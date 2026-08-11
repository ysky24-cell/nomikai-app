import { createHash, randomBytes } from "node:crypto";

// `playing` and `closed` are retained for old snapshots and clients. New
// commands use the more explicit lobby/game lifecycle when possible.
export type RoomStatus = "waiting" | "locked" | "playing" | "finished" | "closed";
export type ParticipantRole = "host" | "player";

export type RoomParticipant = {
  id: string;
  name: string;
  role: ParticipantRole;
  reconnectTokenHash: string;
  connected: boolean;
};

export type TwoChoiceAnswer = "A" | "B" | "pass";
export type AnonymousEntryStatus = "unshown" | "displayed" | "answered" | "skipped";
export type JohariPane = {
  open: string[];
  hidden: string[];
  blind: string[];
  unknown: string[];
};
export type JohariResult = Record<string, JohariPane>;
type TwoChoiceGameState = {
  kind: "two-choice";
  startedVersion?: number;
  prompt: string;
  deadlineAt: number | null;
  phase: "answering" | "revealed";
  answers: Record<string, TwoChoiceAnswer>;
};
type ImpressionGameState = {
  kind: "impression-ranking";
  startedVersion?: number;
  prompt: string;
  phase: "voting" | "revealed";
  votes: Record<string, string>;
};
type MajorityGameState = {
  kind: "majority-game";
  startedVersion?: number;
  prompt: string;
  phase: "voting" | "revealed";
  votes: Record<string, string>;
};
type JohariGameState = {
  kind: "johari-window";
  startedVersion?: number;
  prompt: string;
  phase: "self" | "peer" | "result";
  deckWordIds: string[];
  selfSelections: Record<string, string[]>;
  selfSubmitted: Record<string, boolean>;
  peerSelections: Record<string, Record<string, string[]>>;
  peerSubmitted: Record<string, Record<string, boolean>>;
  results?: JohariResult;
};
type AnonymousEntry = { id: string; text: string; authorId: string; status: AnonymousEntryStatus };
type AnonymousGameState = {
  kind: "anonymous-box";
  startedVersion?: number;
  prompt: string;
  entries: AnonymousEntry[];
};
type WordWolfGameState = {
  kind: "word-wolf";
  startedVersion?: number;
  phase: "discussion" | "voting" | "revealed";
  majorityTopic: string;
  minorityTopic: string;
  minorityIds: string[];
  votes: Record<string, string>;
  winner?: "majority" | "minority" | "draw";
  phaseDeadlineAt: number | null;
};
export type WerewolfRole = "werewolf" | "seer" | "guard" | "villager";
type WerewolfGameState = {
  kind: "werewolf";
  startedVersion?: number;
  phase: "night" | "day" | "voting" | "revote" | "finished";
  roles: Record<string, WerewolfRole>;
  aliveIds: string[];
  nightActions: { killTargetId?: string; guardTargetId?: string; inspectTargetId?: string };
  votes: Record<string, string>;
  tiedTargetIds: string[];
  winner?: "werewolf" | "villager";
  seerResults: Record<string, { targetId: string; role: WerewolfRole }[]>;
  phaseDeadlineAt: number | null;
};
type LegacyGameState = {
  kind: "legacy-game";
  startedVersion?: number;
  gameKey: string;
  prompt: string;
  mode: string;
  progression: "simultaneous" | "turn" | "count-up";
  phase: "playing" | "finished";
  inputs: Record<string, string>;
  turnIndex?: number;
  currentTotal?: number;
  targetNumber?: number;
  turnHistory?: Array<{ playerId: string; add: number; total: number }>;
  result?: LegacyGameResult;
};
export type LegacyGameResult = {
  inputs: Record<string, string>;
  summary: string;
  scores: Record<string, number>;
};
export type RoomGameState = TwoChoiceGameState | ImpressionGameState | MajorityGameState | JohariGameState | AnonymousGameState | WordWolfGameState | WerewolfGameState | LegacyGameState;

export type RoomRecord = {
  id: string;
  code: string;
  status: RoomStatus;
  version: number;
  createdAt: number;
  expiresAt: number;
  hostTokenHash: string;
  participants: RoomParticipant[];
  game?: RoomGameState;
};

export type RoomPresenceChange = {
  participantId: string;
  connected: boolean;
};

export type RoomCommandResult = RoomProjection & {
  credentials?: { participantId: string; reconnectToken: string };
};

export type RoomProjection = {
  code: string;
  status: RoomStatus;
  version: number;
  participants: Array<Pick<RoomParticipant, "id" | "name" | "role" | "connected">>;
  self: { id: string; role: ParticipantRole } | null;
  game?: PublicRoomGame;
};

export type PublicRoomGame =
  | { kind: "two-choice"; prompt: string; deadlineAt: number | null; phase: "answering" | "revealed"; answeredCount: number; participantCount: number; ownAnswer?: TwoChoiceAnswer; result?: { A: number; B: number; pass: number } }
  | { kind: "impression-ranking"; prompt: string; phase: "voting" | "revealed"; voteCount: number; participantCount: number; ownVote?: string; result?: Record<string, number> }
  | { kind: "majority-game"; prompt: string; phase: "voting" | "revealed"; voteCount: number; participantCount: number; ownVote?: string; result?: Record<string, number> }
  | { kind: "johari-window"; prompt: string; phase: "self" | "peer" | "result"; deckWordIds: string[]; participantCount: number; selfSubmittedCount: number; selfParticipantCount: number; peerSubmittedCount: number; peerRequiredCount: number; ownSelfSelection?: string[]; ownSelfSubmitted?: boolean; ownPeerSelections?: Record<string, string[]>; ownPeerSubmitted?: Record<string, boolean>; result?: JohariResult }
  | { kind: "anonymous-box"; prompt: string; entries: Array<{ id: string; text: string; status: AnonymousEntryStatus }>; ownEntry?: { id: string; text: string; status: AnonymousEntryStatus } }
  | { kind: "word-wolf"; phase: "discussion" | "voting" | "revealed"; phaseDeadlineAt: number | null; participantCount: number; voteCount: number; ownTopic?: string; ownVote?: string; winner?: "majority" | "minority" | "draw"; voteResults?: Record<string, number> }
  | { kind: "werewolf"; phase: "night" | "day" | "voting" | "revote" | "finished"; phaseDeadlineAt: number | null; aliveIds: string[]; ownRole?: WerewolfRole; teammates?: string[]; ownSeerResults?: { targetId: string; role: WerewolfRole }[]; ownVote?: string; tiedTargetIds?: string[]; winner?: "werewolf" | "villager" }
  | { kind: "legacy-game"; gameKey: string; prompt: string; mode: string; progression: "simultaneous" | "turn" | "count-up"; phase: "playing" | "finished"; inputCount: number; participantCount: number; remainingCount: number; ownInput?: string; currentPlayerId?: string; currentTotal?: number; targetNumber?: number; turnHistory?: Array<{ playerId: string; add: number; total: number }>; result?: LegacyGameResult };

export type RoomCommand = {
  roomCode: string;
  commandId: string;
  expectedVersion: number;
  kind: "join" | "reconnect" | "leave" | "kick" | "start" | "close" | "reset" | "game_reset" | "game_start" | "game_answer" | "game_reveal" | "johari_self_submit" | "johari_peer_submit" | "anonymous_submit" | "anonymous_moderate" | "game_vote" | "game_phase" | "werewolf_action" | "legacy_input";
  participantId?: string;
  joinNonce?: string;
  targetParticipantId?: string;
  name?: string;
  gameKind?: "two-choice" | "impression-ranking" | "majority-game" | "johari-window" | "anonymous-box" | "word-wolf" | "werewolf" | "legacy-game";
  legacyGameKey?: string;
  mode?: string;
  prompt?: string;
  deadlineAt?: number | null;
  choice?: TwoChoiceAnswer;
  johariDeckWordIds?: string[];
  deckWordIds?: string[];
  selectedWordIds?: string[];
  submit?: boolean;
  text?: string;
  targetEntryId?: string;
  moderationStatus?: AnonymousEntryStatus;
  minorityCount?: number;
  majorityTopic?: string;
  minorityTopic?: string;
  voteTargetId?: string;
  action?: "kill" | "guard" | "inspect";
  input?: string;
};

export interface RoomRepository {
  create(room: RoomRecord): Promise<void>;
  get(code: string): Promise<RoomRecord | null>;
  save(room: RoomRecord, presenceChanges?: readonly RoomPresenceChange[]): Promise<void>;
  cleanupExpired?(now?: number): Promise<number>;
  listActiveCodes?(now?: number): Promise<string[]>;
  setParticipantConnected?(roomCode: string, participantId: string, connected: boolean): Promise<boolean>;
}

export class MemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, RoomRecord>();
  constructor(private readonly now = () => Date.now()) {}
  async create(room: RoomRecord) { this.rooms.set(room.code, structuredClone(room)); }
  async get(code: string) {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.expiresAt <= this.now()) return null;
    return structuredClone(room);
  }
  async save(room: RoomRecord, presenceChanges: readonly RoomPresenceChange[] = []) {
    const snapshot = structuredClone(room);
    for (const change of presenceChanges) {
      const participant = snapshot.participants.find((item) => item.id === change.participantId);
      if (participant) participant.connected = change.connected;
    }
    this.rooms.set(room.code, snapshot);
  }
  async cleanupExpired(now = this.now()) {
    let deleted = 0;
    for (const [code, room] of this.rooms) {
      if (room.expiresAt <= now) {
        this.rooms.delete(code);
        deleted += 1;
      }
    }
    return deleted;
  }
  async listActiveCodes(now = this.now()) {
    return [...this.rooms.values()].filter((room) => room.expiresAt > now).map((room) => room.code);
  }
  async setParticipantConnected(roomCode: string, participantId: string, connected: boolean) {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    const participant = room?.participants.find((item) => item.id === participantId);
    if (!participant) return false;
    participant.connected = connected;
    return true;
  }
}

export class RoomDomainError extends Error {
  constructor(public readonly code: string, message = code) { super(message); }
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxParticipants = 30;
const ttlMs = 6 * 60 * 60 * 1000;
const legacyGameKeys = new Set([
  "yamanote", "word-wolf", "ng-word", "party-pack", "johari-window", "turtle-soup", "truth-lie-game", "count-up-game", "reverse-word-game", "song-association-quiz", "drawing-quiz", "hazard-card-game", "typing-speed-game", "memory-logo-drawing", "value-meter-game", "acting-phrase-game", "party-sugoroku", "territory-board-game", "weird-karuta-game", "emo-hint-game", "resource-negotiation-game", "life-event-sugoroku", "arm-wrestling-tournament", "safe-random-draw", "person-hint-quiz", "large-majority-game", "humming-intro-quiz", "loanword-ban-game",
]);

const legacyProgressionByKey: Record<string, LegacyGameState["progression"]> = {
  yamanote: "turn",
  "ng-word": "turn",
  "party-pack": "turn",
  "turtle-soup": "turn",
  "song-association-quiz": "turn",
  "drawing-quiz": "turn",
  "hazard-card-game": "turn",
  "acting-phrase-game": "turn",
  "party-sugoroku": "turn",
  "territory-board-game": "turn",
  "life-event-sugoroku": "turn",
  "arm-wrestling-tournament": "turn",
  "safe-random-draw": "turn",
  "person-hint-quiz": "turn",
  "humming-intro-quiz": "turn",
  "loanword-ban-game": "turn",
  "reverse-word-game": "turn",
  "count-up-game": "count-up",
};

function legacyProgression(gameKey: string): LegacyGameState["progression"] {
  return legacyProgressionByKey[gameKey] ?? "simultaneous";
}

export function validateLegacyInput(gameKey: string, input: string) {
  if (gameKey === "count-up-game") return /^[1-3](?:\s*,\s*[1-3])*$/.test(input);
  if (gameKey === "value-meter-game") {
    const separator = input.indexOf("|");
    if (separator <= 0) return false;
    const value = Number(input.slice(0, separator).trim());
    return Number.isInteger(value) && value >= 1 && value <= 100 && input.slice(separator + 1).trim().length > 0;
  }
  if (gameKey === "typing-speed-game") {
    const separator = input.lastIndexOf("|");
    if (separator <= 0) return false;
    const elapsedMs = Number(input.slice(separator + 1).trim());
    return Number.isInteger(elapsedMs) && elapsedMs >= 1 && elapsedMs <= 120_000 && input.slice(0, separator).trim().length > 0;
  }
  if (gameKey === "truth-lie-game") return ["1", "2", "3", "A", "B", "C"].includes(input.toUpperCase());
  return input.length > 0;
}
const legacyMinimumPlayers: Record<string, number> = {
  "word-wolf": 4,
  "ng-word": 3,
  "party-pack": 3,
  "johari-window": 3,
  "acting-phrase-game": 3,
  "resource-negotiation-game": 3,
  "emo-hint-game": 3,
  "large-majority-game": 10,
};

const nativeMinimumPlayers: Record<Exclude<RoomCommand["gameKind"], "legacy-game" | undefined>, number> = {
  "two-choice": 2,
  "impression-ranking": 3,
  "majority-game": 3,
  "johari-window": 3,
  "anonymous-box": 2,
  "word-wolf": 4,
  werewolf: 4,
};

const defaultJohariDeckWordIds = [
  "warm-01", "warm-02", "warm-03", "warm-04", "warm-05",
  "social-01", "social-02", "social-03", "social-04", "social-05",
  "steady-01", "steady-02", "steady-03", "steady-04", "steady-05",
  "creative-01", "creative-02", "creative-03", "creative-04", "creative-05",
];

const commandResultTtlMs = 10 * 60 * 1000;
const maxCommandResults = 4_096;
const maxStaleMergeVersions = 64;

type StoredCommandResult = {
  result: RoomCommandResult;
  bodyHash: string;
  baseKey: string;
  expiresAt: number;
};

class RepositoryVersionConflict extends Error {
  constructor() {
    super("version_conflict");
    this.name = "RepositoryVersionConflict";
  }
}

function isVersionConflictError(error: unknown) {
  return error instanceof RepositoryVersionConflict
    || error instanceof RoomDomainError && error.code === "version_conflict"
    || error instanceof Error && error.message === "version_conflict"
    || Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "version_conflict");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function commandBodyHash(command: RoomCommand) {
  return createHash("sha256").update(JSON.stringify(canonicalize(command))).digest("base64url");
}

function activeParticipants(room: RoomRecord) {
  return room.participants.filter((participant) => participant.connected);
}

function isTerminalGame(game: RoomGameState | undefined) {
  if (!game) return false;
  if (game.kind === "two-choice") return game.phase === "revealed";
  if (game.kind === "impression-ranking" || game.kind === "majority-game") return game.phase === "revealed";
  if (game.kind === "johari-window") return game.phase === "result";
  if (game.kind === "word-wolf") return game.phase === "revealed";
  if (game.kind === "werewolf") return game.phase === "finished";
  if (game.kind === "legacy-game") return game.phase === "finished";
  return false;
}

function markGameFinished(room: RoomRecord) {
  if (room.status !== "closed" && isTerminalGame(room.game)) room.status = "finished";
}

function normalizeRoomStatus(room: RoomRecord) {
  // A few early v2 snapshots used the legacy status name.
  if ((room.status as string) === "complete") room.status = "finished";
}

function normalizeJohariWordIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 300) return null;
  const ids = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
  return ids;
}

function readJohariDeckWordIds(command: RoomCommand) {
  const supplied = command.johariDeckWordIds ?? command.deckWordIds;
  return supplied === undefined ? [...defaultJohariDeckWordIds] : normalizeJohariWordIds(supplied);
}

function normalizeJohariSelection(value: unknown, deckWordIds: readonly string[]) {
  if (!Array.isArray(value) || value.length > deckWordIds.length) return null;
  const selection = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (selection.some((id) => !id) || new Set(selection).size !== selection.length) return null;
  const allowed = new Set(deckWordIds);
  if (selection.some((id) => !allowed.has(id))) return null;
  return selection;
}

function johariPeerRequiredCount(participantIds: readonly string[]) {
  return participantIds.length * Math.max(0, participantIds.length - 1);
}

function johariPeerSubmittedCount(game: JohariGameState, participantIds: readonly string[]) {
  const active = new Set(participantIds);
  return participantIds.reduce((total, targetId) => {
    const submitted = game.peerSubmitted[targetId] ?? {};
    return total + participantIds.filter((peerId) => peerId !== targetId && active.has(peerId) && submitted[peerId] === true).length;
  }, 0);
}

function johariSelfReady(game: JohariGameState, participantIds: readonly string[]) {
  return participantIds.length > 0 && participantIds.every((participantId) => game.selfSubmitted[participantId] === true);
}

function johariPeerReady(game: JohariGameState, participantIds: readonly string[]) {
  return participantIds.length > 0 && participantIds.every((targetId) => {
    const submitted = game.peerSubmitted[targetId] ?? {};
    return participantIds.filter((peerId) => peerId !== targetId).every((peerId) => submitted[peerId] === true);
  });
}

function resolveJohariResult(game: JohariGameState, participants: readonly RoomParticipant[]): JohariResult {
  const participantIds = participants.map((participant) => participant.id);
  return Object.fromEntries(participantIds.map((targetId) => {
    const own = new Set(game.selfSelections[targetId] ?? []);
    const selectedByOthers = new Set<string>();
    const targetPeerSelections = game.peerSelections[targetId] ?? {};
    const targetPeerSubmitted = game.peerSubmitted[targetId] ?? {};
    participantIds.forEach((peerId) => {
      if (peerId === targetId || targetPeerSubmitted[peerId] !== true) return;
      for (const wordId of targetPeerSelections[peerId] ?? []) selectedByOthers.add(wordId);
    });
    const open: string[] = [];
    const hidden: string[] = [];
    const blind: string[] = [];
    const unknown: string[] = [];
    for (const wordId of game.deckWordIds) {
      if (own.has(wordId) && selectedByOthers.has(wordId)) open.push(wordId);
      else if (own.has(wordId)) hidden.push(wordId);
      else if (selectedByOthers.has(wordId)) blind.push(wordId);
      else unknown.push(wordId);
    }
    return [targetId, { open, hidden, blind, unknown } satisfies JohariPane];
  }));
}

function maybeAdvanceJohari(room: RoomRecord) {
  if (room.game?.kind !== "johari-window") return false;
  const game = room.game;
  const participants = activeParticipants(room);
  const participantIds = participants.map((participant) => participant.id);
  let changed = false;
  if (game.phase === "self" && johariSelfReady(game, participantIds)) {
    game.phase = "peer";
    changed = true;
  }
  if (game.phase === "peer" && johariPeerReady(game, participantIds)) {
    game.phase = "result";
    game.results = resolveJohariResult(game, participants);
    markGameFinished(room);
    changed = true;
  }
  return changed;
}

function reconcileLegacyTurnState(game: LegacyGameState, participantId: string, activeBefore: readonly RoomParticipant[]) {
  if (game.progression !== "turn" && game.progression !== "count-up") return;

  const activeAfter = activeBefore.filter((participant) => participant.id !== participantId);
  const previousTurnIndex = Math.max(0, game.turnIndex ?? 0);
  const removedIndex = activeBefore.findIndex((participant) => participant.id === participantId);
  const adjustedTurnIndex = removedIndex >= 0 && removedIndex < previousTurnIndex
    ? previousTurnIndex - 1
    : previousTurnIndex;

  if (game.progression === "count-up") {
    game.currentTotal = (game.turnHistory ?? []).reduce((total, turn) => total + turn.add, 0);
  }

  if (activeAfter.length === 0) {
    game.turnIndex = 0;
    game.phase = "finished";
    game.result = resolveLegacyResult(game, activeAfter);
    return;
  }

  game.turnIndex = adjustedTurnIndex % activeAfter.length;
  if (game.progression === "turn" && activeAfter.every((participant) => Boolean(game.inputs[participant.id]))) {
    game.phase = "finished";
    game.result = resolveLegacyResult(game, activeAfter);
  }
}

function removeParticipantFromGameState(
  room: RoomRecord,
  participantId: string,
  preserveTargetReferences = false,
  activeBefore: readonly RoomParticipant[] = activeParticipants(room),
) {
  const game = room.game;
  if (!game) return;
  // A leave keeps the participant record so reconnect remains possible, but
  // removes that participant's submitted state. Existing votes aimed at the
  // participant remain valid because the participant was not kicked.
  if (preserveTargetReferences) {
    if (game.kind === "two-choice") delete game.answers[participantId];
    else if (game.kind === "impression-ranking" || game.kind === "majority-game") delete game.votes[participantId];
    else if (game.kind === "johari-window") {
      delete game.selfSelections[participantId];
      delete game.selfSubmitted[participantId];
      for (const targetId of Object.keys(game.peerSelections)) delete game.peerSelections[targetId]?.[participantId];
      for (const targetId of Object.keys(game.peerSubmitted)) delete game.peerSubmitted[targetId]?.[participantId];
    }
    else if (game.kind === "anonymous-box") game.entries = game.entries.filter((entry) => entry.authorId !== participantId);
    else if (game.kind === "word-wolf") delete game.votes[participantId];
    else if (game.kind === "werewolf") delete game.votes[participantId];
    else {
      delete game.inputs[participantId];
      if (game.turnHistory) game.turnHistory = game.turnHistory.filter((turn) => turn.playerId !== participantId);
      reconcileLegacyTurnState(game, participantId, activeBefore);
    }
    return;
  }
  if (game.kind === "two-choice") {
    delete game.answers[participantId];
  } else if (game.kind === "impression-ranking") {
    delete game.votes[participantId];
    for (const [voterId, targetId] of Object.entries(game.votes)) if (targetId === participantId) delete game.votes[voterId];
  } else if (game.kind === "majority-game") {
    delete game.votes[participantId];
  } else if (game.kind === "johari-window") {
    delete game.selfSelections[participantId];
    delete game.selfSubmitted[participantId];
    delete game.peerSelections[participantId];
    delete game.peerSubmitted[participantId];
    for (const targetId of Object.keys(game.peerSelections)) delete game.peerSelections[targetId]?.[participantId];
    for (const targetId of Object.keys(game.peerSubmitted)) delete game.peerSubmitted[targetId]?.[participantId];
  } else if (game.kind === "anonymous-box") {
    game.entries = game.entries.filter((entry) => entry.authorId !== participantId);
  } else if (game.kind === "word-wolf") {
    game.minorityIds = game.minorityIds.filter((id) => id !== participantId);
    delete game.votes[participantId];
    for (const [voterId, targetId] of Object.entries(game.votes)) if (targetId === participantId) delete game.votes[voterId];
  } else if (game.kind === "werewolf") {
    delete game.roles[participantId];
    delete game.votes[participantId];
    game.aliveIds = game.aliveIds.filter((id) => id !== participantId);
    game.tiedTargetIds = game.tiedTargetIds.filter((id) => id !== participantId);
    for (const [voterId, targetId] of Object.entries(game.votes)) if (targetId === participantId) delete game.votes[voterId];
    for (const action of ["killTargetId", "guardTargetId", "inspectTargetId"] as const) {
      if (game.nightActions[action] === participantId) delete game.nightActions[action];
    }
    delete game.seerResults[participantId];
    for (const seerId of Object.keys(game.seerResults)) {
      game.seerResults[seerId] = game.seerResults[seerId].filter((result) => result.targetId !== participantId);
    }
  } else {
    delete game.inputs[participantId];
    if (game.turnHistory) game.turnHistory = game.turnHistory.filter((turn) => turn.playerId !== participantId);
    reconcileLegacyTurnState(game, participantId, activeBefore);
  }
}

function isDangerousDeparture(room: RoomRecord) {
  return room.status === "playing"
    && room.game
    && !isTerminalGame(room.game)
    && (room.game.kind === "word-wolf" || room.game.kind === "werewolf");
}

function canMergeStaleCommand(room: RoomRecord, command: RoomCommand) {
  if (room.version <= command.expectedVersion || room.version - command.expectedVersion > maxStaleMergeVersions) return false;
  if (command.kind === "join") return room.status === "waiting" && !room.game;
  const game = room.game;
  if (!game || typeof game.startedVersion !== "number" || command.expectedVersion < game.startedVersion) return false;
  const actorId = command.participantId;
  if (!actorId || !room.participants.some((participant) => participant.id === actorId && participant.connected)) return false;
  if (command.kind === "game_answer") {
    return game.kind === "two-choice"
      && game.phase === "answering"
      && !Object.prototype.hasOwnProperty.call(game.answers, actorId);
  }
  if (command.kind === "johari_self_submit") {
    return game.kind === "johari-window"
      && game.phase === "self"
      && (command.submit === false || game.selfSubmitted[actorId] !== true);
  }
  if (command.kind === "johari_peer_submit") {
    return game.kind === "johari-window"
      && game.phase === "peer"
      && typeof command.targetParticipantId === "string"
      && command.targetParticipantId !== actorId
      && !game.peerSubmitted[command.targetParticipantId]?.[actorId];
  }
  if (command.kind === "anonymous_submit") return game.kind === "anonymous-box" && room.status === "playing";
  if (command.kind === "game_vote") {
    if (game.kind === "impression-ranking" || game.kind === "majority-game" || game.kind === "word-wolf") {
      return game.phase === "voting"
        && !Object.prototype.hasOwnProperty.call(game.votes, actorId);
    }
    return game.kind === "werewolf"
      && (game.phase === "voting" || game.phase === "revote")
      && !Object.prototype.hasOwnProperty.call(game.votes, actorId);
  }
  if (command.kind === "werewolf_action") return game.kind === "werewolf" && game.phase === "night";
  if (command.kind === "legacy_input") return game.kind === "legacy-game" && game.phase === "playing" && game.progression === "simultaneous" && !game.inputs[actorId];
  return false;
}

function isMergeableCommand(command: unknown) {
  if (!command || typeof command !== "object") return false;
  const kind = (command as { kind?: unknown }).kind;
  return kind === "join" || kind === "game_answer" || kind === "johari_self_submit" || kind === "johari_peer_submit" || kind === "game_vote" || kind === "anonymous_submit" || kind === "werewolf_action" || kind === "legacy_input";
}

function token(size = 24) {
  const bytes = randomBytes(size);
  return Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function normalizeName(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase();
}

function randomOrder<T>(items: readonly T[]) {
  return [...items].sort(() => randomBytes(2).readUInt16BE(0) / 65536 - 0.5);
}

function reverseText(value: string) {
  return Array.from(value).reverse().join("");
}

function normalizeTruthAnswer(value: string) {
  const normalized = value.trim().toUpperCase();
  return ({ A: "1", B: "2", C: "3" } as Record<string, string>)[normalized] ?? normalized;
}

function resolveLegacyResult(game: LegacyGameState, participants: RoomParticipant[]): LegacyGameResult {
  const inputs = { ...game.inputs };
  const scores: Record<string, number> = {};
  let summary = `${Object.keys(inputs).length}人の回答を公開しました`;
  if (game.gameKey === "truth-lie-game") {
    const speaker = participants[0]?.id;
    const answer = speaker ? normalizeTruthAnswer(inputs[speaker] ?? "") : undefined;
    if (speaker) scores[speaker] = 0;
    participants.forEach((participant) => { if (participant.id !== speaker) scores[participant.id] = answer && normalizeTruthAnswer(inputs[participant.id] ?? "") === answer ? 1 : 0; });
    const correct = Object.values(scores).filter((score) => score === 1).length;
    summary = `正解は${answer ?? "未設定"}、正解者${correct}人`;
  } else if (game.gameKey === "count-up-game") {
    const values = (game.turnHistory ?? []).map((turn) => turn.add).filter((value) => Number.isFinite(value));
    const targetMatch = game.prompt.match(/\d+/);
    const target = targetMatch ? Number(targetMatch[0]) : 30;
    const total = values.reduce((sum, value) => sum + value, 0);
    const average = values.length ? total / values.length : 0;
    participants.forEach((participant) => { const value = (game.turnHistory ?? []).filter((turn) => turn.playerId === participant.id).reduce((sum, turn) => sum + turn.add, 0); scores[participant.id] = Number.isFinite(value) ? Math.abs(value - target) : Number.POSITIVE_INFINITY; });
    summary = `目標${target}、合計${total}、平均${average.toFixed(1)}`;
  } else if (game.gameKey === "reverse-word-game") {
    const expected = reverseText(game.prompt.trim());
    participants.forEach((participant) => { scores[participant.id] = inputs[participant.id] === expected ? 1 : 0; });
    summary = `正解は${expected}、正解者${Object.values(scores).filter((score) => score === 1).length}人`;
  } else if (game.gameKey === "typing-speed-game") {
    const expected = game.prompt.trim();
    const timings = participants.map((participant) => {
      const separator = (inputs[participant.id] ?? "").lastIndexOf("|");
      const text = separator > 0 ? inputs[participant.id].slice(0, separator).trim() : "";
      const elapsedMs = separator > 0 ? Number(inputs[participant.id].slice(separator + 1).trim()) : Number.POSITIVE_INFINITY;
      return { id: participant.id, text, elapsedMs };
    });
    timings.forEach(({ id, text, elapsedMs }) => { scores[id] = text === expected ? Math.max(0, 120_000 - elapsedMs) : 0; });
    const fastest = timings.filter(({ text }) => text === expected).sort((a, b) => a.elapsedMs - b.elapsedMs)[0];
    summary = `正確入力${timings.filter(({ text }) => text === expected).length}人${fastest ? `、最速${fastest.elapsedMs}ms` : ""}`;
  } else if (game.gameKey === "value-meter-game") {
    const values = participants.map((participant) => Number(inputs[participant.id]?.split("|", 1)[0])).filter((value) => Number.isFinite(value));
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    participants.forEach((participant) => { const value = Number(inputs[participant.id]?.split("|", 1)[0]); scores[participant.id] = Number.isFinite(value) ? value : 0; });
    summary = `平均${average.toFixed(1)}、範囲1〜100`;
  }
  return { inputs, summary, scores };
}

function werewolfWinner(game: WerewolfGameState): "werewolf" | "villager" | undefined {
  const wolves = game.aliveIds.filter((id) => game.roles[id] === "werewolf").length;
  const villagers = game.aliveIds.length - wolves;
  if (wolves === 0) return "villager";
  if (wolves >= villagers) return "werewolf";
  return undefined;
}

function resolveWordWolf(game: WordWolfGameState) {
  const counts: Record<string, number> = {};
  Object.values(game.votes).forEach((target) => { counts[target] = (counts[target] ?? 0) + 1; });
  const max = Math.max(0, ...Object.values(counts));
  const targets = Object.entries(counts).filter(([, count]) => count === max).map(([id]) => id);
  // Finding the minority is a majority-side win. Missing the minority lets
  // the minority side win; a tied highest vote remains a draw.
  game.winner = targets.length !== 1 ? "draw" : game.minorityIds.includes(targets[0]) ? "majority" : "minority";
  game.phase = "revealed";
}

function resolveWerewolfVotes(game: WerewolfGameState) {
  const counts: Record<string, number> = {};
  Object.values(game.votes).forEach((target) => { counts[target] = (counts[target] ?? 0) + 1; });
  const max = Math.max(0, ...Object.values(counts));
  const targets = Object.entries(counts).filter(([, count]) => count === max).map(([id]) => id);
  if (targets.length > 1 && game.phase === "voting") {
    game.tiedTargetIds = targets;
    game.votes = {};
    game.phase = "revote";
    return;
  }
  if (targets.length === 1) game.aliveIds = game.aliveIds.filter((id) => id !== targets[0]);
  game.tiedTargetIds = [];
  game.votes = {};
  const winner = werewolfWinner(game);
  if (winner) { game.winner = winner; game.phase = "finished"; } else game.phase = "day";
}

function resolveWerewolfNight(game: WerewolfGameState) {
  const kill = game.nightActions.killTargetId;
  const guard = game.nightActions.guardTargetId;
  if (game.nightActions.inspectTargetId) {
    const seerId = Object.entries(game.roles).find(([, role]) => role === "seer")?.[0];
    if (seerId) (game.seerResults[seerId] ??= []).push({ targetId: game.nightActions.inspectTargetId, role: game.roles[game.nightActions.inspectTargetId] });
  }
  if (kill && kill !== guard) game.aliveIds = game.aliveIds.filter((id) => id !== kill);
  const winner = werewolfWinner(game);
  if (winner) { game.winner = winner; game.phase = "finished"; } else game.phase = "day";
  game.nightActions = {};
}

function advanceExpiredGame(room: RoomRecord, now: number) {
  if (room.status === "closed") return false;
  const game = room.game;
  if (!game) return false;
  if (game.kind === "two-choice") {
    if (game.phase === "answering" && game.deadlineAt !== null && game.deadlineAt <= now) {
      game.phase = "revealed";
      game.deadlineAt = null;
      markGameFinished(room);
      return true;
    }
  }
  if (game.kind === "word-wolf") {
    if (game.phaseDeadlineAt === null || game.phaseDeadlineAt > now) return false;
    if (game.phase === "discussion") { game.phase = "voting"; game.phaseDeadlineAt = now + 60_000; return true; }
    if (game.phase === "voting") { resolveWordWolf(game); game.phaseDeadlineAt = null; markGameFinished(room); return true; }
  }
  if (game.kind === "werewolf") {
    if (game.phaseDeadlineAt === null || game.phaseDeadlineAt > now) return false;
    if (game.phase === "night") { resolveWerewolfNight(game); game.phaseDeadlineAt = game.winner ? null : now + 60_000; markGameFinished(room); return true; }
    if (game.phase === "day") { game.phase = "voting"; game.phaseDeadlineAt = now + 60_000; return true; }
    if (game.phase === "voting" || game.phase === "revote") { resolveWerewolfVotes(game); game.phaseDeadlineAt = game.winner ? null : now + 60_000; markGameFinished(room); return true; }
  }
  return false;
}

function previewExpiredGame(room: RoomRecord, now: number) {
  if (room.status === "closed") return false;
  // A read-only preview may cross several already-expired phases. The
  // bounded loop prevents malformed legacy snapshots from spinning forever;
  // durable state still advances one explicit tick at a time.
  let changed = false;
  for (let step = 0; step < 8; step += 1) {
    const game = room.game;
    const deadline = game?.kind === "two-choice" ? game.deadlineAt : game && "phaseDeadlineAt" in game ? game.phaseDeadlineAt : null;
    if (deadline === null || deadline === undefined || deadline > now) break;
    if (!advanceExpiredGame(room, deadline)) break;
    changed = true;
  }
  return changed;
}

export class RoomService {
  private readonly commandResults = new Map<string, StoredCommandResult>();
  private readonly commandResultIndexes = new Map<string, string>();
  private readonly commandAttempts = new Map<string, { count: number; resetAt: number }>();
  private readonly roomLocks = new Map<string, Promise<void>>();
  constructor(private readonly repository: RoomRepository, private readonly now = () => Date.now()) {}

  async getProjection(code: string, participantId: string | null, tokenValue?: string) {
    const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const room = await this.repository.get(normalizedCode);
    if (room && participantId) {
      const participant = room.participants.find((item) => item.id === participantId);
      if (!participant) throw new RoomDomainError("participant_not_found");
      const tokenHash = typeof tokenValue === "string" ? hashToken(tokenValue) : "";
      if (tokenHash !== participant.reconnectTokenHash && (participant.role !== "host" || tokenHash !== room.hostTokenHash)) throw new RoomDomainError("token_invalid");
    }
    if (!room) return null;
    // Projection is deliberately read-only. A cloned preview keeps old
    // clients responsive around deadlines; durable advancement is performed
    // by tick(), which the transport layer can call explicitly.
    const view = structuredClone(room);
    normalizeRoomStatus(view);
    previewExpiredGame(view, this.now());
    return this.project(view, participantId, this.now());
  }

  async createRoom(hostName: string) {
    const name = typeof hostName === "string" ? hostName.trim() : "";
    if (!name) throw new RoomDomainError("nickname_required");
    const hostToken = token();
    const reconnectToken = token();
    const id = token(12);
    const code = token(6);
    const host: RoomParticipant = { id, name, role: "host", reconnectTokenHash: hashToken(reconnectToken), connected: true };
    const room: RoomRecord = { id, code, status: "waiting", version: 0, createdAt: this.now(), expiresAt: this.now() + ttlMs, hostTokenHash: hashToken(hostToken), participants: [host] };
    await this.repository.create(room);
    return { room: this.project(room, id, this.now()), hostToken, reconnectToken };
  }

  async execute(command: RoomCommand, tokenValue?: string): Promise<RoomCommandResult> {
    const roomCode = command && typeof command === "object" && typeof command.roomCode === "string"
      ? command.roomCode.trim().toUpperCase()
      : "";
    return this.withRoomLock(roomCode, async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          return await this.executeUnlocked(command, tokenValue);
        } catch (error) {
          if (error instanceof RepositoryVersionConflict && isMergeableCommand(command)) continue;
          if (error instanceof RepositoryVersionConflict) throw new RoomDomainError("version_conflict");
          throw error;
        }
      }
      throw new RoomDomainError("version_conflict");
    });
  }

  /** Update reconnectable membership without touching the game version. */
  async reconnect(roomCode: string, participantId: string, tokenValue: string) {
    const normalizedCode = roomCode.trim().toUpperCase();
    return this.withRoomLock(normalizedCode, async () => {
      const room = await this.repository.get(normalizedCode);
      if (!room) throw new RoomDomainError("room_not_found");
      const participant = room.participants.find((item) => item.id === participantId);
      if (!participant) throw new RoomDomainError("participant_not_found");
      if (hashToken(tokenValue) !== participant.reconnectTokenHash && (participant.role !== "host" || hashToken(tokenValue) !== room.hostTokenHash)) {
        throw new RoomDomainError("reconnect_token_invalid");
      }
      if (this.repository.setParticipantConnected) {
        const updated = await this.repository.setParticipantConnected(normalizedCode, participantId, true);
        if (!updated) throw new RoomDomainError("participant_not_found");
        participant.connected = true;
        return this.project(room, participantId, this.now());
      }
      participant.connected = true;
      room.version += 1;
      await this.saveRoom(room, [{ participantId, connected: true }]);
      return this.project(room, participantId, this.now());
    });
  }

  private async withRoomLock<T>(roomCode: string, operation: () => Promise<T>) {
    const previous = this.roomLocks.get(roomCode) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.roomLocks.set(roomCode, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.roomLocks.get(roomCode) === queued) this.roomLocks.delete(roomCode);
    }
  }

  /** Advance deadline-driven game state and persist it explicitly. */
  async tick(code: string) {
    const roomCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!roomCode) throw new RoomDomainError("room_code_required");
    return this.withRoomLock(roomCode, async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const room = await this.repository.get(roomCode);
        if (!room) return null;
        normalizeRoomStatus(room);
        if (!previewExpiredGame(room, this.now())) return this.project(room, null, this.now());
        room.version += 1;
        try {
          await this.saveRoom(room);
          return this.project(room, null, this.now());
        } catch (error) {
          if (error instanceof RepositoryVersionConflict) continue;
          throw error;
        }
      }
      throw new RoomDomainError("version_conflict");
    });
  }

  /** Delegate storage-level expiry cleanup without making GET a write path. */
  async cleanupExpired() {
    return this.repository.cleanupExpired ? this.repository.cleanupExpired(this.now()) : 0;
  }

  private async executeUnlocked(command: RoomCommand, tokenValue?: string): Promise<RoomCommandResult> {
    if (!command || typeof command !== "object") throw new RoomDomainError("command_invalid");
    const roomCode = typeof command.roomCode === "string" ? command.roomCode.trim().toUpperCase() : "";
    if (!roomCode) throw new RoomDomainError("room_code_required");
    if (typeof command.commandId !== "string" || !command.commandId.trim()) throw new RoomDomainError("command_id_required");
    if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) throw new RoomDomainError("expected_version_invalid");
    if (!("join reconnect leave kick start close reset game_reset game_start game_answer game_reveal johari_self_submit johari_peer_submit anonymous_submit anonymous_moderate game_vote game_phase werewolf_action legacy_input" as const).split(" ").includes(command.kind)) throw new RoomDomainError("command_kind_invalid");
    command = { ...command, roomCode, commandId: command.commandId.trim() };
    const suppliedToken = typeof tokenValue === "string" ? tokenValue : undefined;
    const room = await this.repository.get(command.roomCode) ?? null;
    if (!room) throw new RoomDomainError("room_not_found");
    if (room.expiresAt <= this.now()) throw new RoomDomainError("room_expired");
    normalizeRoomStatus(room);
    if (advanceExpiredGame(room, this.now())) {
      room.version += 1;
      await this.saveRoom(room);
    }
    // Rooms started before this field existed must remain usable after a reconnect.
    if (room.game?.kind === "legacy-game" && !room.game.progression) {
      room.game.progression = legacyProgression(room.game.gameKey);
    }

    const actor = command.kind === "join"
      ? null
      : command.participantId ? room.participants.find((item) => item.id === command.participantId) : null;
    if (command.kind !== "join" && !actor) throw new RoomDomainError("participant_not_found");
    if (actor) {
      const expectedHash = command.kind === "reconnect"
        ? actor.reconnectTokenHash
        : actor.role === "host" ? room.hostTokenHash : actor.reconnectTokenHash;
      if (!suppliedToken || hashToken(suppliedToken) !== expectedHash) {
        throw new RoomDomainError(command.kind === "reconnect" ? "reconnect_token_invalid" : "token_invalid");
      }
    }

    const bodyHash = commandBodyHash(command);
    const joinNonce = typeof command.joinNonce === "string" && command.joinNonce.trim().length >= 16
      ? command.joinNonce.trim()
      : null;
    const identityKey = command.kind === "join"
      ? joinNonce ? `join:${joinNonce}` : null
      : `participant:${actor!.id}`;
    const baseKey = identityKey ? `${room.code}:${identityKey}:${command.commandId}` : null;
    const resultKey = baseKey ? `${baseKey}:${bodyHash}` : null;
    this.pruneCommandResults(this.now());
    const indexedResultKey = baseKey ? this.commandResultIndexes.get(baseKey) : undefined;
    if (baseKey && resultKey && indexedResultKey) {
      const previous = this.commandResults.get(indexedResultKey);
      if (previous && previous.expiresAt > this.now()) {
        if (previous.bodyHash !== bodyHash) throw new RoomDomainError("command_id_reuse");
        return structuredClone(previous.result);
      }
      this.commandResultIndexes.delete(baseKey);
      this.commandResults.delete(indexedResultKey);
    }

    const rateKey = `${room.code}:${actor?.id ?? "join"}`;
    const now = this.now();
    if (this.commandAttempts.size > 5_000) {
      for (const [entryKey, entry] of this.commandAttempts) if (entry.resetAt <= now) this.commandAttempts.delete(entryKey);
    }
    const attempt = this.commandAttempts.get(rateKey);
    if (!attempt || attempt.resetAt <= now) {
      this.commandAttempts.set(rateKey, { count: 1, resetAt: now + 60_000 });
    } else {
      if (attempt.count >= 120) throw new RoomDomainError("rate_limited");
      attempt.count += 1;
    }
    if (room.version !== command.expectedVersion && !canMergeStaleCommand(room, command)) throw new RoomDomainError("version_conflict");
    if (room.status === "closed" && command.kind !== "close") throw new RoomDomainError(command.kind === "join" ? "room_not_joinable" : "room_closed");
    if (room.status === "finished" && ["game_answer", "game_reveal", "johari_self_submit", "johari_peer_submit", "anonymous_submit", "anonymous_moderate", "game_vote", "game_phase", "werewolf_action", "legacy_input"].includes(command.kind)) throw new RoomDomainError("game_finished");
    let issuedReconnectToken: string | undefined;
    let createdParticipantId: string | undefined;
    const presenceChanges: RoomPresenceChange[] = [];
    if (command.kind === "join") {
      if (room.status !== "waiting") throw new RoomDomainError("room_not_joinable");
      const name = typeof command.name === "string" ? command.name.trim() : "";
      if (!name) throw new RoomDomainError("nickname_required");
      if (room.participants.length >= maxParticipants) throw new RoomDomainError("room_full");
      if (room.participants.some((item) => normalizeName(item.name) === normalizeName(name))) throw new RoomDomainError("nickname_taken");
      issuedReconnectToken = token();
      createdParticipantId = token(12);
      room.participants.push({ id: createdParticipantId, name, role: "player", reconnectTokenHash: hashToken(issuedReconnectToken), connected: true });
      presenceChanges.push({ participantId: createdParticipantId, connected: true });
    } else if (command.kind === "leave") {
      if (isDangerousDeparture(room)) throw new RoomDomainError("game_in_progress");
      const activeBeforeDeparture = activeParticipants(room);
      actor!.connected = false;
      presenceChanges.push({ participantId: actor!.id, connected: false });
      if (room.status === "playing" && room.game && !isTerminalGame(room.game)) {
        removeParticipantFromGameState(room, actor!.id, true, activeBeforeDeparture);
        maybeAdvanceJohari(room);
      }
    } else if (command.kind === "kick") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      const target = room.participants.find((item) => item.id === command.targetParticipantId);
      if (!target) throw new RoomDomainError("participant_not_found");
      if (target.role === "host") throw new RoomDomainError("host_required");
      if (isDangerousDeparture(room)) throw new RoomDomainError("game_in_progress");
      removeParticipantFromGameState(room, target.id, false, activeParticipants(room));
      presenceChanges.push({ participantId: target.id, connected: false });
      room.participants = room.participants.filter((item) => item.id !== command.targetParticipantId);
      maybeAdvanceJohari(room);
    } else if (command.kind === "start") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (room.status === "waiting") room.status = "locked";
      else if (room.status === "finished" || isTerminalGame(room.game)) {
        room.game = undefined;
        room.status = "waiting";
      } else if (room.status !== "locked") {
        throw new RoomDomainError("game_in_progress");
      }
    } else if (command.kind === "close") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      room.status = "closed";
    } else if (command.kind === "reset" || command.kind === "game_reset") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (room.status === "playing" && room.game && !isTerminalGame(room.game)) throw new RoomDomainError("game_in_progress");
      room.game = undefined;
      room.status = "waiting";
    } else if (command.kind === "reconnect") {
      actor!.connected = true;
      presenceChanges.push({ participantId: actor!.id, connected: true });
    } else if (command.kind === "game_start") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (command.gameKind !== "two-choice" && command.gameKind !== "impression-ranking" && command.gameKind !== "majority-game" && command.gameKind !== "johari-window" && command.gameKind !== "anonymous-box" && command.gameKind !== "word-wolf" && command.gameKind !== "werewolf" && command.gameKind !== "legacy-game") throw new RoomDomainError("game_kind_invalid");
      if (room.status === "playing" && room.game && !isTerminalGame(room.game)) throw new RoomDomainError("game_in_progress");
      if (room.status !== "locked") throw new RoomDomainError("room_not_locked");
      const prompt = typeof command.prompt === "string" ? command.prompt.trim() : "";
      if (!prompt) throw new RoomDomainError("prompt_required");
      const activeCount = activeParticipants(room).length;
      const minimum = command.gameKind === "legacy-game" ? undefined : nativeMinimumPlayers[command.gameKind];
      if (minimum !== undefined && activeCount < minimum) throw new RoomDomainError("not_enough_participants");
      if (command.gameKind === "werewolf" && activeCount !== 4 && activeCount < 6) {
        throw new RoomDomainError("werewolf_player_count_invalid");
      }
      const startedVersion = room.version + 1;
      if (command.gameKind === "two-choice") {
        room.game = { kind: "two-choice", startedVersion, prompt, deadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : null, phase: "answering", answers: {} };
      } else if (command.gameKind === "impression-ranking") {
        room.game = { kind: "impression-ranking", startedVersion, prompt, phase: "voting", votes: {} };
      } else if (command.gameKind === "majority-game") {
        room.game = { kind: "majority-game", startedVersion, prompt, phase: "voting", votes: {} };
      } else if (command.gameKind === "johari-window") {
        const deckWordIds = readJohariDeckWordIds(command);
        if (!deckWordIds) throw new RoomDomainError("johari_deck_invalid");
        room.game = {
          kind: "johari-window",
          startedVersion,
          prompt,
          phase: "self",
          deckWordIds,
          selfSelections: {},
          selfSubmitted: {},
          peerSelections: {},
          peerSubmitted: {},
        };
      } else if (command.gameKind === "anonymous-box") {
        room.game = { kind: "anonymous-box", startedVersion, prompt, entries: [] };
      } else if (command.gameKind === "word-wolf") {
        const majorityTopic = typeof command.majorityTopic === "string" ? command.majorityTopic.trim() : "";
        const minorityTopic = typeof command.minorityTopic === "string" ? command.minorityTopic.trim() : "";
        if (!majorityTopic || !minorityTopic) throw new RoomDomainError("topic_required");
        const ids = activeParticipants(room).map((item) => item.id);
        const minorityCount = command.minorityCount === undefined ? 1 : command.minorityCount;
        if (!Number.isInteger(minorityCount) || minorityCount < 1 || minorityCount >= ids.length) throw new RoomDomainError("minority_count_invalid");
        room.game = { kind: "word-wolf", startedVersion, phase: "discussion", phaseDeadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : this.now() + 60_000, majorityTopic, minorityTopic, minorityIds: randomOrder(ids).slice(0, minorityCount), votes: {} };
      } else if (command.gameKind === "werewolf") {
        const ids = randomOrder(activeParticipants(room).map((item) => item.id));
        const wolfCount = Math.max(1, Math.floor(ids.length / 4));
        const roles: Record<string, WerewolfRole> = {};
        ids.forEach((id, index) => { roles[id] = index < wolfCount ? "werewolf" : index === wolfCount ? "seer" : index === wolfCount + 1 ? "guard" : "villager"; });
        room.game = { kind: "werewolf", startedVersion, phase: "night", phaseDeadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : this.now() + 60_000, roles, aliveIds: ids, nightActions: {}, votes: {}, tiedTargetIds: [], seerResults: {} };
      } else {
        const gameKey = command.legacyGameKey?.trim();
        if (!gameKey || !legacyGameKeys.has(gameKey)) throw new RoomDomainError("game_kind_invalid");
        if (activeCount < (legacyMinimumPlayers[gameKey] ?? 2)) throw new RoomDomainError("not_enough_participants");
        const progression = legacyProgression(gameKey);
        room.game = { kind: "legacy-game", startedVersion, gameKey, prompt, mode: command.mode?.trim() || progression, progression, phase: "playing", inputs: {}, ...(progression === "turn" || progression === "count-up" ? { turnIndex: 0 } : {}), ...(progression === "count-up" ? { currentTotal: 0, targetNumber: Number(prompt.match(/\d+/)?.[0] ?? 30), turnHistory: [] } : {}) };
      }
      room.status = "playing";
    } else if (command.kind === "game_answer") {
      if (!room.game || room.game.kind !== "two-choice") throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.answers, actor!.id)) throw new RoomDomainError("answer_already_submitted");
      if (room.game.phase === "revealed" || (room.game.deadlineAt !== null && room.game.deadlineAt <= this.now())) throw new RoomDomainError("answer_deadline_passed");
      if (command.choice !== "A" && command.choice !== "B" && command.choice !== "pass") throw new RoomDomainError("choice_invalid");
      room.game.answers[actor!.id] = command.choice;
    } else if (command.kind === "johari_self_submit") {
      if (!room.game || room.game.kind !== "johari-window" || room.game.phase !== "self") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.selfSubmitted[actor!.id] === true) throw new RoomDomainError("johari_submission_locked");
      const selectedWordIds = normalizeJohariSelection(command.selectedWordIds ?? room.game.selfSelections[actor!.id] ?? [], room.game.deckWordIds);
      if (!selectedWordIds) throw new RoomDomainError("johari_selection_invalid");
      room.game.selfSelections[actor!.id] = selectedWordIds;
      if (command.submit !== false) room.game.selfSubmitted[actor!.id] = true;
      maybeAdvanceJohari(room);
    } else if (command.kind === "johari_peer_submit") {
      if (!room.game || room.game.kind !== "johari-window" || room.game.phase !== "peer") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const targetParticipantId = typeof command.targetParticipantId === "string" ? command.targetParticipantId : "";
      if (!targetParticipantId || targetParticipantId === actor!.id || !activeParticipants(room).some((item) => item.id === targetParticipantId)) throw new RoomDomainError("johari_target_invalid");
      if (room.game.peerSubmitted[targetParticipantId]?.[actor!.id] === true) throw new RoomDomainError("johari_submission_locked");
      const existingSelection = room.game.peerSelections[targetParticipantId]?.[actor!.id] ?? [];
      const selectedWordIds = normalizeJohariSelection(command.selectedWordIds ?? existingSelection, room.game.deckWordIds);
      if (!selectedWordIds) throw new RoomDomainError("johari_selection_invalid");
      (room.game.peerSelections[targetParticipantId] ??= {})[actor!.id] = selectedWordIds;
      if (command.submit !== false) (room.game.peerSubmitted[targetParticipantId] ??= {})[actor!.id] = true;
      maybeAdvanceJohari(room);
    } else if (command.kind === "game_reveal") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (!room.game) throw new RoomDomainError("game_not_active");
      if (room.game.kind === "two-choice") {
        const allAnswered = activeParticipants(room).every((item) => room.game?.kind === "two-choice" && room.game.answers[item.id]);
        if (!allAnswered && (room.game.deadlineAt === null || room.game.deadlineAt > this.now())) throw new RoomDomainError("game_not_ready");
        room.game.phase = "revealed";
        room.game.deadlineAt = null;
      } else if (room.game.kind === "impression-ranking") {
        const game = room.game;
        if (game.phase !== "voting" || activeParticipants(room).some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "revealed";
      } else if (room.game.kind === "majority-game") {
        const game = room.game;
        if (game.phase !== "voting" || activeParticipants(room).some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "revealed";
      } else if (room.game.kind === "word-wolf") {
        const game = room.game;
        if (game.phase !== "voting" || activeParticipants(room).some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
        resolveWordWolf(game);
        game.phaseDeadlineAt = null;
      } else if (room.game.kind === "werewolf") {
        const game = room.game;
        if ((game.phase !== "voting" && game.phase !== "revote") || game.aliveIds.some((id) => !game.votes[id])) throw new RoomDomainError("game_not_ready");
        resolveWerewolfVotes(game);
        game.phaseDeadlineAt = game.winner ? null : this.now() + 60_000;
      } else if (room.game.kind === "legacy-game") {
        const game = room.game;
        if (game.gameKey === "count-up-game") throw new RoomDomainError("game_not_ready");
        if (game.phase !== "playing" || activeParticipants(room).some((item) => !game.inputs[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "finished";
        game.result = resolveLegacyResult(game, activeParticipants(room));
      } else if (room.game.kind === "anonymous-box") {
        if (room.game.entries.some((entry) => entry.status === "unshown")) throw new RoomDomainError("game_not_ready");
        room.status = "finished";
      } else throw new RoomDomainError("game_not_active");
      markGameFinished(room);
    } else if (command.kind === "anonymous_submit") {
      if (!room.game || room.game.kind !== "anonymous-box") throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const text = typeof command.text === "string" ? command.text.trim() : "";
      if (!text) throw new RoomDomainError("text_required");
      if (text.length > 500) throw new RoomDomainError("text_too_long");
      if (room.game.entries.some((entry) => entry.authorId === actor!.id && entry.status === "unshown")) throw new RoomDomainError("submission_pending");
      room.game.entries.push({ id: token(10), text, authorId: actor!.id, status: "unshown" });
    } else if (command.kind === "anonymous_moderate") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (!room.game || room.game.kind !== "anonymous-box") throw new RoomDomainError("game_not_active");
      if (command.moderationStatus !== "displayed" && command.moderationStatus !== "answered" && command.moderationStatus !== "skipped") throw new RoomDomainError("moderation_status_invalid");
      const entry = room.game.entries.find((item) => item.id === command.targetEntryId);
      if (!entry) throw new RoomDomainError("entry_not_found");
      entry.status = command.moderationStatus;
    } else if (command.kind === "game_vote") {
      if (!room.game || (room.game.kind !== "impression-ranking" && room.game.kind !== "majority-game" && room.game.kind !== "word-wolf" && room.game.kind !== "werewolf")) throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.votes, actor!.id)) throw new RoomDomainError("vote_already_submitted");
      if (room.game.kind === "impression-ranking") {
        if (room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
        const target = command.voteTargetId;
        if (!target || target !== "skip" && !activeParticipants(room).some((item) => item.id === target)) throw new RoomDomainError("vote_target_invalid");
        if (target === actor!.id) throw new RoomDomainError("vote_target_invalid");
        room.game.votes[actor!.id] = target;
      } else if (room.game.kind === "majority-game") {
        if (room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
        const target = command.voteTargetId;
        if (target !== "A" && target !== "B" && target !== "skip") throw new RoomDomainError("vote_target_invalid");
        room.game.votes[actor!.id] = target;
      } else if (room.game.kind === "word-wolf") {
        if (room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
        const target = command.voteTargetId;
        if (!target || !activeParticipants(room).some((item) => item.id === target) || target === actor!.id) throw new RoomDomainError("vote_target_invalid");
        room.game.votes[actor!.id] = target;
      } else {
        if ((room.game.phase !== "voting" && room.game.phase !== "revote") || !room.game.aliveIds.includes(actor!.id)) throw new RoomDomainError("game_not_ready");
        const target = command.voteTargetId;
        if (!target || !room.game.aliveIds.includes(target) || (room.game.phase === "revote" && !room.game.tiedTargetIds.includes(target))) throw new RoomDomainError("vote_target_invalid");
        room.game.votes[actor!.id] = target;
      }
    } else if (command.kind === "game_phase") {
      if (actor!.role !== "host" || !room.game) throw new RoomDomainError("host_required");
      if (room.game.kind === "word-wolf") {
        if (room.game.phase !== "discussion") throw new RoomDomainError("game_not_ready");
        room.game.phase = "voting";
        room.game.phaseDeadlineAt = this.now() + 60_000;
      } else if (room.game.kind === "werewolf") {
        if (room.game.phase === "night") {
          resolveWerewolfNight(room.game);
          room.game.phaseDeadlineAt = room.game.winner ? null : this.now() + 60_000;
        } else if (room.game.phase === "day") { room.game.phase = "voting"; room.game.phaseDeadlineAt = this.now() + 60_000; }
        else throw new RoomDomainError("game_not_ready");
      } else throw new RoomDomainError("game_not_active");
      markGameFinished(room);
    } else if (command.kind === "legacy_input") {
      if (!room.game || room.game.kind !== "legacy-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const input = typeof command.input === "string" ? command.input.trim() : "";
      if (!input) throw new RoomDomainError("input_required");
      if (input.length > 500) throw new RoomDomainError("input_too_long");
      if (!validateLegacyInput(room.game.gameKey, input)) throw new RoomDomainError("input_invalid");
      if (room.game.progression === "count-up") {
        const participants = activeParticipants(room);
        const currentIndex = room.game.turnIndex ?? 0;
        const currentPlayer = participants[currentIndex % participants.length];
        if (!currentPlayer || currentPlayer.id !== actor!.id) throw new RoomDomainError("not_your_turn");
        const add = input.split(",").reduce((sum, value) => sum + Number(value.trim()), 0);
        const total = (room.game.currentTotal ?? 0) + add;
        room.game.inputs[actor!.id] = input;
        room.game.currentTotal = total;
        room.game.turnHistory = [...(room.game.turnHistory ?? []), { playerId: actor!.id, add, total }];
        if (total >= (room.game.targetNumber ?? 30)) {
          room.game.phase = "finished";
          room.game.result = resolveLegacyResult(room.game, participants);
        } else {
          room.game.turnIndex = (currentIndex + 1) % participants.length;
        }
      } else if (room.game.progression === "turn") {
        const participants = activeParticipants(room);
        const currentIndex = room.game.turnIndex ?? 0;
        const currentPlayer = participants[currentIndex % participants.length];
        if (!currentPlayer || currentPlayer.id !== actor!.id) throw new RoomDomainError("not_your_turn");
        room.game.inputs[actor!.id] = input;
        const nextTurn = currentIndex + 1;
        if (nextTurn >= participants.length) {
          room.game.phase = "finished";
          room.game.result = resolveLegacyResult(room.game, participants);
        } else {
          room.game.turnIndex = nextTurn;
        }
      } else {
        room.game.inputs[actor!.id] = input;
        if (activeParticipants(room).every((participant) => room.game?.kind === "legacy-game" && Boolean(room.game.inputs[participant.id]))) {
          room.game.phase = "finished";
          room.game.result = resolveLegacyResult(room.game, activeParticipants(room));
        }
      }
      markGameFinished(room);
    } else if (command.kind === "werewolf_action") {
      if (!room.game || room.game.kind !== "werewolf" || room.game.phase !== "night" || !actor!.connected || !room.game.aliveIds.includes(actor!.id)) throw new RoomDomainError("game_not_ready");
      const target = command.targetParticipantId;
      if (!target || !room.game.aliveIds.includes(target)) throw new RoomDomainError("action_target_invalid");
      const role = room.game.roles[actor!.id];
      if (command.action === "kill" && role === "werewolf") room.game.nightActions.killTargetId = target;
      else if (command.action === "guard" && role === "guard") room.game.nightActions.guardTargetId = target;
      else if (command.action === "inspect" && role === "seer") room.game.nightActions.inspectTargetId = target;
      else throw new RoomDomainError("role_action_invalid");
    }
    room.version += 1;
    await this.saveRoom(room, presenceChanges);
    const result: RoomCommandResult = this.project(room, createdParticipantId ?? actor?.id ?? null, this.now());
    if (issuedReconnectToken && createdParticipantId) result.credentials = { participantId: createdParticipantId, reconnectToken: issuedReconnectToken };
    if (baseKey && resultKey) this.storeCommandResult(resultKey, baseKey, bodyHash, result, this.now());
    return structuredClone(result);
  }

  private async saveRoom(room: RoomRecord, presenceChanges: readonly RoomPresenceChange[] = []) {
    try {
      await this.repository.save(room, presenceChanges);
    } catch (error) {
      if (isVersionConflictError(error)) throw new RepositoryVersionConflict();
      throw error;
    }
  }

  private pruneCommandResults(now: number) {
    for (const [key, entry] of this.commandResults) {
      if (entry.expiresAt <= now) {
        this.commandResults.delete(key);
        if (this.commandResultIndexes.get(entry.baseKey) === key) this.commandResultIndexes.delete(entry.baseKey);
      }
    }
    for (const [baseKey, resultKey] of this.commandResultIndexes) {
      if (!this.commandResults.has(resultKey)) this.commandResultIndexes.delete(baseKey);
    }
  }

  private storeCommandResult(resultKey: string, baseKey: string, bodyHash: string, result: RoomCommandResult, now: number) {
    this.pruneCommandResults(now);
    while (this.commandResults.size >= maxCommandResults) {
      const oldestKey = this.commandResults.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = this.commandResults.get(oldestKey);
      this.commandResults.delete(oldestKey);
      if (oldest && this.commandResultIndexes.get(oldest.baseKey) === oldestKey) this.commandResultIndexes.delete(oldest.baseKey);
    }
    const previousKey = this.commandResultIndexes.get(baseKey);
    if (previousKey && previousKey !== resultKey) this.commandResults.delete(previousKey);
    this.commandResults.set(resultKey, { result: structuredClone(result), bodyHash, baseKey, expiresAt: now + commandResultTtlMs });
    this.commandResultIndexes.set(baseKey, resultKey);
  }

  project(room: RoomRecord, participantId: string | null, now = Date.now()): RoomProjection {
    const projection: RoomProjection = {
      code: room.code,
      status: room.status,
      version: room.version,
      participants: room.participants.map(({ id, name, role, connected }) => ({ id, name, role, connected })),
      self: participantId ? (() => { const item = room.participants.find((entry) => entry.id === participantId); return item ? { id: item.id, role: item.role } : null; })() : null,
    };
    if (room.game?.kind === "two-choice") {
      const game = room.game;
      const deadlinePassed = game.deadlineAt !== null && game.deadlineAt <= now;
      const revealed = game.phase === "revealed" || deadlinePassed;
      const answers = Object.values(game.answers);
      projection.game = {
        kind: "two-choice",
        prompt: game.prompt,
        deadlineAt: game.deadlineAt,
        phase: revealed ? "revealed" : "answering",
        answeredCount: answers.length,
        participantCount: activeParticipants(room).length,
        ...(participantId && game.answers[participantId] ? { ownAnswer: game.answers[participantId] } : {}),
        ...(revealed ? { result: { A: answers.filter((item) => item === "A").length, B: answers.filter((item) => item === "B").length, pass: answers.filter((item) => item === "pass").length } } : {}),
      };
    } else if (room.game?.kind === "impression-ranking") {
      const game = room.game;
      projection.game = {
        kind: "impression-ranking",
        prompt: game.prompt,
        phase: game.phase,
        voteCount: Object.keys(game.votes).length,
        participantCount: activeParticipants(room).length,
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: Object.values(game.votes).reduce<Record<string, number>>((acc, target) => { acc[target] = (acc[target] ?? 0) + 1; return acc; }, {}) } : {}),
      };
    } else if (room.game?.kind === "majority-game") {
      const game = room.game;
      projection.game = {
        kind: "majority-game",
        prompt: game.prompt,
        phase: game.phase,
        voteCount: Object.keys(game.votes).length,
        participantCount: activeParticipants(room).length,
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: Object.values(game.votes).reduce<Record<string, number>>((acc, target) => { acc[target] = (acc[target] ?? 0) + 1; return acc; }, {}) } : {}),
      };
    } else if (room.game?.kind === "johari-window") {
      const game = room.game;
      const participants = activeParticipants(room);
      const participantIds = participants.map((participant) => participant.id);
      const ownParticipant = participantId ? participantIds.includes(participantId) : false;
      const ownPeerSelections = ownParticipant
        ? Object.fromEntries(participantIds.filter((targetId) => targetId !== participantId).map((targetId) => [targetId, [...(game.peerSelections[targetId]?.[participantId!] ?? [])]]))
        : undefined;
      const ownPeerSubmitted = ownParticipant
        ? Object.fromEntries(participantIds.filter((targetId) => targetId !== participantId).map((targetId) => [targetId, game.peerSubmitted[targetId]?.[participantId!] === true]))
        : undefined;
      projection.game = {
        kind: "johari-window",
        prompt: game.prompt,
        phase: game.phase,
        deckWordIds: [...game.deckWordIds],
        participantCount: participantIds.length,
        selfSubmittedCount: participantIds.filter((id) => game.selfSubmitted[id] === true).length,
        selfParticipantCount: participantIds.length,
        peerSubmittedCount: johariPeerSubmittedCount(game, participantIds),
        peerRequiredCount: johariPeerRequiredCount(participantIds),
        ...(ownParticipant && game.phase !== "result" ? {
          ...(Object.prototype.hasOwnProperty.call(game.selfSelections, participantId!) ? { ownSelfSelection: [...game.selfSelections[participantId!]] } : {}),
          ownSelfSubmitted: game.selfSubmitted[participantId!] === true,
          ownPeerSelections,
          ownPeerSubmitted,
        } : {}),
        ...(game.phase === "result" ? { result: game.results ?? resolveJohariResult(game, participants) } : {}),
      };
    } else if (room.game?.kind === "anonymous-box") {
      const game = room.game;
      const visibleEntries = game.entries
        .filter((entry) => entry.status !== "unshown" || room.participants.find((item) => item.id === participantId)?.role === "host" || entry.authorId === participantId)
        .map(({ id, text, status }) => ({ id, text, status }));
      const ownEntry = participantId ? game.entries.find((entry) => entry.authorId === participantId && entry.status === "unshown") : undefined;
      projection.game = { kind: "anonymous-box", prompt: game.prompt, entries: visibleEntries, ...(ownEntry ? { ownEntry: { id: ownEntry.id, text: ownEntry.text, status: ownEntry.status } } : {}) };
    } else if (room.game?.kind === "word-wolf") {
      const game = room.game;
      projection.game = {
        kind: "word-wolf",
        phase: game.phase,
        phaseDeadlineAt: game.phaseDeadlineAt,
        participantCount: activeParticipants(room).length,
        voteCount: Object.keys(game.votes).length,
        ...(participantId && room.participants.some((item) => item.id === participantId) ? { ownTopic: game.minorityIds.includes(participantId) ? game.minorityTopic : game.majorityTopic, ...(game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}) } : {}),
        ...(game.phase === "revealed" ? { winner: game.winner, voteResults: Object.values(game.votes).reduce<Record<string, number>>((acc, target) => { acc[target] = (acc[target] ?? 0) + 1; return acc; }, {}) } : {}),
      };
    } else if (room.game?.kind === "werewolf") {
      const game = room.game;
      const role = participantId ? game.roles[participantId] : undefined;
      projection.game = {
        kind: "werewolf",
        phase: game.phase,
        phaseDeadlineAt: game.phaseDeadlineAt,
        aliveIds: [...game.aliveIds],
        ...(role ? { ownRole: role } : {}),
        ...(role === "werewolf" && participantId ? { teammates: game.aliveIds.filter((id) => id !== participantId && game.roles[id] === "werewolf") } : {}),
        ...(role === "seer" && participantId ? { ownSeerResults: game.seerResults[participantId] ?? [] } : {}),
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revote" ? { tiedTargetIds: [...game.tiedTargetIds] } : {}),
        ...(game.phase === "finished" ? { winner: game.winner } : {}),
      };
    } else if (room.game?.kind === "legacy-game") {
      const game = room.game;
      const progression = game.progression ?? legacyProgression(game.gameKey);
      const participants = activeParticipants(room);
      const isTurnBased = progression === "turn" || progression === "count-up";
      projection.game = {
        kind: "legacy-game",
        gameKey: game.gameKey,
        prompt: game.prompt,
        mode: game.mode,
        progression,
        phase: game.phase,
        inputCount: progression === "count-up" ? (game.turnHistory?.length ?? 0) : Object.keys(game.inputs).length,
        participantCount: activeParticipants(room).length,
        remainingCount: game.phase === "finished" ? 0 : progression === "turn" || progression === "count-up" ? Math.max(0, participants.length - (game.turnIndex ?? 0)) : participants.filter((participant) => !game.inputs[participant.id]).length,
        ...(participantId && game.inputs[participantId] ? { ownInput: game.inputs[participantId] } : {}),
        ...(isTurnBased && participants.length > 0 ? { currentPlayerId: participants[(game.turnIndex ?? 0) % participants.length]?.id } : {}),
        ...(progression === "count-up" ? { currentTotal: game.currentTotal ?? 0, targetNumber: game.targetNumber ?? 30, turnHistory: [...(game.turnHistory ?? [])] } : {}),
        ...(game.phase === "finished" && game.result ? { result: game.result } : {}),
      };
    }
    return projection;
  }
}
