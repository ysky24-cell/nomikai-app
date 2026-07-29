import { createHash, randomBytes } from "node:crypto";

export type RoomStatus = "waiting" | "playing" | "closed";
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
type TwoChoiceGameState = {
  kind: "two-choice";
  prompt: string;
  deadlineAt: number | null;
  phase: "answering" | "revealed";
  answers: Record<string, TwoChoiceAnswer>;
};
type ImpressionGameState = {
  kind: "impression-ranking";
  prompt: string;
  phase: "voting" | "revealed";
  votes: Record<string, string>;
};
type MajorityGameState = {
  kind: "majority-game";
  prompt: string;
  phase: "voting" | "revealed";
  votes: Record<string, string>;
};
type AnonymousEntry = { id: string; text: string; authorId: string; status: AnonymousEntryStatus };
type AnonymousGameState = {
  kind: "anonymous-box";
  prompt: string;
  entries: AnonymousEntry[];
};
type WordWolfGameState = {
  kind: "word-wolf";
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
export type RoomGameState = TwoChoiceGameState | ImpressionGameState | MajorityGameState | AnonymousGameState | WordWolfGameState | WerewolfGameState | LegacyGameState;

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
  | { kind: "anonymous-box"; prompt: string; entries: Array<{ id: string; text: string; status: AnonymousEntryStatus }>; ownEntry?: { id: string; text: string; status: AnonymousEntryStatus } }
  | { kind: "word-wolf"; phase: "discussion" | "voting" | "revealed"; phaseDeadlineAt: number | null; participantCount: number; voteCount: number; ownTopic?: string; ownVote?: string; winner?: "majority" | "minority" | "draw"; voteResults?: Record<string, number> }
  | { kind: "werewolf"; phase: "night" | "day" | "voting" | "revote" | "finished"; phaseDeadlineAt: number | null; aliveIds: string[]; ownRole?: WerewolfRole; teammates?: string[]; ownSeerResults?: { targetId: string; role: WerewolfRole }[]; ownVote?: string; tiedTargetIds?: string[]; winner?: "werewolf" | "villager" }
  | { kind: "legacy-game"; gameKey: string; prompt: string; mode: string; progression: "simultaneous" | "turn" | "count-up"; phase: "playing" | "finished"; inputCount: number; participantCount: number; remainingCount: number; ownInput?: string; currentPlayerId?: string; currentTotal?: number; targetNumber?: number; turnHistory?: Array<{ playerId: string; add: number; total: number }>; result?: LegacyGameResult };

export type RoomCommand = {
  roomCode: string;
  commandId: string;
  expectedVersion: number;
  kind: "join" | "reconnect" | "leave" | "kick" | "start" | "close" | "game_start" | "game_answer" | "game_reveal" | "anonymous_submit" | "anonymous_moderate" | "game_vote" | "game_phase" | "werewolf_action" | "legacy_input";
  participantId?: string;
  targetParticipantId?: string;
  name?: string;
  gameKind?: "two-choice" | "impression-ranking" | "majority-game" | "anonymous-box" | "word-wolf" | "werewolf" | "legacy-game";
  legacyGameKey?: string;
  mode?: string;
  prompt?: string;
  deadlineAt?: number | null;
  choice?: TwoChoiceAnswer;
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
  save(room: RoomRecord): Promise<void>;
}

export class MemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, RoomRecord>();
  constructor(private readonly now = () => Date.now()) {}
  async create(room: RoomRecord) { this.rooms.set(room.code, structuredClone(room)); }
  async get(code: string) {
    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.expiresAt <= this.now()) { this.rooms.delete(code); return null; }
    return structuredClone(room);
  }
  async save(room: RoomRecord) { this.rooms.set(room.code, structuredClone(room)); }
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
  game.winner = targets.length !== 1 ? "draw" : game.minorityIds.includes(targets[0]) ? "minority" : "majority";
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
  const game = room.game;
  if (!game) return false;
  if (game.kind === "word-wolf") {
    if (game.phaseDeadlineAt === null || game.phaseDeadlineAt > now) return false;
    if (game.phase === "discussion") { game.phase = "voting"; game.phaseDeadlineAt = now + 60_000; return true; }
    if (game.phase === "voting") { resolveWordWolf(game); game.phaseDeadlineAt = null; return true; }
  }
  if (game.kind === "werewolf") {
    if (game.phaseDeadlineAt === null || game.phaseDeadlineAt > now) return false;
    if (game.phase === "night") { resolveWerewolfNight(game); game.phaseDeadlineAt = game.winner ? null : now + 60_000; return true; }
    if (game.phase === "day") { game.phase = "voting"; game.phaseDeadlineAt = now + 60_000; return true; }
    if (game.phase === "voting" || game.phase === "revote") { resolveWerewolfVotes(game); game.phaseDeadlineAt = game.winner ? null : now + 60_000; return true; }
  }
  return false;
}

export class RoomService {
  private readonly commandResults = new Map<string, RoomCommandResult>();
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
    if (room && advanceExpiredGame(room, this.now())) {
      room.version += 1;
      await this.repository.save(room);
    }
    return room ? this.project(room, participantId) : null;
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
    return { room: this.project(room, id), hostToken, reconnectToken };
  }

  async execute(command: RoomCommand, tokenValue?: string): Promise<RoomCommandResult> {
    const roomCode = command && typeof command === "object" && typeof command.roomCode === "string"
      ? command.roomCode.trim().toUpperCase()
      : "";
    const previous = this.roomLocks.get(roomCode) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    this.roomLocks.set(roomCode, queued);
    await previous;
    try {
      return await this.executeUnlocked(command, tokenValue);
    } finally {
      release();
      if (this.roomLocks.get(roomCode) === queued) this.roomLocks.delete(roomCode);
    }
  }

  private async executeUnlocked(command: RoomCommand, tokenValue?: string): Promise<RoomCommandResult> {
    if (!command || typeof command !== "object") throw new RoomDomainError("command_invalid");
    const roomCode = typeof command.roomCode === "string" ? command.roomCode.trim().toUpperCase() : "";
    if (!roomCode) throw new RoomDomainError("room_code_required");
    if (typeof command.commandId !== "string" || !command.commandId.trim()) throw new RoomDomainError("command_id_required");
    if (!Number.isInteger(command.expectedVersion) || command.expectedVersion < 0) throw new RoomDomainError("expected_version_invalid");
    if (!("join reconnect leave kick start close game_start game_answer game_reveal anonymous_submit anonymous_moderate game_vote game_phase werewolf_action legacy_input" as const).split(" ").includes(command.kind)) throw new RoomDomainError("command_kind_invalid");
    command = { ...command, roomCode, commandId: command.commandId.trim() };
    const suppliedToken = typeof tokenValue === "string" ? tokenValue : undefined;
    const resultKey = `${command.roomCode}:${command.commandId}`;
    const previous = this.commandResults.get(resultKey);
    if (previous) return structuredClone(previous);
    const room = await this.repository.get(command.roomCode) ?? null;
    if (!room) throw new RoomDomainError("room_not_found");
    if (room.expiresAt <= this.now()) throw new RoomDomainError("room_expired");
    if (advanceExpiredGame(room, this.now())) {
      room.version += 1;
      await this.repository.save(room);
    }
    // Rooms started before this field existed must remain usable after a reconnect.
    if (room.game?.kind === "legacy-game" && !room.game.progression) {
      room.game.progression = legacyProgression(room.game.gameKey);
    }
    const rateKey = `${room.code}:${command.participantId ?? "anonymous"}`;
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
    const staleLegacyInput = room.version !== command.expectedVersion && command.kind === "legacy_input";
    if (room.version !== command.expectedVersion && !staleLegacyInput) throw new RoomDomainError("version_conflict");
    if (staleLegacyInput && (!room.game || room.game.kind !== "legacy-game" || room.game.progression !== "simultaneous" || !command.participantId || room.game.inputs[command.participantId])) {
      throw new RoomDomainError("version_conflict");
    }
    const actor = command.participantId ? room.participants.find((item) => item.id === command.participantId) : null;
    if (command.kind !== "join" && !actor) throw new RoomDomainError("participant_not_found");
    if (actor && command.kind !== "reconnect") {
      const expectedHash = actor.role === "host" ? room.hostTokenHash : actor.reconnectTokenHash;
      if (!suppliedToken || hashToken(suppliedToken) !== expectedHash) throw new RoomDomainError("token_invalid");
    }
    if (room.status === "closed" && ["game_start", "game_answer", "game_reveal", "anonymous_submit", "anonymous_moderate", "game_vote", "game_phase", "werewolf_action", "legacy_input"].includes(command.kind)) {
      throw new RoomDomainError("room_closed");
    }
    let issuedReconnectToken: string | undefined;
    let createdParticipantId: string | undefined;
    if (command.kind === "join") {
      if (room.status !== "waiting") throw new RoomDomainError("room_not_joinable");
      const name = typeof command.name === "string" ? command.name.trim() : "";
      if (!name) throw new RoomDomainError("nickname_required");
      if (room.participants.length >= maxParticipants) throw new RoomDomainError("room_full");
      if (room.participants.some((item) => normalizeName(item.name) === normalizeName(name))) throw new RoomDomainError("nickname_taken");
      issuedReconnectToken = token();
      createdParticipantId = token(12);
      room.participants.push({ id: createdParticipantId, name, role: "player", reconnectTokenHash: hashToken(issuedReconnectToken), connected: true });
    } else if (command.kind === "leave") {
      actor!.connected = false;
    } else if (command.kind === "kick") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      const target = room.participants.find((item) => item.id === command.targetParticipantId);
      if (!target) throw new RoomDomainError("participant_not_found");
      if (target.role === "host") throw new RoomDomainError("host_required");
      room.participants = room.participants.filter((item) => item.id !== command.targetParticipantId);
    } else if (command.kind === "start") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      room.status = "playing";
    } else if (command.kind === "close") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      room.status = "closed";
    } else if (command.kind === "reconnect") {
      if (!suppliedToken || !actor || actor.reconnectTokenHash !== hashToken(suppliedToken)) throw new RoomDomainError("reconnect_token_invalid");
      actor.connected = true;
    } else if (command.kind === "game_start") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (command.gameKind !== "two-choice" && command.gameKind !== "impression-ranking" && command.gameKind !== "majority-game" && command.gameKind !== "anonymous-box" && command.gameKind !== "word-wolf" && command.gameKind !== "werewolf" && command.gameKind !== "legacy-game") throw new RoomDomainError("game_kind_invalid");
      const prompt = typeof command.prompt === "string" ? command.prompt.trim() : "";
      if (!prompt) throw new RoomDomainError("prompt_required");
      if (command.gameKind === "two-choice") {
        room.game = { kind: "two-choice", prompt, deadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : null, phase: "answering", answers: {} };
      } else if (command.gameKind === "impression-ranking") {
        if (room.participants.length < 3) throw new RoomDomainError("not_enough_participants");
        room.game = { kind: "impression-ranking", prompt, phase: "voting", votes: {} };
      } else if (command.gameKind === "majority-game") {
        if (room.participants.length < 3) throw new RoomDomainError("not_enough_participants");
        room.game = { kind: "majority-game", prompt, phase: "voting", votes: {} };
      } else if (command.gameKind === "anonymous-box") {
        room.game = { kind: "anonymous-box", prompt, entries: [] };
      } else if (command.gameKind === "word-wolf") {
        const ids = room.participants.map((item) => item.id);
        const minorityCount = Math.max(1, Math.min(ids.length - 1, Math.floor(command.minorityCount ?? 1)));
        room.game = { kind: "word-wolf", phase: "discussion", phaseDeadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : this.now() + 60_000, majorityTopic: command.majorityTopic?.trim() || prompt, minorityTopic: command.minorityTopic?.trim() || "別のお題", minorityIds: randomOrder(ids).slice(0, minorityCount), votes: {} };
      } else if (command.gameKind === "werewolf") {
        const ids = randomOrder(room.participants.map((item) => item.id));
        const wolfCount = Math.max(1, Math.floor(ids.length / 4));
        const roles: Record<string, WerewolfRole> = {};
        ids.forEach((id, index) => { roles[id] = index < wolfCount ? "werewolf" : index === wolfCount ? "seer" : index === wolfCount + 1 ? "guard" : "villager"; });
        room.game = { kind: "werewolf", phase: "night", phaseDeadlineAt: typeof command.deadlineAt === "number" ? command.deadlineAt : this.now() + 60_000, roles, aliveIds: ids, nightActions: {}, votes: {}, tiedTargetIds: [], seerResults: {} };
      } else {
        const gameKey = command.legacyGameKey?.trim();
        if (!gameKey || !legacyGameKeys.has(gameKey)) throw new RoomDomainError("game_kind_invalid");
        if (room.participants.length < (legacyMinimumPlayers[gameKey] ?? 2)) throw new RoomDomainError("not_enough_participants");
        const progression = legacyProgression(gameKey);
        room.game = { kind: "legacy-game", gameKey, prompt, mode: command.mode?.trim() || progression, progression, phase: "playing", inputs: {}, ...(progression === "turn" || progression === "count-up" ? { turnIndex: 0 } : {}), ...(progression === "count-up" ? { currentTotal: 0, targetNumber: Number(prompt.match(/\d+/)?.[0] ?? 30), turnHistory: [] } : {}) };
      }
      room.status = "playing";
    } else if (command.kind === "game_answer") {
      if (!room.game || room.game.kind !== "two-choice") throw new RoomDomainError("game_not_active");
      if (room.game.phase === "revealed" || (room.game.deadlineAt !== null && room.game.deadlineAt <= this.now())) throw new RoomDomainError("answer_deadline_passed");
      if (command.choice !== "A" && command.choice !== "B" && command.choice !== "pass") throw new RoomDomainError("choice_invalid");
      room.game.answers[actor!.id] = command.choice;
    } else if (command.kind === "game_reveal") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (!room.game) throw new RoomDomainError("game_not_active");
      if (room.game.kind === "two-choice") {
        const allAnswered = room.participants.every((item) => room.game?.kind === "two-choice" && room.game.answers[item.id]);
        if (!allAnswered && (room.game.deadlineAt === null || room.game.deadlineAt > this.now())) throw new RoomDomainError("game_not_ready");
        room.game.phase = "revealed";
        room.game.deadlineAt = null;
      } else if (room.game.kind === "impression-ranking") {
        const game = room.game;
        if (game.phase !== "voting" || room.participants.some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "revealed";
      } else if (room.game.kind === "majority-game") {
        const game = room.game;
        if (game.phase !== "voting" || room.participants.some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "revealed";
      } else if (room.game.kind === "word-wolf") {
        const game = room.game;
        if (game.phase !== "voting" || room.participants.some((item) => !game.votes[item.id])) throw new RoomDomainError("game_not_ready");
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
        if (game.phase !== "playing" || room.participants.some((item) => !game.inputs[item.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "finished";
        game.result = resolveLegacyResult(game, room.participants);
      } else throw new RoomDomainError("game_not_active");
    } else if (command.kind === "anonymous_submit") {
      if (!room.game || room.game.kind !== "anonymous-box") throw new RoomDomainError("game_not_active");
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
      if (room.game.kind === "impression-ranking") {
        if (room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
        const target = command.voteTargetId;
        if (!target || target !== "skip" && !room.participants.some((item) => item.id === target)) throw new RoomDomainError("vote_target_invalid");
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
        if (!target || !room.participants.some((item) => item.id === target) || target === actor!.id) throw new RoomDomainError("vote_target_invalid");
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
    } else if (command.kind === "legacy_input") {
      if (!room.game || room.game.kind !== "legacy-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      const input = typeof command.input === "string" ? command.input.trim() : "";
      if (!input) throw new RoomDomainError("input_required");
      if (input.length > 500) throw new RoomDomainError("input_too_long");
      if (!validateLegacyInput(room.game.gameKey, input)) throw new RoomDomainError("input_invalid");
      if (room.game.progression === "count-up") {
        const participants = room.participants;
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
          room.game.result = resolveLegacyResult(room.game, room.participants);
        } else {
          room.game.turnIndex = (currentIndex + 1) % participants.length;
        }
      } else if (room.game.progression === "turn") {
        const participants = room.participants;
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
        if (room.participants.every((participant) => room.game?.kind === "legacy-game" && Boolean(room.game.inputs[participant.id]))) {
          room.game.phase = "finished";
          room.game.result = resolveLegacyResult(room.game, room.participants);
        }
      }
    } else if (command.kind === "werewolf_action") {
      if (!room.game || room.game.kind !== "werewolf" || room.game.phase !== "night" || !room.game.aliveIds.includes(actor!.id)) throw new RoomDomainError("game_not_ready");
      const target = command.targetParticipantId;
      if (!target || !room.game.aliveIds.includes(target)) throw new RoomDomainError("action_target_invalid");
      const role = room.game.roles[actor!.id];
      if (command.action === "kill" && role === "werewolf") room.game.nightActions.killTargetId = target;
      else if (command.action === "guard" && role === "guard") room.game.nightActions.guardTargetId = target;
      else if (command.action === "inspect" && role === "seer") room.game.nightActions.inspectTargetId = target;
      else throw new RoomDomainError("role_action_invalid");
    }
    room.version += 1;
    await this.repository.save(room);
    const result: RoomCommandResult = this.project(room, createdParticipantId ?? actor?.id ?? null, this.now());
    if (issuedReconnectToken && createdParticipantId) result.credentials = { participantId: createdParticipantId, reconnectToken: issuedReconnectToken };
    this.commandResults.set(resultKey, result);
    return structuredClone(result);
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
        participantCount: room.participants.length,
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
        participantCount: room.participants.length,
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
        participantCount: room.participants.length,
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: Object.values(game.votes).reduce<Record<string, number>>((acc, target) => { acc[target] = (acc[target] ?? 0) + 1; return acc; }, {}) } : {}),
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
        participantCount: room.participants.length,
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
      projection.game = {
        kind: "legacy-game",
        gameKey: game.gameKey,
        prompt: game.prompt,
        mode: game.mode,
        progression,
        phase: game.phase,
        inputCount: progression === "count-up" ? (game.turnHistory?.length ?? 0) : Object.keys(game.inputs).length,
        participantCount: room.participants.length,
        remainingCount: game.phase === "finished" ? 0 : progression === "turn" || progression === "count-up" ? Math.max(0, room.participants.length - (game.turnIndex ?? 0)) : room.participants.filter((participant) => !game.inputs[participant.id]).length,
        ...(participantId && game.inputs[participantId] ? { ownInput: game.inputs[participantId] } : {}),
        ...(progression === "turn" || progression === "count-up" ? { currentPlayerId: room.participants[(game.turnIndex ?? 0) % room.participants.length]?.id } : {}),
        ...(progression === "count-up" ? { currentTotal: game.currentTotal ?? 0, targetNumber: game.targetNumber ?? 30, turnHistory: [...(game.turnHistory ?? [])] } : {}),
        ...(game.phase === "finished" && game.result ? { result: game.result } : {}),
      };
    }
    return projection;
  }
}
