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
export type NgWordHit = {
  id: string;
  targetParticipantId: string;
  markerParticipantId: string;
};
export type TurtleSoupQuestionClassification = "yes" | "no" | "irrelevant";
export type YamanoteAction = "answer" | "pass" | "out";
export type PartyPackMode =
  | "yamanote"
  | "majority"
  | "truth-lie"
  | "reverse-word"
  | "loanword-ban"
  | "typing"
  | "memory-drawing"
  | "value-meter"
  | "acting"
  | "hint-quiz";
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
type NgWordGameState = {
  kind: "ng-word";
  startedVersion?: number;
  prompt: string;
  phase: "assigned" | "playing" | "revealed";
  assignments: Record<string, string>;
  hits: NgWordHit[];
  difficulty: "easy" | "normal";
};
type TurtleSoupQuestion = {
  id: string;
  askerId: string;
  text: string;
  classification: TurtleSoupQuestionClassification | null;
};
type TurtleSoupGameState = {
  kind: "turtle-soup";
  startedVersion?: number;
  prompt: string;
  phase: "questioning" | "revealed";
  truth: string;
  hints: string[];
  hintLevel: number;
  questions: TurtleSoupQuestion[];
};
type YamanoteAnswerLog = {
  id: string;
  playerId: string;
  action: YamanoteAction;
  answer?: string;
};
type YamanoteGameState = {
  kind: "yamanote";
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "finished";
  playerOrder: string[];
  currentPlayerId: string | null;
  actedPlayerIds: string[];
  outIds: string[];
  answerHistory: YamanoteAnswerLog[];
};
type PartyPackResult = {
  summary: string;
  inputs: Record<string, string>;
  scores: Record<string, number>;
  answer?: string;
  counts?: Record<string, number>;
};
type PartyPackGameState = {
  kind: "party-pack";
  startedVersion?: number;
  prompt: string;
  promptId: string;
  instruction: string;
  mode: PartyPackMode;
  progression: "simultaneous" | "turn";
  phase: "playing" | "revealed";
  playerOrder: string[];
  currentPlayerId: string | null;
  inputs: Record<string, string>;
  hiddenAnswer?: string;
  result?: PartyPackResult;
};

export type NativeTurnAction = "answer" | "pass" | "out";

type TruthLieResult = {
  presenterId: string;
  statements: string[];
  lieIndex: number;
  votes: Record<string, number>;
  scores: Record<string, number>;
  correctCount: number;
};

type TruthLieGameState = {
  kind: "truth-lie-game";
  startedVersion?: number;
  prompt: string;
  phase: "presenting" | "voting" | "revealed";
  presenterId: string;
  statements: string[];
  lieIndex: number | null;
  votes: Record<string, number>;
  result?: TruthLieResult;
};

type ReverseWordTurn = {
  id: string;
  playerId: string;
  action: NativeTurnAction;
  answer?: string;
};

type ReverseWordResult = {
  expected: string;
  turnHistory: ReverseWordTurn[];
  outIds: string[];
  scores: Record<string, number>;
};

type ReverseWordGameState = {
  kind: "reverse-word-game";
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "finished";
  playerOrder: string[];
  currentPlayerId: string | null;
  actedPlayerIds: string[];
  outIds: string[];
  turnHistory: ReverseWordTurn[];
  result?: ReverseWordResult;
};

type FastTypingSubmission = {
  text: string;
  submittedAt: number;
  order: number;
};

type FastTypingLeaderboardEntry = {
  participantId: string;
  rank: number;
  completedAt: number;
  score: number;
};

type FastTypingResult = {
  expected: string;
  submissions: Record<string, FastTypingSubmission>;
  leaderboard: FastTypingLeaderboardEntry[];
  scores: Record<string, number>;
};

type FastTypingGameState = {
  kind: "fast-typing-game";
  startedVersion?: number;
  prompt: string;
  phase: "typing" | "revealed";
  startedAt: number;
  nextSubmissionOrder: number;
  submissions: Record<string, FastTypingSubmission>;
  result?: FastTypingResult;
};

type MemoryDrawingResult = {
  target: string;
  descriptions: Record<string, string>;
  votes: Record<string, string>;
  scores: Record<string, number>;
};

type MemoryDrawingGameState = {
  kind: "memory-drawing-game";
  startedVersion?: number;
  prompt: string;
  target: string;
  phase: "drawing" | "voting" | "revealed";
  descriptions: Record<string, string>;
  votes: Record<string, string>;
  result?: MemoryDrawingResult;
};

type ValueMeterRow = {
  value: number;
  phrase: string;
};

type ValueMeterResult = {
  rows: Record<string, ValueMeterRow>;
  average: number;
  median: number;
  min: number;
  max: number;
  scores: Record<string, number>;
};

type ValueMeterGameState = {
  kind: "value-meter-game";
  startedVersion?: number;
  prompt: string;
  phase: "submitting" | "revealed";
  rows: Record<string, ValueMeterRow>;
  result?: ValueMeterResult;
};

type ActingResult = {
  prompt: string;
  emotion: string;
  performerId: string;
  guesses: Record<string, string>;
  scores: Record<string, number>;
};

type ActingGameState = {
  kind: "acting-game";
  startedVersion?: number;
  prompt: string;
  phase: "guessing" | "revealed";
  performerId: string;
  emotion: string;
  guesses: Record<string, string>;
  result?: ActingResult;
};

type LoanwordBanStrike = {
  id: string;
  participantId: string;
  word: string;
};

type LoanwordBanResult = {
  prompt: string;
  prohibitedWords: string[];
  turnHistory: ReverseWordTurn[];
  strikes: LoanwordBanStrike[];
  outIds: string[];
  scores: Record<string, number>;
};

type LoanwordBanGameState = {
  kind: "loanword-ban-game";
  startedVersion?: number;
  prompt: string;
  prohibitedWords: string[];
  phase: "playing" | "finished";
  playerOrder: string[];
  currentPlayerId: string | null;
  actedPlayerIds: string[];
  outIds: string[];
  turnHistory: ReverseWordTurn[];
  strikes: LoanwordBanStrike[];
  result?: LoanwordBanResult;
};

type NativeHintQuizKind = "song-association-quiz" | "emo-hint-game" | "person-hint-quiz";

type NativeHintQuizResult = {
  facilitatorId: string;
  target: string;
  hints: string[];
  guesses: Record<string, string>;
  scores: Record<string, number>;
  correctCount: number;
};

type NativeHintQuizGameState = {
  kind: NativeHintQuizKind;
  startedVersion?: number;
  prompt: string;
  phase: "setting" | "guessing" | "revealed";
  facilitatorId: string;
  target: string | null;
  hints: string[];
  guesses: Record<string, string>;
  result?: NativeHintQuizResult;
};

type DrawingQuizResult = {
  artistId: string;
  target: string;
  guesses: Record<string, string>;
  scores: Record<string, number>;
  correctCount: number;
};

type DrawingQuizGameState = {
  kind: "drawing-quiz";
  startedVersion?: number;
  prompt: string;
  phase: "preparing" | "guessing" | "revealed";
  artistId: string;
  target: string | null;
  readyIds: string[];
  guesses: Record<string, string>;
  result?: DrawingQuizResult;
};

type FunnyLineKarutaClaim = {
  id: string;
  participantId: string;
  response: string;
  claimedAt: number;
  order: number;
};

type FunnyLineKarutaResult = {
  prompt: string;
  claims: FunnyLineKarutaClaim[];
  winnerId: string | null;
  scores: Record<string, number>;
};

type FunnyLineKarutaGameState = {
  kind: "funny-line-karuta";
  startedVersion?: number;
  prompt: string;
  phase: "claiming" | "revealed";
  claims: Record<string, FunnyLineKarutaClaim>;
  claimOrder: string[];
  nextClaimOrder: number;
  winnerId: string | null;
  result?: FunnyLineKarutaResult;
};

type HummingIntroGuess = {
  text: string;
  submittedAt: number;
  order: number;
};

type HummingIntroLeaderboardEntry = {
  participantId: string;
  rank: number;
  submittedAt: number;
  correct: boolean;
  score: number;
};

type HummingIntroResult = {
  singerId: string;
  target: string;
  guesses: Record<string, HummingIntroGuess>;
  leaderboard: HummingIntroLeaderboardEntry[];
  scores: Record<string, number>;
};

type HummingIntroGameState = {
  kind: "humming-intro-quiz";
  startedVersion?: number;
  prompt: string;
  phase: "preparing" | "guessing" | "revealed";
  singerId: string;
  target: string | null;
  guesses: Record<string, HummingIntroGuess>;
  nextGuessOrder: number;
  result?: HummingIntroResult;
};

type CountUpTurn = {
  id: string;
  playerId: string;
  increment: number;
  total: number;
};

type CountUpResult = {
  target: number;
  finalValue: number;
  loserId: string | null;
  winnerIds: string[];
  turnHistory: CountUpTurn[];
  scores: Record<string, number>;
};

type CountUpGameState = {
  kind: "count-up-game";
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "revealed";
  target: number;
  currentValue: number;
  playerOrder: string[];
  currentPlayerId: string | null;
  turnHistory: CountUpTurn[];
  loserId?: string | null;
  result?: CountUpResult;
};

type DudCardResult = {
  cardIds: string[];
  dudCardId: string;
  picks: Record<string, string>;
  dudPickerId: string | null;
  safeNeutral: true;
  scores: Record<string, number>;
};

type DudCardGameState = {
  kind: "dud-card-game";
  startedVersion?: number;
  prompt: string;
  phase: "picking" | "revealed";
  cardIds: string[];
  dudCardId: string;
  picks: Record<string, string>;
  result?: DudCardResult;
};

type SafeRandomDrawResult = {
  cardIds: string[];
  picks: Record<string, string>;
  outcomes: Record<string, string>;
  selectedOutcomes: Record<string, { cardId: string; outcome: string }>;
  safeNeutral: true;
  scores: Record<string, number>;
};

type SafeRandomDrawGameState = {
  kind: "safe-random-draw";
  startedVersion?: number;
  prompt: string;
  phase: "picking" | "revealed";
  cardIds: string[];
  outcomeByCard: Record<string, string>;
  picks: Record<string, string>;
  result?: SafeRandomDrawResult;
};

type NativeSugorokuKind = "drinking-sugoroku" | "life-event-sugoroku";

type NativeSugorokuTurn = {
  id: string;
  participantId: string;
  from: number;
  to: number;
  step: number;
  event: string;
};

type NativeSugorokuResult = {
  kind: NativeSugorokuKind;
  boardLength: number;
  positions: Record<string, number>;
  turnHistory: NativeSugorokuTurn[];
  winnerId: string | null;
  scores: Record<string, number>;
  safeNotice: string;
};

type NativeSugorokuGameState = {
  kind: NativeSugorokuKind;
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "revealed";
  boardLength: number;
  positions: Record<string, number>;
  playerOrder: string[];
  currentPlayerId: string | null;
  turnHistory: NativeSugorokuTurn[];
  safeEvents: string[];
  safeNotice: string;
  result?: NativeSugorokuResult;
};

type TerritoryResult = {
  boardSize: number;
  cells: Record<string, string | null>;
  claimHistory: Array<{ id: string; participantId: string; cellId: string }>;
  winnerIds: string[];
  scores: Record<string, number>;
};

type TerritoryGameState = {
  kind: "territory-game";
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "revealed";
  boardSize: number;
  cellIds: string[];
  cells: Record<string, string | null>;
  playerOrder: string[];
  currentPlayerId: string | null;
  claimHistory: Array<{ id: string; participantId: string; cellId: string }>;
  result?: TerritoryResult;
};

type ResourceName = "token" | "idea" | "story";
type ResourceInventory = Record<ResourceName, number>;
type ResourceOfferStatus = "pending" | "accepted" | "rejected" | "cancelled";
type ResourceOffer = {
  id: string;
  creatorId: string;
  recipientId: string;
  give: ResourceInventory;
  want: ResourceInventory;
  status: ResourceOfferStatus;
  order: number;
};

type ResourceNegotiationResult = {
  inventories: Record<string, ResourceInventory>;
  offers: ResourceOffer[];
  winnerId: string | null;
  goalResource: ResourceName;
  goalAmount: number;
  scores: Record<string, number>;
};

type ResourceNegotiationGameState = {
  kind: "resource-negotiation-game";
  startedVersion?: number;
  prompt: string;
  phase: "negotiating" | "revealed";
  resourceNames: ResourceName[];
  inventories: Record<string, ResourceInventory>;
  offers: Record<string, ResourceOffer>;
  nextOfferOrder: number;
  goalResource: ResourceName;
  goalAmount: number;
  winnerId: string | null;
  result?: ResourceNegotiationResult;
};

type ArmWrestlingMatch = {
  id: string;
  round: number;
  leftId: string;
  rightId: string | null;
  winnerId?: string;
  status: "pending" | "completed" | "bye";
};

type ArmWrestlingResult = {
  refereeId: string;
  matches: ArmWrestlingMatch[];
  winnerId: string | null;
  scores: Record<string, number>;
  safetyNotice: string;
};

type ArmWrestlingGameState = {
  kind: "arm-wrestling-tournament";
  startedVersion?: number;
  prompt: string;
  phase: "playing" | "revealed";
  refereeId: string;
  roundParticipants: string[];
  roundWinners: string[];
  round: number;
  currentMatch: ArmWrestlingMatch | null;
  matches: ArmWrestlingMatch[];
  safetyNotice: string;
  result?: ArmWrestlingResult;
};

type LargeMajorityResult = {
  options: string[];
  votes: Record<string, string>;
  counts: Record<string, number>;
  winningOptions: string[];
  scores: Record<string, number>;
};

type LargeMajorityGameState = {
  kind: "large-majority-game";
  startedVersion?: number;
  prompt: string;
  phase: "voting" | "revealed";
  options: string[];
  votes: Record<string, string>;
  result?: LargeMajorityResult;
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
export type RoomGameState = TwoChoiceGameState | ImpressionGameState | MajorityGameState | JohariGameState | AnonymousGameState | WordWolfGameState | NgWordGameState | TurtleSoupGameState | YamanoteGameState | PartyPackGameState | TruthLieGameState | ReverseWordGameState | FastTypingGameState | MemoryDrawingGameState | ValueMeterGameState | ActingGameState | LoanwordBanGameState | NativeHintQuizGameState | DrawingQuizGameState | FunnyLineKarutaGameState | HummingIntroGameState | CountUpGameState | DudCardGameState | NativeSugorokuGameState | TerritoryGameState | ResourceNegotiationGameState | ArmWrestlingGameState | SafeRandomDrawGameState | LargeMajorityGameState | WerewolfGameState | LegacyGameState;

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
  | { kind: "ng-word"; prompt: string; phase: "assigned" | "playing" | "revealed"; participantCount: number; assignedCount: number; assignments: Record<string, string | null>; hits: NgWordHit[]; hitCounts: Record<string, number>; result?: { assignments: Record<string, string>; hits: NgWordHit[]; hitCounts: Record<string, number> } }
  | { kind: "turtle-soup"; prompt: string; phase: "questioning" | "revealed"; questionCount: number; pendingQuestionCount: number; questions: Array<Pick<TurtleSoupQuestion, "id" | "askerId" | "text" | "classification">>; hintLevel: number; hints: string[]; availableHints?: string[]; hostTruth?: string; truth?: string }
  | { kind: "yamanote"; prompt: string; phase: "playing" | "finished"; playerOrder: string[]; currentPlayerId: string | null; actedPlayerIds: string[]; outIds: string[]; answerHistory: YamanoteAnswerLog[]; result?: { answerHistory: YamanoteAnswerLog[]; outIds: string[] } }
  | { kind: "party-pack"; prompt: string; promptId: string; instruction: string; mode: PartyPackMode; progression: "simultaneous" | "turn"; phase: "playing" | "revealed"; playerOrder: string[]; currentPlayerId: string | null; inputCount: number; participantCount: number; remainingCount: number; ownInput?: string; hostAnswer?: string; result?: PartyPackResult }
  | { kind: "truth-lie-game"; prompt: string; phase: "presenting" | "voting" | "revealed"; presenterId: string; ownRole: "presenter" | "voter"; statementCount: number; voterCount: number; voteCount: number; ownStatements?: string[]; ownLieIndex?: number; statements?: string[]; ownVote?: number; result?: TruthLieResult }
  | { kind: "reverse-word-game"; prompt: string; phase: "playing" | "finished"; playerOrder: string[]; currentPlayerId: string | null; actedPlayerIds: string[]; outIds: string[]; turnCount: number; turnHistory: Array<Pick<ReverseWordTurn, "id" | "playerId" | "action">>; result?: ReverseWordResult }
  | { kind: "fast-typing-game"; prompt: string; phase: "typing" | "revealed"; submittedCount: number; participantCount: number; remainingCount: number; ownSubmission?: Pick<FastTypingSubmission, "text" | "submittedAt">; result?: FastTypingResult }
  | { kind: "memory-drawing-game"; prompt: string; phase: "drawing" | "voting" | "revealed"; drawingCount: number; participantCount: number; voteCount: number; voterCount: number; ownDescription?: string; ownVote?: string; hostTarget?: string; result?: MemoryDrawingResult }
  | { kind: "value-meter-game"; prompt: string; phase: "submitting" | "revealed"; submittedCount: number; participantCount: number; remainingCount: number; ownRow?: ValueMeterRow; result?: ValueMeterResult }
  | { kind: "acting-game"; prompt: string; phase: "guessing" | "revealed"; performerId: string; audienceCount: number; guessCount: number; ownRole: "performer" | "audience"; ownPerformerPrompt?: string; ownEmotion?: string; ownGuess?: string; result?: ActingResult }
  | { kind: "loanword-ban-game"; phase: "playing" | "finished"; prompt: string; playerOrder: string[]; currentPlayerId: string | null; actedPlayerIds: string[]; outIds: string[]; turnCount: number; strikeCount: number; ownPrompt?: string; ownProhibitedWords?: string[]; turnHistory: Array<Pick<ReverseWordTurn, "id" | "playerId" | "action">>; strikes: Array<Pick<LoanwordBanStrike, "id" | "participantId"> & { word?: string }>; result?: LoanwordBanResult }
  | { kind: NativeHintQuizKind; prompt: string; phase: "setting" | "guessing" | "revealed"; facilitatorId: string; ownRole: "facilitator" | "guesser"; hints: string[]; hintCount: number; guessCount: number; participantCount: number; ownTarget?: string; ownGuess?: string; result?: NativeHintQuizResult }
  | { kind: "drawing-quiz"; prompt: string; phase: "preparing" | "guessing" | "revealed"; artistId: string; ownRole: "artist" | "guesser"; artistReady: boolean; readyCount: number; participantCount: number; guessCount: number; ownTarget?: string; ownReady?: boolean; ownGuess?: string; result?: DrawingQuizResult }
  | { kind: "funny-line-karuta"; prompt: string; phase: "claiming" | "revealed"; claimCount: number; participantCount: number; winnerId?: string | null; ownClaim?: Pick<FunnyLineKarutaClaim, "response" | "claimedAt" | "order">; result?: FunnyLineKarutaResult }
  | { kind: "humming-intro-quiz"; prompt: string; phase: "preparing" | "guessing" | "revealed"; singerId: string; ownRole: "singer" | "guesser"; guessCount: number; participantCount: number; ownTarget?: string; ownGuess?: Pick<HummingIntroGuess, "text" | "submittedAt">; result?: HummingIntroResult }
  | { kind: "count-up-game"; prompt: string; phase: "playing" | "revealed"; target: number; currentValue: number; playerOrder: string[]; currentPlayerId: string | null; turnCount: number; ownTurn: boolean; result?: CountUpResult }
  | { kind: "dud-card-game"; prompt: string; phase: "picking" | "revealed"; cardIds: string[]; pickCount: number; participantCount: number; ownPick?: string; result?: DudCardResult }
  | { kind: NativeSugorokuKind; prompt: string; phase: "playing" | "revealed"; boardLength: number; positions: Record<string, number>; playerOrder: string[]; currentPlayerId: string | null; turnCount: number; safeNotice: string; ownPosition: number; result?: NativeSugorokuResult }
  | { kind: "territory-game"; prompt: string; phase: "playing" | "revealed"; boardSize: number; cellIds: string[]; cells: Record<string, string | null>; playerOrder: string[]; currentPlayerId: string | null; claimCount: number; ownTurn: boolean; result?: TerritoryResult }
  | { kind: "resource-negotiation-game"; prompt: string; phase: "negotiating" | "revealed"; resourceNames: ResourceName[]; goalResource: ResourceName; goalAmount: number; offers: ResourceOffer[]; offerCount: number; ownInventory?: ResourceInventory; ownOfferIds: string[]; winnerId: string | null; result?: ResourceNegotiationResult }
  | { kind: "arm-wrestling-tournament"; prompt: string; phase: "playing" | "revealed"; refereeId: string; currentMatch: ArmWrestlingMatch | null; matches: ArmWrestlingMatch[]; ownRole: "referee" | "competitor"; safetyNotice: string; result?: ArmWrestlingResult }
  | { kind: "safe-random-draw"; prompt: string; phase: "picking" | "revealed"; cardIds: string[]; pickCount: number; participantCount: number; ownPick?: string; result?: SafeRandomDrawResult }
  | { kind: "large-majority-game"; prompt: string; phase: "voting" | "revealed"; options: string[]; voteCount: number; participantCount: number; ownVote?: string; result?: LargeMajorityResult }
  | { kind: "werewolf"; phase: "night" | "day" | "voting" | "revote" | "finished"; phaseDeadlineAt: number | null; aliveIds: string[]; ownRole?: WerewolfRole; teammates?: string[]; ownSeerResults?: { targetId: string; role: WerewolfRole }[]; ownVote?: string; tiedTargetIds?: string[]; winner?: "werewolf" | "villager" }
  | { kind: "legacy-game"; gameKey: string; prompt: string; mode: string; progression: "simultaneous" | "turn" | "count-up"; phase: "playing" | "finished"; inputCount: number; participantCount: number; remainingCount: number; ownInput?: string; currentPlayerId?: string; currentTotal?: number; targetNumber?: number; turnHistory?: Array<{ playerId: string; add: number; total: number }>; result?: LegacyGameResult };

export type RoomCommand = {
  roomCode: string;
  commandId: string;
  expectedVersion: number;
  kind: "join" | "reconnect" | "leave" | "kick" | "start" | "close" | "reset" | "game_reset" | "game_start" | "game_answer" | "game_reveal" | "game_phase" | "johari_self_submit" | "johari_peer_submit" | "anonymous_submit" | "anonymous_moderate" | "game_vote" | "werewolf_action" | "legacy_input" | "ng_word_hit" | "turtle_soup_question" | "turtle_soup_classify" | "turtle_soup_hint" | "yamanote_answer" | "party_pack_action" | "truth_lie_present" | "truth_lie_vote" | "truth_lie_submit" | "reverse_word_action" | "reverse_word_answer" | "fast_typing_submit" | "fast_typing_complete" | "memory_drawing_submit" | "memory_drawing_vote" | "value_meter_submit" | "acting_guess" | "acting_submit" | "loanword_ban_action" | "loanword_ban_answer" | "song_association_prepare" | "song_association_hint" | "song_association_guess" | "drawing_quiz_prepare" | "drawing_quiz_ready" | "drawing_quiz_guess" | "funny_line_karuta_claim" | "emo_hint_prepare" | "emo_hint_hint" | "emo_hint_guess" | "person_hint_prepare" | "person_hint_hint" | "person_hint_guess" | "humming_intro_prepare" | "humming_intro_guess" | "count_up_increment" | "dud_card_pick" | "drinking_sugoroku_roll" | "life_event_sugoroku_roll" | "territory_claim" | "resource_offer_create" | "resource_offer_accept" | "resource_offer_reject" | "resource_offer_cancel" | "arm_wrestling_record" | "safe_random_pick" | "large_majority_vote";
  participantId?: string;
  joinNonce?: string;
  targetParticipantId?: string;
  name?: string;
  gameKind?: "two-choice" | "impression-ranking" | "majority-game" | "johari-window" | "anonymous-box" | "word-wolf" | "werewolf" | "ng-word" | "turtle-soup" | "yamanote" | "party-pack" | "truth-lie-game" | "reverse-word-game" | "fast-typing-game" | "memory-drawing-game" | "value-meter-game" | "acting-game" | "loanword-ban-game" | "song-association-quiz" | "drawing-quiz" | "funny-line-karuta" | "emo-hint-game" | "person-hint-quiz" | "humming-intro-quiz" | "count-up-game" | "dud-card-game" | "drinking-sugoroku" | "territory-game" | "resource-negotiation-game" | "life-event-sugoroku" | "arm-wrestling-tournament" | "safe-random-draw" | "large-majority-game" | "legacy-game";
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
  action?: "kill" | "guard" | "inspect" | NativeTurnAction;
  input?: string;
  ngWordDifficulty?: "easy" | "normal";
  turtleSoupQuestionId?: string;
  turtleSoupClassification?: TurtleSoupQuestionClassification;
  turtleSoupHintIndex?: number;
  turtleSoupTruth?: string;
  turtleSoupHints?: string[];
  yamanoteAction?: YamanoteAction;
  partyPackMode?: PartyPackMode;
  partyPackPromptId?: string;
  truthLiePresenterId?: string;
  truthLieStatements?: string[];
  truthLieLieIndex?: number;
  truthLieVote?: number;
  turnAction?: NativeTurnAction;
  fastTypingText?: string;
  memoryDrawingDescription?: string;
  memoryDrawingTarget?: string;
  memoryDrawingVoteTargetId?: string;
  valueMeterValue?: number;
  valueMeterPhrase?: string;
  actingPerformerId?: string;
  actingGuess?: string;
  nativeQuizTarget?: string;
  nativeQuizHint?: string;
  nativeQuizGuess?: string;
  songAssociationFacilitatorId?: string;
  drawingQuizArtistId?: string;
  drawingQuizTarget?: string;
  drawingQuizReady?: boolean;
  drawingQuizGuess?: string;
  funnyLineKarutaResponse?: string;
  emoHintFacilitatorId?: string;
  personHintFacilitatorId?: string;
  hummingIntroSingerId?: string;
  hummingIntroTarget?: string;
  hummingIntroGuess?: string;
  countUpTarget?: number;
  countUpIncrement?: number;
  dudCardPick?: string;
  sugorokuBoardLength?: number;
  territoryBoardSize?: number;
  territoryCell?: string;
  resourceOfferId?: string;
  resourceOfferRecipientId?: string;
  resourceOfferGive?: string;
  resourceOfferWant?: string;
  armWrestlingRefereeId?: string;
  armWrestlingWinnerId?: string;
  safeRandomPick?: string;
  largeMajorityOptions?: string[];
  largeMajorityVote?: string;
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

const nativeHintQuizKinds = ["song-association-quiz", "emo-hint-game", "person-hint-quiz"] as const;

const nativeSugorokuKinds = ["drinking-sugoroku", "life-event-sugoroku"] as const;

function isNativeHintQuizGame(game: RoomGameState): game is NativeHintQuizGameState {
  return (nativeHintQuizKinds as readonly string[]).includes(game.kind);
}

function isNativeSugorokuGame(game: RoomGameState): game is NativeSugorokuGameState {
  return (nativeSugorokuKinds as readonly string[]).includes(game.kind);
}

const nativeMinimumPlayers: Record<Exclude<RoomCommand["gameKind"], "legacy-game" | undefined>, number> = {
  "two-choice": 2,
  "impression-ranking": 3,
  "majority-game": 3,
  "johari-window": 3,
  "anonymous-box": 2,
  "word-wolf": 4,
  "ng-word": 3,
  "turtle-soup": 2,
  yamanote: 2,
  "party-pack": 3,
  "truth-lie-game": 3,
  "reverse-word-game": 2,
  "fast-typing-game": 2,
  "memory-drawing-game": 3,
  "value-meter-game": 2,
  "acting-game": 3,
  "loanword-ban-game": 2,
  "song-association-quiz": 3,
  "drawing-quiz": 3,
  "funny-line-karuta": 2,
  "emo-hint-game": 3,
  "person-hint-quiz": 3,
  "humming-intro-quiz": 3,
  "count-up-game": 2,
  "dud-card-game": 2,
  "drinking-sugoroku": 2,
  "territory-game": 2,
  "resource-negotiation-game": 3,
  "life-event-sugoroku": 2,
  "arm-wrestling-tournament": 2,
  "safe-random-draw": 2,
  "large-majority-game": 10,
  werewolf: 4,
};

const defaultJohariDeckWordIds = [
  "warm-01", "warm-02", "warm-03", "warm-04", "warm-05",
  "social-01", "social-02", "social-03", "social-04", "social-05",
  "steady-01", "steady-02", "steady-03", "steady-04", "steady-05",
  "creative-01", "creative-02", "creative-03", "creative-04", "creative-05",
];

const ngWordPools: Record<"easy" | "normal", readonly string[]> = {
  easy: ["すごい", "なるほど", "たしかに", "やばい", "おいしい", "いいね", "ほんと", "なんで", "ありがとう", "ちょっと"],
  normal: ["仕事", "明日", "最近", "好き", "眠い", "忙しい", "旅行", "ごはん", "休み", "楽しい"],
};

const defaultTurtleSoupTruth = "主人公は傘を持って来たつもりでしたが、家に置き忘れていたことに気づいたため、誰にも盗まれていないと安心しました。";
const defaultTurtleSoupHints = [
  "誰かに盗まれたわけではありません。",
  "主人公は傘を持って来たと思い込んでいました。",
  "安心した理由は、疑う相手がいなくなったからです。",
];

type PartyPackDefinition = {
  id: string;
  mode: PartyPackMode;
  prompt: string;
  instruction: string;
  answer?: string;
};

const partyPackDefinitions: readonly PartyPackDefinition[] = [
  { id: "yamanote-01", mode: "yamanote", prompt: "東京の駅名", instruction: "順番に、お題に合う言葉を1つずつ入力します。" },
  { id: "majority-01", mode: "majority", prompt: "朝型？夜型？ A=朝型 / B=夜型", instruction: "この場の多数派だと思う方を同時に選びます。" },
  { id: "truth-lie-01", mode: "truth-lie", prompt: "話し手の3つの話で、嘘はどれ？", instruction: "嘘だと思う番号を1〜3で入力します。", answer: "2" },
  { id: "reverse-word-01", mode: "reverse-word", prompt: "さくら", instruction: "お題を逆から読んで入力します." },
  { id: "loanword-ban-01", mode: "loanword-ban", prompt: "スマホを外来語なしで説明", instruction: "カタカナ語を避けた言い換えを入力します。" },
  { id: "typing-01", mode: "typing", prompt: "今日はみんなで楽しく遊ぼう", instruction: "文章|ミリ秒 の形式で入力します。" },
  { id: "memory-drawing-01", mode: "memory-drawing", prompt: "身近な店のロゴ", instruction: "覚えている特徴を文章で入力します。" },
  { id: "value-meter-01", mode: "value-meter", prompt: "休日は予定を入れたい", instruction: "数値|理由 の形式で1〜100の共感度を入力します。" },
  { id: "acting-01", mode: "acting", prompt: "『大丈夫です』を喜んで演じる", instruction: "演技の感情やヒントを入力します。" },
  { id: "hint-quiz-01", mode: "hint-quiz", prompt: "写真なしで人物を当てよう", instruction: "答えまたはヒントを入力します。", answer: "スポーツ選手" },
];

const actingEmotionPool = ["うれしい", "かなしい", "おどろき", "いかり", "ねむい", "あせり"] as const;
const loanwordBanDefaultWords = ["スマホ", "アプリ", "ゲーム", "ネット", "パソコン", "テレビ", "コンビニ"] as const;

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
  if (game.kind === "ng-word" || game.kind === "turtle-soup" || game.kind === "party-pack") return game.phase === "revealed";
  if (game.kind === "yamanote") return game.phase === "finished";
  if (game.kind === "reverse-word-game" || game.kind === "loanword-ban-game") return game.phase === "finished";
  if (game.kind === "truth-lie-game" || game.kind === "fast-typing-game" || game.kind === "memory-drawing-game" || game.kind === "value-meter-game" || game.kind === "acting-game") return game.phase === "revealed";
  if (isNativeHintQuizGame(game)) return game.phase === "revealed";
  if (game.kind === "drawing-quiz" || game.kind === "humming-intro-quiz") return game.phase === "revealed";
  if (game.kind === "funny-line-karuta") return game.phase === "revealed";
  if (game.kind === "count-up-game" || game.kind === "dud-card-game" || isNativeSugorokuGame(game) || game.kind === "territory-game" || game.kind === "resource-negotiation-game" || game.kind === "arm-wrestling-tournament" || game.kind === "safe-random-draw" || game.kind === "large-majority-game") return game.phase === "revealed";
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

function countNgWordHits(hits: readonly NgWordHit[]) {
  return hits.reduce<Record<string, number>>((counts, hit) => {
    counts[hit.targetParticipantId] = (counts[hit.targetParticipantId] ?? 0) + 1;
    return counts;
  }, {});
}

function partyPackProgression(mode: PartyPackMode): PartyPackGameState["progression"] {
  return ["yamanote", "reverse-word", "loanword-ban", "acting", "hint-quiz"].includes(mode)
    ? "turn"
    : "simultaneous";
}

function getPartyPackDefinition(mode: PartyPackMode, promptId?: string) {
  const requested = typeof promptId === "string"
    ? partyPackDefinitions.find((definition) => definition.id === promptId && definition.mode === mode)
    : undefined;
  return requested ?? partyPackDefinitions.find((definition) => definition.mode === mode) ?? partyPackDefinitions[0]!;
}

function partyPackHiddenAnswer(mode: PartyPackMode, prompt: string, definition: PartyPackDefinition) {
  if (mode === "reverse-word") return reverseText(prompt);
  return definition.answer;
}

function normalizePartyPackChoice(input: string) {
  const normalized = input.trim().toUpperCase();
  return ({ A: "1", B: "2", C: "3" } as Record<string, string>)[normalized] ?? normalized;
}

function validatePartyPackInput(game: PartyPackGameState, input: string) {
  if (game.mode === "majority") return ["A", "B", "PASS"].includes(input.trim().toUpperCase());
  if (game.mode === "truth-lie") return ["1", "2", "3"].includes(normalizePartyPackChoice(input));
  if (game.mode === "value-meter") {
    const separator = input.indexOf("|");
    if (separator <= 0) return false;
    const value = Number(input.slice(0, separator).trim());
    return Number.isInteger(value) && value >= 1 && value <= 100 && input.slice(separator + 1).trim().length > 0;
  }
  if (game.mode === "typing") {
    const separator = input.lastIndexOf("|");
    if (separator <= 0) return false;
    const elapsedMs = Number(input.slice(separator + 1).trim());
    return Number.isInteger(elapsedMs) && elapsedMs >= 1 && elapsedMs <= 120_000 && input.slice(0, separator).trim().length > 0;
  }
  return input.trim().length > 0;
}

function resolvePartyPackResult(game: PartyPackGameState, participants: readonly RoomParticipant[]): PartyPackResult {
  const inputs = { ...game.inputs };
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  const answer = game.hiddenAnswer;
  let summary = `${Object.keys(inputs).length}人の回答を公開しました`;

  if (game.mode === "reverse-word" || game.mode === "hint-quiz") {
    participants.forEach((participant) => {
      const submitted = inputs[participant.id]?.trim() ?? "";
      scores[participant.id] = answer && submitted.toLocaleLowerCase() === answer.toLocaleLowerCase() ? 1 : 0;
    });
    summary = `正解は${answer ?? "未設定"}、正解者${Object.values(scores).filter((score) => score === 1).length}人`;
  } else if (game.mode === "truth-lie") {
    participants.forEach((participant) => {
      scores[participant.id] = answer && normalizePartyPackChoice(inputs[participant.id] ?? "") === answer ? 1 : 0;
    });
    summary = `正解は${answer ?? "未設定"}、正解者${Object.values(scores).filter((score) => score === 1).length}人`;
  } else if (game.mode === "majority") {
    const counts = Object.values(inputs).reduce<Record<string, number>>((result, value) => {
      const choice = value.trim().toUpperCase();
      result[choice] = (result[choice] ?? 0) + 1;
      return result;
    }, {});
    const max = Math.max(0, ...Object.values(counts));
    const winners = Object.entries(counts).filter(([, count]) => count === max).map(([choice]) => choice);
    participants.forEach((participant) => {
      scores[participant.id] = winners.includes((inputs[participant.id] ?? "").trim().toUpperCase()) ? 1 : 0;
    });
    summary = `最多票は${winners.join("・") || "なし"}、${Object.values(scores).filter((score) => score === 1).length}人が一致しました`;
    return { summary, inputs, scores, counts };
  } else if (game.mode === "typing") {
    const expected = game.prompt.trim();
    const timings = participants.map((participant) => {
      const input = inputs[participant.id] ?? "";
      const separator = input.lastIndexOf("|");
      const text = separator > 0 ? input.slice(0, separator).trim() : "";
      const elapsedMs = separator > 0 ? Number(input.slice(separator + 1).trim()) : Number.POSITIVE_INFINITY;
      return { id: participant.id, text, elapsedMs };
    });
    timings.forEach(({ id, text, elapsedMs }) => { scores[id] = text === expected ? Math.max(0, 120_000 - elapsedMs) : 0; });
    const fastest = timings.filter(({ text }) => text === expected).sort((left, right) => left.elapsedMs - right.elapsedMs)[0];
    summary = `正確入力${timings.filter(({ text }) => text === expected).length}人${fastest ? `、最速${fastest.elapsedMs}ms` : ""}`;
  } else if (game.mode === "value-meter") {
    const values = participants.map((participant) => Number((inputs[participant.id] ?? "").split("|", 1)[0])).filter((value) => Number.isFinite(value));
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    participants.forEach((participant) => {
      const value = Number((inputs[participant.id] ?? "").split("|", 1)[0]);
      scores[participant.id] = Number.isFinite(value) ? value : 0;
    });
    summary = `平均${average.toFixed(1)}、範囲1〜100`;
  } else {
    participants.forEach((participant) => { scores[participant.id] = inputs[participant.id] ? 1 : 0; });
  }

  return { summary, inputs, scores, ...(answer ? { answer } : {}) };
}

function finishPartyPack(game: PartyPackGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.currentPlayerId = null;
  game.result = resolvePartyPackResult(game, participants);
}

function nextPendingPartyPackPlayer(game: PartyPackGameState, room: RoomRecord, afterId: string | null) {
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const order = game.playerOrder.filter((id) => activeIds.has(id));
  if (order.length === 0) return null;
  const startIndex = Math.max(0, order.indexOf(afterId ?? ""));
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset) % order.length];
    if (candidate && !game.inputs[candidate]) return candidate;
  }
  return null;
}

function finishYamanote(game: YamanoteGameState) {
  game.phase = "finished";
  game.currentPlayerId = null;
}

function nextYamanotePlayer(game: YamanoteGameState, room: RoomRecord, afterId: string | null) {
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const pending = new Set(game.playerOrder.filter((id) => activeIds.has(id) && !game.outIds.includes(id) && !game.actedPlayerIds.includes(id)));
  if (pending.size === 0) return null;
  const startIndex = Math.max(0, game.playerOrder.indexOf(afterId ?? ""));
  for (let offset = 1; offset <= game.playerOrder.length; offset += 1) {
    const candidate = game.playerOrder[(startIndex + offset) % game.playerOrder.length];
    if (candidate && pending.has(candidate)) return candidate;
  }
  return pending.values().next().value ?? null;
}

function reconcileYamanoteDeparture(game: YamanoteGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  const previousIndex = Math.max(0, game.playerOrder.indexOf(participantId));
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  game.actedPlayerIds = game.actedPlayerIds.filter((id) => id !== participantId);
  game.outIds = game.outIds.filter((id) => id !== participantId);
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const pending = game.playerOrder.filter((id) => activeIds.has(id) && !game.outIds.includes(id) && !game.actedPlayerIds.includes(id));
  if (pending.length === 0) {
    finishYamanote(game);
    return;
  }
  if (previousCurrent === participantId || !pending.includes(previousCurrent ?? "")) {
    for (let offset = 0; offset < game.playerOrder.length; offset += 1) {
      const candidate = game.playerOrder[(previousIndex + offset) % game.playerOrder.length];
      if (candidate && pending.includes(candidate)) {
        game.currentPlayerId = candidate;
        return;
      }
    }
    game.currentPlayerId = pending[0] ?? null;
  }
}

function reconcilePartyPackDeparture(game: PartyPackGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  const previousIndex = Math.max(0, game.playerOrder.indexOf(participantId));
  delete game.inputs[participantId];
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  if (game.phase !== "playing" || game.progression !== "turn") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const pending = game.playerOrder.filter((id) => activeIds.has(id) && !game.inputs[id]);
  if (pending.length === 0) {
    finishPartyPack(game, activeParticipants(room));
    return;
  }
  if (previousCurrent === participantId || !pending.includes(previousCurrent ?? "")) {
    for (let offset = 0; offset < game.playerOrder.length; offset += 1) {
      const candidate = game.playerOrder[(previousIndex + offset) % game.playerOrder.length];
      if (candidate && pending.includes(candidate)) {
        game.currentPlayerId = candidate;
        return;
      }
    }
    game.currentPlayerId = pending[0] ?? null;
  }
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
    else if (game.kind === "ng-word" || game.kind === "turtle-soup") {
      // Hits and questions are shared logs, so a safe leave does not erase them.
    }
    else if (game.kind === "yamanote") reconcileYamanoteDeparture(game, room, participantId);
    else if (game.kind === "party-pack") reconcilePartyPackDeparture(game, room, participantId);
    else if (game.kind === "truth-lie-game") reconcileTruthLieDeparture(game, room, participantId);
    else if (game.kind === "reverse-word-game") reconcileReverseWordDeparture(game, room, participantId);
    else if (game.kind === "fast-typing-game") delete game.submissions[participantId];
    else if (game.kind === "memory-drawing-game") {
      delete game.descriptions[participantId];
      delete game.votes[participantId];
      for (const [voterId, targetId] of Object.entries(game.votes)) if (targetId === participantId) delete game.votes[voterId];
    }
    else if (game.kind === "value-meter-game") delete game.rows[participantId];
    else if (game.kind === "acting-game") reconcileActingDeparture(game, room, participantId);
    else if (game.kind === "loanword-ban-game") reconcileLoanwordBanDeparture(game, room, participantId);
    else if (isNativeHintQuizGame(game)) reconcileNativeHintQuizDeparture(game, room, participantId);
    else if (game.kind === "drawing-quiz") reconcileDrawingQuizDeparture(game, room, participantId);
    else if (game.kind === "funny-line-karuta") reconcileFunnyLineKarutaDeparture(game, room, participantId);
    else if (game.kind === "humming-intro-quiz") reconcileHummingIntroDeparture(game, room, participantId);
    else if (game.kind === "count-up-game") reconcileCountUpDeparture(game, room, participantId);
    else if (game.kind === "dud-card-game") reconcileDudCardDeparture(game, room, participantId);
    else if (game.kind === "safe-random-draw") reconcileSafeRandomDrawDeparture(game, room, participantId);
    else if (game.kind === "large-majority-game") reconcileLargeMajorityDeparture(game, room, participantId);
    else if (isNativeSugorokuGame(game)) reconcileNativeSugorokuDeparture(game, room, participantId);
    else if (game.kind === "territory-game") reconcileTerritoryDeparture(game, room, participantId);
    else if (game.kind === "resource-negotiation-game") reconcileResourceNegotiationDeparture(game, room, participantId);
    else if (game.kind === "arm-wrestling-tournament") reconcileArmWrestlingDeparture(game, room, participantId);
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
  } else if (game.kind === "ng-word") {
    delete game.assignments[participantId];
    // Keep the shared hit log even when a kicked participant is no longer in the roster.
  } else if (game.kind === "turtle-soup") {
    // Keep the shared question log so the facilitator can still classify it.
  } else if (game.kind === "yamanote") {
    reconcileYamanoteDeparture(game, room, participantId);
  } else if (game.kind === "party-pack") {
    reconcilePartyPackDeparture(game, room, participantId);
  } else if (game.kind === "truth-lie-game") {
    reconcileTruthLieDeparture(game, room, participantId);
  } else if (game.kind === "reverse-word-game") {
    reconcileReverseWordDeparture(game, room, participantId);
  } else if (game.kind === "fast-typing-game") {
    delete game.submissions[participantId];
  } else if (game.kind === "memory-drawing-game") {
    delete game.descriptions[participantId];
    delete game.votes[participantId];
    for (const [voterId, targetId] of Object.entries(game.votes)) if (targetId === participantId) delete game.votes[voterId];
  } else if (game.kind === "value-meter-game") {
    delete game.rows[participantId];
  } else if (game.kind === "acting-game") {
    reconcileActingDeparture(game, room, participantId);
  } else if (game.kind === "loanword-ban-game") {
    reconcileLoanwordBanDeparture(game, room, participantId);
  } else if (isNativeHintQuizGame(game)) {
    reconcileNativeHintQuizDeparture(game, room, participantId);
  } else if (game.kind === "drawing-quiz") {
    reconcileDrawingQuizDeparture(game, room, participantId);
  } else if (game.kind === "funny-line-karuta") {
    reconcileFunnyLineKarutaDeparture(game, room, participantId);
  } else if (game.kind === "humming-intro-quiz") {
    reconcileHummingIntroDeparture(game, room, participantId);
  } else if (game.kind === "count-up-game") {
    reconcileCountUpDeparture(game, room, participantId);
  } else if (game.kind === "dud-card-game") {
    reconcileDudCardDeparture(game, room, participantId);
  } else if (game.kind === "safe-random-draw") {
    reconcileSafeRandomDrawDeparture(game, room, participantId);
  } else if (isNativeSugorokuGame(game)) {
    reconcileNativeSugorokuDeparture(game, room, participantId);
  } else if (game.kind === "territory-game") {
    reconcileTerritoryDeparture(game, room, participantId);
  } else if (game.kind === "resource-negotiation-game") {
    reconcileResourceNegotiationDeparture(game, room, participantId);
  } else if (game.kind === "arm-wrestling-tournament") {
    reconcileArmWrestlingDeparture(game, room, participantId);
  } else if (game.kind === "large-majority-game") {
    reconcileLargeMajorityDeparture(game, room, participantId);
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
  if (command.kind === "ng_word_hit") return game.kind === "ng-word" && game.phase === "playing";
  if (command.kind === "turtle_soup_question") return game.kind === "turtle-soup" && game.phase === "questioning";
  if (command.kind === "party_pack_action") return game.kind === "party-pack" && game.phase === "playing" && game.progression === "simultaneous" && !game.inputs[actorId];
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
  if (command.kind === "truth_lie_vote" || command.kind === "truth_lie_submit") return game.kind === "truth-lie-game" && game.phase === "voting" && actorId !== game.presenterId && !Object.prototype.hasOwnProperty.call(game.votes, actorId);
  if (command.kind === "fast_typing_submit" || command.kind === "fast_typing_complete") return game.kind === "fast-typing-game" && game.phase === "typing" && !Object.prototype.hasOwnProperty.call(game.submissions, actorId);
  if (command.kind === "memory_drawing_submit") return game.kind === "memory-drawing-game" && game.phase === "drawing" && !Object.prototype.hasOwnProperty.call(game.descriptions, actorId);
  if (command.kind === "memory_drawing_vote") return game.kind === "memory-drawing-game" && game.phase === "voting" && !Object.prototype.hasOwnProperty.call(game.votes, actorId);
  if (command.kind === "acting_guess" || command.kind === "acting_submit") return game.kind === "acting-game" && game.phase === "guessing" && actorId !== game.performerId && !Object.prototype.hasOwnProperty.call(game.guesses, actorId);
  if (command.kind === "value_meter_submit") return game.kind === "value-meter-game" && game.phase === "submitting" && !Object.prototype.hasOwnProperty.call(game.rows, actorId);
  if (command.kind === "song_association_guess" || command.kind === "emo_hint_guess" || command.kind === "person_hint_guess") return isNativeHintQuizGame(game) && game.phase === "guessing" && actorId !== game.facilitatorId;
  if (command.kind === "drawing_quiz_ready") return game.kind === "drawing-quiz" && (game.phase === "preparing" || game.phase === "guessing");
  if (command.kind === "drawing_quiz_guess") return game.kind === "drawing-quiz" && game.phase === "guessing" && actorId !== game.artistId;
  if (command.kind === "funny_line_karuta_claim") return game.kind === "funny-line-karuta" && game.phase === "claiming" && !Object.prototype.hasOwnProperty.call(game.claims, actorId);
  if (command.kind === "humming_intro_guess") return game.kind === "humming-intro-quiz" && game.phase === "guessing" && actorId !== game.singerId && !Object.prototype.hasOwnProperty.call(game.guesses, actorId);
  if (command.kind === "dud_card_pick") return game.kind === "dud-card-game" && game.phase === "picking" && !game.picks[actorId] && typeof command.dudCardPick === "string" && game.cardIds.includes(command.dudCardPick) && !Object.values(game.picks).includes(command.dudCardPick);
  if (command.kind === "safe_random_pick") return game.kind === "safe-random-draw" && game.phase === "picking" && !game.picks[actorId] && typeof command.safeRandomPick === "string" && game.cardIds.includes(command.safeRandomPick) && !Object.values(game.picks).includes(command.safeRandomPick);
  if (command.kind === "large_majority_vote") return game.kind === "large-majority-game" && game.phase === "voting" && !game.votes[actorId] && typeof command.largeMajorityVote === "string" && game.options.includes(command.largeMajorityVote);
  if (command.kind === "resource_offer_create") return game.kind === "resource-negotiation-game" && game.phase === "negotiating";
  if (command.kind === "resource_offer_accept" || command.kind === "resource_offer_reject") {
    if (game.kind !== "resource-negotiation-game" || game.phase !== "negotiating" || typeof command.resourceOfferId !== "string") return false;
    const offer = game.offers[command.resourceOfferId];
    return Boolean(offer && offer.status === "pending" && offer.recipientId === actorId);
  }
  if (command.kind === "resource_offer_cancel") {
    if (game.kind !== "resource-negotiation-game" || game.phase !== "negotiating" || typeof command.resourceOfferId !== "string") return false;
    const offer = game.offers[command.resourceOfferId];
    return Boolean(offer && offer.status === "pending" && offer.creatorId === actorId);
  }
  return false;
}

function isMergeableCommand(command: unknown) {
  if (!command || typeof command !== "object") return false;
  const kind = (command as { kind?: unknown }).kind;
  return kind === "join" || kind === "game_answer" || kind === "johari_self_submit" || kind === "johari_peer_submit" || kind === "game_vote" || kind === "anonymous_submit" || kind === "werewolf_action" || kind === "legacy_input" || kind === "ng_word_hit" || kind === "turtle_soup_question" || kind === "party_pack_action" || kind === "truth_lie_vote" || kind === "truth_lie_submit" || kind === "fast_typing_submit" || kind === "fast_typing_complete" || kind === "memory_drawing_submit" || kind === "memory_drawing_vote" || kind === "acting_guess" || kind === "acting_submit" || kind === "value_meter_submit" || kind === "song_association_guess" || kind === "emo_hint_guess" || kind === "person_hint_guess" || kind === "drawing_quiz_ready" || kind === "drawing_quiz_guess" || kind === "funny_line_karuta_claim" || kind === "humming_intro_guess" || kind === "dud_card_pick" || kind === "safe_random_pick" || kind === "large_majority_vote" || kind === "resource_offer_create" || kind === "resource_offer_accept" || kind === "resource_offer_reject" || kind === "resource_offer_cancel";
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

function serverRandomInt(min: number, max: number) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  if (upper <= lower) return lower;
  return lower + (randomBytes(4).readUInt32BE(0) % (upper - lower + 1));
}

function reverseText(value: string) {
  return Array.from(value).reverse().join("");
}

function normalizeTruthAnswer(value: string) {
  const normalized = value.trim().toUpperCase();
  return ({ A: "1", B: "2", C: "3" } as Record<string, string>)[normalized] ?? normalized;
}

function nativePresenterId(room: RoomRecord, requested?: string) {
  const active = activeParticipants(room);
  if (requested && active.some((participant) => participant.id === requested)) return requested;
  return active.find((participant) => participant.role !== "host")?.id ?? active[0]?.id ?? "";
}

function nativePendingTurnPlayer(
  playerOrder: readonly string[],
  actedPlayerIds: readonly string[],
  outIds: readonly string[],
  activeIds: ReadonlySet<string>,
  afterId: string | null,
) {
  const pending = playerOrder.filter((id) => activeIds.has(id) && !actedPlayerIds.includes(id) && !outIds.includes(id));
  if (pending.length === 0) return null;
  const startIndex = Math.max(0, playerOrder.indexOf(afterId ?? ""));
  for (let offset = 1; offset <= playerOrder.length; offset += 1) {
    const candidate = playerOrder[(startIndex + offset) % playerOrder.length];
    if (candidate && pending.includes(candidate)) return candidate;
  }
  return pending[0] ?? null;
}

function truthLieVoterIds(game: TruthLieGameState, room: RoomRecord) {
  return activeParticipants(room).map((participant) => participant.id).filter((id) => id !== game.presenterId);
}

function resolveTruthLieResult(game: TruthLieGameState, participants: readonly RoomParticipant[]): TruthLieResult {
  const lieIndex = game.lieIndex ?? 0;
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  let correctCount = 0;
  for (const participant of participants) {
    if (participant.id !== game.presenterId && game.votes[participant.id] === lieIndex) {
      scores[participant.id] = 1;
      correctCount += 1;
    }
  }
  return {
    presenterId: game.presenterId,
    statements: [...game.statements],
    lieIndex,
    votes: { ...game.votes },
    scores,
    correctCount,
  };
}

function finishTruthLie(game: TruthLieGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveTruthLieResult(game, participants);
}

function reverseWordExpected(game: ReverseWordGameState) {
  return reverseText(game.prompt.trim());
}

function resolveReverseWordResult(game: ReverseWordGameState, participants: readonly RoomParticipant[]): ReverseWordResult {
  const expected = reverseWordExpected(game);
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  for (const turn of game.turnHistory) {
    if (turn.action === "answer" && turn.answer?.normalize("NFKC").trim().toLocaleLowerCase() === expected.normalize("NFKC").toLocaleLowerCase()) scores[turn.playerId] = 1;
  }
  return { expected, turnHistory: game.turnHistory.map((turn) => ({ ...turn })), outIds: [...game.outIds], scores };
}

function finishReverseWord(game: ReverseWordGameState, participants: readonly RoomParticipant[]) {
  game.phase = "finished";
  game.currentPlayerId = null;
  game.result = resolveReverseWordResult(game, participants);
}

function resolveFastTypingResult(game: FastTypingGameState, participants: readonly RoomParticipant[]): FastTypingResult {
  const ordered = Object.entries(game.submissions)
    .filter(([participantId]) => participants.some((participant) => participant.id === participantId))
    .sort(([, left], [, right]) => left.submittedAt - right.submittedAt || left.order - right.order || left.text.localeCompare(right.text));
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  const leaderboard = ordered.map(([participantId, submission], index) => {
    const score = ordered.length - index;
    scores[participantId] = score;
    return { participantId, rank: index + 1, completedAt: submission.submittedAt, score };
  });
  return { expected: game.prompt, submissions: structuredClone(game.submissions), leaderboard, scores };
}

function finishFastTyping(game: FastTypingGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveFastTypingResult(game, participants);
}

function resolveMemoryDrawingResult(game: MemoryDrawingGameState, participants: readonly RoomParticipant[]): MemoryDrawingResult {
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  for (const targetId of Object.values(game.votes)) if (scores[targetId] !== undefined) scores[targetId] += 1;
  return { target: game.target, descriptions: { ...game.descriptions }, votes: { ...game.votes }, scores };
}

function finishMemoryDrawing(game: MemoryDrawingGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveMemoryDrawingResult(game, participants);
}

function resolveValueMeterResult(game: ValueMeterGameState, participants: readonly RoomParticipant[]): ValueMeterResult {
  const rows = Object.fromEntries(
    participants.filter((participant) => game.rows[participant.id]).map((participant) => [participant.id, { ...game.rows[participant.id]! }]),
  ) as Record<string, ValueMeterRow>;
  const values = Object.values(rows).map((row) => row.value).sort((left, right) => left - right);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const middle = Math.floor(values.length / 2);
  const median = values.length === 0 ? 0 : values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  for (const [participantId, row] of Object.entries(rows)) scores[participantId] = Math.max(0, Number((100 - Math.abs(row.value - average)).toFixed(2)));
  return { rows, average: Number(average.toFixed(2)), median, min: values[0] ?? 0, max: values.at(-1) ?? 0, scores };
}

function finishValueMeter(game: ValueMeterGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveValueMeterResult(game, participants);
}

function resolveActingResult(game: ActingGameState, participants: readonly RoomParticipant[]): ActingResult {
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  for (const participant of participants) {
    if (participant.id !== game.performerId && normalizeName(game.guesses[participant.id] ?? "") === normalizeName(game.emotion)) scores[participant.id] = 1;
  }
  return { prompt: game.prompt, emotion: game.emotion, performerId: game.performerId, guesses: { ...game.guesses }, scores };
}

function finishActing(game: ActingGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveActingResult(game, participants);
}

function loanwordBanResult(game: LoanwordBanGameState, participants: readonly RoomParticipant[]): LoanwordBanResult {
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  for (const participant of participants) scores[participant.id] = Math.max(0, 1 - game.strikes.filter((strike) => strike.participantId === participant.id).length);
  return { prompt: game.prompt, prohibitedWords: [...game.prohibitedWords], turnHistory: game.turnHistory.map((turn) => ({ ...turn })), strikes: game.strikes.map((strike) => ({ ...strike })), outIds: [...game.outIds], scores };
}

function finishLoanwordBan(game: LoanwordBanGameState, participants: readonly RoomParticipant[]) {
  game.phase = "finished";
  game.currentPlayerId = null;
  game.result = loanwordBanResult(game, participants);
}

function normalizeAction(command: RoomCommand): NativeTurnAction {
  const action = command.turnAction ?? command.yamanoteAction ?? (command.action === "answer" || command.action === "pass" || command.action === "out" ? command.action : undefined);
  return action ?? "answer";
}

function containsProhibitedWord(input: string, words: readonly string[]) {
  const normalized = input.normalize("NFKC").toLocaleLowerCase();
  return words.find((word) => normalized.includes(word.normalize("NFKC").toLocaleLowerCase()));
}

function normalizeNativeQuizText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function nativeHintQuizVoterIds(game: NativeHintQuizGameState, room: RoomRecord) {
  return activeParticipants(room).map((participant) => participant.id).filter((id) => id !== game.facilitatorId);
}

function resolveNativeHintQuizResult(game: NativeHintQuizGameState, participants: readonly RoomParticipant[]): NativeHintQuizResult {
  const target = game.target ?? "";
  const targetKey = normalizeNativeQuizText(target);
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  let correctCount = 0;
  for (const participant of participants) {
    if (participant.id !== game.facilitatorId && normalizeNativeQuizText(game.guesses[participant.id] ?? "") === targetKey && targetKey) {
      scores[participant.id] = 1;
      correctCount += 1;
    }
  }
  return {
    facilitatorId: game.facilitatorId,
    target,
    hints: [...game.hints],
    guesses: { ...game.guesses },
    scores,
    correctCount,
  };
}

function finishNativeHintQuiz(game: NativeHintQuizGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveNativeHintQuizResult(game, participants);
}

function resolveDrawingQuizResult(game: DrawingQuizGameState, participants: readonly RoomParticipant[]): DrawingQuizResult {
  const target = game.target ?? "";
  const targetKey = normalizeNativeQuizText(target);
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  let correctCount = 0;
  for (const participant of participants) {
    if (participant.id !== game.artistId && normalizeNativeQuizText(game.guesses[participant.id] ?? "") === targetKey && targetKey) {
      scores[participant.id] = 1;
      correctCount += 1;
    }
  }
  return { artistId: game.artistId, target, guesses: { ...game.guesses }, scores, correctCount };
}

function finishDrawingQuiz(game: DrawingQuizGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveDrawingQuizResult(game, participants);
}

function funnyLineKarutaClaims(game: FunnyLineKarutaGameState, participants: readonly RoomParticipant[]) {
  const activeIds = new Set(participants.map((participant) => participant.id));
  return game.claimOrder
    .map((participantId) => game.claims[participantId])
    .filter((claim): claim is FunnyLineKarutaClaim => Boolean(claim) && activeIds.has(claim.participantId))
    .sort((left, right) => left.claimedAt - right.claimedAt || left.order - right.order || left.id.localeCompare(right.id));
}

function resolveFunnyLineKarutaResult(game: FunnyLineKarutaGameState, participants: readonly RoomParticipant[]): FunnyLineKarutaResult {
  const claims = funnyLineKarutaClaims(game, participants);
  const winnerId = claims[0]?.participantId ?? null;
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, participant.id === winnerId ? 1 : 0]));
  return { prompt: game.prompt, claims: claims.map((claim) => ({ ...claim })), winnerId, scores };
}

function finishFunnyLineKaruta(game: FunnyLineKarutaGameState, participants: readonly RoomParticipant[]) {
  const result = resolveFunnyLineKarutaResult(game, participants);
  game.winnerId = result.winnerId;
  game.phase = "revealed";
  game.result = result;
}

function resolveHummingIntroResult(game: HummingIntroGameState, participants: readonly RoomParticipant[]): HummingIntroResult {
  const target = game.target ?? "";
  const targetKey = normalizeNativeQuizText(target);
  const activeIds = new Set(participants.map((participant) => participant.id));
  const ordered = Object.entries(game.guesses)
    .filter(([participantId]) => activeIds.has(participantId))
    .sort(([, left], [, right]) => left.submittedAt - right.submittedAt || left.order - right.order || left.text.localeCompare(right.text));
  const correctEntries = ordered.filter(([, guess]) => normalizeNativeQuizText(guess.text) === targetKey && targetKey);
  const correctRanks = new Map(correctEntries.map(([participantId], index) => [participantId, index]));
  const scores: Record<string, number> = Object.fromEntries(participants.map((participant) => [participant.id, 0]));
  const leaderboard = ordered.map(([participantId, guess], index) => {
    const correct = correctRanks.has(participantId);
    const score = correct ? correctEntries.length - (correctRanks.get(participantId) ?? 0) : 0;
    scores[participantId] = score;
    return { participantId, rank: index + 1, submittedAt: guess.submittedAt, correct, score };
  });
  return { singerId: game.singerId, target, guesses: structuredClone(game.guesses), leaderboard, scores };
}

function finishHummingIntro(game: HummingIntroGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveHummingIntroResult(game, participants);
}

function resolveCountUpResult(game: CountUpGameState, participants: readonly RoomParticipant[]): CountUpResult {
  const activeIds = participants.map((participant) => participant.id);
  const loserId = game.loserId ?? null;
  const winnerIds = activeIds.filter((id) => id !== loserId);
  const scores: Record<string, number> = Object.fromEntries(activeIds.map((id) => [id, id === loserId ? 0 : 1]));
  return {
    target: game.target,
    finalValue: game.currentValue,
    loserId,
    winnerIds,
    turnHistory: game.turnHistory.map((turn) => ({ ...turn })),
    scores,
  };
}

function finishCountUp(game: CountUpGameState, participants: readonly RoomParticipant[], loserId: string | null = null) {
  game.phase = "revealed";
  game.currentPlayerId = null;
  game.loserId = loserId;
  game.result = resolveCountUpResult(game, participants);
}

function nextNativeOrderPlayer(order: readonly string[], activeIds: ReadonlySet<string>, afterId: string | null) {
  const available = order.filter((id) => activeIds.has(id));
  if (available.length === 0) return null;
  const startIndex = Math.max(0, order.indexOf(afterId ?? ""));
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(startIndex + offset) % order.length];
    if (candidate && activeIds.has(candidate)) return candidate;
  }
  return available[0] ?? null;
}

function reconcileCountUpDeparture(game: CountUpGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  if (activeIds.size === 0) {
    finishCountUp(game, activeParticipants(room));
    return;
  }
  if (previousCurrent === participantId || !activeIds.has(previousCurrent ?? "")) {
    game.currentPlayerId = nextNativeOrderPlayer(game.playerOrder, activeIds, participantId);
  }
}

function resolveDudCardResult(game: DudCardGameState, participants: readonly RoomParticipant[]): DudCardResult {
  const activeIds = participants.map((participant) => participant.id);
  const picks = Object.fromEntries(activeIds.filter((id) => game.picks[id]).map((id) => [id, game.picks[id]!])) as Record<string, string>;
  const dudPickerId = activeIds.find((id) => picks[id] === game.dudCardId) ?? null;
  const scores: Record<string, number> = Object.fromEntries(activeIds.map((id) => [id, picks[id] === game.dudCardId ? 0 : 1]));
  return { cardIds: [...game.cardIds], dudCardId: game.dudCardId, picks, dudPickerId, safeNeutral: true, scores };
}

function finishDudCard(game: DudCardGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveDudCardResult(game, participants);
}

function reconcileDudCardDeparture(game: DudCardGameState, room: RoomRecord, participantId: string) {
  delete game.picks[participantId];
  const active = activeParticipants(room);
  if (game.phase === "picking" && active.length > 0 && active.every((participant) => Boolean(game.picks[participant.id]))) finishDudCard(game, active);
}

const safeRandomOutcomePool = ["自由回答", "1分ボーナス", "次の人へ", "休憩カード", "全員に1分休憩"] as const;

function resolveSafeRandomDrawResult(game: SafeRandomDrawGameState, participants: readonly RoomParticipant[]): SafeRandomDrawResult {
  const activeIds = participants.map((participant) => participant.id);
  const picks = Object.fromEntries(activeIds.filter((id) => game.picks[id]).map((id) => [id, game.picks[id]!])) as Record<string, string>;
  const outcomes = Object.fromEntries(game.cardIds.map((cardId) => [cardId, game.outcomeByCard[cardId] ?? "自由回答"]));
  const selectedOutcomes = Object.fromEntries(activeIds.filter((id) => picks[id]).map((id) => {
    const cardId = picks[id]!;
    return [id, { cardId, outcome: outcomes[cardId] ?? "自由回答" }];
  })) as Record<string, { cardId: string; outcome: string }>;
  const scores: Record<string, number> = Object.fromEntries(activeIds.map((id) => [id, selectedOutcomes[id]?.outcome === "1分ボーナス" ? 1 : 0]));
  return { cardIds: [...game.cardIds], picks, outcomes, selectedOutcomes, safeNeutral: true, scores };
}

function finishSafeRandomDraw(game: SafeRandomDrawGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveSafeRandomDrawResult(game, participants);
}

function reconcileSafeRandomDrawDeparture(game: SafeRandomDrawGameState, room: RoomRecord, participantId: string) {
  delete game.picks[participantId];
  const active = activeParticipants(room);
  if (game.phase === "picking" && active.length > 0 && active.every((participant) => Boolean(game.picks[participant.id]))) finishSafeRandomDraw(game, active);
}

const drinkingSugorokuEvents = ["自由に1マス進む", "水分・休憩を選ぶ", "全員でひとこと", "そのまま進む"];
const lifeEventSugorokuEvents = ["思い出をひとこと", "自由に1マス進む", "休憩カード", "次の人を応援"];

function resolveNativeSugorokuResult(game: NativeSugorokuGameState, participants: readonly RoomParticipant[]): NativeSugorokuResult {
  const activeIds = new Set(participants.map((participant) => participant.id));
  const positions = Object.fromEntries(game.playerOrder.filter((id) => activeIds.has(id)).map((id) => [id, game.positions[id] ?? 0]));
  const winnerId = game.result?.winnerId ?? null;
  const scores: Record<string, number> = Object.fromEntries([...activeIds].map((id) => [id, id === winnerId ? 1 : 0]));
  return {
    kind: game.kind,
    boardLength: game.boardLength,
    positions,
    turnHistory: game.turnHistory.map((turn) => ({ ...turn })),
    winnerId,
    scores,
    safeNotice: game.safeNotice,
  };
}

function finishNativeSugoroku(game: NativeSugorokuGameState, participants: readonly RoomParticipant[], winnerId: string | null) {
  game.phase = "revealed";
  game.currentPlayerId = null;
  game.result = { ...resolveNativeSugorokuResult(game, participants), winnerId };
}

function nativeSugorokuEvents(game: NativeSugorokuGameState) {
  return game.kind === "drinking-sugoroku" ? drinkingSugorokuEvents : lifeEventSugorokuEvents;
}

function reconcileNativeSugorokuDeparture(game: NativeSugorokuGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  delete game.positions[participantId];
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  if (activeIds.size === 0) {
    finishNativeSugoroku(game, activeParticipants(room), null);
    return;
  }
  if (previousCurrent === participantId || !activeIds.has(previousCurrent ?? "")) {
    game.currentPlayerId = nextNativeOrderPlayer(game.playerOrder, activeIds, participantId);
  }
}

function territoryCellIds(boardSize: number) {
  return Array.from({ length: boardSize * boardSize }, (_, index) => `${String.fromCharCode(65 + Math.floor(index / boardSize))}${(index % boardSize) + 1}`);
}

function resolveTerritoryResult(game: TerritoryGameState, participants: readonly RoomParticipant[]): TerritoryResult {
  const activeIds = participants.map((participant) => participant.id);
  const counts = Object.fromEntries(activeIds.map((id) => [id, 0]));
  for (const ownerId of Object.values(game.cells)) if (ownerId && counts[ownerId] !== undefined) counts[ownerId] += 1;
  const maximum = Math.max(0, ...Object.values(counts));
  const winnerIds = Object.entries(counts).filter(([, count]) => count === maximum && maximum > 0).map(([id]) => id);
  return { boardSize: game.boardSize, cells: { ...game.cells }, claimHistory: game.claimHistory.map((claim) => ({ ...claim })), winnerIds, scores: Object.fromEntries(activeIds.map((id) => [id, counts[id] ?? 0])) };
}

function finishTerritory(game: TerritoryGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.currentPlayerId = null;
  game.result = resolveTerritoryResult(game, participants);
}

function reconcileTerritoryDeparture(game: TerritoryGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  if (activeIds.size === 0) {
    finishTerritory(game, activeParticipants(room));
    return;
  }
  if (previousCurrent === participantId || !activeIds.has(previousCurrent ?? "")) {
    game.currentPlayerId = nextNativeOrderPlayer(game.playerOrder, activeIds, participantId);
  }
}

const resourceNames: ResourceName[] = ["token", "idea", "story"];

function emptyResourceInventory(): ResourceInventory {
  return { token: 0, idea: 0, story: 0 };
}

function cloneResourceInventory(inventory: ResourceInventory): ResourceInventory {
  return { token: inventory.token, idea: inventory.idea, story: inventory.story };
}

function parseResourceInventory(value: unknown) {
  if (typeof value !== "string") return null;
  const inventory = emptyResourceInventory();
  const parts = value.split(/[,;]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const match = /^(token|idea|story)\s*[:=]\s*(\d+)$/.exec(part.toLocaleLowerCase());
    if (!match) return null;
    const name = match[1] as ResourceName;
    const amount = Number(match[2]);
    if (!Number.isInteger(amount) || amount < 0 || amount > 20) return null;
    inventory[name] += amount;
  }
  return Object.values(inventory).some((amount) => amount > 0) ? inventory : null;
}

function canAfford(inventory: ResourceInventory, requested: ResourceInventory) {
  return resourceNames.every((name) => inventory[name] >= requested[name]);
}

function applyResourceDelta(inventory: ResourceInventory, delta: ResourceInventory, direction: 1 | -1) {
  for (const name of resourceNames) inventory[name] += delta[name] * direction;
}

function resourceGoalReached(game: ResourceNegotiationGameState, participantIds: readonly string[]) {
  return participantIds.find((id) => (game.inventories[id]?.[game.goalResource] ?? 0) >= game.goalAmount) ?? null;
}

function resolveResourceNegotiationResult(game: ResourceNegotiationGameState, participants: readonly RoomParticipant[]): ResourceNegotiationResult {
  const activeIds = participants.map((participant) => participant.id);
  return {
    inventories: Object.fromEntries(activeIds.filter((id) => game.inventories[id]).map((id) => [id, cloneResourceInventory(game.inventories[id]!)])),
    offers: Object.values(game.offers).map((offer) => ({ ...offer, give: cloneResourceInventory(offer.give), want: cloneResourceInventory(offer.want) })),
    winnerId: game.winnerId,
    goalResource: game.goalResource,
    goalAmount: game.goalAmount,
    scores: Object.fromEntries(activeIds.map((id) => [id, id === game.winnerId ? 1 : 0])),
  };
}

function finishResourceNegotiation(game: ResourceNegotiationGameState, participants: readonly RoomParticipant[], winnerId: string | null) {
  game.phase = "revealed";
  game.winnerId = winnerId;
  game.result = resolveResourceNegotiationResult(game, participants);
}

function reconcileResourceNegotiationDeparture(game: ResourceNegotiationGameState, room: RoomRecord, participantId: string) {
  delete game.inventories[participantId];
  for (const offer of Object.values(game.offers)) {
    if (offer.status === "pending" && (offer.creatorId === participantId || offer.recipientId === participantId)) offer.status = "cancelled";
  }
  if (game.phase !== "negotiating") return;
  const active = activeParticipants(room);
  const winnerId = resourceGoalReached(game, active.map((participant) => participant.id));
  if (winnerId || active.length < 2) finishResourceNegotiation(game, active, winnerId);
}

const armSafetyNotice = "安全第一：実際の力比べは不要。口頭・合意で勝者を記録し、無理をしないでください。";

function resolveArmWrestlingResult(game: ArmWrestlingGameState, participants: readonly RoomParticipant[]): ArmWrestlingResult {
  const activeIds = new Set(participants.map((participant) => participant.id));
  const winnerId = game.result?.winnerId && activeIds.has(game.result.winnerId) ? game.result.winnerId : game.result?.winnerId ?? null;
  const scores = Object.fromEntries([...activeIds].map((id) => [id, id === winnerId ? 1 : 0]));
  return { refereeId: game.refereeId, matches: game.matches.map((match) => ({ ...match })), winnerId, scores, safetyNotice: game.safetyNotice };
}

function finishArmWrestling(game: ArmWrestlingGameState, participants: readonly RoomParticipant[], winnerId: string | null) {
  game.phase = "revealed";
  game.currentMatch = null;
  game.result = { ...resolveArmWrestlingResult(game, participants), winnerId };
}

function advanceArmWrestling(game: ArmWrestlingGameState, room: RoomRecord) {
  if (game.phase !== "playing" || game.currentMatch) return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  game.roundParticipants = game.roundParticipants.filter((id) => activeIds.has(id));
  game.roundWinners = game.roundWinners.filter((id) => activeIds.has(id));
  while (game.phase === "playing" && !game.currentMatch) {
    if (game.roundParticipants.length >= 2) {
      const leftId = game.roundParticipants.shift()!;
      const rightId = game.roundParticipants.shift()!;
      const match: ArmWrestlingMatch = { id: token(10), round: game.round, leftId, rightId, status: "pending" };
      game.matches.push(match);
      game.currentMatch = match;
      return;
    }
    if (game.roundParticipants.length === 1) {
      const leftId = game.roundParticipants.shift()!;
      const bye: ArmWrestlingMatch = { id: token(10), round: game.round, leftId, rightId: null, winnerId: leftId, status: "bye" };
      game.matches.push(bye);
      game.roundWinners.push(leftId);
      continue;
    }
    if (game.roundWinners.length === 1) {
      finishArmWrestling(game, activeParticipants(room), game.roundWinners[0] ?? null);
      return;
    }
    if (game.roundWinners.length === 0) {
      finishArmWrestling(game, activeParticipants(room), null);
      return;
    }
    game.roundParticipants = [...game.roundWinners];
    game.roundWinners = [];
    game.round += 1;
  }
}

function reconcileArmWrestlingDeparture(game: ArmWrestlingGameState, room: RoomRecord, participantId: string) {
  const active = activeParticipants(room);
  const activeIds = new Set(active.map((participant) => participant.id));
  game.roundParticipants = game.roundParticipants.filter((id) => id !== participantId);
  game.roundWinners = game.roundWinners.filter((id) => id !== participantId);
  if (game.refereeId === participantId) game.refereeId = nativePresenterId(room);
  if (game.phase !== "playing") return;
  if (game.currentMatch && (game.currentMatch.leftId === participantId || game.currentMatch.rightId === participantId)) {
    const winnerId = game.currentMatch.leftId === participantId ? game.currentMatch.rightId : game.currentMatch.leftId;
    game.currentMatch.winnerId = winnerId && activeIds.has(winnerId) ? winnerId : undefined;
    game.currentMatch.status = "bye";
    game.currentMatch = null;
    if (winnerId && activeIds.has(winnerId)) game.roundWinners.push(winnerId);
  }
  if (activeIds.size < 1) finishArmWrestling(game, active, null);
  else advanceArmWrestling(game, room);
}

function resolveLargeMajorityResult(game: LargeMajorityGameState, participants: readonly RoomParticipant[]): LargeMajorityResult {
  const activeIds = participants.map((participant) => participant.id);
  const votes = Object.fromEntries(activeIds.filter((id) => game.votes[id]).map((id) => [id, game.votes[id]!])) as Record<string, string>;
  const counts = Object.fromEntries(game.options.map((option) => [option, 0]));
  for (const vote of Object.values(votes)) if (counts[vote] !== undefined) counts[vote] += 1;
  const maximum = Math.max(0, ...Object.values(counts));
  const winningOptions = game.options.filter((option) => counts[option] === maximum && maximum > 0);
  const scores = Object.fromEntries(activeIds.map((id) => [id, winningOptions.includes(votes[id] ?? "") ? 1 : 0]));
  return { options: [...game.options], votes, counts, winningOptions, scores };
}

function finishLargeMajority(game: LargeMajorityGameState, participants: readonly RoomParticipant[]) {
  game.phase = "revealed";
  game.result = resolveLargeMajorityResult(game, participants);
}

function reconcileLargeMajorityDeparture(game: LargeMajorityGameState, room: RoomRecord, participantId: string) {
  delete game.votes[participantId];
  const active = activeParticipants(room);
  if (game.phase === "voting" && active.length > 0 && active.every((participant) => Boolean(game.votes[participant.id]))) finishLargeMajority(game, active);
}

function reconcileNativeHintQuizDeparture(game: NativeHintQuizGameState, room: RoomRecord, participantId: string) {
  delete game.guesses[participantId];
  if (game.facilitatorId !== participantId) return;
  const replacement = nativePresenterId(room);
  if (!replacement) {
    game.phase = "revealed";
    game.result = resolveNativeHintQuizResult(game, []);
    return;
  }
  game.facilitatorId = replacement;
  game.phase = "setting";
  game.target = null;
  game.hints = [];
  game.guesses = {};
  delete game.result;
}

function reconcileDrawingQuizDeparture(game: DrawingQuizGameState, room: RoomRecord, participantId: string) {
  game.readyIds = game.readyIds.filter((id) => id !== participantId);
  delete game.guesses[participantId];
  if (game.artistId !== participantId) return;
  const replacement = nativePresenterId(room);
  if (!replacement) {
    game.phase = "revealed";
    game.result = resolveDrawingQuizResult(game, []);
    return;
  }
  game.artistId = replacement;
  game.phase = "preparing";
  game.target = null;
  game.readyIds = [];
  game.guesses = {};
  delete game.result;
}

function reconcileFunnyLineKarutaDeparture(game: FunnyLineKarutaGameState, room: RoomRecord, participantId: string) {
  delete game.claims[participantId];
  game.claimOrder = game.claimOrder.filter((id) => id !== participantId);
  game.winnerId = funnyLineKarutaClaims(game, activeParticipants(room))[0]?.participantId ?? null;
}

function reconcileHummingIntroDeparture(game: HummingIntroGameState, room: RoomRecord, participantId: string) {
  delete game.guesses[participantId];
  if (game.singerId !== participantId) return;
  const replacement = nativePresenterId(room);
  if (!replacement) {
    game.phase = "revealed";
    game.result = resolveHummingIntroResult(game, []);
    return;
  }
  game.singerId = replacement;
  game.phase = "preparing";
  game.target = null;
  game.guesses = {};
  delete game.result;
}

function reconcileTruthLieDeparture(game: TruthLieGameState, room: RoomRecord, participantId: string) {
  delete game.votes[participantId];
  if (game.presenterId !== participantId) return;
  const replacement = activeParticipants(room)[0];
  if (!replacement) {
    game.phase = "revealed";
    game.result = { presenterId: participantId, statements: [], lieIndex: 0, votes: {}, scores: {}, correctCount: 0 };
    return;
  }
  game.presenterId = replacement.id;
  game.phase = "presenting";
  game.statements = [];
  game.lieIndex = null;
  game.votes = {};
  delete game.result;
}

function reconcileReverseWordDeparture(game: ReverseWordGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  const previousIndex = Math.max(0, game.playerOrder.indexOf(participantId));
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  game.actedPlayerIds = game.actedPlayerIds.filter((id) => id !== participantId);
  game.outIds = game.outIds.filter((id) => id !== participantId);
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const pending = game.playerOrder.filter((id) => activeIds.has(id) && !game.actedPlayerIds.includes(id) && !game.outIds.includes(id));
  if (pending.length === 0) {
    finishReverseWord(game, activeParticipants(room));
    return;
  }
  if (previousCurrent === participantId || !pending.includes(previousCurrent ?? "")) {
    for (let offset = 0; offset < game.playerOrder.length; offset += 1) {
      const candidate = game.playerOrder[(previousIndex + offset) % game.playerOrder.length];
      if (pending.includes(candidate)) {
        game.currentPlayerId = candidate;
        return;
      }
    }
    game.currentPlayerId = pending[0] ?? null;
  }
}

function reconcileLoanwordBanDeparture(game: LoanwordBanGameState, room: RoomRecord, participantId: string) {
  const previousCurrent = game.currentPlayerId;
  const previousIndex = Math.max(0, game.playerOrder.indexOf(participantId));
  game.playerOrder = game.playerOrder.filter((id) => id !== participantId);
  game.actedPlayerIds = game.actedPlayerIds.filter((id) => id !== participantId);
  game.outIds = game.outIds.filter((id) => id !== participantId);
  if (game.phase !== "playing") return;
  const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
  const pending = game.playerOrder.filter((id) => activeIds.has(id) && !game.actedPlayerIds.includes(id) && !game.outIds.includes(id));
  if (pending.length === 0) {
    finishLoanwordBan(game, activeParticipants(room));
    return;
  }
  if (previousCurrent === participantId || !pending.includes(previousCurrent ?? "")) {
    for (let offset = 0; offset < game.playerOrder.length; offset += 1) {
      const candidate = game.playerOrder[(previousIndex + offset) % game.playerOrder.length];
      if (pending.includes(candidate)) {
        game.currentPlayerId = candidate;
        return;
      }
    }
    game.currentPlayerId = pending[0] ?? null;
  }
}

function reconcileActingDeparture(game: ActingGameState, room: RoomRecord, participantId: string) {
  delete game.guesses[participantId];
  if (game.performerId !== participantId || game.phase !== "guessing") return;
  const replacement = nativePresenterId(room);
  if (!replacement) {
    game.phase = "revealed";
    game.result = resolveActingResult(game, []);
    return;
  }
  game.performerId = replacement;
  game.guesses = {};
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
    if (!("join reconnect leave kick start close reset game_reset game_start game_answer game_reveal game_phase johari_self_submit johari_peer_submit anonymous_submit anonymous_moderate game_vote werewolf_action legacy_input ng_word_hit turtle_soup_question turtle_soup_classify turtle_soup_hint yamanote_answer party_pack_action truth_lie_present truth_lie_vote truth_lie_submit reverse_word_action reverse_word_answer fast_typing_submit fast_typing_complete memory_drawing_submit memory_drawing_vote acting_guess acting_submit loanword_ban_action loanword_ban_answer value_meter_submit song_association_prepare song_association_hint song_association_guess drawing_quiz_prepare drawing_quiz_ready drawing_quiz_guess funny_line_karuta_claim emo_hint_prepare emo_hint_hint emo_hint_guess person_hint_prepare person_hint_hint person_hint_guess humming_intro_prepare humming_intro_guess count_up_increment dud_card_pick drinking_sugoroku_roll life_event_sugoroku_roll territory_claim resource_offer_create resource_offer_accept resource_offer_reject resource_offer_cancel arm_wrestling_record safe_random_pick large_majority_vote" as const).split(" ").includes(command.kind)) throw new RoomDomainError("command_kind_invalid");
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
    if (room.game?.kind === "legacy-game") {
      const legacyGame = room.game as unknown as { gameKey: string; progression?: LegacyGameState["progression"] };
      if (!legacyGame.progression) legacyGame.progression = legacyProgression(legacyGame.gameKey);
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
    if (room.status === "finished" && ["game_answer", "game_reveal", "johari_self_submit", "johari_peer_submit", "anonymous_submit", "anonymous_moderate", "game_vote", "game_phase", "werewolf_action", "legacy_input", "ng_word_hit", "turtle_soup_question", "turtle_soup_classify", "turtle_soup_hint", "yamanote_answer", "party_pack_action", "truth_lie_present", "truth_lie_vote", "truth_lie_submit", "reverse_word_action", "reverse_word_answer", "fast_typing_submit", "fast_typing_complete", "memory_drawing_submit", "memory_drawing_vote", "acting_guess", "acting_submit", "loanword_ban_action", "loanword_ban_answer", "value_meter_submit", "song_association_prepare", "song_association_hint", "song_association_guess", "drawing_quiz_prepare", "drawing_quiz_ready", "drawing_quiz_guess", "funny_line_karuta_claim", "emo_hint_prepare", "emo_hint_hint", "emo_hint_guess", "person_hint_prepare", "person_hint_hint", "person_hint_guess", "humming_intro_prepare", "humming_intro_guess", "count_up_increment", "dud_card_pick", "drinking_sugoroku_roll", "life_event_sugoroku_roll", "territory_claim", "resource_offer_create", "resource_offer_accept", "resource_offer_reject", "resource_offer_cancel", "arm_wrestling_record", "safe_random_pick", "large_majority_vote"].includes(command.kind)) throw new RoomDomainError("game_finished");
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
        markGameFinished(room);
      }
    } else if (command.kind === "kick") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      const target = room.participants.find((item) => item.id === command.targetParticipantId);
      if (!target) throw new RoomDomainError("participant_not_found");
      if (target.role === "host") throw new RoomDomainError("host_required");
      if (isDangerousDeparture(room)) throw new RoomDomainError("game_in_progress");
      target.connected = false;
      removeParticipantFromGameState(room, target.id, false, activeParticipants(room));
      presenceChanges.push({ participantId: target.id, connected: false });
      room.participants = room.participants.filter((item) => item.id !== command.targetParticipantId);
      maybeAdvanceJohari(room);
      markGameFinished(room);
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
      if (command.gameKind !== "two-choice" && command.gameKind !== "impression-ranking" && command.gameKind !== "majority-game" && command.gameKind !== "johari-window" && command.gameKind !== "anonymous-box" && command.gameKind !== "word-wolf" && command.gameKind !== "werewolf" && command.gameKind !== "ng-word" && command.gameKind !== "turtle-soup" && command.gameKind !== "yamanote" && command.gameKind !== "party-pack" && command.gameKind !== "truth-lie-game" && command.gameKind !== "reverse-word-game" && command.gameKind !== "fast-typing-game" && command.gameKind !== "memory-drawing-game" && command.gameKind !== "value-meter-game" && command.gameKind !== "acting-game" && command.gameKind !== "loanword-ban-game" && command.gameKind !== "song-association-quiz" && command.gameKind !== "drawing-quiz" && command.gameKind !== "funny-line-karuta" && command.gameKind !== "emo-hint-game" && command.gameKind !== "person-hint-quiz" && command.gameKind !== "humming-intro-quiz" && command.gameKind !== "count-up-game" && command.gameKind !== "dud-card-game" && command.gameKind !== "drinking-sugoroku" && command.gameKind !== "territory-game" && command.gameKind !== "resource-negotiation-game" && command.gameKind !== "life-event-sugoroku" && command.gameKind !== "arm-wrestling-tournament" && command.gameKind !== "safe-random-draw" && command.gameKind !== "large-majority-game" && command.gameKind !== "legacy-game") throw new RoomDomainError("game_kind_invalid");
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
      } else if (command.gameKind === "ng-word") {
        const difficulty = command.ngWordDifficulty ?? "easy";
        if (!ngWordPools[difficulty]) throw new RoomDomainError("ng_word_difficulty_invalid");
        const words = randomOrder(ngWordPools[difficulty]);
        const assignments = Object.fromEntries(activeParticipants(room).map((participant, index) => [participant.id, words[index % words.length]!])) as Record<string, string>;
        room.game = { kind: "ng-word", startedVersion, prompt, phase: "assigned", assignments, hits: [], difficulty };
      } else if (command.gameKind === "turtle-soup") {
        const truth = typeof command.turtleSoupTruth === "string" && command.turtleSoupTruth.trim() ? command.turtleSoupTruth.trim() : defaultTurtleSoupTruth;
        const hints = command.turtleSoupHints === undefined ? [...defaultTurtleSoupHints] : Array.isArray(command.turtleSoupHints) ? command.turtleSoupHints.filter((hint): hint is string => typeof hint === "string").map((hint) => hint.trim()).filter(Boolean).slice(0, 10) : [];
        if (hints.length === 0) throw new RoomDomainError("turtle_soup_hints_invalid");
        room.game = { kind: "turtle-soup", startedVersion, prompt, phase: "questioning", truth, hints, hintLevel: 0, questions: [] };
      } else if (command.gameKind === "yamanote") {
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        room.game = { kind: "yamanote", startedVersion, prompt, phase: "playing", playerOrder, currentPlayerId: playerOrder[0] ?? null, actedPlayerIds: [], outIds: [], answerHistory: [] };
      } else if (command.gameKind === "party-pack") {
        const mode = command.partyPackMode;
        if (!mode || !partyPackDefinitions.some((definition) => definition.mode === mode)) throw new RoomDomainError("party_pack_mode_invalid");
        const definition = getPartyPackDefinition(mode, command.partyPackPromptId);
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        const progression = partyPackProgression(mode);
        const hiddenAnswer = partyPackHiddenAnswer(mode, prompt, definition);
        room.game = {
          kind: "party-pack",
          startedVersion,
          prompt,
          promptId: definition.id,
          instruction: definition.instruction,
          mode,
          progression,
          phase: "playing",
          playerOrder,
          currentPlayerId: progression === "turn" ? playerOrder[0] ?? null : null,
          inputs: {},
          ...(hiddenAnswer ? { hiddenAnswer } : {}),
        };
      } else if (command.gameKind === "truth-lie-game") {
        room.game = {
          kind: "truth-lie-game",
          startedVersion,
          prompt,
          phase: "presenting",
          presenterId: nativePresenterId(room, command.truthLiePresenterId),
          statements: [],
          lieIndex: null,
          votes: {},
        };
      } else if (command.gameKind === "reverse-word-game") {
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        room.game = {
          kind: "reverse-word-game",
          startedVersion,
          prompt,
          phase: "playing",
          playerOrder,
          currentPlayerId: playerOrder[0] ?? null,
          actedPlayerIds: [],
          outIds: [],
          turnHistory: [],
        };
      } else if (command.gameKind === "fast-typing-game") {
        room.game = {
          kind: "fast-typing-game",
          startedVersion,
          prompt,
          phase: "typing",
          startedAt: this.now(),
          nextSubmissionOrder: 1,
          submissions: {},
        };
      } else if (command.gameKind === "memory-drawing-game") {
        const target = typeof command.memoryDrawingTarget === "string" && command.memoryDrawingTarget.trim() ? command.memoryDrawingTarget.trim() : prompt;
        if (target.length > 200) throw new RoomDomainError("memory_drawing_target_invalid");
        room.game = {
          kind: "memory-drawing-game",
          startedVersion,
          prompt,
          target,
          phase: "drawing",
          descriptions: {},
          votes: {},
        };
      } else if (command.gameKind === "value-meter-game") {
        room.game = { kind: "value-meter-game", startedVersion, prompt, phase: "submitting", rows: {} };
      } else if (command.gameKind === "acting-game") {
        const performerId = nativePresenterId(room, command.actingPerformerId);
        const emotion = randomOrder(actingEmotionPool)[0] ?? actingEmotionPool[0];
        room.game = { kind: "acting-game", startedVersion, prompt, phase: "guessing", performerId, emotion, guesses: {} };
      } else if (command.gameKind === "loanword-ban-game") {
        const words = [...new Set([prompt, ...loanwordBanDefaultWords].map((word) => word.trim()).filter(Boolean))].slice(0, 8);
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        room.game = {
          kind: "loanword-ban-game",
          startedVersion,
          prompt,
          prohibitedWords: words,
          phase: "playing",
          playerOrder,
          currentPlayerId: playerOrder[0] ?? null,
          actedPlayerIds: [],
          outIds: [],
          turnHistory: [],
          strikes: [],
        };
      } else if (nativeHintQuizKinds.includes(command.gameKind as NativeHintQuizKind)) {
        room.game = {
          kind: command.gameKind as NativeHintQuizKind,
          startedVersion,
          prompt,
          phase: "setting",
          facilitatorId: nativePresenterId(room,
            command.gameKind === "song-association-quiz" ? command.songAssociationFacilitatorId
              : command.gameKind === "emo-hint-game" ? command.emoHintFacilitatorId
                : command.personHintFacilitatorId),
          target: null,
          hints: [],
          guesses: {},
        };
      } else if (command.gameKind === "drawing-quiz") {
        room.game = {
          kind: "drawing-quiz",
          startedVersion,
          prompt,
          phase: "preparing",
          artistId: nativePresenterId(room, command.drawingQuizArtistId),
          target: null,
          readyIds: [],
          guesses: {},
        };
      } else if (command.gameKind === "funny-line-karuta") {
        room.game = {
          kind: "funny-line-karuta",
          startedVersion,
          prompt,
          phase: "claiming",
          claims: {},
          claimOrder: [],
          nextClaimOrder: 1,
          winnerId: null,
        };
      } else if (command.gameKind === "humming-intro-quiz") {
        room.game = {
          kind: "humming-intro-quiz",
          startedVersion,
          prompt,
          phase: "preparing",
          singerId: nativePresenterId(room, command.hummingIntroSingerId),
          target: null,
          guesses: {},
          nextGuessOrder: 1,
        };
      } else if (command.gameKind === "count-up-game") {
        const target = command.countUpTarget ?? Number(prompt.match(/\d+/)?.[0] ?? 30);
        if (!Number.isInteger(target) || target < 3 || target > 1_000) throw new RoomDomainError("count_up_target_invalid");
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        room.game = { kind: "count-up-game", startedVersion, prompt, phase: "playing", target, currentValue: 0, playerOrder, currentPlayerId: playerOrder[0] ?? null, turnHistory: [] };
      } else if (command.gameKind === "dud-card-game") {
        const cardIds = randomOrder(Array.from({ length: activeCount + 1 }, (_, index) => `card-${index + 1}`));
        room.game = { kind: "dud-card-game", startedVersion, prompt, phase: "picking", cardIds, dudCardId: cardIds[0]!, picks: {} };
      } else if (command.gameKind === "safe-random-draw") {
        const cardIds = randomOrder(Array.from({ length: activeCount }, (_, index) => `safe-${index + 1}`));
        const shuffledOutcomes = randomOrder(Array.from({ length: Math.max(activeCount, safeRandomOutcomePool.length) }, (_, index) => safeRandomOutcomePool[index % safeRandomOutcomePool.length]!));
        const outcomeByCard = Object.fromEntries(cardIds.map((cardId, index) => [cardId, shuffledOutcomes[index] ?? "自由回答"]));
        room.game = { kind: "safe-random-draw", startedVersion, prompt, phase: "picking", cardIds, outcomeByCard, picks: {} };
      } else if (command.gameKind === "drinking-sugoroku" || command.gameKind === "life-event-sugoroku") {
        const boardLength = command.sugorokuBoardLength ?? 12;
        if (!Number.isInteger(boardLength) || boardLength < 6 || boardLength > 40) throw new RoomDomainError("sugoroku_board_invalid");
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        const positions = Object.fromEntries(playerOrder.map((id) => [id, 0]));
        const safeNotice = command.gameKind === "drinking-sugoroku"
          ? "名前に関係なく、飲酒なし・水分、休憩、パスで安全に遊べます。"
          : "イベントはすべて任意です。休憩やパスを選んで安全に遊べます。";
        room.game = { kind: command.gameKind, startedVersion, prompt, phase: "playing", boardLength, positions, playerOrder, currentPlayerId: playerOrder[0] ?? null, turnHistory: [], safeEvents: command.gameKind === "drinking-sugoroku" ? [...drinkingSugorokuEvents] : [...lifeEventSugorokuEvents], safeNotice };
      } else if (command.gameKind === "territory-game") {
        const boardSize = command.territoryBoardSize ?? 3;
        if (!Number.isInteger(boardSize) || boardSize < 2 || boardSize > 5) throw new RoomDomainError("territory_board_invalid");
        const cellIds = territoryCellIds(boardSize);
        const cells = Object.fromEntries(cellIds.map((cellId) => [cellId, null])) as Record<string, string | null>;
        const playerOrder = activeParticipants(room).map((participant) => participant.id);
        room.game = { kind: "territory-game", startedVersion, prompt, phase: "playing", boardSize, cellIds, cells, playerOrder, currentPlayerId: playerOrder[0] ?? null, claimHistory: [] };
      } else if (command.gameKind === "resource-negotiation-game") {
        const ids = activeParticipants(room).map((participant) => participant.id);
        const inventories: Record<string, ResourceInventory> = {};
        ids.forEach((id, index) => {
          inventories[id] = index % 3 === 0 ? { token: 2, idea: 1, story: 1 } : index % 3 === 1 ? { token: 1, idea: 2, story: 1 } : { token: 1, idea: 1, story: 2 };
        });
        room.game = { kind: "resource-negotiation-game", startedVersion, prompt, phase: "negotiating", resourceNames: [...resourceNames], inventories, offers: {}, nextOfferOrder: 1, goalResource: "idea", goalAmount: 3, winnerId: null };
      } else if (command.gameKind === "arm-wrestling-tournament") {
        const ids = activeParticipants(room).map((participant) => participant.id);
        const refereeId = nativePresenterId(room, command.armWrestlingRefereeId);
        room.game = { kind: "arm-wrestling-tournament", startedVersion, prompt, phase: "playing", refereeId, roundParticipants: ids.filter((id) => id !== refereeId), roundWinners: [], round: 1, currentMatch: null, matches: [], safetyNotice: armSafetyNotice };
        advanceArmWrestling(room.game, room);
      } else if (command.gameKind === "large-majority-game") {
        const options = Array.isArray(command.largeMajorityOptions) ? command.largeMajorityOptions.map((option) => typeof option === "string" ? option.trim() : "").filter(Boolean) : ["A", "B", "C"];
        if (options.length < 2 || options.length > 5 || options.some((option) => option.length > 80) || new Set(options).size !== options.length) throw new RoomDomainError("majority_options_invalid");
        room.game = { kind: "large-majority-game", startedVersion, prompt, phase: "voting", options, votes: {} };
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
    } else if (command.kind === "ng_word_hit") {
      if (!room.game || room.game.kind !== "ng-word" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const targetParticipantId = typeof command.targetParticipantId === "string" ? command.targetParticipantId : "";
      if (!targetParticipantId || targetParticipantId === actor!.id || !activeParticipants(room).some((participant) => participant.id === targetParticipantId)) throw new RoomDomainError("hit_target_invalid");
      room.game.hits.push({ id: token(10), targetParticipantId, markerParticipantId: actor!.id });
    } else if (command.kind === "turtle_soup_question") {
      if (!room.game || room.game.kind !== "turtle-soup" || room.game.phase !== "questioning") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const text = typeof command.text === "string" ? command.text.trim() : typeof command.input === "string" ? command.input.trim() : "";
      if (!text) throw new RoomDomainError("question_required");
      if (text.length > 500) throw new RoomDomainError("question_too_long");
      room.game.questions.push({ id: token(10), askerId: actor!.id, text, classification: null });
    } else if (command.kind === "turtle_soup_classify") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (!room.game || room.game.kind !== "turtle-soup" || room.game.phase !== "questioning") throw new RoomDomainError("game_not_ready");
      if (command.turtleSoupClassification !== "yes" && command.turtleSoupClassification !== "no" && command.turtleSoupClassification !== "irrelevant") throw new RoomDomainError("turtle_soup_classification_invalid");
      const question = room.game.questions.find((item) => item.id === command.turtleSoupQuestionId);
      if (!question) throw new RoomDomainError("question_not_found");
      question.classification = command.turtleSoupClassification;
    } else if (command.kind === "turtle_soup_hint") {
      if (actor!.role !== "host") throw new RoomDomainError("host_required");
      if (!room.game || room.game.kind !== "turtle-soup" || room.game.phase !== "questioning") throw new RoomDomainError("game_not_ready");
      const requestedIndex = command.turtleSoupHintIndex;
      const nextIndex = room.game.hintLevel;
      if (requestedIndex !== undefined && requestedIndex !== nextIndex) throw new RoomDomainError("turtle_soup_hint_invalid");
      if (nextIndex >= room.game.hints.length) throw new RoomDomainError("turtle_soup_hint_exhausted");
      room.game.hintLevel += 1;
    } else if (command.kind === "yamanote_answer") {
      if (!room.game || room.game.kind !== "yamanote" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const action = command.yamanoteAction ?? "answer";
      if (action !== "answer" && action !== "pass" && action !== "out") throw new RoomDomainError("yamanote_action_invalid");
      const answer = typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (action === "answer") {
        if (!answer) throw new RoomDomainError("answer_required");
        if (answer.length > 100) throw new RoomDomainError("answer_too_long");
        const normalizedAnswer = answer.toLocaleLowerCase();
        if (room.game.answerHistory.some((entry) => entry.action === "answer" && entry.answer?.toLocaleLowerCase() === normalizedAnswer)) throw new RoomDomainError("duplicate_answer");
      }
      room.game.answerHistory.push({ id: token(10), playerId: actor!.id, action, ...(action === "answer" ? { answer } : {}) });
      if (action === "out" && !room.game.outIds.includes(actor!.id)) room.game.outIds.push(actor!.id);
      if (!room.game.actedPlayerIds.includes(actor!.id)) room.game.actedPlayerIds.push(actor!.id);
      const nextPlayerId = nextYamanotePlayer(room.game, room, actor!.id);
      if (!nextPlayerId) finishYamanote(room.game);
      else room.game.currentPlayerId = nextPlayerId;
      markGameFinished(room);
    } else if (command.kind === "party_pack_action") {
      if (!room.game || room.game.kind !== "party-pack" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.inputs, actor!.id)) throw new RoomDomainError("input_already_submitted");
      if (room.game.progression === "turn" && room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const input = typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (!input) throw new RoomDomainError("input_required");
      if (input.length > 500) throw new RoomDomainError("input_too_long");
      if (!validatePartyPackInput(room.game, input)) throw new RoomDomainError("input_invalid");
      room.game.inputs[actor!.id] = input;
      const nextPlayerId = nextPendingPartyPackPlayer(room.game, room, actor!.id);
      room.game.currentPlayerId = room.game.progression === "turn" ? nextPlayerId : null;
    } else if (command.kind === "truth_lie_present" || command.kind === "truth_lie_vote" || command.kind === "truth_lie_submit") {
      if (!room.game || room.game.kind !== "truth-lie-game") throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const hasPresentation = Array.isArray(command.truthLieStatements) || command.truthLieLieIndex !== undefined;
      const presentationCommand = command.kind === "truth_lie_present" || command.kind === "truth_lie_submit" && hasPresentation;
      if (presentationCommand) {
        if (room.game.phase !== "presenting" || room.game.presenterId !== actor!.id) throw new RoomDomainError("not_your_turn");
        const rawStatements = Array.isArray(command.truthLieStatements)
          ? command.truthLieStatements
          : typeof command.input === "string" ? command.input.split(/\r?\n|\|/g) : [];
        const statements = rawStatements.map((statement) => typeof statement === "string" ? statement.trim() : "");
        if (statements.length !== 3 || statements.some((statement) => !statement || statement.length > 200)) throw new RoomDomainError("truth_lie_statements_invalid");
        const lieIndex = typeof command.truthLieLieIndex === "number" ? command.truthLieLieIndex : Number.NaN;
        if (!Number.isInteger(lieIndex) || lieIndex < 1 || lieIndex > 3) throw new RoomDomainError("truth_lie_index_invalid");
        room.game.statements = statements;
        room.game.lieIndex = lieIndex as number;
        room.game.phase = "voting";
        room.game.votes = {};
      } else {
        if (room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
        if (actor!.id === room.game.presenterId || !truthLieVoterIds(room.game, room).includes(actor!.id)) throw new RoomDomainError("vote_target_invalid");
        if (Object.prototype.hasOwnProperty.call(room.game.votes, actor!.id)) throw new RoomDomainError("vote_already_submitted");
        const rawVote = command.truthLieVote ?? (typeof command.voteTargetId === "string" ? Number(command.voteTargetId) : typeof command.input === "string" ? Number(command.input) : Number.NaN);
        const vote = Number.isInteger(rawVote) ? rawVote : Number(normalizeTruthAnswer(String(rawVote)));
        if (!Number.isInteger(vote) || vote < 1 || vote > 3) throw new RoomDomainError("vote_target_invalid");
        room.game.votes[actor!.id] = vote;
      }
    } else if (command.kind === "reverse_word_action" || command.kind === "reverse_word_answer") {
      if (!room.game || room.game.kind !== "reverse-word-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const action = normalizeAction(command);
      if (!(["answer", "pass", "out"] as NativeTurnAction[]).includes(action)) throw new RoomDomainError("turn_action_invalid");
      const answer = typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (action === "answer") {
        if (!answer) throw new RoomDomainError("answer_required");
        if (answer.length > 100) throw new RoomDomainError("answer_too_long");
        const normalized = answer.normalize("NFKC").toLocaleLowerCase();
        if (normalized !== reverseWordExpected(room.game).normalize("NFKC").toLocaleLowerCase()) throw new RoomDomainError("answer_invalid");
      }
      room.game.turnHistory.push({ id: token(10), playerId: actor!.id, action, ...(action === "answer" ? { answer } : {}) });
      room.game.actedPlayerIds.push(actor!.id);
      if (action === "out" && !room.game.outIds.includes(actor!.id)) room.game.outIds.push(actor!.id);
      const nextPlayerId = nativePendingTurnPlayer(room.game.playerOrder, room.game.actedPlayerIds, room.game.outIds, new Set(activeParticipants(room).map((participant) => participant.id)), actor!.id);
      if (!nextPlayerId) finishReverseWord(room.game, activeParticipants(room));
      else room.game.currentPlayerId = nextPlayerId;
      markGameFinished(room);
    } else if (command.kind === "fast_typing_submit" || command.kind === "fast_typing_complete") {
      if (!room.game || room.game.kind !== "fast-typing-game" || room.game.phase !== "typing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.submissions, actor!.id)) throw new RoomDomainError("input_already_submitted");
      const text = typeof command.fastTypingText === "string" ? command.fastTypingText.trim() : typeof command.text === "string" ? command.text.trim() : typeof command.input === "string" ? command.input.trim() : "";
      if (!text) throw new RoomDomainError("input_required");
      if (text.length > 500) throw new RoomDomainError("input_too_long");
      if (text.normalize("NFKC") !== room.game.prompt.normalize("NFKC")) throw new RoomDomainError("answer_invalid");
      room.game.submissions[actor!.id] = { text, submittedAt: this.now(), order: room.game.nextSubmissionOrder };
      room.game.nextSubmissionOrder += 1;
    } else if (command.kind === "memory_drawing_submit") {
      if (!room.game || room.game.kind !== "memory-drawing-game" || room.game.phase !== "drawing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.descriptions, actor!.id)) throw new RoomDomainError("input_already_submitted");
      const description = typeof command.memoryDrawingDescription === "string" ? command.memoryDrawingDescription.trim() : typeof command.text === "string" ? command.text.trim() : typeof command.input === "string" ? command.input.trim() : "";
      if (!description) throw new RoomDomainError("input_required");
      if (description.length > 500) throw new RoomDomainError("input_too_long");
      room.game.descriptions[actor!.id] = description;
    } else if (command.kind === "memory_drawing_vote") {
      if (!room.game || room.game.kind !== "memory-drawing-game" || room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.votes, actor!.id)) throw new RoomDomainError("vote_already_submitted");
      const target = command.memoryDrawingVoteTargetId ?? command.targetParticipantId ?? command.voteTargetId;
      if (!target || target === actor!.id || !activeParticipants(room).some((participant) => participant.id === target) || !room.game.descriptions[target]) throw new RoomDomainError("vote_target_invalid");
      room.game.votes[actor!.id] = target;
    } else if (command.kind === "value_meter_submit") {
      if (!room.game || room.game.kind !== "value-meter-game" || room.game.phase !== "submitting") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.rows, actor!.id)) throw new RoomDomainError("input_already_submitted");
      const raw = typeof command.input === "string" ? command.input.trim() : "";
      const separator = raw.indexOf("|");
      const rawValue = command.valueMeterValue ?? (separator > 0 ? Number(raw.slice(0, separator).trim()) : Number.NaN);
      const phrase = typeof command.valueMeterPhrase === "string" ? command.valueMeterPhrase.trim() : separator > 0 ? raw.slice(separator + 1).trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (!Number.isInteger(rawValue) || rawValue < 1 || rawValue > 100) throw new RoomDomainError("value_meter_value_invalid");
      if (!phrase || phrase.length > 200) throw new RoomDomainError("value_meter_phrase_invalid");
      room.game.rows[actor!.id] = { value: rawValue, phrase };
    } else if (command.kind === "acting_guess" || command.kind === "acting_submit") {
      if (!room.game || room.game.kind !== "acting-game" || room.game.phase !== "guessing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (actor!.id === room.game.performerId) throw new RoomDomainError("performer_cannot_guess");
      if (Object.prototype.hasOwnProperty.call(room.game.guesses, actor!.id)) throw new RoomDomainError("input_already_submitted");
      const guess = typeof command.actingGuess === "string" ? command.actingGuess.trim() : typeof command.text === "string" ? command.text.trim() : typeof command.input === "string" ? command.input.trim() : "";
      if (!guess) throw new RoomDomainError("input_required");
      if (guess.length > 100) throw new RoomDomainError("input_too_long");
      room.game.guesses[actor!.id] = guess;
    } else if (command.kind === "loanword_ban_action" || command.kind === "loanword_ban_answer") {
      if (!room.game || room.game.kind !== "loanword-ban-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const action = normalizeAction(command);
      if (!(["answer", "pass", "out"] as NativeTurnAction[]).includes(action)) throw new RoomDomainError("turn_action_invalid");
      const answer = typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (action === "answer") {
        if (!answer) throw new RoomDomainError("answer_required");
        if (answer.length > 500) throw new RoomDomainError("answer_too_long");
        const prohibitedWord = containsProhibitedWord(answer, room.game.prohibitedWords);
        if (prohibitedWord) room.game.strikes.push({ id: token(10), participantId: actor!.id, word: prohibitedWord });
      }
      room.game.turnHistory.push({ id: token(10), playerId: actor!.id, action, ...(action === "answer" ? { answer } : {}) });
      room.game.actedPlayerIds.push(actor!.id);
      if (action === "out" && !room.game.outIds.includes(actor!.id)) room.game.outIds.push(actor!.id);
      const nextPlayerId = nativePendingTurnPlayer(room.game.playerOrder, room.game.actedPlayerIds, room.game.outIds, new Set(activeParticipants(room).map((participant) => participant.id)), actor!.id);
      if (!nextPlayerId) finishLoanwordBan(room.game, activeParticipants(room));
      else room.game.currentPlayerId = nextPlayerId;
      markGameFinished(room);
    } else if (command.kind === "song_association_prepare" || command.kind === "song_association_hint" || command.kind === "song_association_guess" || command.kind === "emo_hint_prepare" || command.kind === "emo_hint_hint" || command.kind === "emo_hint_guess" || command.kind === "person_hint_prepare" || command.kind === "person_hint_hint" || command.kind === "person_hint_guess") {
      const expectedKind: NativeHintQuizKind = command.kind.startsWith("song_association") ? "song-association-quiz" : command.kind.startsWith("emo_hint") ? "emo-hint-game" : "person-hint-quiz";
      if (!room.game || !isNativeHintQuizGame(room.game) || room.game.kind !== expectedKind) throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const game = room.game;
      const isPrepare = command.kind.endsWith("_prepare");
      const isHint = command.kind.endsWith("_hint");
      if (isPrepare) {
        if (game.phase !== "setting" || actor!.id !== game.facilitatorId) throw new RoomDomainError("not_your_turn");
        const packedInput = typeof command.input === "string" ? command.input.trim() : "";
        const packed = packedInput.split("|");
        const target = typeof command.nativeQuizTarget === "string" ? command.nativeQuizTarget.trim() : packed[0]?.trim() ?? "";
        const hint = typeof command.nativeQuizHint === "string" ? command.nativeQuizHint.trim() : typeof command.text === "string" ? command.text.trim() : packed.slice(1).join("|").trim();
        if (!target || target.length > 200) throw new RoomDomainError("quiz_target_invalid");
        if (!hint || hint.length > 200) throw new RoomDomainError("quiz_hint_invalid");
        game.target = target;
        game.hints = [hint];
        game.guesses = {};
        game.phase = "guessing";
      } else if (isHint) {
        if (game.phase !== "guessing" || actor!.id !== game.facilitatorId) throw new RoomDomainError("not_your_turn");
        const hint = typeof command.nativeQuizHint === "string" ? command.nativeQuizHint.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!hint || hint.length > 200) throw new RoomDomainError("quiz_hint_invalid");
        if (game.hints.length >= 8) throw new RoomDomainError("quiz_hint_limit");
        game.hints.push(hint);
      } else {
        if (game.phase !== "guessing" || actor!.id === game.facilitatorId) throw new RoomDomainError("quiz_guess_invalid");
        const guess = typeof command.nativeQuizGuess === "string" ? command.nativeQuizGuess.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!guess || guess.length > 200) throw new RoomDomainError("quiz_guess_invalid");
        game.guesses[actor!.id] = guess;
      }
    } else if (command.kind === "drawing_quiz_prepare" || command.kind === "drawing_quiz_ready" || command.kind === "drawing_quiz_guess") {
      if (!room.game || room.game.kind !== "drawing-quiz") throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const game = room.game;
      if (command.kind === "drawing_quiz_prepare") {
        if (game.phase !== "preparing" || actor!.id !== game.artistId) throw new RoomDomainError("not_your_turn");
        const target = typeof command.drawingQuizTarget === "string" ? command.drawingQuizTarget.trim() : typeof command.nativeQuizTarget === "string" ? command.nativeQuizTarget.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!target || target.length > 200) throw new RoomDomainError("drawing_target_invalid");
        game.target = target;
        game.phase = "guessing";
        if (!game.readyIds.includes(actor!.id)) game.readyIds.push(actor!.id);
      } else if (command.kind === "drawing_quiz_ready") {
        if (game.phase !== "preparing" && game.phase !== "guessing") throw new RoomDomainError("game_not_ready");
        if (command.drawingQuizReady === false) game.readyIds = game.readyIds.filter((id) => id !== actor!.id);
        else if (!game.readyIds.includes(actor!.id)) game.readyIds.push(actor!.id);
      } else {
        if (game.phase !== "guessing" || !game.target || actor!.id === game.artistId) throw new RoomDomainError("quiz_guess_invalid");
        const guess = typeof command.drawingQuizGuess === "string" ? command.drawingQuizGuess.trim() : typeof command.nativeQuizGuess === "string" ? command.nativeQuizGuess.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!guess || guess.length > 200) throw new RoomDomainError("quiz_guess_invalid");
        game.guesses[actor!.id] = guess;
      }
    } else if (command.kind === "funny_line_karuta_claim") {
      if (!room.game || room.game.kind !== "funny-line-karuta" || room.game.phase !== "claiming") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (Object.prototype.hasOwnProperty.call(room.game.claims, actor!.id)) throw new RoomDomainError("claim_already_submitted");
      const response = typeof command.funnyLineKarutaResponse === "string" ? command.funnyLineKarutaResponse.trim() : typeof command.nativeQuizGuess === "string" ? command.nativeQuizGuess.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
      if (!response || response.length > 200) throw new RoomDomainError("claim_invalid");
      const claim: FunnyLineKarutaClaim = { id: token(10), participantId: actor!.id, response, claimedAt: this.now(), order: room.game.nextClaimOrder };
      room.game.nextClaimOrder += 1;
      room.game.claims[actor!.id] = claim;
      room.game.claimOrder.push(actor!.id);
      if (!room.game.winnerId) room.game.winnerId = actor!.id;
    } else if (command.kind === "humming_intro_prepare" || command.kind === "humming_intro_guess") {
      if (!room.game || room.game.kind !== "humming-intro-quiz") throw new RoomDomainError("game_not_active");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const game = room.game;
      if (command.kind === "humming_intro_prepare") {
        if (game.phase !== "preparing" || actor!.id !== game.singerId) throw new RoomDomainError("not_your_turn");
        const target = typeof command.hummingIntroTarget === "string" ? command.hummingIntroTarget.trim() : typeof command.nativeQuizTarget === "string" ? command.nativeQuizTarget.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!target || target.length > 200) throw new RoomDomainError("humming_target_invalid");
        game.target = target;
        game.phase = "guessing";
        game.guesses = {};
      } else {
        if (game.phase !== "guessing" || !game.target || actor!.id === game.singerId) throw new RoomDomainError("quiz_guess_invalid");
        if (Object.prototype.hasOwnProperty.call(game.guesses, actor!.id)) throw new RoomDomainError("guess_already_submitted");
        const guess = typeof command.hummingIntroGuess === "string" ? command.hummingIntroGuess.trim() : typeof command.nativeQuizGuess === "string" ? command.nativeQuizGuess.trim() : typeof command.input === "string" ? command.input.trim() : typeof command.text === "string" ? command.text.trim() : "";
        if (!guess || guess.length > 200) throw new RoomDomainError("quiz_guess_invalid");
        game.guesses[actor!.id] = { text: guess, submittedAt: this.now(), order: game.nextGuessOrder };
        game.nextGuessOrder += 1;
      }
    } else if (command.kind === "count_up_increment") {
      if (!room.game || room.game.kind !== "count-up-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const increment = command.countUpIncrement;
      if (!Number.isInteger(increment) || increment === undefined || increment < 1 || increment > 3) throw new RoomDomainError("count_up_increment_invalid");
      if (room.game.currentValue + increment > room.game.target) throw new RoomDomainError("count_up_overflow");
      room.game.currentValue += increment;
      room.game.turnHistory.push({ id: token(10), playerId: actor!.id, increment, total: room.game.currentValue });
      if (room.game.currentValue === room.game.target) finishCountUp(room.game, activeParticipants(room), actor!.id);
      else room.game.currentPlayerId = nextNativeOrderPlayer(room.game.playerOrder, new Set(activeParticipants(room).map((participant) => participant.id)), actor!.id);
      markGameFinished(room);
    } else if (command.kind === "dud_card_pick") {
      if (!room.game || room.game.kind !== "dud-card-game" || room.game.phase !== "picking") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.picks[actor!.id]) throw new RoomDomainError("pick_already_submitted");
      const cardId = typeof command.dudCardPick === "string" ? command.dudCardPick.trim() : "";
      if (!room.game.cardIds.includes(cardId)) throw new RoomDomainError("card_pick_invalid");
      if (Object.values(room.game.picks).includes(cardId)) throw new RoomDomainError("card_already_picked");
      room.game.picks[actor!.id] = cardId;
      if (activeParticipants(room).every((participant) => Boolean(room.game && room.game.kind === "dud-card-game" && room.game.picks[participant.id]))) finishDudCard(room.game, activeParticipants(room));
      markGameFinished(room);
    } else if (command.kind === "safe_random_pick") {
      if (!room.game || room.game.kind !== "safe-random-draw" || room.game.phase !== "picking") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.picks[actor!.id]) throw new RoomDomainError("pick_already_submitted");
      const cardId = typeof command.safeRandomPick === "string" ? command.safeRandomPick.trim() : "";
      if (!room.game.cardIds.includes(cardId)) throw new RoomDomainError("card_pick_invalid");
      if (Object.values(room.game.picks).includes(cardId)) throw new RoomDomainError("card_already_picked");
      room.game.picks[actor!.id] = cardId;
      if (activeParticipants(room).every((participant) => Boolean(room.game && room.game.kind === "safe-random-draw" && room.game.picks[participant.id]))) finishSafeRandomDraw(room.game, activeParticipants(room));
      markGameFinished(room);
    } else if (command.kind === "drinking_sugoroku_roll" || command.kind === "life_event_sugoroku_roll") {
      const expectedKind: NativeSugorokuKind = command.kind === "drinking_sugoroku_roll" ? "drinking-sugoroku" : "life-event-sugoroku";
      if (!room.game || !isNativeSugorokuGame(room.game) || room.game.kind !== expectedKind || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const from = room.game.positions[actor!.id] ?? 0;
      const step = serverRandomInt(1, 3);
      const to = Math.min(room.game.boardLength, from + step);
      room.game.positions[actor!.id] = to;
      const events = nativeSugorokuEvents(room.game);
      room.game.turnHistory.push({ id: token(10), participantId: actor!.id, from, to, step, event: events[to % events.length] ?? events[0] ?? "自由に進む" });
      if (to >= room.game.boardLength) finishNativeSugoroku(room.game, activeParticipants(room), actor!.id);
      else room.game.currentPlayerId = nextNativeOrderPlayer(room.game.playerOrder, new Set(activeParticipants(room).map((participant) => participant.id)), actor!.id);
      markGameFinished(room);
    } else if (command.kind === "territory_claim") {
      if (!room.game || room.game.kind !== "territory-game" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.currentPlayerId !== actor!.id) throw new RoomDomainError("not_your_turn");
      const cellId = typeof command.territoryCell === "string" ? command.territoryCell.trim().toUpperCase() : "";
      if (!room.game.cellIds.includes(cellId)) throw new RoomDomainError("territory_cell_invalid");
      if (room.game.cells[cellId]) throw new RoomDomainError("territory_cell_taken");
      room.game.cells[cellId] = actor!.id;
      room.game.claimHistory.push({ id: token(10), participantId: actor!.id, cellId });
      const next = nextNativeOrderPlayer(room.game.playerOrder, new Set(activeParticipants(room).map((participant) => participant.id)), actor!.id);
      if (Object.values(room.game.cells).every(Boolean)) finishTerritory(room.game, activeParticipants(room));
      else room.game.currentPlayerId = next;
      markGameFinished(room);
    } else if (command.kind === "resource_offer_create" || command.kind === "resource_offer_accept" || command.kind === "resource_offer_reject" || command.kind === "resource_offer_cancel") {
      if (!room.game || room.game.kind !== "resource-negotiation-game" || room.game.phase !== "negotiating") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      const game = room.game;
      if (command.kind === "resource_offer_create") {
        const recipientId = typeof command.resourceOfferRecipientId === "string" ? command.resourceOfferRecipientId : "";
        if (!recipientId || recipientId === actor!.id || !activeParticipants(room).some((participant) => participant.id === recipientId)) throw new RoomDomainError("trade_recipient_invalid");
        const give = parseResourceInventory(command.resourceOfferGive);
        const want = parseResourceInventory(command.resourceOfferWant);
        if (!give || !want || !canAfford(game.inventories[actor!.id] ?? emptyResourceInventory(), give) || !canAfford(game.inventories[recipientId] ?? emptyResourceInventory(), want)) throw new RoomDomainError("trade_offer_invalid");
        const offer: ResourceOffer = { id: token(10), creatorId: actor!.id, recipientId, give, want, status: "pending", order: game.nextOfferOrder };
        game.nextOfferOrder += 1;
        game.offers[offer.id] = offer;
      } else {
        const offerId = typeof command.resourceOfferId === "string" ? command.resourceOfferId : "";
        const offer = game.offers[offerId];
        if (!offer || offer.status !== "pending") throw new RoomDomainError("trade_offer_not_found");
        if (command.kind === "resource_offer_accept") {
          if (offer.recipientId !== actor!.id) throw new RoomDomainError("trade_recipient_required");
          const creatorInventory = game.inventories[offer.creatorId];
          const recipientInventory = game.inventories[offer.recipientId];
          if (!creatorInventory || !recipientInventory || !canAfford(creatorInventory, offer.give) || !canAfford(recipientInventory, offer.want)) throw new RoomDomainError("trade_offer_invalid");
          applyResourceDelta(creatorInventory, offer.give, -1);
          applyResourceDelta(recipientInventory, offer.give, 1);
          applyResourceDelta(recipientInventory, offer.want, -1);
          applyResourceDelta(creatorInventory, offer.want, 1);
          offer.status = "accepted";
          const winnerId = resourceGoalReached(game, activeParticipants(room).map((participant) => participant.id));
          if (winnerId) finishResourceNegotiation(game, activeParticipants(room), winnerId);
        } else if (command.kind === "resource_offer_reject") {
          if (offer.recipientId !== actor!.id) throw new RoomDomainError("trade_recipient_required");
          offer.status = "rejected";
        } else {
          if (offer.creatorId !== actor!.id) throw new RoomDomainError("trade_creator_required");
          offer.status = "cancelled";
        }
      }
      markGameFinished(room);
    } else if (command.kind === "arm_wrestling_record") {
      if (!room.game || room.game.kind !== "arm-wrestling-tournament" || room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (actor!.id !== room.game.refereeId) throw new RoomDomainError("referee_required");
      const currentMatch = room.game.currentMatch;
      if (!currentMatch || currentMatch.status !== "pending") throw new RoomDomainError("match_not_ready");
      const winnerId = typeof command.armWrestlingWinnerId === "string" ? command.armWrestlingWinnerId : "";
      if (winnerId !== currentMatch.leftId && winnerId !== currentMatch.rightId) throw new RoomDomainError("match_winner_invalid");
      currentMatch.winnerId = winnerId;
      currentMatch.status = "completed";
      room.game.roundWinners.push(winnerId);
      room.game.currentMatch = null;
      advanceArmWrestling(room.game, room);
      markGameFinished(room);
    } else if (command.kind === "large_majority_vote") {
      if (!room.game || room.game.kind !== "large-majority-game" || room.game.phase !== "voting") throw new RoomDomainError("game_not_ready");
      if (!actor!.connected) throw new RoomDomainError("participant_not_connected");
      if (room.game.votes[actor!.id]) throw new RoomDomainError("vote_already_submitted");
      const vote = typeof command.largeMajorityVote === "string" ? command.largeMajorityVote.trim() : "";
      if (!room.game.options.includes(vote)) throw new RoomDomainError("majority_vote_invalid");
      room.game.votes[actor!.id] = vote;
      if (activeParticipants(room).every((participant) => Boolean(room.game && room.game.kind === "large-majority-game" && room.game.votes[participant.id]))) finishLargeMajority(room.game, activeParticipants(room));
      markGameFinished(room);
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
      } else if (room.game.kind === "ng-word") {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        room.game.phase = "revealed";
      } else if (room.game.kind === "turtle-soup") {
        if (room.game.phase !== "questioning" || room.game.questions.some((question) => question.classification === null)) throw new RoomDomainError("game_not_ready");
        room.game.phase = "revealed";
      } else if (room.game.kind === "yamanote") {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        finishYamanote(room.game);
      } else if (room.game.kind === "party-pack") {
        const game = room.game;
        if (game.phase !== "playing" || activeParticipants(room).some((participant) => !game.inputs[participant.id])) throw new RoomDomainError("game_not_ready");
        finishPartyPack(game, activeParticipants(room));
      } else if (room.game.kind === "truth-lie-game") {
        const game = room.game;
        const voters = truthLieVoterIds(game, room);
        if (game.phase !== "voting" || voters.some((participantId) => !game.votes[participantId])) throw new RoomDomainError("game_not_ready");
        finishTruthLie(game, activeParticipants(room));
      } else if (room.game.kind === "reverse-word-game") {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        finishReverseWord(room.game, activeParticipants(room));
      } else if (room.game.kind === "fast-typing-game") {
        if (room.game.phase !== "typing") throw new RoomDomainError("game_not_ready");
        finishFastTyping(room.game, activeParticipants(room));
      } else if (room.game.kind === "memory-drawing-game") {
        const game = room.game;
        if (game.phase !== "voting" || activeParticipants(room).some((participant) => !game.votes[participant.id])) throw new RoomDomainError("game_not_ready");
        finishMemoryDrawing(game, activeParticipants(room));
      } else if (room.game.kind === "value-meter-game") {
        const game = room.game;
        if (game.phase !== "submitting" || activeParticipants(room).some((participant) => !game.rows[participant.id])) throw new RoomDomainError("game_not_ready");
        finishValueMeter(game, activeParticipants(room));
      } else if (room.game.kind === "acting-game") {
        const game = room.game;
        const audience = activeParticipants(room).filter((participant) => participant.id !== game.performerId);
        if (game.phase !== "guessing" || audience.some((participant) => !game.guesses[participant.id])) throw new RoomDomainError("game_not_ready");
        finishActing(game, activeParticipants(room));
      } else if (room.game.kind === "loanword-ban-game") {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        finishLoanwordBan(room.game, activeParticipants(room));
      } else if (isNativeHintQuizGame(room.game)) {
        const game = room.game;
        const requiredGuessers = nativeHintQuizVoterIds(game, room);
        if (game.phase !== "guessing" || !game.target || requiredGuessers.some((participantId) => !game.guesses[participantId])) throw new RoomDomainError("game_not_ready");
        finishNativeHintQuiz(game, activeParticipants(room));
      } else if (room.game.kind === "drawing-quiz") {
        const game = room.game;
        const requiredGuessers = activeParticipants(room).filter((participant) => participant.id !== game.artistId);
        if (game.phase !== "guessing" || !game.target || requiredGuessers.some((participant) => !game.guesses[participant.id])) throw new RoomDomainError("game_not_ready");
        finishDrawingQuiz(game, activeParticipants(room));
      } else if (room.game.kind === "funny-line-karuta") {
        if (room.game.phase !== "claiming") throw new RoomDomainError("game_not_ready");
        finishFunnyLineKaruta(room.game, activeParticipants(room));
      } else if (room.game.kind === "humming-intro-quiz") {
        const game = room.game;
        const requiredGuessers = activeParticipants(room).filter((participant) => participant.id !== game.singerId);
        if (game.phase !== "guessing" || !game.target || requiredGuessers.some((participant) => !game.guesses[participant.id])) throw new RoomDomainError("game_not_ready");
        finishHummingIntro(game, activeParticipants(room));
      } else if (room.game.kind === "count-up-game") {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        finishCountUp(room.game, activeParticipants(room));
      } else if (room.game.kind === "dud-card-game") {
        if (room.game.phase !== "picking" || activeParticipants(room).some((participant) => !room.game || room.game.kind !== "dud-card-game" || !room.game.picks[participant.id])) throw new RoomDomainError("game_not_ready");
        finishDudCard(room.game, activeParticipants(room));
      } else if (room.game.kind === "safe-random-draw") {
        if (room.game.phase !== "picking" || activeParticipants(room).some((participant) => !room.game || room.game.kind !== "safe-random-draw" || !room.game.picks[participant.id])) throw new RoomDomainError("game_not_ready");
        finishSafeRandomDraw(room.game, activeParticipants(room));
      } else if (isNativeSugorokuGame(room.game)) {
        if (room.game.phase !== "playing") throw new RoomDomainError("game_not_ready");
        finishNativeSugoroku(room.game, activeParticipants(room), null);
      } else if (room.game.kind === "territory-game") {
        if (room.game.phase !== "playing" || Object.values(room.game.cells).some((ownerId) => !ownerId)) throw new RoomDomainError("game_not_ready");
        finishTerritory(room.game, activeParticipants(room));
      } else if (room.game.kind === "resource-negotiation-game") {
        if (room.game.phase !== "negotiating" || !room.game.winnerId) throw new RoomDomainError("game_not_ready");
        finishResourceNegotiation(room.game, activeParticipants(room), room.game.winnerId);
      } else if (room.game.kind === "arm-wrestling-tournament") {
        if (room.game.phase !== "playing" || room.game.currentMatch) throw new RoomDomainError("game_not_ready");
        advanceArmWrestling(room.game, room);
      } else if (room.game.kind === "large-majority-game") {
        if (room.game.phase !== "voting" || activeParticipants(room).some((participant) => !room.game || room.game.kind !== "large-majority-game" || !room.game.votes[participant.id])) throw new RoomDomainError("game_not_ready");
        finishLargeMajority(room.game, activeParticipants(room));
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
      if (room.game.kind === "ng-word") {
        if (room.game.phase !== "assigned") throw new RoomDomainError("game_not_ready");
        room.game.phase = "playing";
      } else if (room.game.kind === "word-wolf") {
        if (room.game.phase !== "discussion") throw new RoomDomainError("game_not_ready");
        room.game.phase = "voting";
        room.game.phaseDeadlineAt = this.now() + 60_000;
      } else if (room.game.kind === "werewolf") {
        if (room.game.phase === "night") {
          resolveWerewolfNight(room.game);
          room.game.phaseDeadlineAt = room.game.winner ? null : this.now() + 60_000;
        } else if (room.game.phase === "day") { room.game.phase = "voting"; room.game.phaseDeadlineAt = this.now() + 60_000; }
        else throw new RoomDomainError("game_not_ready");
      } else if (room.game.kind === "memory-drawing-game") {
        const game = room.game;
        if (game.phase !== "drawing" || activeParticipants(room).some((participant) => !game.descriptions[participant.id])) throw new RoomDomainError("game_not_ready");
        game.phase = "voting";
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
    } else if (room.game?.kind === "ng-word") {
      const game = room.game;
      const assignments = Object.fromEntries(Object.entries(game.assignments).map(([targetId, word]) => [targetId, game.phase === "revealed" || (participantId !== null && participantId !== undefined && targetId !== participantId) ? word : null]));
      const hitCounts = countNgWordHits(game.hits);
      projection.game = {
        kind: "ng-word",
        prompt: game.prompt,
        phase: game.phase,
        participantCount: activeParticipants(room).length,
        assignedCount: activeParticipants(room).filter((participant) => Boolean(game.assignments[participant.id])).length,
        assignments,
        hits: game.hits.map((hit) => ({ ...hit })),
        hitCounts,
        ...(game.phase === "revealed" ? { result: { assignments: { ...game.assignments }, hits: game.hits.map((hit) => ({ ...hit })), hitCounts } } : {}),
      };
    } else if (room.game?.kind === "turtle-soup") {
      const game = room.game;
      const host = participantId ? room.participants.find((participant) => participant.id === participantId)?.role === "host" : false;
      const hints = game.hints.slice(0, game.hintLevel);
      projection.game = {
        kind: "turtle-soup",
        prompt: game.prompt,
        phase: game.phase,
        questionCount: game.questions.length,
        pendingQuestionCount: game.questions.filter((question) => question.classification === null).length,
        questions: game.questions.map((question) => ({ ...question })),
        hintLevel: game.hintLevel,
        hints,
        ...(host && game.phase !== "revealed" ? { hostTruth: game.truth, availableHints: [...game.hints] } : {}),
        ...(game.phase === "revealed" ? { truth: game.truth } : {}),
      };
    } else if (room.game?.kind === "yamanote") {
      const game = room.game;
      const answerHistory = game.answerHistory.map((entry) => ({ ...entry }));
      projection.game = {
        kind: "yamanote",
        prompt: game.prompt,
        phase: game.phase,
        playerOrder: [...game.playerOrder],
        currentPlayerId: game.currentPlayerId,
        actedPlayerIds: [...game.actedPlayerIds],
        outIds: [...game.outIds],
        answerHistory,
        ...(game.phase === "finished" ? { result: { answerHistory, outIds: [...game.outIds] } } : {}),
      };
    } else if (room.game?.kind === "party-pack") {
      const game = room.game;
      const active = activeParticipants(room);
      const activeIds = new Set(active.map((participant) => participant.id));
      const inputCount = active.filter((participant) => Boolean(game.inputs[participant.id])).length;
      const remainingCount = active.filter((participant) => !game.inputs[participant.id]).length;
      const isHost = participantId ? room.participants.find((participant) => participant.id === participantId)?.role === "host" : false;
      projection.game = {
        kind: "party-pack",
        prompt: game.prompt,
        promptId: game.promptId,
        instruction: game.instruction,
        mode: game.mode,
        progression: game.progression,
        phase: game.phase,
        playerOrder: game.playerOrder.filter((id) => activeIds.has(id)),
        currentPlayerId: game.currentPlayerId,
        inputCount,
        participantCount: active.length,
        remainingCount: game.phase === "revealed" ? 0 : remainingCount,
        ...(participantId && game.inputs[participantId] ? { ownInput: game.inputs[participantId] } : {}),
        ...(isHost && game.phase === "playing" && game.hiddenAnswer ? { hostAnswer: game.hiddenAnswer } : {}),
        ...(game.phase === "revealed" && game.result ? { result: game.result } : {}),
      };
    } else if (room.game?.kind === "truth-lie-game") {
      const game = room.game;
      const active = activeParticipants(room);
      const voters = truthLieVoterIds(game, room);
      const ownIsPresenter = participantId === game.presenterId;
      projection.game = {
        kind: "truth-lie-game",
        prompt: game.prompt,
        phase: game.phase,
        presenterId: game.presenterId,
        ownRole: ownIsPresenter ? "presenter" : "voter",
        statementCount: game.statements.length,
        voterCount: voters.length,
        voteCount: voters.filter((id) => Boolean(game.votes[id])).length,
        ...(ownIsPresenter && game.statements.length > 0 ? { ownStatements: [...game.statements] } : {}),
        ...(ownIsPresenter && game.lieIndex !== null ? { ownLieIndex: game.lieIndex } : {}),
        ...(game.phase !== "presenting" ? { statements: [...game.statements] } : {}),
        ...(participantId && !ownIsPresenter && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveTruthLieResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "reverse-word-game") {
      const game = room.game;
      const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
      const visibleHistory = game.phase === "finished" ? game.turnHistory.map((turn) => ({ ...turn })) : game.turnHistory.map(({ id, playerId, action }) => ({ id, playerId, action }));
      projection.game = {
        kind: "reverse-word-game",
        prompt: game.prompt,
        phase: game.phase,
        playerOrder: game.playerOrder.filter((id) => activeIds.has(id)),
        currentPlayerId: game.currentPlayerId,
        actedPlayerIds: game.actedPlayerIds.filter((id) => activeIds.has(id)),
        outIds: game.outIds.filter((id) => activeIds.has(id)),
        turnCount: game.turnHistory.length,
        turnHistory: visibleHistory,
        ...(game.phase === "finished" ? { result: game.result ?? resolveReverseWordResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "fast-typing-game") {
      const game = room.game;
      const active = activeParticipants(room);
      projection.game = {
        kind: "fast-typing-game",
        prompt: game.prompt,
        phase: game.phase,
        submittedCount: active.filter((participant) => Boolean(game.submissions[participant.id])).length,
        participantCount: active.length,
        remainingCount: game.phase === "revealed" ? 0 : active.filter((participant) => !game.submissions[participant.id]).length,
        ...(participantId && game.submissions[participantId] ? { ownSubmission: { text: game.submissions[participantId].text, submittedAt: game.submissions[participantId].submittedAt } } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveFastTypingResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "memory-drawing-game") {
      const game = room.game;
      const active = activeParticipants(room);
      const isHost = participantId ? room.participants.find((participant) => participant.id === participantId)?.role === "host" : false;
      projection.game = {
        kind: "memory-drawing-game",
        prompt: game.phase === "revealed" ? game.prompt : "お題を思い出して特徴を文章で提出",
        phase: game.phase,
        drawingCount: active.filter((participant) => Boolean(game.descriptions[participant.id])).length,
        participantCount: active.length,
        voteCount: active.filter((participant) => Boolean(game.votes[participant.id])).length,
        voterCount: active.length,
        ...(participantId && game.descriptions[participantId] ? { ownDescription: game.descriptions[participantId] } : {}),
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(isHost && game.phase !== "revealed" ? { hostTarget: game.target } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveMemoryDrawingResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "value-meter-game") {
      const game = room.game;
      const active = activeParticipants(room);
      projection.game = {
        kind: "value-meter-game",
        prompt: game.prompt,
        phase: game.phase,
        submittedCount: active.filter((participant) => Boolean(game.rows[participant.id])).length,
        participantCount: active.length,
        remainingCount: game.phase === "revealed" ? 0 : active.filter((participant) => !game.rows[participant.id]).length,
        ...(participantId && game.rows[participantId] ? { ownRow: { ...game.rows[participantId] } } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveValueMeterResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "acting-game") {
      const game = room.game;
      const active = activeParticipants(room);
      const audience = active.filter((participant) => participant.id !== game.performerId);
      const ownIsPerformer = participantId === game.performerId;
      projection.game = {
        kind: "acting-game",
        prompt: game.prompt,
        phase: game.phase,
        performerId: game.performerId,
        audienceCount: audience.length,
        guessCount: audience.filter((participant) => Boolean(game.guesses[participant.id])).length,
        ownRole: ownIsPerformer ? "performer" : "audience",
        ...(ownIsPerformer ? { ownPerformerPrompt: game.prompt, ownEmotion: game.emotion } : {}),
        ...(participantId && !ownIsPerformer && game.guesses[participantId] ? { ownGuess: game.guesses[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveActingResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "loanword-ban-game") {
      const game = room.game;
      const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
      const isCurrentActor = participantId !== null && participantId === game.currentPlayerId;
      const visibleHistory = game.phase === "finished" ? game.turnHistory.map((turn) => ({ ...turn })) : game.turnHistory.map(({ id, playerId, action }) => ({ id, playerId, action }));
      const visibleStrikes = game.phase === "finished"
        ? game.strikes.map((strike) => ({ ...strike }))
        : game.strikes.map(({ id, participantId: strikeParticipantId }) => ({ id, participantId: strikeParticipantId }));
      projection.game = {
        kind: "loanword-ban-game",
        prompt: game.phase === "finished" ? game.prompt : isCurrentActor ? game.prompt : "",
        phase: game.phase,
        playerOrder: game.playerOrder.filter((id) => activeIds.has(id)),
        currentPlayerId: game.currentPlayerId,
        actedPlayerIds: game.actedPlayerIds.filter((id) => activeIds.has(id)),
        outIds: game.outIds.filter((id) => activeIds.has(id)),
        turnCount: game.turnHistory.length,
        strikeCount: game.strikes.length,
        ...(isCurrentActor && game.phase !== "finished" ? { ownPrompt: game.prompt, ownProhibitedWords: [...game.prohibitedWords] } : {}),
        turnHistory: visibleHistory,
        strikes: visibleStrikes,
        ...(game.phase === "finished" ? { result: game.result ?? loanwordBanResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game && isNativeHintQuizGame(room.game)) {
      const game = room.game;
      const active = activeParticipants(room);
      const isFacilitator = participantId === game.facilitatorId;
      const guessers = active.filter((participant) => participant.id !== game.facilitatorId);
      projection.game = {
        kind: game.kind,
        prompt: game.prompt,
        phase: game.phase,
        facilitatorId: game.facilitatorId,
        ownRole: isFacilitator ? "facilitator" : "guesser",
        hints: [...game.hints],
        hintCount: game.hints.length,
        guessCount: guessers.filter((participant) => Boolean(game.guesses[participant.id])).length,
        participantCount: guessers.length,
        ...(isFacilitator && game.target ? { ownTarget: game.target } : {}),
        ...(participantId && !isFacilitator && game.guesses[participantId] ? { ownGuess: game.guesses[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveNativeHintQuizResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "drawing-quiz") {
      const game = room.game;
      const active = activeParticipants(room);
      const isArtist = participantId === game.artistId;
      const guessers = active.filter((participant) => participant.id !== game.artistId);
      projection.game = {
        kind: "drawing-quiz",
        prompt: game.prompt,
        phase: game.phase,
        artistId: game.artistId,
        ownRole: isArtist ? "artist" : "guesser",
        artistReady: Boolean(game.target),
        readyCount: active.filter((participant) => game.readyIds.includes(participant.id)).length,
        participantCount: active.length,
        guessCount: guessers.filter((participant) => Boolean(game.guesses[participant.id])).length,
        ...(isArtist && game.target ? { ownTarget: game.target } : {}),
        ...(participantId ? { ownReady: game.readyIds.includes(participantId) } : {}),
        ...(participantId && !isArtist && game.guesses[participantId] ? { ownGuess: game.guesses[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveDrawingQuizResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "funny-line-karuta") {
      const game = room.game;
      const active = activeParticipants(room);
      const ownClaim = participantId ? game.claims[participantId] : undefined;
      projection.game = {
        kind: "funny-line-karuta",
        prompt: game.prompt,
        phase: game.phase,
        claimCount: active.filter((participant) => Boolean(game.claims[participant.id])).length,
        participantCount: active.length,
        ...(game.phase === "revealed" ? { winnerId: game.winnerId } : {}),
        ...(ownClaim ? { ownClaim: { response: ownClaim.response, claimedAt: ownClaim.claimedAt, order: ownClaim.order } } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveFunnyLineKarutaResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "humming-intro-quiz") {
      const game = room.game;
      const active = activeParticipants(room);
      const isSinger = participantId === game.singerId;
      const guessers = active.filter((participant) => participant.id !== game.singerId);
      const ownGuess = participantId ? game.guesses[participantId] : undefined;
      projection.game = {
        kind: "humming-intro-quiz",
        prompt: game.prompt,
        phase: game.phase,
        singerId: game.singerId,
        ownRole: isSinger ? "singer" : "guesser",
        guessCount: guessers.filter((participant) => Boolean(game.guesses[participant.id])).length,
        participantCount: guessers.length,
        ...(isSinger && game.target ? { ownTarget: game.target } : {}),
        ...(ownGuess ? { ownGuess: { text: ownGuess.text, submittedAt: ownGuess.submittedAt } } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveHummingIntroResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "count-up-game") {
      const game = room.game;
      projection.game = {
        kind: "count-up-game",
        prompt: game.prompt,
        phase: game.phase,
        target: game.target,
        currentValue: game.currentValue,
        playerOrder: [...game.playerOrder],
        currentPlayerId: game.currentPlayerId,
        turnCount: game.turnHistory.length,
        ownTurn: participantId === game.currentPlayerId,
        ...(game.phase === "revealed" ? { result: game.result ?? resolveCountUpResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "dud-card-game") {
      const game = room.game;
      const active = activeParticipants(room);
      projection.game = {
        kind: "dud-card-game",
        prompt: game.prompt,
        phase: game.phase,
        cardIds: [...game.cardIds],
        pickCount: active.filter((participant) => Boolean(game.picks[participant.id])).length,
        participantCount: active.length,
        ...(participantId && game.picks[participantId] ? { ownPick: game.picks[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveDudCardResult(game, active) } : {}),
      };
    } else if (room.game && isNativeSugorokuGame(room.game)) {
      const game = room.game;
      const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
      projection.game = {
        kind: game.kind,
        prompt: game.prompt,
        phase: game.phase,
        boardLength: game.boardLength,
        positions: Object.fromEntries(game.playerOrder.filter((id) => activeIds.has(id)).map((id) => [id, game.positions[id] ?? 0])),
        playerOrder: game.playerOrder.filter((id) => activeIds.has(id)),
        currentPlayerId: game.currentPlayerId,
        turnCount: game.turnHistory.length,
        safeNotice: game.safeNotice,
        ownPosition: participantId ? game.positions[participantId] ?? 0 : 0,
        ...(game.phase === "revealed" ? { result: game.result ?? resolveNativeSugorokuResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "territory-game") {
      const game = room.game;
      const activeIds = new Set(activeParticipants(room).map((participant) => participant.id));
      projection.game = {
        kind: "territory-game",
        prompt: game.prompt,
        phase: game.phase,
        boardSize: game.boardSize,
        cellIds: [...game.cellIds],
        cells: { ...game.cells },
        playerOrder: game.playerOrder.filter((id) => activeIds.has(id)),
        currentPlayerId: game.currentPlayerId,
        claimCount: game.claimHistory.length,
        ownTurn: participantId === game.currentPlayerId,
        ...(game.phase === "revealed" ? { result: game.result ?? resolveTerritoryResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "resource-negotiation-game") {
      const game = room.game;
      const offers = Object.values(game.offers).sort((left, right) => left.order - right.order).map((offer) => ({ ...offer, give: { ...offer.give }, want: { ...offer.want } }));
      projection.game = {
        kind: "resource-negotiation-game",
        prompt: game.prompt,
        phase: game.phase,
        resourceNames: [...game.resourceNames],
        goalResource: game.goalResource,
        goalAmount: game.goalAmount,
        offers,
        offerCount: offers.length,
        ...(participantId && game.inventories[participantId] ? { ownInventory: { ...game.inventories[participantId] } } : {}),
        ownOfferIds: offers.filter((offer) => offer.creatorId === participantId || offer.recipientId === participantId).map((offer) => offer.id),
        winnerId: game.phase === "revealed" ? game.winnerId : null,
        ...(game.phase === "revealed" ? { result: game.result ?? resolveResourceNegotiationResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "arm-wrestling-tournament") {
      const game = room.game;
      projection.game = {
        kind: "arm-wrestling-tournament",
        prompt: game.prompt,
        phase: game.phase,
        refereeId: game.refereeId,
        currentMatch: game.currentMatch ? { ...game.currentMatch } : null,
        matches: game.matches.map((match) => ({ ...match })),
        ownRole: participantId === game.refereeId ? "referee" : "competitor",
        safetyNotice: game.safetyNotice,
        ...(game.phase === "revealed" ? { result: game.result ?? resolveArmWrestlingResult(game, activeParticipants(room)) } : {}),
      };
    } else if (room.game?.kind === "safe-random-draw") {
      const game = room.game;
      const active = activeParticipants(room);
      projection.game = {
        kind: "safe-random-draw",
        prompt: game.prompt,
        phase: game.phase,
        cardIds: [...game.cardIds],
        pickCount: active.filter((participant) => Boolean(game.picks[participant.id])).length,
        participantCount: active.length,
        ...(participantId && game.picks[participantId] ? { ownPick: game.picks[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveSafeRandomDrawResult(game, active) } : {}),
      };
    } else if (room.game?.kind === "large-majority-game") {
      const game = room.game;
      const active = activeParticipants(room);
      projection.game = {
        kind: "large-majority-game",
        prompt: game.prompt,
        phase: game.phase,
        options: [...game.options],
        voteCount: active.filter((participant) => Boolean(game.votes[participant.id])).length,
        participantCount: active.length,
        ...(participantId && game.votes[participantId] ? { ownVote: game.votes[participantId] } : {}),
        ...(game.phase === "revealed" ? { result: game.result ?? resolveLargeMajorityResult(game, active) } : {}),
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
