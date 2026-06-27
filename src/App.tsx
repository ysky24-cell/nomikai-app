import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Home,
  KeyRound,
  ListChecks,
  MessageCircleQuestion,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Users,
  Vote,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import {
  anonymousQuestionCategories,
  anonymousQuestionPrompts,
  type AnonymousQuestionFilter,
} from "./data/anonymousQuestionPrompts";
import {
  impressionCategories,
  impressionPrompts,
  normalImpressionCategories,
  normalImpressionPrompts,
  type ImpressionCategory,
} from "./data/impressionPrompts";
import {
  johariCategories,
  johariWords,
  type JohariCategory,
} from "./data/johariWords";
import {
  partyPackModeGuides,
  partyPackModes,
  partyPackPrompts,
  type PartyPackMode,
  type PartyPackPrompt,
  type PartyPackPromptMode,
} from "./data/partyPackPrompts";
import {
  normalTwoChoiceCategories,
  normalTwoChoicePrompts,
  twoChoiceCategories,
  twoChoicePrompts,
  type TwoChoiceCategory,
} from "./data/twoChoicePrompts";
import {
  normalWordWolfCategories,
  normalWordWolfTopics,
  wordWolfCategories,
  wordWolfTopics,
  type WordWolfCategory,
} from "./data/wordWolfTopics";
import {
  turtleSoupCases,
  turtleSoupCategories,
  type TurtleSoupFilter,
} from "./data/turtleSoupCases";
import {
  urlCandidateGameByKey,
  urlCandidateGameConfigs,
  urlCandidateGameKeys,
  type UrlCandidateGameConfig,
  type UrlCandidateGameKey,
  type UrlCandidateGameKind,
  type UrlCandidateIconName,
  type UrlCandidatePrompt,
} from "./data/urlCandidateGames";
import {
  normalYamanoteCategories,
  normalYamanoteThemes,
  yamanoteCategories,
  yamanoteThemes,
  type YamanoteCategory,
} from "./data/yamanoteThemes";

type BuiltInGameKey =
  | "yamanote"
  | "two-choice"
  | "word-wolf"
  | "ng-word"
  | "impression-ranking"
  | "party-pack"
  | "johari-window"
  | "turtle-soup"
  | "anonymous-box";

type GameKey = BuiltInGameKey | UrlCandidateGameKey;

type HomeFilter = "all" | "url" | "talk" | "reaction" | "luck" | "drawing" | "board" | "large";

type Player = {
  id: string;
  name: string;
};

type RoomParticipant = {
  id: string;
  roomId: string;
  name: string;
  role: "host" | "player";
  connected: boolean;
  createdAt: string;
  updatedAt: string;
};

type RoomInfo = {
  id: string;
  code: string;
  status: string;
  currentGame: string | null;
  state: unknown;
  createdAt: string;
  updatedAt: string;
};

type RoomSnapshot = {
  room: RoomInfo;
  participants: RoomParticipant[];
};

type RoomEvent = {
  id: string;
  roomId: string;
  participantId: string | null;
  participantName: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

type RoomProgressPhase = "lobby" | "playing" | "complete";

type RoomProgressState = {
  phase: RoomProgressPhase;
  gameKey: GameKey | null;
  gameTitle: string | null;
  step: number;
  message: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

type RoomSession = {
  roomCode: string;
  participantId: string;
  participantName: string;
  participantRole: "host" | "player";
};

type ClaimTransferResponse = {
  participant?: RoomParticipant | null;
  participantId?: string | null;
  room?: RoomInfo | null;
  participants?: RoomParticipant[];
};

type TransferCodeResponse = {
  transferCode?: string;
  expiresAt?: string | null;
  participant?: RoomParticipant | null;
};

type IssuedTransferCode = {
  participantId: string;
  participantName: string;
  transferCode: string;
  expiresAt: string | null;
};

type GameCardImage = {
  src: string;
  alt: string;
};

type GameMeta = {
  key: GameKey;
  title: string;
  description: string;
  people: string;
  minutes: string;
  accent: "teal" | "coral" | "indigo" | "gold";
  icon: LucideIcon;
  groups: readonly HomeFilter[];
  image?: GameCardImage;
};

const STORAGE_PREFIX = "nomikai-app:v1:";
const ROOM_SESSION_KEY = `${STORAGE_PREFIX}room-session`;
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
const publicAsset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const STORED_GAME_KEYS: readonly GameKey[] = [
  "yamanote",
  "two-choice",
  "word-wolf",
  "ng-word",
  "impression-ranking",
  "party-pack",
  "johari-window",
  "turtle-soup",
  "anonymous-box",
  ...urlCandidateGameKeys,
];

const homeFilterOptions: readonly SegmentedOption<HomeFilter>[] = [
  { value: "all", label: "全部" },
  { value: "url", label: "定番" },
  { value: "talk", label: "会話" },
  { value: "reaction", label: "反射" },
  { value: "luck", label: "運" },
  { value: "drawing", label: "描く" },
  { value: "board", label: "ボード風" },
  { value: "large", label: "大人数" },
];

const urlCandidateIconMap: Record<UrlCandidateIconName, LucideIcon> = {
  timer: Timer,
  vote: Vote,
  question: MessageCircleQuestion,
  shield: ShieldAlert,
  sparkles: Sparkles,
  trophy: Trophy,
  list: ListChecks,
};

const gameCardImages: Partial<Record<GameKey, GameCardImage>> = {
  yamanote: {
    src: publicAsset("game-cards/yamanote.jpg"),
    alt: "山手線ゲームのルール説明ボード",
  },
  "two-choice": {
    src: publicAsset("game-cards/two-choice.jpg"),
    alt: "二択トークを楽しむ飲み会の様子",
  },
  "word-wolf": {
    src: publicAsset("game-cards/word-wolf.jpg"),
    alt: "ワードウルフで会話している飲み会の様子",
  },
  "ng-word": {
    src: publicAsset("game-cards/ng-word-game.jpg"),
    alt: "NGワードゲームで盛り上がる飲み会の様子",
  },
  "impression-ranking": {
    src: publicAsset("game-cards/impression-ranking.jpg"),
    alt: "第一印象ランキングの投票ボード",
  },
  "party-pack": {
    src: publicAsset("game-cards/party-pack.jpg"),
    alt: "定番ゲームパックのパッケージ写真",
  },
  "johari-window": {
    src: publicAsset("game-cards/johari-window.jpg"),
    alt: "ジョハリの窓の説明ボード",
  },
  "turtle-soup": {
    src: publicAsset("game-cards/turtle-soup.jpg"),
    alt: "ウミガメのスープの問題と質問例ボード",
  },
  "anonymous-box": {
    src: publicAsset("game-cards/anonymous-box.jpg"),
    alt: "匿名質問箱の投函ボックス",
  },
  "majority-game": {
    src: publicAsset("game-cards/majority-game.jpg"),
    alt: "マジョリティゲームの説明ボード",
  },
  "truth-lie-game": {
    src: publicAsset("game-cards/truth-lie-game.jpg"),
    alt: "2つの真実と1つの嘘のカードセット",
  },
  "count-up-game": {
    src: publicAsset("game-cards/count-up-game.jpg"),
    alt: "カウントアップゲームの説明ボード",
  },
  "reverse-word-game": {
    src: publicAsset("game-cards/reverse-word-game.jpg"),
    alt: "逆さ言葉ゲームのカードセット",
  },
  "song-association-quiz": {
    src: publicAsset("game-cards/song-association-quiz.jpg"),
    alt: "曲名連想クイズのヒントカード",
  },
  "drawing-quiz": {
    src: publicAsset("game-cards/drawing-quiz.jpg"),
    alt: "お絵描きクイズのボードとお題カード",
  },
  "hazard-card-game": {
    src: publicAsset("game-cards/hazard-card-game.jpg"),
    alt: "ドキドキはずれカードのカードセット",
  },
  "typing-speed-game": {
    src: publicAsset("game-cards/typing-speed-game.jpg"),
    alt: "スマホ早打ちゲームのカードとスマホ画面",
  },
  "memory-logo-drawing": {
    src: publicAsset("game-cards/memory-logo-drawing.jpg"),
    alt: "記憶だけでロゴを書くゲームのスケッチボード",
  },
  "value-meter-game": {
    src: publicAsset("game-cards/value-meter-game.jpg"),
    alt: "価値観メーターのメーターボードとカード",
  },
  "acting-phrase-game": {
    src: publicAsset("game-cards/acting-phrase-game.jpg"),
    alt: "ひとこと演技ゲームの説明カード",
  },
  "party-sugoroku": {
    src: publicAsset("game-cards/party-sugoroku.jpg"),
    alt: "飲み会すごろくの盤面とカード",
  },
  "territory-board-game": {
    src: publicAsset("game-cards/territory-board-game.jpg"),
    alt: "シンプル陣取りの盤面と説明カード",
  },
  "weird-karuta-game": {
    src: publicAsset("game-cards/weird-karuta-game.jpg"),
    alt: "変な一言カルタの読み札と取り札",
  },
  "emo-hint-game": {
    src: publicAsset("game-cards/emo-hint-game.jpg"),
    alt: "エモヒント連想のヒントカード",
  },
  "resource-negotiation-game": {
    src: publicAsset("game-cards/resource-negotiation-game.jpg"),
    alt: "資源交渉トークの資源カード",
  },
  "life-event-sugoroku": {
    src: publicAsset("game-cards/life-event-sugoroku.jpg"),
    alt: "人生イベントすごろくの盤面とイベントカード",
  },
  "arm-wrestling-tournament": {
    src: publicAsset("game-cards/arm-wrestling-tournament.jpg"),
    alt: "腕相撲トーナメントの対戦表",
  },
  "safe-random-draw": {
    src: publicAsset("game-cards/safe-random-draw.jpg"),
    alt: "安全はずれ抽選のカードセット",
  },
  "person-hint-quiz": {
    src: publicAsset("game-cards/person-hint-quiz.jpg"),
    alt: "人物当てヒントクイズの説明カード",
  },
  "large-majority-game": {
    src: publicAsset("game-cards/large-majority-game.jpg"),
    alt: "大人数マジョリティの投票カード",
  },
  "humming-intro-quiz": {
    src: publicAsset("game-cards/humming-intro-quiz.jpg"),
    alt: "鼻歌イントロドンのヒントカード",
  },
  "loanword-ban-game": {
    src: publicAsset("game-cards/loanword-ban-game.jpg"),
    alt: "外来語禁止ゲームの言い換えカード",
  },
  "werewolf-game": {
    src: publicAsset("game-cards/werewolf-game.jpg"),
    alt: "人狼ゲームの役職カードと進行ボード",
  },
};

const urlCandidateGameMeta: GameMeta[] = urlCandidateGameConfigs.map((game) => ({
  key: game.key,
  title: game.title,
  description: game.description,
  people: game.people,
  minutes: game.minutes,
  accent: game.accent,
  icon: urlCandidateIconMap[game.icon],
  groups: ["url", ...game.groups],
  image: gameCardImages[game.key],
}));

const activeGames: GameMeta[] = [
  {
    key: "yamanote",
    title: "山手線ゲーム",
    description: "お題に合う言葉をリズムよく順番に答える",
    people: "2人から",
    minutes: "3分から",
    accent: "teal",
    icon: Timer,
    groups: ["url", "reaction"],
    image: gameCardImages.yamanote,
  },
  {
    key: "two-choice",
    title: "二択トーク",
    description: "A/Bで投票して、理由から会話を広げる",
    people: "2人から",
    minutes: "3分から",
    accent: "teal",
    icon: Vote,
    groups: ["talk"],
    image: gameCardImages["two-choice"],
  },
  {
    key: "word-wolf",
    title: "ワードウルフ",
    description: "似たお題を話しながら少数派を探す",
    people: "4人から",
    minutes: "5分から",
    accent: "coral",
    icon: MessageCircleQuestion,
    groups: ["talk"],
    image: gameCardImages["word-wolf"],
  },
  {
    key: "ng-word",
    title: "NGワードゲーム",
    description: "本人だけ知らない言葉を言わないように会話する",
    people: "3人から",
    minutes: "5分から",
    accent: "indigo",
    icon: ShieldAlert,
    groups: ["talk"],
    image: gameCardImages["ng-word"],
  },
  {
    key: "impression-ranking",
    title: "第一印象ランキング",
    description: "お題に一番当てはまりそうな人へ投票する",
    people: "3人から",
    minutes: "5分から",
    accent: "gold",
    icon: Sparkles,
    groups: ["url", "talk", "large"],
    image: gameCardImages["impression-ranking"],
  },
  {
    key: "party-pack",
    title: "定番ゲームパック",
    description: "山手線、逆さ言葉、外来語禁止などをお題カードで回す",
    people: "2人から",
    minutes: "3分から",
    accent: "indigo",
    icon: ListChecks,
    groups: ["reaction", "talk", "drawing"],
    image: gameCardImages["party-pack"],
  },
  {
    key: "johari-window",
    title: "ジョハリの窓",
    description: "自分と周りが選ぶ特徴ワードを4つの窓で見比べる",
    people: "3人から",
    minutes: "10分から",
    accent: "teal",
    icon: Eye,
    groups: ["talk"],
    image: gameCardImages["johari-window"],
  },
  {
    key: "turtle-soup",
    title: "ウミガメのスープ",
    description: "はい・いいえで質問して短い謎の真相を当てる",
    people: "2人から",
    minutes: "5分から",
    accent: "coral",
    icon: MessageCircleQuestion,
    groups: ["talk"],
    image: gameCardImages["turtle-soup"],
  },
  {
    key: "anonymous-box",
    title: "匿名質問箱",
    description: "答えやすい質問をランダムに引いて会話を広げる",
    people: "2人から",
    minutes: "5分から",
    accent: "gold",
    icon: ListChecks,
    groups: ["talk"],
    image: gameCardImages["anonymous-box"],
  },
  ...urlCandidateGameMeta,
];

const futureGames: string[] = [];

function createId(prefix: string) {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shuffle<T>(items: T[]) {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function pickOne<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatTime(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatClockTime(value: string | number | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatTransferExpiry(value: string | null) {
  if (!value) return "";
  const clockTime = formatClockTime(value);
  return clockTime ? `${clockTime}まで` : "";
}

type SyncedTimerFields = {
  remainingSeconds: number;
  timerRunning: boolean;
  timerEndsAt: string | null;
};

function getSyncedTimerRemaining(timer: SyncedTimerFields, now = Date.now()) {
  if (!timer.timerRunning || !timer.timerEndsAt) return Math.max(0, timer.remainingSeconds);
  const endTime = Date.parse(timer.timerEndsAt);
  if (!Number.isFinite(endTime)) return Math.max(0, timer.remainingSeconds);
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

function startSyncedTimer<T extends SyncedTimerFields>(state: T, now = Date.now()): T {
  const remainingSeconds = getSyncedTimerRemaining(state, now);
  return {
    ...state,
    remainingSeconds,
    timerRunning: remainingSeconds > 0,
    timerEndsAt: remainingSeconds > 0 ? new Date(now + remainingSeconds * 1000).toISOString() : null,
  };
}

function pauseSyncedTimer<T extends SyncedTimerFields>(state: T, now = Date.now()): T {
  return {
    ...state,
    remainingSeconds: getSyncedTimerRemaining(state, now),
    timerRunning: false,
    timerEndsAt: null,
  };
}

function stopSyncedTimer<T extends SyncedTimerFields>(state: T, remainingSeconds = state.remainingSeconds): T {
  return {
    ...state,
    remainingSeconds: Math.max(0, remainingSeconds),
    timerRunning: false,
    timerEndsAt: null,
  };
}

function toggleSyncedTimer<T extends SyncedTimerFields>(state: T, now = Date.now()): T {
  return state.timerRunning ? pauseSyncedTimer(state, now) : startSyncedTimer(state, now);
}

function useSecondTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setNow(Date.now());
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}

function useStoredState<T>(key: string, initialState: T) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [state, setState] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored ? (JSON.parse(stored) as T) : initialState;
    } catch {
      return initialState;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  return [state, setState] as const;
}

function clearStoredGameStates() {
  STORED_GAME_KEYS.forEach((key) => {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  });
}

function readRoomSession(): RoomSession | null {
  try {
    const stored = window.localStorage.getItem(ROOM_SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<RoomSession>;
    if (
      typeof parsed.roomCode === "string" &&
      typeof parsed.participantId === "string" &&
      typeof parsed.participantName === "string" &&
      (parsed.participantRole === "host" || parsed.participantRole === "player")
    ) {
      return {
        roomCode: parsed.roomCode,
        participantId: parsed.participantId,
        participantName: parsed.participantName,
        participantRole: parsed.participantRole,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function saveRoomSession(roomCode: string, participant: RoomParticipant | null) {
  if (!participant) return;
  const session: RoomSession = {
    roomCode,
    participantId: participant.id,
    participantName: participant.name,
    participantRole: participant.role,
  };
  window.localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session));
}

function clearRoomSession() {
  window.localStorage.removeItem(ROOM_SESSION_KEY);
}

function isUrlCandidateGameKey(key: GameKey | null): key is UrlCandidateGameKey {
  return Boolean(key && key in urlCandidateGameByKey);
}

function App() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);
  const [activeRoomSession, setActiveRoomSession] = useState<RoomSession | null>(null);

  function startGame(game: GameKey, roomSession: RoomSession | null = null) {
    setActiveRoomSession(roomSession);
    setActiveGame(game);
  }

  function goHome() {
    setActiveGame(null);
  }

  function resetAllGames() {
    clearStoredGameStates();
    clearRoomSession();
    setActiveRoomSession(null);
    setActiveGame(null);
  }

  if (activeGame === "yamanote") {
    return <YamanoteGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "two-choice") {
    return <TwoChoiceGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "word-wolf") {
    return <WordWolfGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "ng-word") {
    return <NgWordGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "impression-ranking") {
    return <ImpressionRankingGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "party-pack") {
    return <PartyPackGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "johari-window") {
    return <JohariWindowGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "turtle-soup") {
    return <TurtleSoupGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "anonymous-box") {
    return <AnonymousQuestionBoxGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (activeGame === "werewolf-game") {
    return <WerewolfGame onHome={goHome} onResetAll={resetAllGames} roomSessionOverride={activeRoomSession} />;
  }

  if (isUrlCandidateGameKey(activeGame)) {
    return (
      <UrlCandidateGame
        config={urlCandidateGameByKey[activeGame]}
        onHome={goHome}
        onResetAll={resetAllGames}
        roomSessionOverride={activeRoomSession}
      />
    );
  }

  return <HomeScreen onStart={startGame} onResetAll={resetAllGames} />;
}

function HomeScreen({ onStart, onResetAll }: { onStart: (game: GameKey, roomSession?: RoomSession | null) => void; onResetAll: () => void }) {
  const [filter, setFilter] = useState<HomeFilter>("all");
  const visibleGames = filter === "all" ? activeGames : activeGames.filter((game) => game.groups.includes(filter));

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="アプリ概要">
        <div>
          <p className="eyebrow">1台共有 / ルーム式</p>
          <h1>飲み会アプリ</h1>
          <p className="lead">幹事のスマホを回す静的版と、Docker版のルーム参加を並べて育てるミニゲーム集。</p>
        </div>
        <div className="top-actions">
          <div className="status-pill">
            <Check size={18} />
            静的版完成
          </div>
          <button className="secondary-button reset-all-button" onClick={onResetAll}>
            <RotateCcw size={18} />
            初期化
          </button>
        </div>
      </section>

      <RoomLobby onStart={onStart} />

      <section className="home-filter" aria-label="ゲーム絞り込み">
        <SegmentedControl label="表示するゲーム" options={homeFilterOptions} value={filter} onChange={setFilter} />
        <p className="soft-note">
          {visibleGames.length}件を表示中。定番は、飲み会で使いやすい会話・反射・運試し系をまとめた入口です。
        </p>
      </section>

      <section className="game-grid" aria-label="遊べるゲーム">
        {visibleGames.map((game) => {
          const Icon = game.icon;
          return (
            <article className={`game-card accent-${game.accent}${game.image ? " has-image" : ""}`} key={game.key}>
              {game.image && (
                <div className="game-card-media">
                  <img src={game.image.src} alt={game.image.alt} loading="lazy" />
                </div>
              )}
              <div className="game-card-main">
                <div className="game-icon">
                  <Icon size={28} />
                </div>
                <div>
                  <h2>{game.title}</h2>
                  <p>{game.description}</p>
                </div>
              </div>
              <div className="meta-row">
                <span>
                  <Users size={16} />
                  {game.people}
                </span>
                <span>
                  <Timer size={16} />
                  {game.minutes}
                </span>
              </div>
              <button className="primary-button" onClick={() => onStart(game.key)}>
                <Play size={18} />
                遊ぶ
              </button>
            </article>
          );
        })}
      </section>

      {futureGames.length > 0 && (
        <section className="future-section" aria-label="追加予定ゲーム">
          <div className="section-heading">
            <ListChecks size={20} />
            <h2>追加予定</h2>
          </div>
          <div className="future-list">
            {futureGames.map((game) => (
              <span key={game}>{game}</span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function RoomLobby({ onStart }: { onStart: (game: GameKey, roomSession?: RoomSession | null) => void }) {
  const [apiStatus, setApiStatus] = useState<"checking" | "ready" | "offline">("checking");
  const [socketStatus, setSocketStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");
  const [savedSession, setSavedSession] = useState<RoomSession | null>(() => readRoomSession());
  const [resumeStatus, setResumeStatus] = useState<"idle" | "checking" | "failed">("idle");
  const [lastRoomSyncAt, setLastRoomSyncAt] = useState<string | null>(null);
  const [hostName, setHostName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [transferRoomCode, setTransferRoomCode] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [issuedTransferCode, setIssuedTransferCode] = useState<IssuedTransferCode | null>(null);
  const [observerCode, setObserverCode] = useState("");
  const [spectatorRoomCode, setSpectatorRoomCode] = useState<string | null>(null);
  const [selectedRoomGame, setSelectedRoomGame] = useState<GameKey>("werewolf-game");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [participant, setParticipant] = useState<RoomParticipant | null>(null);
  const [roomEvents, setRoomEvents] = useState<RoomEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const socketRef = useRef<Socket | null>(null);

  function rememberRoomSession(roomCode: string, nextParticipant: RoomParticipant | null) {
    if (!nextParticipant) {
      clearRoomSession();
      setSavedSession(null);
      return;
    }
    saveRoomSession(roomCode, nextParticipant);
    setSavedSession(readRoomSession());
  }

  function forgetRoomSession() {
    clearRoomSession();
    setSavedSession(null);
  }

  function markRoomSynced() {
    setLastRoomSyncAt(new Date().toISOString());
  }

  useEffect(() => {
    let ignore = false;
    requestJson<{ ok: boolean }>("/health")
      .then(() => {
        if (!ignore) setApiStatus("ready");
      })
      .catch(() => {
        if (!ignore) setApiStatus("offline");
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const session = readRoomSession();
    if (!session) return;
    setSavedSession(session);
    void restoreSavedRoomSession(session);
  }, []);

  useEffect(() => {
    const roomCode = snapshot?.room.code ?? null;
    const isWatching = Boolean(roomCode && !participant && spectatorRoomCode === roomCode);
    if (!roomCode || (!participant && !isWatching)) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocketStatus("idle");
      return;
    }

    socketRef.current?.disconnect();
    setSocketStatus("connecting");
    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    let closedByEffect = false;
    let hadConnectionDrop = false;

    socket.on("connect", () => {
      if (hadConnectionDrop) {
        setNotice("同期接続が復帰しました。");
        hadConnectionDrop = false;
      }
      setSocketStatus("connected");
      setError("");
      socket.emit("room:join", {
        roomCode,
        ...(participant ? { participantId: participant.id } : {}),
      });
    });

    socket.on("disconnect", () => {
      if (!closedByEffect) {
        hadConnectionDrop = true;
        setSocketStatus("disconnected");
        setNotice("同期接続が切れました。自動再接続を待つか、更新で状態を取り直してください。");
      }
    });

    socket.on("connect_error", () => {
      hadConnectionDrop = true;
      setSocketStatus("disconnected");
      setError("同期サーバーへ接続できません。DockerのAPIが起動しているか確認してください。");
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (!nextSnapshot) return;
      markRoomSynced();
      setSnapshot(nextSnapshot);
      void loadRoomEvents(nextSnapshot.room.code, participant?.id ?? null);
      const runningGame = toGameKey(nextSnapshot.room.currentGame);
      if (runningGame) setSelectedRoomGame(runningGame);
      if (!participant) return;

      const latestParticipant = nextSnapshot.participants.find((item) => item.id === participant.id) ?? null;
      if (!latestParticipant) {
        socket.disconnect();
        socketRef.current = null;
        setParticipant(null);
        setSnapshot(null);
        setRoomEvents([]);
        setEventsError("");
        forgetRoomSession();
        setSocketStatus("idle");
        setNotice("この端末の参加者はルームから退出しました。");
        return;
      }
      if (latestParticipant.role !== participant.role || latestParticipant.name !== participant.name) {
        setParticipant(latestParticipant);
        rememberRoomSession(nextSnapshot.room.code, latestParticipant);
      }
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      closedByEffect = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [participant?.id, participant?.name, participant?.role, snapshot?.room.code, spectatorRoomCode]);

  const isHost = participant?.role === "host";
  const isSpectating = Boolean(snapshot && !participant && spectatorRoomCode === snapshot.room.code);
  const roomClosed = snapshot?.room.status === "closed";
  const progress = snapshot ? parseRoomProgress(snapshot) : null;
  const currentGame = progress?.gameKey ? findGameMeta(progress.gameKey) : null;
  const connectedCount = snapshot?.participants.filter((item) => item.connected).length ?? 0;
  const issuedTransferCodeIsVisible = Boolean(
    issuedTransferCode &&
      isHost &&
      !roomClosed &&
      snapshot?.participants.some((item) => item.id === issuedTransferCode.participantId),
  );
  const socketStatusLabel =
    socketStatus === "connected"
      ? "接続中"
      : socketStatus === "connecting"
        ? "接続中..."
        : socketStatus === "disconnected"
          ? "再接続中"
          : "未接続";
  const savedSessionRoleLabel = savedSession?.participantRole === "host" ? "ホスト" : "参加者";

  useEffect(() => {
    if (issuedTransferCode && !issuedTransferCodeIsVisible) {
      setIssuedTransferCode(null);
    }
  }, [issuedTransferCode, issuedTransferCodeIsVisible]);

  async function restoreSavedRoomSession(session = savedSession) {
    if (!session) {
      setError("保存済みのルームがありません。コードで参加してください。");
      return;
    }

    setIsBusy(true);
    setResumeStatus("checking");
    setError("");
    setNotice("");
    setIssuedTransferCode(null);
    setJoinCode(session.roomCode);
    setObserverCode(session.roomCode);
    setTransferRoomCode(session.roomCode);
    try {
      const roomSnapshot = await fetchRoomSnapshot(session.roomCode, session.participantId);
      const savedParticipant = roomSnapshot.participants.find((item) => item.id === session.participantId) ?? null;
      if (!savedParticipant) {
        socketRef.current?.disconnect();
        socketRef.current = null;
        setSnapshot(null);
        setParticipant(null);
        setRoomEvents([]);
        setEventsError("");
        forgetRoomSession();
        setResumeStatus("failed");
        setSocketStatus("idle");
        setError("保存済みの参加者はこのルームに残っていません。もう一度コードで参加してください。");
        return;
      }

      setSnapshot(roomSnapshot);
      setParticipant(savedParticipant);
      setSpectatorRoomCode(null);
      rememberRoomSession(roomSnapshot.room.code, savedParticipant);
      markRoomSynced();
      void loadRoomEvents(roomSnapshot.room.code, savedParticipant.id);
      const runningGame = toGameKey(roomSnapshot.room.currentGame);
      if (runningGame) setSelectedRoomGame(runningGame);
      setResumeStatus("idle");
      setNotice(`${savedParticipant.name}さんとして保存済みルームに再接続しました。`);
    } catch (caught) {
      setResumeStatus("failed");
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function discardSavedRoomSession() {
    forgetRoomSession();
    setSnapshot(null);
    setParticipant(null);
    setSpectatorRoomCode(null);
    setRoomEvents([]);
    setEventsError("");
    setLastRoomSyncAt(null);
    setResumeStatus("idle");
    setSocketStatus("idle");
    setIssuedTransferCode(null);
    setNotice("保存済みのルーム情報を消しました。");
    setError("");
  }

  async function loadRoomEvents(roomCode = snapshot?.room.code, requesterParticipantId = participant?.id ?? null) {
    if (!roomCode) {
      setEventsError("履歴を取得するルームがありません。");
      return;
    }

    setEventsLoading(true);
    setEventsError("");
    try {
      const query = requesterParticipantId ? `?participantId=${encodeURIComponent(requesterParticipantId)}` : "";
      const result = await requestJson<{ events: RoomEvent[] }>(`/rooms/${encodeURIComponent(roomCode)}/events${query}`);
      setRoomEvents(Array.isArray(result.events) ? result.events : []);
    } catch (caught) {
      setEventsError(toErrorMessage(caught));
    } finally {
      setEventsLoading(false);
    }
  }

  function applyRoomSnapshot(nextSnapshot: RoomSnapshot, nextNotice?: string) {
    markRoomSynced();
    setSnapshot(nextSnapshot);
    void loadRoomEvents(nextSnapshot.room.code, participant?.id ?? null);
    if (!participant) {
      if (nextNotice) setNotice(nextNotice);
      return;
    }

    const latestParticipant = nextSnapshot.participants.find((item) => item.id === participant.id) ?? null;
    if (!latestParticipant) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSnapshot(null);
      setParticipant(null);
      setRoomEvents([]);
      setEventsError("");
      forgetRoomSession();
      setSocketStatus("idle");
      setNotice("この端末の参加者はルームから退出しました。もう一度参加する場合はコードで入り直してください。");
      return;
    }

    if (latestParticipant.role !== participant.role || latestParticipant.name !== participant.name) {
      setParticipant(latestParticipant);
      rememberRoomSession(nextSnapshot.room.code, latestParticipant);
    }
    if (nextNotice) setNotice(nextNotice);
  }

  async function createRoomForHost() {
    const name = hostName.trim();
    if (!name) {
      setError("ホスト名を入力してください。");
      return;
    }

    setIsBusy(true);
    setError("");
    setNotice("");
    setIssuedTransferCode(null);
    try {
      const result = await requestJson<{ room: RoomInfo; host: RoomParticipant | null }>("/rooms", {
        method: "POST",
        body: { hostName: name },
      });
      const roomSnapshot = await fetchRoomSnapshot(result.room.code, result.host?.id);
      setSnapshot(roomSnapshot);
      setParticipant(result.host);
      setSpectatorRoomCode(null);
      rememberRoomSession(result.room.code, result.host);
      markRoomSynced();
      void loadRoomEvents(result.room.code, result.host?.id ?? null);
      setJoinCode(result.room.code);
      setObserverCode(result.room.code);
      setTransferRoomCode(result.room.code);
      setNotice("ルームを作成しました。コードを参加者に共有してください。");
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function joinRoom() {
    const code = normalizeInputRoomCode(joinCode);
    const name = joinName.trim();
    if (!code || !name) {
      setError("ルームコードと名前を入力してください。");
      return;
    }

    setIsBusy(true);
    setError("");
    setNotice("");
    setIssuedTransferCode(null);
    try {
      const result = await requestJson<{ participant: RoomParticipant; room: RoomInfo | null }>(
        `/rooms/${encodeURIComponent(code)}/join`,
        {
          method: "POST",
          body: { name },
        },
      );
      const roomSnapshot = await fetchRoomSnapshot(code, result.participant.id);
      setSnapshot(roomSnapshot);
      setParticipant(result.participant);
      setSpectatorRoomCode(null);
      rememberRoomSession(code, result.participant);
      markRoomSynced();
      void loadRoomEvents(code, result.participant.id);
      setJoinCode(code);
      setObserverCode(code);
      setTransferRoomCode(code);
      setNotice("ルームに参加しました。");
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function claimTransferCode() {
    const code = normalizeInputRoomCode(transferRoomCode);
    const codeToClaim = normalizeInputTransferCode(transferCode);
    if (!code || !codeToClaim) {
      setError("ルームコードと引き継ぎコードを入力してください。");
      return;
    }

    setIsBusy(true);
    setError("");
    setNotice("");
    setIssuedTransferCode(null);
    try {
      const result = await requestJson<ClaimTransferResponse>(`/rooms/${encodeURIComponent(code)}/claim-transfer`, {
        method: "POST",
        body: { transferCode: codeToClaim },
      });
      const claimedParticipant =
        result.participant ??
        (result.participantId && result.participants
          ? result.participants.find((item) => item.id === result.participantId) ?? null
          : null);
      if (!claimedParticipant) throw new Error("participant_required");

      const roomSnapshot =
        result.room && Array.isArray(result.participants)
          ? { room: result.room, participants: result.participants }
          : await fetchRoomSnapshot(result.room?.code ?? code, claimedParticipant.id);

      setSnapshot(roomSnapshot);
      setParticipant(claimedParticipant);
      setSpectatorRoomCode(null);
      rememberRoomSession(roomSnapshot.room.code, claimedParticipant);
      markRoomSynced();
      void loadRoomEvents(roomSnapshot.room.code, claimedParticipant.id);
      const runningGame = toGameKey(roomSnapshot.room.currentGame);
      if (runningGame) setSelectedRoomGame(runningGame);
      setJoinCode(roomSnapshot.room.code);
      setObserverCode(roomSnapshot.room.code);
      setTransferRoomCode(roomSnapshot.room.code);
      setTransferCode("");
      setNotice(`${claimedParticipant.name}さんとして復帰しました。`);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function watchRoomAsSpectator() {
    const code = normalizeInputRoomCode(observerCode || joinCode);
    if (!code) {
      setError("観戦するルームコードを入力してください。");
      return;
    }

    setIsBusy(true);
    setError("");
    setNotice("");
    setIssuedTransferCode(null);
    try {
      const roomSnapshot = await fetchRoomSnapshot(code);
      setSnapshot(roomSnapshot);
      setParticipant(null);
      setSpectatorRoomCode(roomSnapshot.room.code);
      markRoomSynced();
      void loadRoomEvents(roomSnapshot.room.code, null);
      const runningGame = toGameKey(roomSnapshot.room.currentGame);
      if (runningGame) setSelectedRoomGame(runningGame);
      setJoinCode(roomSnapshot.room.code);
      setObserverCode(roomSnapshot.room.code);
      setTransferRoomCode(roomSnapshot.room.code);
      setNotice("観戦モードでルームを開きました。参加者としては追加されず、操作はできません。");
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function startRoomGame() {
    if (!snapshot || !participant || roomClosed) return;
    const game = findGameMeta(selectedRoomGame);
    if (!game) return;

    setIsBusy(true);
    setError("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(`/rooms/${encodeURIComponent(snapshot.room.code)}/game/start`, {
        method: "POST",
        body: { gameKey: game.key, gameTitle: game.title, participantId: participant.id },
      });
      applyRoomSnapshot(nextSnapshot);
      setNotice(`${game.title}を開始しました。`);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function advanceRoomGame() {
    if (!snapshot || !participant || roomClosed) return;
    setIsBusy(true);
    setError("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(
        `/rooms/${encodeURIComponent(snapshot.room.code)}/game/advance`,
        {
          method: "POST",
          body: { participantId: participant.id },
        },
      );
      applyRoomSnapshot(nextSnapshot);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function completeRoomGame() {
    if (!snapshot || !participant || roomClosed) return;
    setIsBusy(true);
    setError("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(
        `/rooms/${encodeURIComponent(snapshot.room.code)}/game/complete`,
        {
          method: "POST",
          body: { participantId: participant.id },
        },
      );
      applyRoomSnapshot(nextSnapshot);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function resetRoomGame() {
    if (!snapshot || !participant || roomClosed) return;
    setIsBusy(true);
    setError("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(`/rooms/${encodeURIComponent(snapshot.room.code)}/game/reset`, {
        method: "POST",
        body: { participantId: participant.id },
      });
      applyRoomSnapshot(nextSnapshot, "ルームを待機中に戻しました。");
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function closeRoomForEveryone() {
    if (!snapshot || !participant || !isHost || roomClosed) return;
    const confirmed = window.confirm("このルームを終了しますか？終了後は進行や参加者整理ができず、履歴だけ確認できます。");
    if (!confirmed) return;

    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(`/rooms/${encodeURIComponent(snapshot.room.code)}/close`, {
        method: "POST",
        body: { participantId: participant.id },
      });
      applyRoomSnapshot(nextSnapshot, "ルームを終了しました。履歴だけ確認できます。");
      void loadRoomEvents(nextSnapshot.room.code, participant.id);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function leaveLocalRoom() {
    const wasParticipant = Boolean(participant);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSnapshot(null);
    setParticipant(null);
    setSpectatorRoomCode(null);
    setRoomEvents([]);
    setEventsError("");
    if (wasParticipant) forgetRoomSession();
    setLastRoomSyncAt(null);
    setSocketStatus("idle");
    setIssuedTransferCode(null);
    setNotice("");
    setError("");
  }

  async function copyRoomCode() {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setNotice("ルームコードをコピーしました。");
    } catch {
      setNotice(`ルームコード: ${snapshot.room.code}`);
    }
  }

  async function issueTransferCode(targetParticipant: RoomParticipant) {
    if (!snapshot || !participant || !isHost || roomClosed) return;
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<TransferCodeResponse>(
        `/rooms/${encodeURIComponent(snapshot.room.code)}/participants/${encodeURIComponent(targetParticipant.id)}/transfer-code`,
        {
          method: "POST",
          body: { participantId: participant.id },
        },
      );
      if (!result.transferCode) throw new Error("transfer_code_required");
      const target = result.participant ?? targetParticipant;
      setIssuedTransferCode({
        participantId: target.id,
        participantName: target.name,
        transferCode: result.transferCode,
        expiresAt: result.expiresAt ?? null,
      });
      setNotice("引き継ぎコードを発行しました。");
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyIssuedTransferCode() {
    if (!issuedTransferCode) return;
    try {
      await navigator.clipboard.writeText(issuedTransferCode.transferCode);
      setNotice("引き継ぎコードをコピーしました。");
    } catch {
      setNotice(`引き継ぎコード: ${issuedTransferCode.transferCode}`);
    }
  }

  async function refreshRoom() {
    const code = snapshot?.room.code ?? normalizeInputRoomCode(joinCode);
    if (!code) {
      setError("ルームコードを入力してください。");
      return;
    }

    setIsBusy(true);
    setError("");
    try {
      const roomSnapshot = await fetchRoomSnapshot(code, participant?.id ?? (isSpectating ? null : readRoomSession()?.participantId));
      applyRoomSnapshot(roomSnapshot, "ルーム情報を更新しました。");
      void loadRoomEvents(roomSnapshot.room.code, participant?.id ?? null);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function transferHost(targetParticipant: RoomParticipant) {
    if (!snapshot || !participant || !isHost || roomClosed) return;
    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(`/rooms/${encodeURIComponent(snapshot.room.code)}/host/transfer`, {
        method: "POST",
        body: { participantId: participant.id, targetParticipantId: targetParticipant.id },
      });
      applyRoomSnapshot(nextSnapshot, `${targetParticipant.name}さんをホストにしました。`);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function removeParticipant(targetParticipant: RoomParticipant) {
    if (!snapshot || !participant || !isHost || roomClosed) return;
    const confirmed = window.confirm(`${targetParticipant.name}さんをこのルームから外しますか？`);
    if (!confirmed) return;

    setIsBusy(true);
    setError("");
    setNotice("");
    try {
      const nextSnapshot = await requestJson<RoomSnapshot>(
        `/rooms/${encodeURIComponent(snapshot.room.code)}/participants/${encodeURIComponent(targetParticipant.id)}`,
        {
          method: "DELETE",
          body: { participantId: participant.id },
        },
      );
      applyRoomSnapshot(nextSnapshot, `${targetParticipant.name}さんをルームから外しました。`);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function openCurrentRoomGame() {
    if (progress?.gameKey && snapshot && participant && !roomClosed) {
      const roomSession: RoomSession = {
        roomCode: snapshot.room.code,
        participantId: participant.id,
        participantName: participant.name,
        participantRole: participant.role,
      };
      rememberRoomSession(snapshot.room.code, participant);
      onStart(progress.gameKey, roomSession);
    }
  }

  return (
    <section className="room-panel" aria-label="ルーム参加">
      <div className="room-panel-heading">
        <div>
          <p className="eyebrow">Dockerルーム版</p>
          <h2>ルームを作って参加者を同期</h2>
          <p className="soft-note">全ゲーム共通で、開始・進行・完了・待機戻しを参加者へ共有します。</p>
        </div>
        <div className={`room-status status-${apiStatus}`}>
          <span>API: {apiStatus === "ready" ? "OK" : apiStatus === "checking" ? "確認中" : "停止中"}</span>
          <span>同期: {socketStatusLabel}</span>
          {isSpectating && <span>表示: 観戦中</span>}
          {roomClosed && <span>状態: 終了済み</span>}
          {snapshot && <span>参加: {connectedCount}/{snapshot.participants.length} 接続</span>}
          {lastRoomSyncAt && <span>最終同期: {formatClockTime(lastRoomSyncAt)}</span>}
        </div>
      </div>

      <div className="room-actions-grid">
        <div className="room-form">
          <h3>ホストとして作成</h3>
          <div className="room-button-row">
            <input value={hostName} onChange={(event) => setHostName(event.currentTarget.value)} placeholder="ホスト名" />
            <button className="primary-button" type="button" disabled={isBusy || apiStatus !== "ready"} onClick={createRoomForHost}>
              <Plus size={18} />
              ルーム作成
            </button>
          </div>
        </div>

        <div className="room-form">
          <h3>コードで参加</h3>
          <p className="soft-note">観戦から参加へ切り替える時も、ここで名前を入れて参加します。</p>
          <div className="room-button-row">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.currentTarget.value.toUpperCase())}
              placeholder="ルームコード"
              inputMode="text"
            />
            <input value={joinName} onChange={(event) => setJoinName(event.currentTarget.value)} placeholder="名前" />
            <button className="secondary-button" type="button" disabled={isBusy || apiStatus !== "ready"} onClick={joinRoom}>
              <Users size={18} />
              参加
            </button>
          </div>
        </div>

        <div className="room-form room-transfer-form">
          <h3>引き継ぎコードで復帰</h3>
          <p className="soft-note">別端末でも同じ参加者として戻れます。</p>
          <div className="room-button-row">
            <input
              value={transferRoomCode}
              onChange={(event) => setTransferRoomCode(event.currentTarget.value.toUpperCase())}
              placeholder="ルームコード"
              inputMode="text"
            />
            <input
              value={transferCode}
              onChange={(event) => setTransferCode(normalizeInputTransferCode(event.currentTarget.value))}
              placeholder="引き継ぎコード"
              inputMode="text"
              autoComplete="one-time-code"
              maxLength={8}
            />
            <button className="secondary-button" type="button" disabled={isBusy || apiStatus !== "ready"} onClick={claimTransferCode}>
              <KeyRound size={18} />
              復帰
            </button>
          </div>
        </div>

        <div className="room-form">
          <h3>観戦で見る</h3>
          <p className="soft-note">参加者に数えず、進行・履歴・接続状況だけを確認します。</p>
          <div className="room-button-row">
            <input
              value={observerCode}
              onChange={(event) => setObserverCode(event.currentTarget.value.toUpperCase())}
              placeholder="ルームコード"
              inputMode="text"
            />
            <button className="secondary-button" type="button" disabled={isBusy || apiStatus !== "ready"} onClick={watchRoomAsSpectator}>
              <Eye size={18} />
              観戦
            </button>
          </div>
        </div>
      </div>

      {savedSession && !snapshot && (
        <div className="room-form room-resume-card">
          <div>
            <h3>前回のルームに戻る</h3>
            <p className="soft-note">
              {savedSession.roomCode} / {savedSession.participantName}（{savedSessionRoleLabel}）としてこのブラウザに保存されています。別端末で同じ参加者として戻る場合は、ホストに引き継ぎコードを発行してもらってください。
            </p>
          </div>
          <div className="room-game-controls">
            <button
              className="primary-button"
              type="button"
              disabled={isBusy || resumeStatus === "checking" || apiStatus !== "ready"}
              onClick={() => restoreSavedRoomSession(savedSession)}
            >
              <RotateCcw size={18} />
              {resumeStatus === "checking" ? "確認中..." : "再接続する"}
            </button>
            <button className="secondary-button" type="button" disabled={isBusy} onClick={discardSavedRoomSession}>
              保存を消す
            </button>
          </div>
        </div>
      )}

      {snapshot && (participant || isSpectating) && (
        <>
          {socketStatus === "disconnected" && (
            <p className="room-message error">
              同期接続が切れています。自動再接続を待つか、「更新」で現在の状態を取り直してください。
            </p>
          )}
          {roomClosed && (
            <p className="room-message">
              ルーム終了済みです。ゲーム進行と参加者整理は停止し、現在の履歴だけ確認できます。
            </p>
          )}

          <div className="room-current">
            <div>
              <p className="eyebrow">ルームコード</p>
              <button className="room-code" type="button" onClick={copyRoomCode}>
                {snapshot.room.code}
              </button>
            </div>
            <div>
              <p className="eyebrow">現在のゲーム</p>
              <h3>{roomClosed ? "終了済み" : currentGame ? currentGame.title : "待機中"}</h3>
              <p className="soft-note">
                {roomClosed
                  ? "このルームは終了しています。下の履歴を見ながら振り返れます。"
                  : progress?.message || "ホストがゲームを開始すると参加者に同期されます。"}
                {!roomClosed && progress && progress.step > 0 ? ` / ステップ ${progress.step}` : ""}
              </p>
            </div>
            <div className="room-current-actions">
              <button className="secondary-button" type="button" disabled={isBusy} onClick={refreshRoom}>
                <RotateCcw size={18} />
                更新
              </button>
              {isHost && (
                <button className="danger-button" type="button" disabled={isBusy || roomClosed} onClick={closeRoomForEveryone}>
                  <ShieldAlert size={18} />
                  ルーム終了
                </button>
              )}
              <button className="secondary-button" type="button" onClick={leaveLocalRoom}>
                {isSpectating ? "観戦を終了" : "この端末だけ退出"}
              </button>
            </div>
          </div>

          {participant ? (
            <div className="room-game-panel">
              {currentGame && !roomClosed && (
                <p className="soft-note">回答や自分だけの確認は、下の「この端末でゲーム画面を開く」から進みます。</p>
              )}
              <label>
                <span className="control-label">開始するゲーム</span>
                <select
                  value={selectedRoomGame}
                  onChange={(event) => setSelectedRoomGame(event.currentTarget.value as GameKey)}
                  disabled={!isHost || isBusy || roomClosed}
                >
                  {activeGames.map((game) => (
                    <option value={game.key} key={game.key}>
                      {game.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="room-game-controls">
                <button className="primary-button" type="button" disabled={!isHost || isBusy || roomClosed} onClick={startRoomGame}>
                  <Play size={18} />
                  ルームで開始
                </button>
                <button className="secondary-button" type="button" disabled={!isHost || isBusy || roomClosed || !currentGame} onClick={advanceRoomGame}>
                  <ChevronRight size={18} />
                  次へ
                </button>
                <button className="secondary-button" type="button" disabled={!isHost || isBusy || roomClosed || !currentGame} onClick={completeRoomGame}>
                  <Trophy size={18} />
                  完了
                </button>
                <button className="secondary-button" type="button" disabled={!isHost || isBusy || roomClosed} onClick={resetRoomGame}>
                  <RotateCcw size={18} />
                  待機に戻す
                </button>
              </div>
              {roomClosed && <p className="soft-note">終了済みのルームでは、進行操作はできません。</p>}
              {!isHost && <p className="soft-note">ゲーム開始や進行操作はホスト端末で行います。</p>}
            </div>
          ) : (
            <div className="room-game-panel">
              <div className="section-heading compact">
                <Eye size={20} />
                <h3>観戦中</h3>
              </div>
              <p className="soft-note">
                {roomClosed
                  ? "このルームは終了済みです。参加者として追加されず、履歴と接続状況だけを確認できます。"
                  : "参加者としては追加されません。現在のゲーム、進行メッセージ、参加者の接続状況だけを確認できます。参加する場合は、上の「コードで参加」に名前を入れて入り直してください。"}
              </p>
            </div>
          )}

          {currentGame && participant && !roomClosed && (
            <button className="primary-button room-open-game" type="button" onClick={openCurrentRoomGame}>
              <Play size={18} />
              この端末でゲーム画面を開く
            </button>
          )}

          <div className="room-participants-panel">
            <div className="section-heading compact">
              <Users size={20} />
              <h3>参加者</h3>
            </div>
            <div className="room-participants">
              {snapshot.participants.map((item) => {
                const isSelf = participant ? item.id === participant.id : false;
                return (
                  <div className={`room-participant-card${isSelf ? " self" : ""}`} key={item.id}>
                    <div>
                      <strong>
                        {item.name}
                        {isSelf ? "（自分）" : ""}
                      </strong>
                      <span>
                        {item.role === "host" ? "ホスト" : "参加者"} / {item.connected ? "接続中" : "離席"}
                      </span>
                    </div>
                    {isHost && !roomClosed && (
                      <div className="participant-actions">
                        <button className="secondary-button" type="button" disabled={isBusy} onClick={() => issueTransferCode(item)}>
                          <KeyRound size={16} />
                          発行
                        </button>
                        {item.role !== "host" && (
                          <button className="secondary-button" type="button" disabled={isBusy} onClick={() => transferHost(item)}>
                            <Users size={16} />
                            ホストにする
                          </button>
                        )}
                        {!isSelf && (
                          <button className="ghost-icon-button" type="button" disabled={isBusy} aria-label={`${item.name}さんを退出`} onClick={() => removeParticipant(item)}>
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {issuedTransferCodeIsVisible && issuedTransferCode && (
              <div className="transfer-code-panel" role="status">
                <div className="transfer-code-copy">
                  <span>{issuedTransferCode.participantName}さん用</span>
                  <strong>{issuedTransferCode.transferCode}</strong>
                  {issuedTransferCode.expiresAt && <small>{formatTransferExpiry(issuedTransferCode.expiresAt)}</small>}
                </div>
                <button className="secondary-button" type="button" onClick={copyIssuedTransferCode}>
                  <Copy size={16} />
                  コピー
                </button>
              </div>
            )}
            {isSpectating ? (
              <p className="soft-note">観戦中は参加者として数えられず、ホスト交代や参加者整理もできません。</p>
            ) : roomClosed ? (
              <p className="soft-note">終了済みのため、ホスト交代や参加者整理はできません。</p>
            ) : (
              !isHost && <p className="soft-note">ホスト交代や参加者整理はホスト端末から行います。</p>
            )}
          </div>

          <div className="room-history-panel">
            <div className="room-history-heading">
              <div className="section-heading compact">
                <ListChecks size={20} />
                <h3>ルーム履歴</h3>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={eventsLoading || isBusy}
                onClick={() => loadRoomEvents(snapshot.room.code, participant?.id ?? null)}
              >
                <RotateCcw size={18} />
                {eventsLoading ? "取得中..." : "履歴更新"}
              </button>
            </div>
            <p className="soft-note">履歴は進行の要約です。役職やお題などの秘密情報は画面に出さない前提です。</p>
            {eventsError && <p className="room-message error">履歴を取得できませんでした: {eventsError}</p>}
            {!eventsError && roomEvents.length === 0 && (
              <p className="soft-note">{eventsLoading ? "履歴を取得しています。" : "まだ表示できる履歴がありません。"}</p>
            )}
            {roomEvents.length > 0 && (
              <ol className="room-events-list">
                {roomEvents.map((event) => {
                  const summary = summarizeRoomEvent(event);
                  return (
                    <li className="room-event-item" key={event.id}>
                      <span className="room-event-time">{formatClockTime(event.createdAt)}</span>
                      <strong>{getRoomEventLabel(event.eventType)}</strong>
                      {summary && <span>{summary}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}

      {notice && <p className="room-message">{notice}</p>}
      {error && <p className="room-message error">{error}</p>}
    </section>
  );
}

async function requestJson<T>(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : response.statusText;
    throw new Error(error || "request_failed");
  }
  return payload as T;
}

async function fetchRoomSnapshot(code: string, participantId?: string | null) {
  const query = participantId ? `?participantId=${encodeURIComponent(participantId)}` : "";
  return requestJson<RoomSnapshot>(`/rooms/${encodeURIComponent(code)}${query}`);
}

const roomEventLabels: Record<string, string> = {
  room_created: "作成",
  participant_joined: "参加",
  game_started: "開始",
  game_advanced: "次へ",
  game_completed: "完了",
  game_reset: "待機戻し",
  host_transferred: "ホスト交代",
  participant_removed: "削除",
  room_closed: "終了",
};

function getRoomEventLabel(eventType: string) {
  return roomEventLabels[eventType] ?? eventType;
}

function summarizeRoomEvent(event: RoomEvent) {
  const payload = isRecordPayload(event.payload) ? event.payload : {};
  const details: string[] = [];
  const actor = event.participantName ?? readPayloadText(payload, "name") ?? readPayloadText(payload, "hostName");
  const targetName = readPayloadText(payload, "targetName");
  const promotedHostName = readPayloadText(payload, "promotedHostName");
  const currentGameKey = readPayloadText(payload, "currentGame");
  const currentGame = currentGameKey ? findGameMeta(toGameKey(currentGameKey)) : null;

  if (actor) details.push(actor);
  if (targetName) details.push(`対象: ${targetName}`);
  if (promotedHostName) details.push(`新ホスト: ${promotedHostName}`);
  if (currentGame) details.push(currentGame.title);
  if (event.eventType === "room_closed") details.push("終了済み");

  return details.slice(0, 3).join(" / ");
}

function isRecordPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPayloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRoomProgress(snapshot: RoomSnapshot): RoomProgressState {
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<RoomProgressState>) : {};
  const gameKey = toGameKey(state.gameKey ?? snapshot.room.currentGame);
  return {
    phase: state.phase === "complete" ? "complete" : state.phase === "lobby" ? "lobby" : gameKey ? "playing" : "lobby",
    gameKey,
    gameTitle: typeof state.gameTitle === "string" ? state.gameTitle : findGameMeta(gameKey)?.title ?? null,
    step: typeof state.step === "number" && Number.isFinite(state.step) ? state.step : gameKey ? 1 : 0,
    message: typeof state.message === "string" ? state.message : "",
    updatedBy: typeof state.updatedBy === "string" ? state.updatedBy : null,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null,
  };
}

function findGameMeta(key: GameKey | null) {
  return activeGames.find((game) => game.key === key) ?? null;
}

function toGameKey(value: unknown): GameKey | null {
  return typeof value === "string" && activeGames.some((game) => game.key === value) ? (value as GameKey) : null;
}

function normalizeInputRoomCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeInputTransferCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function toErrorMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    room_not_found: "ルームが見つかりません。",
    room_code_required: "ルームコードを入力してください。",
    name_required: "名前を入力してください。",
    game_key_required: "ゲームを選択してください。",
    game_title_required: "ゲーム名が取得できません。",
    unsupported_game: "このゲームはルーム同期の対象外です。画面を更新して選び直してください。",
    game_not_started: "先にゲームを開始してください。",
    host_required: "この操作はホストだけが実行できます。",
    room_closed: "このルームは終了済みです。",
    participant_id_required: "参加者情報が取得できません。",
    participant_required: "ルーム参加者として接続してから操作してください。",
    target_participant_id_required: "対象の参加者が取得できません。",
    participant_not_found: "参加者が見つかりません。",
    room_join_required: "ルームへの接続が切れています。更新または再参加してください。",
    game_mismatch: "現在のゲームと更新内容が一致しません。画面を更新してください。",
    participant_update_mismatch: "別の参加者としての更新はできません。",
    participant_field_forbidden: "この端末では、その回答欄や投票欄は変更できません。",
    transfer_code_required: "引き継ぎコードを入力してください。",
    transfer_code_invalid: "引き継ぎコードが違います。",
    transfer_code_expired: "引き継ぎコードの期限が切れています。",
    transfer_code_used: "この引き継ぎコードは使用済みです。",
    transfer_code_rate_limited: "引き継ぎコードの試行回数が多すぎます。少し待ってからやり直してください。",
    Failed_to_fetch: "APIに接続できません。Docker版が起動しているか確認してください。",
  };
  return messages[value] ?? "処理に失敗しました。APIサーバーの状態を確認してください。";
}

type PlayerSetupProps = {
  players: Player[];
  minPlayers: number;
  maxPlayers: number;
  onChange: (players: Player[]) => void;
};

function PlayerSetup({ players, minPlayers, maxPlayers, onChange }: PlayerSetupProps) {
  const [draftName, setDraftName] = useState("");
  const remaining = Math.max(0, minPlayers - players.length);

  function addPlayer() {
    const name = draftName.trim();
    if (!name || players.length >= maxPlayers) return;
    onChange([...players, { id: createId("player"), name }]);
    setDraftName("");
  }

  function updatePlayer(id: string, name: string) {
    onChange(players.map((player) => (player.id === id ? { ...player, name } : player)));
  }

  function removePlayer(id: string) {
    onChange(players.filter((player) => player.id !== id));
  }

  return (
    <div className="setup-block">
      <div className="setup-heading">
        <div>
          <h3>参加者</h3>
          <p>{remaining === 0 ? "開始できます" : `あと${remaining}人追加してください`}</p>
        </div>
        <span className="count-badge">
          {players.length}/{maxPlayers}
        </span>
      </div>

      <form
        className="add-player-row"
        onSubmit={(event) => {
          event.preventDefault();
          addPlayer();
        }}
      >
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="名前を入力"
          maxLength={16}
        />
        <button className="icon-button" type="submit" disabled={!draftName.trim() || players.length >= maxPlayers}>
          <Plus size={20} />
          <span className="sr-only">追加</span>
        </button>
      </form>

      <div className="player-list">
        {players.map((player, index) => (
          <div className="player-row" key={player.id}>
            <span className="player-number">{index + 1}</span>
            <input
              value={player.name}
              onChange={(event) => updatePlayer(player.id, event.target.value)}
              maxLength={16}
            />
            <button className="ghost-icon-button" onClick={() => removePlayer(player.id)} type="button">
              <Trash2 size={18} />
              <span className="sr-only">削除</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="control-block">
      <span className="control-label">{label}</span>
      <div className="segmented">
        {options.map((option) => (
          <button
            key={option.value}
            className={option.value === value ? "selected" : ""}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`toggle-control ${checked ? "enabled" : ""}`}>
      <span className="toggle-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

function GameFrame({
  title,
  subtitle,
  onHome,
  onResetAll,
  children,
}: {
  title: string;
  subtitle: string;
  onHome: () => void;
  onResetAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <nav className="game-nav" aria-label="ゲーム操作">
        <button className="secondary-button" onClick={onHome}>
          <Home size={18} />
          トップ
        </button>
        <button className="secondary-button reset-all-button" onClick={onResetAll}>
          <RotateCcw size={18} />
          初期化してトップへ
        </button>
      </nav>
      <section className="game-title">
        <p className="eyebrow">プレイ中</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
      {children}
    </main>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

type UrlCandidateStep = "setup" | "play" | "complete";
type UrlCandidateQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type UrlCandidateState = {
  players: Player[];
  includeAdultTopics: boolean;
  questionCount: UrlCandidateQuestionCount;
  step: UrlCandidateStep;
  deckPromptIds: string[];
  deckIndex: number;
  answerVisible: boolean;
  currentPlayerIndex: number;
  numberValue: number;
  positions: Record<string, number>;
  territory: Record<string, string>;
  drawnCount: number;
  hazardIndex: number;
  completedPairs: number;
  actionLog: string[];
  votes: Record<string, string>;
  safeCounts: Record<string, number>;
  missCounts: Record<string, number>;
  guesses: Record<string, string>;
  scoreCounts: Record<string, number>;
  resourceCounts: Record<string, number>;
};

const urlCandidateQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialUrlCandidateState: UrlCandidateState = {
  players: [],
  includeAdultTopics: false,
  questionCount: 10,
  step: "setup",
  deckPromptIds: [],
  deckIndex: 0,
  answerVisible: false,
  currentPlayerIndex: 0,
  numberValue: 0,
  positions: {},
  territory: {},
  drawnCount: 0,
  hazardIndex: 4,
  completedPairs: 0,
  actionLog: [],
  votes: {},
  safeCounts: {},
  missCounts: {},
  guesses: {},
  scoreCounts: {},
  resourceCounts: {},
};

function createPlayerPositions(players: Player[]) {
  return Object.fromEntries(players.map((player) => [player.id, 0]));
}

function createPlayerCountMap(players: Player[]) {
  return Object.fromEntries(players.map((player) => [player.id, 0]));
}

function createPlayerResourceMap(players: Player[]) {
  return Object.fromEntries(players.map((player) => [player.id, 3]));
}

function createHazardIndex() {
  return Math.floor(Math.random() * 8) + 1;
}

function formatChoiceLabel(option: string, index: number) {
  return /^[A-ZＡ-Ｚ]\s*[:：.．]/.test(option) ? option : `${String.fromCharCode(65 + index)}. ${option}`;
}

function deriveAnswerFromPromptTitle(title: string) {
  return title.replace(/^[^:：]+[:：]\s*/, "").replace(/\s*\([^()]*\)\s*$/, "");
}

type UrlCandidateRoomEnvelope = RoomProgressState & {
  urlCandidate?: {
    key: UrlCandidateGameKey;
    state: UrlCandidateState;
  };
};

function isVoteSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return key === "majority-game" || key === "large-majority-game";
}

function isTurnSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return key === "reverse-word-game" || key === "loanword-ban-game";
}

function isGuessSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return (
    key === "song-association-quiz" ||
    key === "drawing-quiz" ||
    key === "memory-logo-drawing" ||
    key === "weird-karuta-game" ||
    key === "emo-hint-game" ||
    key === "person-hint-quiz" ||
    key === "humming-intro-quiz"
  );
}

function isBoardSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return (
    key === "party-sugoroku" ||
    key === "life-event-sugoroku" ||
    key === "territory-board-game" ||
    key === "resource-negotiation-game"
  );
}

function isAnswerSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return key === "truth-lie-game" || key === "value-meter-game" || key === "typing-speed-game";
}

function isActingSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return key === "acting-phrase-game";
}

function isActionSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return key === "count-up-game" || key === "hazard-card-game" || key === "safe-random-draw" || key === "arm-wrestling-tournament";
}

function isRoomSyncableUrlCandidateKey(key: UrlCandidateGameKey) {
  return (
    isVoteSyncableUrlCandidateKey(key) ||
    isTurnSyncableUrlCandidateKey(key) ||
    isGuessSyncableUrlCandidateKey(key) ||
    isBoardSyncableUrlCandidateKey(key) ||
    isAnswerSyncableUrlCandidateKey(key) ||
    isActingSyncableUrlCandidateKey(key) ||
    isActionSyncableUrlCandidateKey(key)
  );
}

function parseUrlCandidateStateFromRoom(snapshot: RoomSnapshot | null, key: UrlCandidateGameKey) {
  if (!snapshot || snapshot.room.currentGame !== key) return null;
  const roomState =
    snapshot.room.state && typeof snapshot.room.state === "object"
      ? (snapshot.room.state as Partial<UrlCandidateRoomEnvelope>)
      : {};
  const urlCandidate = roomState.urlCandidate;
  if (!urlCandidate || urlCandidate.key !== key || typeof urlCandidate.state !== "object") return null;
  return { ...initialUrlCandidateState, ...urlCandidate.state } as UrlCandidateState;
}

function getUrlCandidateProgressStep(state: UrlCandidateState) {
  const stepOrder: Record<UrlCandidateStep, number> = {
    setup: 1,
    play: 2,
    complete: 3,
  };
  return stepOrder[state.step] ?? 1;
}

function describeUrlCandidateProgress(config: UrlCandidateGameConfig, state: UrlCandidateState) {
  if (state.step === "setup") return `${config.title}の設定中です`;
  if (state.step === "play") {
    const progress = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "準備中";
    if (isVoteSyncableUrlCandidateKey(config.key)) {
      const votedCount = state.players.filter((player) => state.votes[player.id]).length;
      return `${config.title}: お題${progress}で投票中です (${votedCount}/${state.players.length})`;
    }
    if (isTurnSyncableUrlCandidateKey(config.key)) {
      const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      return currentPlayer ? `${config.title}: お題${progress}で${currentPlayer.name}さんの番です` : `${config.title}: お題${progress}で進行中です`;
    }
    if (isGuessSyncableUrlCandidateKey(config.key)) {
      const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      const answerers = currentPlayer ? state.players.filter((player) => player.id !== currentPlayer.id) : state.players;
      const guessedCount = answerers.filter((player) => state.guesses[player.id]?.trim()).length;
      return currentPlayer
        ? `${config.title}: お題${progress}で${currentPlayer.name}さんが出題中です (${guessedCount}/${answerers.length})`
        : `${config.title}: お題${progress}で回答中です (${guessedCount}/${answerers.length})`;
    }
    if (isBoardSyncableUrlCandidateKey(config.key)) {
      const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      if (config.key === "resource-negotiation-game") {
        return currentPlayer ? `${config.title}: お題${progress}で${currentPlayer.name}さんが交渉中です` : `${config.title}: お題${progress}で交渉中です`;
      }
      if (config.key === "territory-board-game") {
        const ownedCount = Object.keys(state.territory).length;
        return currentPlayer
          ? `${config.title}: ${ownedCount}/25マス取得済み、${currentPlayer.name}さんの番です`
          : `${config.title}: ${ownedCount}/25マス取得済みです`;
      }
      return currentPlayer ? `${config.title}: お題${progress}で${currentPlayer.name}さんの番です` : `${config.title}: お題${progress}で進行中です`;
    }
    if (isAnswerSyncableUrlCandidateKey(config.key)) {
      const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      if (config.key === "truth-lie-game") {
        const voters = currentPlayer ? state.players.filter((player) => player.id !== currentPlayer.id) : state.players;
        const votedCount = voters.filter((player) => state.votes[player.id]).length;
        return currentPlayer
          ? `${config.title}: お題${progress}で${currentPlayer.name}さんが話し手です (${votedCount}/${voters.length})`
          : `${config.title}: お題${progress}で投票中です (${votedCount}/${voters.length})`;
      }
      const answeredCount = state.players.filter((player) => state.guesses[player.id]?.trim() || state.votes[player.id]?.trim()).length;
      return `${config.title}: お題${progress}で回答中です (${answeredCount}/${state.players.length})`;
    }
    if (isActingSyncableUrlCandidateKey(config.key)) {
      const actor = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      const answerers = actor ? state.players.filter((player) => player.id !== actor.id) : state.players;
      const votedCount = answerers.filter((player) => state.votes[player.id]).length;
      return actor
        ? `${config.title}: お題${progress}で${actor.name}さんが演じています (${votedCount}/${answerers.length})`
        : `${config.title}: お題${progress}で感情を当てています (${votedCount}/${answerers.length})`;
    }
    if (isActionSyncableUrlCandidateKey(config.key)) {
      const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
      const secondPlayer = state.players[(state.currentPlayerIndex + 1) % Math.max(1, state.players.length)] ?? null;
      if (config.key === "count-up-game") {
        const prompt = config.prompts.find((item) => item.id === state.deckPromptIds[state.deckIndex]);
        const target = prompt?.targetNumber ?? 30;
        return currentPlayer
          ? `${config.title}: ${state.numberValue}/${target}まで進行中、${currentPlayer.name}さんの番です`
          : `${config.title}: ${state.numberValue}/${target}まで進行中です`;
      }
      if (config.key === "arm-wrestling-tournament") {
        return currentPlayer && secondPlayer
          ? `${config.title}: ${state.completedPairs}試合完了、${currentPlayer.name}さん VS ${secondPlayer.name}さん`
          : `${config.title}: ${state.completedPairs}試合完了です`;
      }
      return currentPlayer
        ? `${config.title}: ${state.drawnCount}/8枚、${currentPlayer.name}さんの番です`
        : `${config.title}: ${state.drawnCount}/8枚まで引きました`;
    }
    return `${config.title}: お題${progress}で進行中です`;
  }
  return `${config.title}が完了しました`;
}

function buildUrlCandidateRoomEnvelope(
  config: UrlCandidateGameConfig,
  urlCandidateState: UrlCandidateState,
  updatedBy: string | null,
): UrlCandidateRoomEnvelope {
  return {
    phase: urlCandidateState.step === "complete" ? "complete" : "playing",
    gameKey: config.key,
    gameTitle: config.title,
    step: getUrlCandidateProgressStep(urlCandidateState),
    message: describeUrlCandidateProgress(config, urlCandidateState),
    updatedBy,
    updatedAt: new Date().toISOString(),
    urlCandidate: {
      key: config.key,
      state: urlCandidateState,
    },
  };
}

function UrlCandidateGame({
  config,
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  config: UrlCandidateGameConfig;
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [privateAnswerVisible, setPrivateAnswerVisible] = useState(false);
  const [storedState, setStoredState] = useStoredState<UrlCandidateState>(config.key, initialUrlCandidateState);
  const supportsRoomSync = isRoomSyncableUrlCandidateKey(config.key);
  const roomUrlCandidateState = supportsRoomSync ? parseUrlCandidateStateFromRoom(roomSnapshot, config.key) : null;
  const isUrlCandidateRoom = Boolean(supportsRoomSync && roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === config.key));
  const activeUrlCandidateState = isUrlCandidateRoom ? (roomUrlCandidateState ?? initialUrlCandidateState) : storedState;
  const state = { ...initialUrlCandidateState, ...activeUrlCandidateState };
  const isRoomHost = isUrlCandidateRoom && roomSession?.participantRole === "host";
  const canControlUrlCandidate = !isUrlCandidateRoom || (isRoomHost && Boolean(roomSnapshot));
  const usesTurnSync = isTurnSyncableUrlCandidateKey(config.key);
  const usesGuessSync = isGuessSyncableUrlCandidateKey(config.key);
  const usesBoardSync = isBoardSyncableUrlCandidateKey(config.key);
  const usesAnswerSync = isAnswerSyncableUrlCandidateKey(config.key);
  const usesActingSync = isActingSyncableUrlCandidateKey(config.key);
  const usesActionSync = isActionSyncableUrlCandidateKey(config.key);
  const promptPool = useMemo(
    () => config.prompts.filter((prompt) => state.includeAdultTopics || prompt.rating === "normal"),
    [config.prompts, state.includeAdultTopics],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const prompt = config.prompts.find((item) => item.id === state.deckPromptIds[state.deckIndex]) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
  const hiddenAnswerText = prompt ? (prompt.answer ?? (usesGuessSync ? deriveAnswerFromPromptTitle(prompt.title) : undefined)) : undefined;
  const canActForCurrentUrlPlayer = !isUrlCandidateRoom || canControlUrlCandidate || roomSession?.participantId === currentPlayer?.id;
  const canPeekUrlAnswer = !isUrlCandidateRoom || canControlUrlCandidate || (usesGuessSync && roomSession?.participantId === currentPlayer?.id);
  const canRevealUrlAnswer = !isUrlCandidateRoom || canControlUrlCandidate || (usesGuessSync && canActForCurrentUrlPlayer);
  const canStart = state.players.length >= config.minPlayers && state.players.every((player) => player.name.trim());
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";
  const normalCount = config.prompts.filter((item) => item.rating === "normal").length;
  const adultCount = config.prompts.filter((item) => item.rating === "adult").length;

  function setState(nextStateOrUpdater: UrlCandidateState | ((current: UrlCandidateState) => UrlCandidateState)) {
    if (isUrlCandidateRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isUrlCandidateRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildUrlCandidateRoomEnvelope(config, nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: config.key,
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: config.key,
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!supportsRoomSync || !roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession, supportsRoomSync]);

  useEffect(() => {
    setPrivateAnswerVisible(false);
  }, [config.key, prompt?.id, roomSession?.participantId]);

  useEffect(() => {
    if (state.step === "play" && !prompt) {
      setState({
        ...state,
        step: "setup",
        deckPromptIds: [],
        deckIndex: 0,
        answerVisible: false,
        votes: {},
        guesses: {},
        resourceCounts: {},
      });
    }
  }, [prompt, setState, state.step]);

  function startUrlCandidateGame() {
    const deckPromptIds = shuffle([...promptPool])
      .slice(0, selectedQuestionCount)
      .map((item) => item.id);
    setState({
      ...state,
      step: "play",
      deckPromptIds,
      deckIndex: 0,
      answerVisible: false,
      currentPlayerIndex: 0,
      numberValue: 0,
      positions: createPlayerPositions(state.players),
      territory: {},
      drawnCount: 0,
      hazardIndex: createHazardIndex(),
      completedPairs: 0,
      actionLog: [],
      votes: {},
      safeCounts: createPlayerCountMap(state.players),
      missCounts: createPlayerCountMap(state.players),
      guesses: {},
      scoreCounts: createPlayerCountMap(state.players),
      resourceCounts: createPlayerResourceMap(state.players),
    });
  }

  function moveToNextUrlPrompt() {
    const nextIndex = state.deckIndex + 1;
    const shouldRotatePromptOwner = usesGuessSync || usesActingSync || config.key === "truth-lie-game";
    if (nextIndex >= state.deckPromptIds.length) {
      setState({ ...state, step: "complete", answerVisible: false, actionLog: [] });
      return;
    }
    setState({
      ...state,
      deckIndex: nextIndex,
      answerVisible: false,
      numberValue: 0,
      drawnCount: 0,
      hazardIndex: createHazardIndex(),
      actionLog: [],
      votes: {},
      guesses: {},
      currentPlayerIndex: shouldRotatePromptOwner ? (state.currentPlayerIndex + 1) % Math.max(1, state.players.length) : state.currentPlayerIndex,
      safeCounts: state.safeCounts,
      missCounts: state.missCounts,
      scoreCounts: state.scoreCounts,
      resourceCounts: state.resourceCounts,
    });
  }

  const canVoteForUrlPlayer = (playerId: string) =>
    !isUrlCandidateRoom || canControlUrlCandidate || roomSession?.participantId === playerId;

  return (
    <GameFrame title={config.title} subtitle={config.description} onHome={onHome} onResetAll={onResetAll}>
      {isUrlCandidateRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? usesTurnSync
                  ? "この端末が進行役です。参加者取り込み、手番、セーフ、アウト、次のお題を同期します。"
                  : usesGuessSync
                    ? "この端末が進行役です。参加者取り込み、親、回答、正解表示、次のお題を同期します。"
                    : usesBoardSync
                      ? "この端末が進行役です。参加者取り込み、手番、盤面、コマ、資源、次のお題を同期します。"
                    : usesAnswerSync
                      ? "この端末が進行役です。参加者取り込み、回答、集計、得点、次のお題を同期します。"
                      : usesActingSync
                        ? "この端末が進行役です。参加者取り込み、演者、感情、回答、結果表示、次のお題を同期します。"
                        : usesActionSync
                          ? "この端末が進行役です。参加者取り込み、手番、数字、カード、対戦結果、次のお題を同期します。"
                  : "この端末が進行役です。参加者取り込み、次のお題、完了を同期します。"
                : usesTurnSync
                  ? "この端末では自分の番だけセーフ、パス、アウト操作ができます。お題切り替えはホスト端末で行います。"
                  : usesGuessSync
                    ? "この端末では自分の回答を入力できます。親の番では答え確認と正解表示ができます。"
                    : usesBoardSync
                      ? "この端末では自分の番や自分の資源操作を行えます。盤面とお題切り替えは同期されます。"
                      : usesAnswerSync
                        ? "この端末では自分の回答だけ操作できます。集計とお題切り替えは同期されます。"
                        : usesActingSync
                          ? "この端末では演者の番なら感情を選び、回答者の番なら自分の回答だけ操作できます。"
                        : usesActionSync
                          ? "この端末では自分の番や自分が入っている対戦だけ操作できます。お題切り替えは同期されます。"
                  : "この端末では自分の投票だけ操作できます。集計とお題の進行は同期されます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>詳しい進め方</h3>
            <ol className="rule-list">
              {config.setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          {isUrlCandidateRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を{config.title}メンバーに使えます</strong>
              <p>
                {usesTurnSync
                  ? "参加者それぞれの端末で自分の番を操作するには、ルーム参加者を取り込んでください。"
                  : usesGuessSync
                    ? "親、回答者、正解表示を端末ごとに同期するには、ルーム参加者を取り込んでください。"
                    : usesBoardSync
                      ? "手番、盤面、コマ、資源を端末ごとに同期するには、ルーム参加者を取り込んでください。"
                      : usesAnswerSync
                        ? "回答、集計、得点を端末ごとに同期するには、ルーム参加者を取り込んでください。"
                        : usesActingSync
                          ? "演者、感情選択、回答、結果表示を端末ごとに同期するには、ルーム参加者を取り込んでください。"
                        : usesActionSync
                          ? "手番、数字、カード、対戦結果を端末ごとに同期するには、ルーム参加者を取り込んでください。"
                  : "参加者それぞれの端末で自分の投票をするには、ルーム参加者を取り込んでください。"}
              </p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      deckPromptIds: [],
                      deckIndex: 0,
                      answerVisible: false,
                      votes: {},
                      currentPlayerIndex: 0,
                      actionLog: [],
                      safeCounts: {},
                      missCounts: {},
                      guesses: {},
                      scoreCounts: {},
                      resourceCounts: {},
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      deckPromptIds: [],
                      deckIndex: 0,
                      answerVisible: false,
                      votes: {},
                      currentPlayerIndex: 0,
                      actionLog: [],
                      safeCounts: {},
                      missCounts: {},
                      guesses: {},
                      scoreCounts: {},
                      resourceCounts: {},
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlUrlCandidate ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={config.minPlayers}
                maxPlayers={config.maxPlayers}
                onChange={(players) =>
                  setState({
                    ...state,
                    players,
                    votes: {},
                    currentPlayerIndex: 0,
                    actionLog: [],
                    safeCounts: {},
                    missCounts: {},
                    guesses: {},
                    scoreCounts: {},
                    resourceCounts: {},
                  })
                }
              />

              <ToggleSwitch
                label="Hな話題"
                description={
                  state.includeAdultTopics
                    ? "ON: 夜の話題・恋バナ寄りのお題も混ぜます。答えにくければスキップできます。"
                    : "OFF: 通常のお題だけで遊びます。"
                }
                checked={state.includeAdultTopics}
                onChange={(includeAdultTopics) =>
                  setState({
                    ...state,
                    includeAdultTopics,
                    deckPromptIds: [],
                    deckIndex: 0,
                    answerVisible: false,
                    votes: {},
                    currentPlayerIndex: 0,
                    actionLog: [],
                    safeCounts: {},
                    missCounts: {},
                    guesses: {},
                    scoreCounts: {},
                    resourceCounts: {},
                  })
                }
              />

              <SegmentedControl
                label="今回の設問数"
                options={urlCandidateQuestionCountOptions}
                value={String(state.questionCount)}
                onChange={(questionCount) =>
                  setState({
                    ...state,
                    questionCount: Number(questionCount) as UrlCandidateQuestionCount,
                    deckPromptIds: [],
                    deckIndex: 0,
                    answerVisible: false,
                    votes: {},
                    currentPlayerIndex: 0,
                    actionLog: [],
                    safeCounts: {},
                    missCounts: {},
                    guesses: {},
                    scoreCounts: {},
                    resourceCounts: {},
                  })
                }
              />

              <p className="soft-note">
                通常{normalCount}問、大人向け{adultCount}問を搭載。現在は{promptPool.length}問から
                {selectedQuestionCount}問をランダムに使います。
              </p>

              {state.includeAdultTopics && (
                <div className="notice-panel">
                  <strong>Hな話題がONです</strong>
                  <p>露骨すぎる話、個人情報、相手が嫌がる深掘りは避けます。答えにくい場合は迷わずスキップしてください。</p>
                </div>
              )}
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">
                {usesTurnSync
                  ? "ホストが参加者を取り込み、お題を開始すると、この端末でも自分の番を操作できます。"
                  : usesGuessSync
                    ? "ホストが参加者を取り込み、お題を開始すると、この端末で回答できます。親の番では答えを確認できます。"
                    : usesBoardSync
                      ? "ホストが参加者を取り込み、お題を開始すると、この端末で自分の番や資源操作ができます。"
                      : usesAnswerSync
                        ? "ホストが参加者を取り込み、お題を開始すると、この端末で自分の回答を操作できます。"
                        : usesActingSync
                          ? "ホストが参加者を取り込み、お題を開始すると、演者は感情を選び、回答者は自分の回答を操作できます。"
                        : usesActionSync
                          ? "ホストが参加者を取り込み、お題を開始すると、この端末で自分の番を操作できます。"
                  : "ホストがお題を開始すると、この端末で自分の投票を選べます。"}
              </p>
            </div>
          )}

          <div className="howto-panel compact">
            <h3>判定と安全の目安</h3>
            <ul className="rule-list">
              {config.judgeTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={!canStart || selectedQuestionCount === 0 || !canControlUrlCandidate}
              onClick={startUrlCandidateGame}
            >
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlUrlCandidate} onClick={() => setState(initialUrlCandidateState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "play" && prompt && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              定番ゲーム {config.articleOrder} / お題 {progressLabel}
            </p>
            <h2>{prompt.title}</h2>
            <p>{prompt.instruction}</p>
            {currentPlayer && <p className="soft-note">現在の番: {currentPlayer.name}</p>}
          </div>

          {prompt.options && (
            <div className="option-list">
              {prompt.options.map((option, index) => (
                <span key={option}>{formatChoiceLabel(option, index)}</span>
              ))}
            </div>
          )}

          {prompt.tips.length > 0 && (
            <div className="chip-list">
              {prompt.tips.map((tip) => (
                <span key={tip}>{tip}</span>
              ))}
            </div>
          )}

          {config.answerMode === "open" && prompt.answer && (
            <div className="answer-panel">
              <strong>使う文・答え</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          {config.answerMode === "hidden" && hiddenAnswerText && (
            <div className="action-row">
              {usesGuessSync && isUrlCandidateRoom ? (
                <>
                  <button
                    className="secondary-button"
                    disabled={!canPeekUrlAnswer}
                    type="button"
                    onClick={() => setPrivateAnswerVisible(!privateAnswerVisible)}
                  >
                    {privateAnswerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    {privateAnswerVisible ? "自分の答え確認を閉じる" : "出題者だけ答えを見る"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canRevealUrlAnswer}
                    type="button"
                    onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
                  >
                    {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    {state.answerVisible ? "正解を隠す" : "正解を全員に表示"}
                  </button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  disabled={isUrlCandidateRoom && !canControlUrlCandidate}
                  onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
                >
                  {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  {state.answerVisible ? "答えを隠す" : "出題者だけ答えを見る"}
                </button>
              )}
            </div>
          )}

          {usesGuessSync && config.answerMode === "hidden" && hiddenAnswerText && privateAnswerVisible && canPeekUrlAnswer && !state.answerVisible && (
            <div className="answer-panel">
              <strong>出題者用の答え</strong>
              <p>{hiddenAnswerText}</p>
            </div>
          )}

          {config.answerMode === "hidden" && hiddenAnswerText && state.answerVisible && (
            <div className="answer-panel">
              <strong>{usesGuessSync && isUrlCandidateRoom ? "全員に表示中の正解" : "答え"}</strong>
              <p>{hiddenAnswerText}</p>
            </div>
          )}

          <UrlCandidateInteractionPanel
            config={config}
            prompt={prompt}
            state={state}
            setState={setState}
            canControl={canControlUrlCandidate}
            canActForCurrentPlayer={canActForCurrentUrlPlayer}
            canVoteForPlayer={canVoteForUrlPlayer}
            isRoomMode={isUrlCandidateRoom}
          />

          <div className="howto-panel compact">
            <h3>このゲームの進め方</h3>
            <ol className="rule-list">
              {config.playSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!canControlUrlCandidate} onClick={moveToNextUrlPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button
              className="secondary-button"
              disabled={!canControlUrlCandidate}
              onClick={() =>
                setState({
                  ...state,
                  step: "setup",
                  answerVisible: false,
                  votes: {},
                  currentPlayerIndex: 0,
                  actionLog: [],
                  safeCounts: {},
                  missCounts: {},
                  guesses: {},
                  scoreCounts: {},
                  resourceCounts: {},
                })
              }
            >
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlUrlCandidate && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Trophy size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          {usesTurnSync && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: セーフ{state.safeCounts[player.id] ?? 0} / アウト{state.missCounts[player.id] ?? 0}
                </span>
              ))}
            </div>
          )}
          {usesGuessSync && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
                </span>
              ))}
            </div>
          )}
          {usesActingSync && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
                </span>
              ))}
            </div>
          )}
          {usesActionSync && (config.kind === "hazard" || config.kind === "draw" || config.kind === "count-up") && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: セーフ{state.safeCounts[player.id] ?? 0} / アウト{state.missCounts[player.id] ?? 0}
                </span>
              ))}
            </div>
          )}
          {usesActionSync && config.kind === "tournament" && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: 勝利{state.scoreCounts[player.id] ?? 0}
                </span>
              ))}
            </div>
          )}
          {usesBoardSync && config.kind === "sugoroku" && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: {state.positions[player.id] ?? 0}マス
                </span>
              ))}
            </div>
          )}
          {usesBoardSync && config.kind === "territory" && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: {Object.values(state.territory).filter((ownerId) => ownerId === player.id).length}マス
                </span>
              ))}
            </div>
          )}
          {usesBoardSync && config.key === "resource-negotiation-game" && (
            <div className="score-list wide">
              {state.players.map((player) => (
                <span key={player.id}>
                  {player.name}: 資源{state.resourceCounts[player.id] ?? 3}
                </span>
              ))}
            </div>
          )}
          <p className="talk-cue">違う設問数やHな話題ON/OFFに変えると、同じゲームでも雰囲気を変えて遊べます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlUrlCandidate} onClick={startUrlCandidateGame}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button
              className="secondary-button"
              disabled={!canControlUrlCandidate}
              onClick={() =>
                setState({
                  ...state,
                  step: "setup",
                  votes: {},
                  currentPlayerIndex: 0,
                  actionLog: [],
                  safeCounts: {},
                  missCounts: {},
                  guesses: {},
                  scoreCounts: {},
                  resourceCounts: {},
                })
              }
            >
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

function UrlCandidateInteractionPanel({
  config,
  prompt,
  state,
  setState,
  canControl = true,
  canActForCurrentPlayer = true,
  canVoteForPlayer = () => true,
  isRoomMode = false,
}: {
  config: UrlCandidateGameConfig;
  prompt: UrlCandidatePrompt;
  state: UrlCandidateState;
  setState: (state: UrlCandidateState) => void;
  canControl?: boolean;
  canActForCurrentPlayer?: boolean;
  canVoteForPlayer?: (playerId: string) => boolean;
  isRoomMode?: boolean;
}) {
  const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
  const secondPlayer = state.players[(state.currentPlayerIndex + 1) % Math.max(1, state.players.length)] ?? null;

  function pushLog(message: string, nextState: Partial<UrlCandidateState> = {}) {
    setState({
      ...state,
      ...nextState,
      actionLog: [message, ...state.actionLog].slice(0, 8),
    });
  }

  function rotatePlayer(message: string) {
    pushLog(message, { currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length) });
  }

  function recordTurnResult(kind: "safe" | "miss" | "skip") {
    if (!currentPlayer || !canActForCurrentPlayer) return;
    const nextIndex = (state.currentPlayerIndex + 1) % Math.max(1, state.players.length);
    if (kind === "safe") {
      pushLog(`${currentPlayer.name}さんはセーフ。次の人へ進みます。`, {
        currentPlayerIndex: nextIndex,
        safeCounts: { ...state.safeCounts, [currentPlayer.id]: (state.safeCounts[currentPlayer.id] ?? 0) + 1 },
      });
      return;
    }
    if (kind === "miss") {
      pushLog(`${currentPlayer.name}さんはアウト。やさしく笑って次の人へ。`, {
        currentPlayerIndex: nextIndex,
        missCounts: { ...state.missCounts, [currentPlayer.id]: (state.missCounts[currentPlayer.id] ?? 0) + 1 },
      });
      return;
    }
    pushLog(`${currentPlayer.name}さんはパスしました。`, { currentPlayerIndex: nextIndex });
  }

  if (isVoteSyncableUrlCandidateKey(config.key) && prompt.options?.length) {
    const voteOptions = prompt.options.slice(0, 4);
    const tallyRows = voteOptions.map((option, index) => ({
      option,
      value: String(index),
      players: state.players.filter((player) => state.votes[player.id] === String(index)),
    }));
    const votedPlayers = state.players.filter((player) => state.votes[player.id]);
    const skippedPlayers = state.players.filter((player) => state.votes[player.id] === "skip");
    const total = tallyRows.reduce((sum, row) => sum + row.players.length, 0);
    const topCount = Math.max(0, ...tallyRows.map((row) => row.players.length));
    const winners = topCount === 0 ? [] : tallyRows.filter((row) => row.players.length === topCount);
    const allVoted = votedPlayers.length === state.players.length && state.players.length > 0;

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>投票同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の行だけ選べます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>票が出そろったら、多数派の理由と少数派の理由を1人ずつ聞きます。</li>
          </ul>
        </div>

        <div className="vote-list">
          {state.players.map((player) => (
            <div className="vote-row" key={player.id}>
              <strong>{player.name || "名前なし"}</strong>
              <div className="vote-buttons">
                {voteOptions.map((option, index) => (
                  <button
                    className={state.votes[player.id] === String(index) ? "selected-choice" : ""}
                    disabled={!canVoteForPlayer(player.id)}
                    key={option}
                    type="button"
                    onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}
                  >
                    {formatChoiceLabel(option, index)}
                  </button>
                ))}
                <button
                  className={state.votes[player.id] === "skip" ? "selected-choice muted" : ""}
                  disabled={!canVoteForPlayer(player.id)}
                  type="button"
                  onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: "skip" } })}
                >
                  パス
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="action-row">
          <span className="inline-status">{votedPlayers.length}/{state.players.length} 投票済み</span>
          {allVoted && winners.length > 0 && (
            <span className="inline-status">多数派: {winners.map((row) => row.option).join(" / ")}</span>
          )}
        </div>

        <div className="ranking-bars">
          {tallyRows.map((row) => (
            <ChoiceBar
              count={row.players.length}
              key={row.value}
              label={formatChoiceLabel(row.option, Number(row.value))}
              total={total}
            />
          ))}
        </div>

        {skippedPlayers.length > 0 && <p className="soft-note">パス: {skippedPlayers.map((player) => player.name).join("、")}</p>}

        <div className="split-result">
          {tallyRows.map((row, index) => (
            <NameCluster key={row.value} title={formatChoiceLabel(row.option, index)} players={row.players} />
          ))}
        </div>

        {isRoomMode && !canControl && <p className="soft-note">自分の投票だけ操作できます。次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (isTurnSyncableUrlCandidateKey(config.key)) {
    const scoreRows = state.players.map((player) => ({
      player,
      safe: state.safeCounts[player.id] ?? 0,
      miss: state.missCounts[player.id] ?? 0,
    }));

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>手番同期</h3>
          <ul className="rule-list">
            <li>各自の端末では、自分の番だけセーフ、パス、アウトを押せます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>アウトは責めずに、テンポよく次の人へ回します。</li>
          </ul>
        </div>

        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}

        {canActForCurrentPlayer ? (
          <div className="action-row centered">
            <button className="primary-button" type="button" onClick={() => recordTurnResult("safe")}>
              <Check size={18} />
              セーフ
            </button>
            <button className="secondary-button" type="button" onClick={() => recordTurnResult("skip")}>
              <ChevronRight size={18} />
              パス
            </button>
            <button className="danger-button" type="button" onClick={() => recordTurnResult("miss")}>
              <ShieldAlert size={18} />
              アウト
            </button>
          </div>
        ) : (
          <div className="howto-panel compact">
            <h3>{currentPlayer?.name ?? "次の人"}さんの番です</h3>
            <p className="soft-note">この端末では待機中です。自分の番になると操作できます。</p>
          </div>
        )}

        <div className="score-list wide">
          {scoreRows.map(({ player, safe, miss }) => (
            <span key={player.id}>
              {player.name}: セーフ{safe} / アウト{miss}
            </span>
          ))}
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (isGuessSyncableUrlCandidateKey(config.key)) {
    const parent = currentPlayer;
    const answerers = parent ? state.players.filter((player) => player.id !== parent.id) : state.players;
    const answeredPlayers = answerers.filter((player) => state.guesses[player.id]?.trim());
    const correctPlayers = answerers.filter((player) => state.votes[player.id] === "correct");
    const canJudgeGuess = canControl || canActForCurrentPlayer;

    function updateGuess(playerId: string, guess: string) {
      if (!canVoteForPlayer(playerId)) return;
      setState({ ...state, guesses: { ...state.guesses, [playerId]: guess } });
    }

    function markGuessCorrect(player: Player) {
      if (!canJudgeGuess || state.votes[player.id] === "correct") return;
      const guess = state.guesses[player.id]?.trim();
      pushLog(`${player.name}さんが正解${guess ? `: ${guess}` : ""}。`, {
        answerVisible: true,
        votes: { ...state.votes, [player.id]: "correct" },
        scoreCounts: { ...state.scoreCounts, [player.id]: (state.scoreCounts[player.id] ?? 0) + 1 },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>回答同期</h3>
          <ul className="rule-list">
            <li>今回の親だけが答えを確認し、絵、鼻歌、ヒントで伝えます。</li>
            <li>回答者は各自の端末で自分の回答を入力できます。</li>
            <li>ホストまたは親が正解を付けると、得点と正解表示が同期されます。</li>
          </ul>
        </div>

        {parent && (
          <div className="turn-callout">
            <span>今回の親</span>
            <strong>{parent.name}</strong>
          </div>
        )}

        <div className="guess-list">
          {answerers.map((player) => {
            const guess = state.guesses[player.id] ?? "";
            const isCorrect = state.votes[player.id] === "correct";
            return (
              <div className="guess-row" key={player.id}>
                <strong>{player.name}</strong>
                <input
                  aria-label={`${player.name}の回答`}
                  disabled={!canVoteForPlayer(player.id) || isCorrect}
                  onChange={(event) => updateGuess(player.id, event.currentTarget.value)}
                  placeholder="回答を入力"
                  value={guess}
                />
                <button
                  className={isCorrect ? "selected-choice" : "secondary-button"}
                  disabled={!canJudgeGuess || isCorrect || !guess.trim()}
                  type="button"
                  onClick={() => markGuessCorrect(player)}
                >
                  {isCorrect ? "正解済み" : "正解"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="action-row">
          <span className="inline-status">
            回答 {answeredPlayers.length}/{answerers.length}
          </span>
          <span className="inline-status">
            正解 {correctPlayers.length}
          </span>
          {canJudgeGuess && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => pushLog("このお題は正解なしで流しました。", { answerVisible: true })}
            >
              正解なしで流す
            </button>
          )}
        </div>

        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (isActingSyncableUrlCandidateKey(config.key)) {
    const actor = currentPlayer;
    const answerers = actor ? state.players.filter((player) => player.id !== actor.id) : state.players;
    const emotionOptions = prompt.options?.slice(0, 4) ?? ["うれしい", "照れている", "焦っている", "余裕がある"];
    const emotionKey = "actingEmotion";
    const selectedEmotion = state.guesses[emotionKey] ?? "";
    const canSelectEmotion = canControl || canActForCurrentPlayer;
    const votedPlayers = answerers.filter((player) => state.votes[player.id]);
    const correctPlayers = selectedEmotion ? answerers.filter((player) => state.votes[player.id] === selectedEmotion) : [];
    const missedPlayers = selectedEmotion
      ? answerers.filter((player) => state.votes[player.id] && state.votes[player.id] !== selectedEmotion && state.votes[player.id] !== "skip")
      : [];

    function revealActingResult() {
      if (!canSelectEmotion || !selectedEmotion || state.answerVisible) return;
      const nextScoreCounts = { ...state.scoreCounts };
      correctPlayers.forEach((player) => {
        nextScoreCounts[player.id] = (nextScoreCounts[player.id] ?? 0) + 1;
      });
      const label = emotionOptions[Number(selectedEmotion)] ?? "選んだ感情";
      pushLog(`正解は「${label}」。正解は${correctPlayers.length}人でした。`, {
        answerVisible: true,
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>演技同期</h3>
          <ul className="rule-list">
            <li>今回の演者だけが、演じる感情を選びます。</li>
            <li>回答者は各自の端末で、どの感情だと思うかを選びます。</li>
            <li>演者またはホストが結果を出すと、正解表示と得点が同期されます。</li>
          </ul>
        </div>

        {actor && (
          <div className="turn-callout">
            <span>今回の演者</span>
            <strong>{actor.name}</strong>
          </div>
        )}

        <div className="answer-sync-list">
          <div className="answer-sync-row">
            <strong>演者の感情</strong>
            <div className="vote-buttons">
              {emotionOptions.map((option, index) => (
                <button
                  className={(canSelectEmotion || state.answerVisible) && selectedEmotion === String(index) ? "selected-choice" : "secondary-button"}
                  disabled={!canSelectEmotion || state.answerVisible}
                  key={option}
                  type="button"
                  onClick={() => setState({ ...state, guesses: { ...state.guesses, [emotionKey]: String(index) } })}
                >
                  {formatChoiceLabel(option, index)}
                </button>
              ))}
            </div>
            {!canSelectEmotion && !state.answerVisible && selectedEmotion && <span className="inline-status">選択済み</span>}
          </div>

          {answerers.map((player) => (
            <div className="answer-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="vote-buttons">
                {emotionOptions.map((option, index) => (
                  <button
                    className={state.votes[player.id] === String(index) ? "selected-choice" : "secondary-button"}
                    disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                    key={option}
                    type="button"
                    onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}
                  >
                    {formatChoiceLabel(option, index)}
                  </button>
                ))}
                <button
                  className={state.votes[player.id] === "skip" ? "selected-choice muted" : "secondary-button"}
                  disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                  type="button"
                  onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: "skip" } })}
                >
                  パス
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="action-row">
          <span className="inline-status">
            回答 {votedPlayers.length}/{answerers.length}
          </span>
          {state.answerVisible && selectedEmotion && (
            <span className="inline-status">正解: {emotionOptions[Number(selectedEmotion)] ?? "選んだ感情"}</span>
          )}
          <button className="primary-button" disabled={!canSelectEmotion || !selectedEmotion || state.answerVisible} type="button" onClick={revealActingResult}>
            <Check size={18} />
            結果を出す
          </button>
        </div>

        {state.answerVisible && selectedEmotion && (
          <div className="split-result">
            <NameCluster title="正解" players={correctPlayers} />
            <NameCluster title="惜しい" players={missedPlayers} />
            <NameCluster title="パス" players={answerers.filter((player) => state.votes[player.id] === "skip")} />
          </div>
        )}

        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.key === "truth-lie-game") {
    const speaker = currentPlayer;
    const voters = speaker ? state.players.filter((player) => player.id !== speaker.id) : state.players;
    const lieOptions = prompt.options?.slice(0, 3) ?? ["1つ目が嘘", "2つ目が嘘", "3つ目が嘘"];
    const answerKey = "truthLieAnswer";
    const answerChoice = state.guesses[answerKey] ?? "";
    const canJudgeTruthLie = canControl || canActForCurrentPlayer;
    const votedPlayers = voters.filter((player) => state.votes[player.id]);
    const correctPlayers = answerChoice ? voters.filter((player) => state.votes[player.id] === answerChoice) : [];

    function revealTruthLieResult() {
      if (!canJudgeTruthLie || !answerChoice || state.answerVisible) return;
      const nextScoreCounts = { ...state.scoreCounts };
      correctPlayers.forEach((player) => {
        nextScoreCounts[player.id] = (nextScoreCounts[player.id] ?? 0) + 1;
      });
      pushLog(`嘘は${Number(answerChoice) + 1}つ目。正解は${correctPlayers.length}人でした。`, {
        answerVisible: true,
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>嘘当て同期</h3>
          <ul className="rule-list">
            <li>話し手は3つの話を出し、どれが嘘かを選びます。</li>
            <li>聞き手は各自の端末で嘘だと思う番号を選びます。</li>
            <li>話し手またはホストが結果を出すと、正解者と得点が同期されます。</li>
          </ul>
        </div>

        {speaker && (
          <div className="turn-callout">
            <span>今回の話し手</span>
            <strong>{speaker.name}</strong>
          </div>
        )}

        <div className="answer-sync-list">
          <div className="answer-sync-row">
            <strong>正解設定</strong>
            <div className="vote-buttons">
              {lieOptions.map((option, index) => (
                <button
                  className={answerChoice === String(index) ? "selected-choice" : "secondary-button"}
                  disabled={!canJudgeTruthLie || state.answerVisible}
                  key={option}
                  type="button"
                  onClick={() => setState({ ...state, guesses: { ...state.guesses, [answerKey]: String(index) } })}
                >
                  {formatChoiceLabel(option, index)}
                </button>
              ))}
            </div>
          </div>

          {voters.map((player) => (
            <div className="answer-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="vote-buttons">
                {lieOptions.map((option, index) => (
                  <button
                    className={state.votes[player.id] === String(index) ? "selected-choice" : "secondary-button"}
                    disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                    key={option}
                    type="button"
                    onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}
                  >
                    {formatChoiceLabel(option, index)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="action-row">
          <span className="inline-status">
            投票 {votedPlayers.length}/{voters.length}
          </span>
          {state.answerVisible && answerChoice && <span className="inline-status">正解 {correctPlayers.length}人</span>}
          <button className="primary-button" disabled={!canJudgeTruthLie || !answerChoice || state.answerVisible} type="button" onClick={revealTruthLieResult}>
            <Check size={18} />
            結果を出す
          </button>
        </div>

        {state.answerVisible && answerChoice && (
          <div className="split-result">
            <NameCluster title="正解" players={correctPlayers} />
            <NameCluster title="惜しい" players={voters.filter((player) => state.votes[player.id] && state.votes[player.id] !== answerChoice)} />
          </div>
        )}

        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.key === "value-meter-game") {
    const rows = state.players.map((player) => ({
      player,
      clue: state.guesses[player.id] ?? "",
      value: state.votes[player.id] ?? "",
    }));
    const answeredRows = rows.filter((row) => row.clue.trim() || row.value.trim());
    const sortedRows = rows
      .filter((row) => row.value.trim() && Number.isFinite(Number(row.value)))
      .sort((a, b) => Number(a.value) - Number(b.value));

    function updateMeter(playerId: string, nextValue: string, nextClue: string) {
      if (!canVoteForPlayer(playerId)) return;
      setState({
        ...state,
        votes: { ...state.votes, [playerId]: nextValue },
        guesses: { ...state.guesses, [playerId]: nextClue },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>メーター同期</h3>
          <ul className="rule-list">
            <li>各自が1から100の数字と、数字を言わない例えを入力します。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>出そろったら並び順を表示して、ズレた理由を楽しみます。</li>
          </ul>
        </div>

        <div className="meter-sync-list">
          {rows.map(({ player, clue, value }) => (
            <div className="meter-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <input
                aria-label={`${player.name}の数字`}
                disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                inputMode="numeric"
                max={100}
                min={1}
                onChange={(event) => updateMeter(player.id, event.currentTarget.value, clue)}
                placeholder="1-100"
                type="number"
                value={value}
              />
              <input
                aria-label={`${player.name}の例え`}
                disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                onChange={(event) => updateMeter(player.id, value, event.currentTarget.value)}
                placeholder="数字を言わずに例える"
                value={clue}
              />
            </div>
          ))}
        </div>

        <div className="action-row">
          <span className="inline-status">
            入力 {answeredRows.length}/{state.players.length}
          </span>
          <button
            className="primary-button"
            disabled={!canControl && isRoomMode}
            type="button"
            onClick={() => pushLog("価値観メーターの並び順を表示しました。", { answerVisible: true })}
          >
            <Check size={18} />
            並び順を表示
          </button>
        </div>

        {state.answerVisible && (
          <div className="answer-panel wide">
            <strong>小さい順</strong>
            <p>{sortedRows.length > 0 ? sortedRows.map((row) => `${row.player.name} ${row.value}: ${row.clue || "例えなし"}`).join(" / ") : "まだ数字がありません"}</p>
          </div>
        )}

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">並び順表示と次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.key === "typing-speed-game") {
    const answeredPlayers = state.players.filter((player) => state.guesses[player.id]?.trim());
    const correctPlayers = state.players.filter((player) => state.votes[player.id] === "correct");

    function updateTypingAnswer(playerId: string, answer: string) {
      if (!canVoteForPlayer(playerId)) return;
      setState({ ...state, guesses: { ...state.guesses, [playerId]: answer } });
    }

    function markTypingCorrect(player: Player) {
      if ((!canVoteForPlayer(player.id) && !canControl) || state.votes[player.id] === "correct") return;
      pushLog(`${player.name}さんは誤字なしで入力完了。`, {
        votes: { ...state.votes, [player.id]: "correct" },
        scoreCounts: { ...state.scoreCounts, [player.id]: (state.scoreCounts[player.id] ?? 0) + 1 },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>早打ち同期</h3>
          <ul className="rule-list">
            <li>各自が入力できた文を自分の欄に入れます。</li>
            <li>誤字なしなら、本人またはホストが誤字なしを押します。</li>
            <li>誤字なしの人数と得点が全端末に同期されます。</li>
          </ul>
        </div>

        <div className="typing-sync-list">
          {state.players.map((player) => {
            const answer = state.guesses[player.id] ?? "";
            const isCorrect = state.votes[player.id] === "correct";
            return (
              <div className="typing-sync-row" key={player.id}>
                <strong>{player.name}</strong>
                <input
                  aria-label={`${player.name}の入力文`}
                  disabled={!canVoteForPlayer(player.id) || isCorrect}
                  onChange={(event) => updateTypingAnswer(player.id, event.currentTarget.value)}
                  placeholder="入力した文"
                  value={answer}
                />
                <button
                  className={isCorrect ? "selected-choice" : "secondary-button"}
                  disabled={isCorrect || !answer.trim() || (!canVoteForPlayer(player.id) && !canControl)}
                  type="button"
                  onClick={() => markTypingCorrect(player)}
                >
                  {isCorrect ? "誤字なし" : "誤字なし"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="action-row">
          <span className="inline-status">
            入力 {answeredPlayers.length}/{state.players.length}
          </span>
          <span className="inline-status">誤字なし {correctPlayers.length}</span>
        </div>

        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 正解{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.key === "resource-negotiation-game") {
    const canAdvanceNegotiator = canControl || canActForCurrentPlayer;

    function adjustResource(player: Player, delta: number) {
      if (!canVoteForPlayer(player.id)) return;
      const nextValue = Math.max(0, (state.resourceCounts[player.id] ?? 3) + delta);
      pushLog(`${player.name}さんの資源を${nextValue}にしました。`, {
        resourceCounts: { ...state.resourceCounts, [player.id]: nextValue },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>資源同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の資源だけ増減できます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>交渉がまとまったら、次の交渉者へ進めます。</li>
          </ul>
        </div>

        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の交渉者</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}

        <div className="resource-list">
          {state.players.map((player) => {
            const value = state.resourceCounts[player.id] ?? 3;
            return (
              <div className="resource-row" key={player.id}>
                <strong>{player.name}</strong>
                <span>資源 {value}</span>
                <div className="resource-actions">
                  <button className="secondary-button" disabled={!canVoteForPlayer(player.id)} type="button" onClick={() => adjustResource(player, -1)}>
                    -1
                  </button>
                  <button className="secondary-button" disabled={!canVoteForPlayer(player.id)} type="button" onClick={() => adjustResource(player, 1)}>
                    +1
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="action-row centered">
          <button
            className="primary-button"
            disabled={!currentPlayer || !canAdvanceNegotiator}
            type="button"
            onClick={() => currentPlayer && rotatePlayer(`${currentPlayer.name}さんの交渉を記録し、次の人へ進みます。`)}
          >
            <ChevronRight size={18} />
            次の交渉者へ
          </button>
        </div>

        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">全員分の代行入力と次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.kind === "count-up") {
    const target = prompt.targetNumber ?? 30;
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>数字同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の番だけ数字を進められます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>現在の数字、アウト、次の番は全端末に同期されます。</li>
          </ul>
        </div>
        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}
        <div className="url-counter">
          <span>現在</span>
          <strong>{state.numberValue}</strong>
          <span>目標 {target}</span>
        </div>
        <div className="action-row centered">
          {[1, 2, 3].map((step) => (
            <button
              className="secondary-button"
              disabled={!currentPlayer || !canActForCurrentPlayer || state.numberValue >= target}
              key={step}
              type="button"
              onClick={() => {
                if (!currentPlayer) return;
                const nextValue = state.numberValue + step;
                const nextIndex = (state.currentPlayerIndex + 1) % Math.max(1, state.players.length);
                const isMiss = nextValue >= target;
                const message =
                  isMiss
                    ? `${currentPlayer.name}さんが${target}以上に到達。アウトとして笑って次へ。`
                    : `${currentPlayer.name}さんが${nextValue}まで進めました。`;
                pushLog(message, {
                  numberValue: Math.min(nextValue, target),
                  currentPlayerIndex: nextIndex,
                  safeCounts: isMiss ? state.safeCounts : { ...state.safeCounts, [currentPlayer.id]: (state.safeCounts[currentPlayer.id] ?? 0) + 1 },
                  missCounts: isMiss ? { ...state.missCounts, [currentPlayer.id]: (state.missCounts[currentPlayer.id] ?? 0) + 1 } : state.missCounts,
                });
              }}
            >
              +{step}
            </button>
          ))}
          <button
            className="secondary-button"
            disabled={!canControl && isRoomMode}
            type="button"
            onClick={() => pushLog("数字を0に戻しました。", { numberValue: 0 })}
          >
            <RotateCcw size={18} />
            数字を戻す
          </button>
        </div>
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: セーフ{state.safeCounts[player.id] ?? 0} / アウト{state.missCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">数字リセットと次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.kind === "hazard" || config.kind === "draw") {
    const nextDraw = state.drawnCount + 1;
    const isHazard = nextDraw === state.hazardIndex;
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>カード同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の番だけカードを引けます。</li>
            <li>はずれ位置、引いた枚数、セーフ/アウトの記録は全端末に同期されます。</li>
            <li>混ぜ直しは進行役が行います。</li>
          </ul>
        </div>
        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}
        <div className="draw-status">
          <strong>{state.drawnCount}/8枚</strong>
          <span>1枚だけはずれがあります</span>
        </div>
        <div className="action-row centered">
          <button
            className={isHazard ? "danger-button" : "primary-button"}
            disabled={!currentPlayer || !canActForCurrentPlayer || state.drawnCount >= 8}
            type="button"
            onClick={() => {
              if (!currentPlayer) return;
              const nextIndex = (state.currentPlayerIndex + 1) % Math.max(1, state.players.length);
              const message = isHazard
                ? `${currentPlayer.name}さんがはずれ。安全な一言お題で場を温めます。`
                : `${currentPlayer.name}さんはセーフ。`;
              pushLog(message, {
                drawnCount: nextDraw,
                currentPlayerIndex: nextIndex,
                safeCounts: isHazard ? state.safeCounts : { ...state.safeCounts, [currentPlayer.id]: (state.safeCounts[currentPlayer.id] ?? 0) + 1 },
                missCounts: isHazard ? { ...state.missCounts, [currentPlayer.id]: (state.missCounts[currentPlayer.id] ?? 0) + 1 } : state.missCounts,
              });
            }}
          >
            <ShieldAlert size={18} />
            1枚引く
          </button>
          <button
            className="secondary-button"
            disabled={!canControl && isRoomMode}
            type="button"
            onClick={() => pushLog("カードを混ぜ直しました。", { drawnCount: 0, hazardIndex: createHazardIndex() })}
          >
            <RotateCcw size={18} />
            混ぜ直す
          </button>
        </div>
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: セーフ{state.safeCounts[player.id] ?? 0} / はずれ{state.missCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">混ぜ直しと次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.kind === "sugoroku") {
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>コマ同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の番だけサイコロを振れます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>コマ位置は全端末に同期されます。</li>
          </ul>
        </div>
        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}
        <div className="position-list">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: {state.positions[player.id] ?? 0}マス
            </span>
          ))}
        </div>
        <div className="action-row centered">
          <button
            className="primary-button"
            disabled={!currentPlayer || !canActForCurrentPlayer}
            onClick={() => {
              if (!currentPlayer) return;
              const roll = Math.floor(Math.random() * 6) + 1;
              const nextPosition = (state.positions[currentPlayer.id] ?? 0) + roll;
              pushLog(`${currentPlayer.name}さんが${roll}を出して${nextPosition}マスへ。`, {
                positions: { ...state.positions, [currentPlayer.id]: nextPosition },
                currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
              });
            }}
          >
            <Play size={18} />
            サイコロを振る
          </button>
        </div>
        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.kind === "territory") {
    const cells = Array.from({ length: 25 }, (_, index) => String(index));
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>盤面同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の番だけマスを選べます。</li>
            <li>ホスト端末では全員分を代行入力できます。</li>
            <li>取ったマスは全端末に同期されます。</li>
          </ul>
        </div>
        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}
        <p className="soft-note">{currentPlayer ? `${currentPlayer.name}さんが取るマスを選びます。` : "参加者が必要です。"}</p>
        <div className="territory-grid">
          {cells.map((cell) => {
            const ownerId = state.territory[cell];
            const owner = state.players.find((player) => player.id === ownerId);
            return (
              <button
                key={cell}
                className={owner ? "owned" : ""}
                disabled={Boolean(owner) || !currentPlayer || !canActForCurrentPlayer}
                onClick={() => {
                  if (!currentPlayer) return;
                  pushLog(`${currentPlayer.name}さんが${Number(cell) + 1}番のマスを取りました。`, {
                    territory: { ...state.territory, [cell]: currentPlayer.id },
                    currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
                  });
                }}
              >
                {owner ? owner.name.slice(0, 2) : Number(cell) + 1}
              </button>
            );
          })}
        </div>
        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  if (config.kind === "tournament") {
    const canRecordMatch = Boolean(
      currentPlayer &&
        secondPlayer &&
        (canControl || canVoteForPlayer(currentPlayer.id) || canVoteForPlayer(secondPlayer.id))
    );
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>対戦同期</h3>
          <ul className="rule-list">
            <li>現在の対戦カードと勝者は全端末に同期されます。</li>
            <li>参加者端末では、自分が入っている対戦だけ結果を記録できます。</li>
            <li>痛みや違和感があれば、勝敗より中止を優先します。</li>
          </ul>
        </div>
        <div className="matchup-panel">
          <span>{currentPlayer?.name ?? "参加者A"}</span>
          <strong>VS</strong>
          <span>{secondPlayer?.name ?? "参加者B"}</span>
        </div>
        <div className="action-row centered">
          {[currentPlayer, secondPlayer].filter(Boolean).map((player) => (
            <button
              className="primary-button"
              disabled={!canRecordMatch}
              key={player!.id}
              type="button"
              onClick={() =>
                pushLog(`${player!.name}さんが勝ち。無理なく拍手で次の対戦へ。`, {
                  currentPlayerIndex: (state.currentPlayerIndex + 2) % Math.max(1, state.players.length),
                  completedPairs: state.completedPairs + 1,
                  scoreCounts: { ...state.scoreCounts, [player!.id]: (state.scoreCounts[player!.id] ?? 0) + 1 },
                })
              }
            >
              {player!.name}が勝ち
            </button>
          ))}
        </div>
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 勝利{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
        {isRoomMode && !canControl && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
      </div>
    );
  }

  const actionLabelByKind: Partial<Record<UrlCandidateGameKind, string>> = {
    drawing: "描き終わった",
    typing: "入力できた",
    value: "並べ終わった",
    acting: "演じ終わった",
  };
  const label = actionLabelByKind[config.kind] ?? "成功で次の人";

  return (
    <div className="url-interaction-panel">
      <div className="action-row centered">
        <button
          className="primary-button"
          onClick={() => currentPlayer && rotatePlayer(`${currentPlayer.name}さん: ${label}`)}
        >
          <Check size={18} />
          {label}
        </button>
        <button
          className="secondary-button"
          onClick={() => currentPlayer && rotatePlayer(`${currentPlayer.name}さんはスキップしました。`)}
        >
          <ChevronRight size={18} />
          スキップ
        </button>
      </div>
      <UrlActionLog logs={state.actionLog} />
    </div>
  );
}

function UrlActionLog({ logs }: { logs: readonly string[] }) {
  if (logs.length === 0) {
    return <EmptyState text="まだ記録はありません" />;
  }
  return (
    <div className="url-action-log">
      {logs.map((log, index) => (
        <span key={`${log}-${index}`}>{log}</span>
      ))}
    </div>
  );
}

type WerewolfRole = "werewolf" | "villager" | "seer" | "knight" | "medium";
type WerewolfPhase = "setup" | "reveal" | "night" | "day" | "vote" | "voteResult" | "result";
type WerewolfNightStep = "werewolf" | "seer" | "knight" | "medium" | "dawn";
type WerewolfWinner = "village" | "werewolves";

type WerewolfAssignment = {
  playerId: string;
  role: WerewolfRole;
  alive: boolean;
};

type WerewolfState = {
  players: Player[];
  phase: WerewolfPhase;
  assignments: WerewolfAssignment[];
  revealIndex: number;
  revealVisible: boolean;
  dayNumber: number;
  discussionSeconds: number;
  remainingSeconds: number;
  timerRunning: boolean;
  timerEndsAt: string | null;
  nightStep: WerewolfNightStep;
  werewolfTargetId: string | null;
  seerTargetId: string | null;
  knightTargetId: string | null;
  mediumChecked: boolean;
  lastExecutedId: string | null;
  lastKilledId: string | null;
  morningMessage: string;
  votes: Record<string, string>;
  voteIndex: number;
  tiedTargetIds: string[];
  winner: WerewolfWinner | null;
  resultReason: string;
  actionLog: string[];
};

const werewolfRoleOrder: readonly WerewolfRole[] = ["werewolf", "seer", "knight", "medium", "villager"];

const werewolfRoleLabels: Record<WerewolfRole, string> = {
  werewolf: "人狼",
  villager: "村人",
  seer: "占い師",
  knight: "騎士",
  medium: "霊媒師",
};

const werewolfRoleDescriptions: Record<WerewolfRole, string> = {
  werewolf: "夜に仲間と相談し、襲撃する相手を1人選びます。昼は正体を隠して村人側に紛れ込みます。",
  villager: "特殊能力はありません。昼の話し合いで矛盾や反応を見て、人狼を探します。",
  seer: "夜に1人を占い、その人が人狼かどうかを知ることができます。",
  knight: "夜に1人を守ります。守った相手が襲撃された場合、その夜は誰も脱落しません。",
  medium: "夜に、直前の昼に追放された人が人狼だったかどうかを確認できます。",
};

const werewolfDiscussionTimeOptions: SegmentedOption<"180" | "300" | "420">[] = [
  { value: "180", label: "3分" },
  { value: "300", label: "5分" },
  { value: "420", label: "7分" },
];

const initialWerewolfState: WerewolfState = {
  players: [],
  phase: "setup",
  assignments: [],
  revealIndex: 0,
  revealVisible: false,
  dayNumber: 1,
  discussionSeconds: 300,
  remainingSeconds: 300,
  timerRunning: false,
  timerEndsAt: null,
  nightStep: "werewolf",
  werewolfTargetId: null,
  seerTargetId: null,
  knightTargetId: null,
  mediumChecked: false,
  lastExecutedId: null,
  lastKilledId: null,
  morningMessage: "",
  votes: {},
  voteIndex: 0,
  tiedTargetIds: [],
  winner: null,
  resultReason: "",
  actionLog: [],
};

function getWerewolfRoleDeck(playerCount: number): WerewolfRole[] {
  const roles: WerewolfRole[] =
    playerCount <= 6
      ? ["werewolf", "seer", "knight"]
      : playerCount <= 8
        ? ["werewolf", "werewolf", "seer", "knight"]
        : playerCount <= 10
          ? ["werewolf", "werewolf", "seer", "knight", "medium"]
          : ["werewolf", "werewolf", "werewolf", "seer", "knight", "medium"];
  const villagerCount = Math.max(0, playerCount - roles.length);
  return [...roles, ...Array.from({ length: villagerCount }, () => "villager" as const)];
}

function countWerewolfRoles(roles: readonly WerewolfRole[]) {
  return werewolfRoleOrder.map((role) => ({
    role,
    count: roles.filter((item) => item === role).length,
  }));
}

function createWerewolfAssignments(players: Player[]) {
  const roles = shuffle(getWerewolfRoleDeck(players.length));
  return players.map((player, index) => ({
    playerId: player.id,
    role: roles[index],
    alive: true,
  })) satisfies WerewolfAssignment[];
}

function getWerewolfAssignment(assignments: readonly WerewolfAssignment[], playerId: string) {
  return assignments.find((assignment) => assignment.playerId === playerId) ?? null;
}

function getWerewolfPlayerName(players: readonly Player[], playerId: string | null) {
  if (!playerId) return "該当者なし";
  return players.find((player) => player.id === playerId)?.name ?? "該当者なし";
}

function hasAliveWerewolfRole(assignments: readonly WerewolfAssignment[], role: WerewolfRole) {
  return assignments.some((assignment) => assignment.alive && assignment.role === role);
}

function getAliveWerewolfPlayers(players: readonly Player[], assignments: readonly WerewolfAssignment[]) {
  return players.filter((player) => getWerewolfAssignment(assignments, player.id)?.alive);
}

function getWerewolfOutcome(assignments: readonly WerewolfAssignment[]) {
  const alive = assignments.filter((assignment) => assignment.alive);
  const werewolves = alive.filter((assignment) => assignment.role === "werewolf").length;
  const villagers = alive.length - werewolves;
  if (werewolves === 0) {
    return { winner: "village" as const, reason: "人狼を全員追放しました。" };
  }
  if (werewolves >= villagers) {
    return { winner: "werewolves" as const, reason: "人狼の数が村人側以上になりました。" };
  }
  return null;
}

function markWerewolfPlayerDead(assignments: readonly WerewolfAssignment[], playerId: string) {
  return assignments.map((assignment) =>
    assignment.playerId === playerId ? { ...assignment, alive: false } : assignment,
  );
}

function getNextWerewolfNightStep(
  currentStep: WerewolfNightStep,
  assignments: readonly WerewolfAssignment[],
  lastExecutedId: string | null,
): WerewolfNightStep {
  const order: readonly WerewolfNightStep[] = ["werewolf", "seer", "knight", "medium", "dawn"];
  const startIndex = order.indexOf(currentStep) + 1;
  for (const step of order.slice(startIndex)) {
    if (step === "seer" && !hasAliveWerewolfRole(assignments, "seer")) continue;
    if (step === "knight" && !hasAliveWerewolfRole(assignments, "knight")) continue;
    if (step === "medium" && (!hasAliveWerewolfRole(assignments, "medium") || !lastExecutedId)) continue;
    return step;
  }
  return "dawn";
}

function tallyWerewolfVotes(votes: Record<string, string>, candidates: readonly Player[]) {
  const rows = candidates.map((player) => ({
    player,
    count: Object.values(votes).filter((targetId) => targetId === player.id).length,
  }));
  const maxVotes = Math.max(0, ...rows.map((row) => row.count));
  const topTargetIds = rows.filter((row) => row.count === maxVotes && maxVotes > 0).map((row) => row.player.id);
  return { rows, maxVotes, topTargetIds };
}

type WerewolfRoomEnvelope = RoomProgressState & {
  werewolf?: WerewolfState;
};

function parseWerewolfStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "werewolf-game") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<WerewolfRoomEnvelope>) : {};
  return state.werewolf && typeof state.werewolf === "object" ? ({ ...initialWerewolfState, ...state.werewolf } as WerewolfState) : null;
}

function getWerewolfProgressStep(state: WerewolfState) {
  const phaseOrder: Record<WerewolfPhase, number> = {
    setup: 1,
    reveal: 2,
    night: 3,
    day: 4,
    vote: 5,
    voteResult: 6,
    result: 7,
  };
  return phaseOrder[state.phase];
}

function describeWerewolfProgress(state: WerewolfState) {
  if (state.phase === "setup") return "人狼ゲームの準備中です";
  if (state.phase === "reveal") return "役職確認中です";
  if (state.phase === "night") return `夜${state.dayNumber}: ${werewolfNightStepLabel(state.nightStep)}を処理中です`;
  if (state.phase === "day") return `昼${state.dayNumber}: 話し合い中です`;
  if (state.phase === "vote") return "投票中です";
  if (state.phase === "voteResult") return "投票結果を確認中です";
  return state.winner === "village" ? "村人側の勝利で終了しました" : "人狼側の勝利で終了しました";
}

function werewolfNightStepLabel(step: WerewolfNightStep) {
  const labels: Record<WerewolfNightStep, string> = {
    werewolf: "人狼の襲撃",
    seer: "占い師の占い",
    knight: "騎士の護衛",
    medium: "霊媒師の確認",
    dawn: "朝の結果",
  };
  return labels[step];
}

function buildWerewolfRoomEnvelope(snapshot: RoomSnapshot, werewolf: WerewolfState, updatedBy: string | null): WerewolfRoomEnvelope {
  const current = parseRoomProgress(snapshot);
  return {
    ...current,
    phase: werewolf.phase === "result" ? "complete" : "playing",
    gameKey: "werewolf-game",
    gameTitle: "人狼ゲーム",
    step: getWerewolfProgressStep(werewolf),
    message: describeWerewolfProgress(werewolf),
    updatedBy,
    updatedAt: new Date().toISOString(),
    werewolf,
  };
}

function roomParticipantsToWerewolfPlayers(snapshot: RoomSnapshot, includeHost: boolean) {
  return snapshot.participants
    .filter((participant) => includeHost || participant.role !== "host")
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
    }));
}

function WerewolfGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const [ownRoleVisible, setOwnRoleVisible] = useState(false);
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<WerewolfState>("werewolf-game", initialWerewolfState);
  const roomWerewolfState = parseWerewolfStateFromRoom(roomSnapshot);
  const isWerewolfRoom = Boolean(roomSession && roomSnapshot?.room.currentGame === "werewolf-game");
  const activeWerewolfState = isWerewolfRoom ? (roomWerewolfState ?? initialWerewolfState) : storedState;
  const state = { ...initialWerewolfState, ...activeWerewolfState };
  const isRoomHost = isWerewolfRoom && roomSession?.participantRole === "host";
  const canControlWerewolf = !isWerewolfRoom || isRoomHost;
  const canStart = state.players.length >= 6 && state.players.every((player) => player.name.trim());
  const rolePreview = countWerewolfRoles(getWerewolfRoleDeck(Math.max(6, state.players.length || 6)));
  const alivePlayers = getAliveWerewolfPlayers(state.players, state.assignments);
  const deadPlayers = state.players.filter((player) => !alivePlayers.some((alivePlayer) => alivePlayer.id === player.id));
  const currentRevealPlayer = state.players[state.revealIndex] ?? null;
  const currentRevealAssignment = currentRevealPlayer
    ? getWerewolfAssignment(state.assignments, currentRevealPlayer.id)
    : null;
  const currentVoter = alivePlayers[state.voteIndex] ?? null;
  const voteParticipantIds = new Set([...Object.keys(state.votes), ...Object.values(state.votes)]);
  const voteDisplayPlayers =
    state.phase === "voteResult" && voteParticipantIds.size > 0
      ? state.players.filter((player) => voteParticipantIds.has(player.id))
      : alivePlayers;
  const voteTally = tallyWerewolfVotes(state.votes, voteDisplayPlayers);
  const ownAssignment = roomSession ? getWerewolfAssignment(state.assignments, roomSession.participantId) : null;
  const currentVoterIsThisParticipant = Boolean(isWerewolfRoom && currentVoter?.id === roomSession?.participantId);
  const canVoteForCurrentVoter = canControlWerewolf || currentVoterIsThisParticipant;
  const werewolfTimerNow = useSecondTick(state.phase === "day" && state.timerRunning);
  const werewolfRemainingSeconds = getSyncedTimerRemaining(state, werewolfTimerNow);
  const werewolfTimerRunning = state.timerRunning && werewolfRemainingSeconds > 0;

  function setState(nextStateOrUpdater: WerewolfState | ((current: WerewolfState) => WerewolfState)) {
    if (!isWerewolfRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildWerewolfRoomEnvelope(roomSnapshot, nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "werewolf-game",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "werewolf-game",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if (state.phase !== "day" || !state.timerRunning || werewolfRemainingSeconds > 0 || !canControlWerewolf) return;
    setState((current) =>
      current.phase === "day" && current.timerRunning && getSyncedTimerRemaining(current) === 0
        ? stopSyncedTimer(current, 0)
        : current,
    );
  }, [canControlWerewolf, state.phase, state.timerRunning, werewolfRemainingSeconds]);

  function startWerewolfGame() {
    const assignments = createWerewolfAssignments(state.players);
    setState({
      ...initialWerewolfState,
      players: state.players,
      discussionSeconds: state.discussionSeconds,
      remainingSeconds: state.discussionSeconds,
      timerEndsAt: null,
      phase: "reveal",
      assignments,
      actionLog: ["役職を配りました。スマホを順番に回して本人だけ確認します。"],
    });
  }

  function goToNextNight(nextState: WerewolfState = state) {
    setState({
      ...nextState,
      phase: "night",
      dayNumber: nextState.dayNumber + 1,
      timerRunning: false,
      timerEndsAt: null,
      nightStep: "werewolf",
      werewolfTargetId: null,
      seerTargetId: null,
      knightTargetId: null,
      mediumChecked: false,
      morningMessage: "",
      votes: {},
      voteIndex: 0,
      tiedTargetIds: [],
    });
  }

  function finishNight() {
    const killedId =
      state.werewolfTargetId && state.werewolfTargetId !== state.knightTargetId ? state.werewolfTargetId : null;
    const nextAssignments = killedId ? markWerewolfPlayerDead(state.assignments, killedId) : state.assignments;
    const morningMessage = killedId
      ? `${getWerewolfPlayerName(state.players, killedId)}さんが襲撃されました。`
      : "平和な朝です。騎士の護衛が成功したか、人狼の襲撃が通りませんでした。";
    const outcome = getWerewolfOutcome(nextAssignments);
    const nextLog = [morningMessage, ...state.actionLog].slice(0, 10);
    if (outcome) {
      setState({
        ...state,
        assignments: nextAssignments,
        phase: "result",
        lastKilledId: killedId,
        morningMessage,
        winner: outcome.winner,
        resultReason: `${morningMessage} ${outcome.reason}`,
        timerRunning: false,
        timerEndsAt: null,
        actionLog: nextLog,
      });
      return;
    }
    setState({
      ...state,
      assignments: nextAssignments,
      phase: "day",
      lastKilledId: killedId,
      morningMessage,
      remainingSeconds: state.discussionSeconds,
      timerRunning: false,
      timerEndsAt: null,
      votes: {},
      voteIndex: 0,
      tiedTargetIds: [],
      actionLog: nextLog,
    });
  }

  function finishVote(targetId: string) {
    if (!currentVoter) return;
    const nextVotes = { ...state.votes, [currentVoter.id]: targetId };
    if (state.voteIndex + 1 < alivePlayers.length) {
      setState({ ...state, votes: nextVotes, voteIndex: state.voteIndex + 1 });
      return;
    }

    const tally = tallyWerewolfVotes(nextVotes, alivePlayers);
    if (tally.topTargetIds.length !== 1) {
      setState({
        ...state,
        votes: nextVotes,
        phase: "voteResult",
        tiedTargetIds: tally.topTargetIds,
        lastExecutedId: null,
        timerRunning: false,
        timerEndsAt: null,
        actionLog: [`同票です。${tally.maxVotes}票で並びました。`, ...state.actionLog].slice(0, 10),
      });
      return;
    }

    const executedId = tally.topTargetIds[0];
    const nextAssignments = markWerewolfPlayerDead(state.assignments, executedId);
    const executedName = getWerewolfPlayerName(state.players, executedId);
    const outcome = getWerewolfOutcome(nextAssignments);
    const nextLog = [`${executedName}さんを追放しました。`, ...state.actionLog].slice(0, 10);
    if (outcome) {
      setState({
        ...state,
        assignments: nextAssignments,
        votes: nextVotes,
        phase: "result",
        tiedTargetIds: [],
        lastExecutedId: executedId,
        winner: outcome.winner,
        resultReason: `${executedName}さんを追放しました。${outcome.reason}`,
        timerRunning: false,
        timerEndsAt: null,
        actionLog: nextLog,
      });
      return;
    }

    setState({
      ...state,
      assignments: nextAssignments,
      votes: nextVotes,
      phase: "voteResult",
      tiedTargetIds: [],
      lastExecutedId: executedId,
      timerRunning: false,
      timerEndsAt: null,
      actionLog: nextLog,
    });
  }

  const werewolfTargets = alivePlayers.filter((player) => getWerewolfAssignment(state.assignments, player.id)?.role !== "werewolf");
  const seerTargets = alivePlayers.filter((player) => getWerewolfAssignment(state.assignments, player.id)?.role !== "seer");
  const knightTargets = alivePlayers;
  const selectedSeerAssignment = state.seerTargetId ? getWerewolfAssignment(state.assignments, state.seerTargetId) : null;
  const lastExecutedAssignment = state.lastExecutedId ? getWerewolfAssignment(state.assignments, state.lastExecutedId) : null;

  return (
    <GameFrame
      title="人狼ゲーム"
      subtitle="役職を隠して、夜の行動と昼の話し合いで人狼を探す進行補助です。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isWerewolfRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が司会用です。配役、夜行動、昼投票、勝敗判定をルームへ同期します。"
                : "この端末は参加者用です。自分の役職確認と、自分の番の投票に使えます。"}
            </p>
          </div>
          {ownAssignment && (
            <div className="own-role-panel">
              <span>あなたの役職</span>
              <strong>{ownRoleVisible ? werewolfRoleLabels[ownAssignment.role] : "非表示"}</strong>
              <button className="secondary-button" type="button" onClick={() => setOwnRoleVisible(!ownRoleVisible)}>
                {ownRoleVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                {ownRoleVisible ? "隠す" : "見る"}
              </button>
            </div>
          )}
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.phase === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>詳しい進め方</h3>
            <ol className="rule-list">
              <li>司会を1人決めます。司会は参加者欄に入れず、画面を見ながら進行します。</li>
              <li>参加者を6〜12人で登録し、役職を配ります。</li>
              <li>スマホを順番に回して、本人だけが自分の役職を確認します。</li>
              <li>夜は司会の合図で、人狼の襲撃、占い師の占い、騎士の護衛、霊媒師の確認を処理します。</li>
              <li>昼は議論してから投票します。人狼を全員追放すれば村人側、人狼が村人側以上の人数になれば人狼側の勝ちです。</li>
            </ol>
          </div>

          {isWerewolfRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を人狼メンバーに使えます</strong>
              <p>司会をホスト端末にする場合は「ホスト以外」を使います。ホストも参加者にする場合は「全員」を使います。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToWerewolfPlayers(roomSnapshot, false),
                      assignments: [],
                      phase: "setup",
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToWerewolfPlayers(roomSnapshot, true),
                      assignments: [],
                      phase: "setup",
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlWerewolf ? (
            <PlayerSetup
              players={state.players}
              minPlayers={6}
              maxPlayers={12}
              onChange={(players) => setState({ ...state, players, assignments: [], phase: "setup" })}
            />
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが参加者を確定して役職を配ると、この画面にも同期されます。</p>
            </div>
          )}

          {canControlWerewolf && (
            <SegmentedControl
              label="昼の議論時間"
              options={werewolfDiscussionTimeOptions}
              value={String(state.discussionSeconds) as "180" | "300" | "420"}
              onChange={(seconds) =>
                setState({
                  ...state,
                  discussionSeconds: Number(seconds),
                  remainingSeconds: Number(seconds),
                  timerRunning: false,
                  timerEndsAt: null,
                })
              }
            />
          )}

          <div className="howto-panel compact">
            <h3>今回の役職配分</h3>
            <div className="chip-list">
              {rolePreview
                .filter((item) => item.count > 0)
                .map((item) => (
                  <span key={item.role}>
                    {werewolfRoleLabels[item.role]} {item.count}人
                  </span>
                ))}
            </div>
          </div>

          <div className="notice-panel calm">
            <strong>Hなお題はありません</strong>
            <p>人狼は推理と会話のゲームとして進行します。飲酒の強要、暴露、個人攻撃になる言い方は司会が止めます。</p>
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || !canControlWerewolf} onClick={startWerewolfGame}>
              <Play size={18} />
              役職を配る
            </button>
            <button className="secondary-button" disabled={!canControlWerewolf} onClick={() => setState(initialWerewolfState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.phase === "reveal" && currentRevealPlayer && currentRevealAssignment && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">
            役職確認 {state.revealIndex + 1}/{state.players.length}
          </p>
          <h2>{currentRevealPlayer.name}さん</h2>
          <p className="soft-note">本人だけが見てください。見終わったら必ず隠してから次の人へ回します。</p>
          <div className={`secret-word ${state.revealVisible ? "visible" : ""}`}>
            {state.revealVisible ? werewolfRoleLabels[currentRevealAssignment.role] : "役職を隠しています"}
          </div>
          {state.revealVisible && (
            <div className="answer-panel">
              <strong>役職の説明</strong>
              <p>{werewolfRoleDescriptions[currentRevealAssignment.role]}</p>
            </div>
          )}
          <div className="action-row centered">
            <button
              className="primary-button"
              disabled={!canControlWerewolf}
              onClick={() => setState({ ...state, revealVisible: !state.revealVisible })}
            >
              {state.revealVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {state.revealVisible ? "隠す" : "見る"}
            </button>
            <button
              className="secondary-button"
              disabled={!state.revealVisible || !canControlWerewolf}
              onClick={() => {
                if (state.revealIndex + 1 >= state.players.length) {
                  setState({ ...state, phase: "night", revealVisible: false, nightStep: "werewolf" });
                } else {
                  setState({ ...state, revealIndex: state.revealIndex + 1, revealVisible: false });
                }
              }}
            >
              <ChevronRight size={18} />
              {state.revealIndex + 1 >= state.players.length ? "最初の夜へ" : "次へ"}
            </button>
          </div>
        </section>
      )}

      {state.phase === "night" && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">夜 {state.dayNumber}</p>
            <h2>司会用の夜行動</h2>
            <p>司会だけが画面を見てください。該当する役職の人に静かに目を開けてもらい、対象を記録します。</p>
          </div>

          <div className="position-list">
            {alivePlayers.map((player) => (
              <span key={player.id}>{player.name}</span>
            ))}
          </div>

          {state.nightStep === "werewolf" && (
            <div className="url-interaction-panel">
              <h3>1. 人狼の襲撃</h3>
              <p className="soft-note">人狼は目を開け、襲撃する相手を1人選びます。人狼同士はここで仲間を確認できます。</p>
              <div className="chip-list">
                {state.players
                  .filter((player) => {
                    const assignment = getWerewolfAssignment(state.assignments, player.id);
                    return assignment?.role === "werewolf" && assignment.alive;
                  })
                  .map((player) => (
                    <span key={player.id}>{player.name}</span>
                  ))}
              </div>
              <div className="candidate-grid">
                {werewolfTargets.map((player) => (
                  <button
                    className={state.werewolfTargetId === player.id ? "selected-choice" : ""}
                    disabled={!canControlWerewolf}
                    key={player.id}
                    onClick={() => setState({ ...state, werewolfTargetId: player.id })}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={!state.werewolfTargetId || !canControlWerewolf}
                  onClick={() =>
                    setState({
                      ...state,
                      nightStep: getNextWerewolfNightStep("werewolf", state.assignments, state.lastExecutedId),
                    })
                  }
                >
                  <ChevronRight size={18} />
                  次の夜行動へ
                </button>
              </div>
            </div>
          )}

          {state.nightStep === "seer" && (
            <div className="url-interaction-panel">
              <h3>2. 占い師の占い</h3>
              <p className="soft-note">占い師は目を開け、占いたい人を1人選びます。司会は結果だけを静かに伝えます。</p>
              <div className="candidate-grid">
                {seerTargets.map((player) => (
                  <button
                    className={state.seerTargetId === player.id ? "selected-choice" : ""}
                    disabled={!canControlWerewolf}
                    key={player.id}
                    onClick={() => setState({ ...state, seerTargetId: player.id })}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
              {state.seerTargetId && selectedSeerAssignment && (
                <div className="answer-panel">
                  <strong>{getWerewolfPlayerName(state.players, state.seerTargetId)}さんの占い結果</strong>
                  <p>{selectedSeerAssignment.role === "werewolf" ? "人狼です" : "人狼ではありません"}</p>
                </div>
              )}
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={!state.seerTargetId || !canControlWerewolf}
                  onClick={() =>
                    setState({
                      ...state,
                      nightStep: getNextWerewolfNightStep("seer", state.assignments, state.lastExecutedId),
                    })
                  }
                >
                  <ChevronRight size={18} />
                  次の夜行動へ
                </button>
              </div>
            </div>
          )}

          {state.nightStep === "knight" && (
            <div className="url-interaction-panel">
              <h3>3. 騎士の護衛</h3>
              <p className="soft-note">騎士は目を開け、守りたい人を1人選びます。同じ人を連続で守るかどうかは、場のルールで決めてOKです。</p>
              <div className="candidate-grid">
                {knightTargets.map((player) => (
                  <button
                    className={state.knightTargetId === player.id ? "selected-choice" : ""}
                    disabled={!canControlWerewolf}
                    key={player.id}
                    onClick={() => setState({ ...state, knightTargetId: player.id })}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={!state.knightTargetId || !canControlWerewolf}
                  onClick={() =>
                    setState({
                      ...state,
                      nightStep: getNextWerewolfNightStep("knight", state.assignments, state.lastExecutedId),
                    })
                  }
                >
                  <ChevronRight size={18} />
                  次の夜行動へ
                </button>
              </div>
            </div>
          )}

          {state.nightStep === "medium" && lastExecutedAssignment && (
            <div className="url-interaction-panel">
              <h3>4. 霊媒師の確認</h3>
              <p className="soft-note">霊媒師は目を開け、直前の昼に追放された人が人狼だったかどうかを確認します。</p>
              <div className="answer-panel">
                <strong>{getWerewolfPlayerName(state.players, state.lastExecutedId)}さんの霊媒結果</strong>
                <p>{lastExecutedAssignment.role === "werewolf" ? "人狼でした" : "人狼ではありませんでした"}</p>
              </div>
              <div className="action-row">
                <button
                  className="primary-button"
                  disabled={!canControlWerewolf}
                  onClick={() =>
                    setState({
                      ...state,
                      mediumChecked: true,
                      nightStep: getNextWerewolfNightStep("medium", state.assignments, state.lastExecutedId),
                    })
                  }
                >
                  <ChevronRight size={18} />
                  朝へ
                </button>
              </div>
            </div>
          )}

          {state.nightStep === "dawn" && (
            <div className="url-interaction-panel">
              <h3>朝にする</h3>
              <p className="soft-note">
                襲撃対象は{getWerewolfPlayerName(state.players, state.werewolfTargetId)}さん、護衛対象は
                {getWerewolfPlayerName(state.players, state.knightTargetId)}さんです。
              </p>
              <div className="action-row">
                <button className="primary-button" disabled={!canControlWerewolf} onClick={finishNight}>
                  <Play size={18} />
                  朝の結果を出す
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {state.phase === "day" && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">昼 {state.dayNumber}</p>
          <h2>{state.morningMessage}</h2>
          <div className="timer-display">{formatTime(werewolfRemainingSeconds)}</div>
          <div className="howto-panel compact">
            <h3>昼の進め方</h3>
            <ul className="rule-list">
              <li>生存者だけで話し合います。脱落者は発言しません。</li>
              <li>占い師や霊媒師は、結果を出すか隠すかを自分で判断します。</li>
              <li>個人攻撃ではなく、発言の矛盾や投票理由を中心に話します。</li>
            </ul>
          </div>
          <div className="position-list">
            <span>生存 {alivePlayers.length}人</span>
            <span>脱落 {deadPlayers.length}人</span>
          </div>
          <div className="action-row centered">
            <button
              className="primary-button"
              onClick={() => setState(toggleSyncedTimer(state, werewolfTimerNow))}
              disabled={werewolfRemainingSeconds === 0 || !canControlWerewolf}
            >
              {werewolfTimerRunning ? <Pause size={18} /> : <Play size={18} />}
              {werewolfTimerRunning ? "止める" : "開始"}
            </button>
            <button
              className="secondary-button"
              disabled={!canControlWerewolf}
              onClick={() =>
                setState({
                  ...stopSyncedTimer(state, werewolfRemainingSeconds),
                  phase: "vote",
                  votes: {},
                  voteIndex: 0,
                })
              }
            >
              <Vote size={18} />
              投票へ
            </button>
          </div>
        </section>
      )}

      {state.phase === "vote" && currentVoter && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              投票 {state.voteIndex + 1}/{alivePlayers.length}
            </p>
            <h2>{currentVoter.name}さんの投票</h2>
            <p>追放したい人を1人選びます。自分には投票できません。</p>
          </div>
          <div className="candidate-grid">
            {alivePlayers
              .filter((player) => player.id !== currentVoter.id)
              .map((player) => (
                <button key={player.id} disabled={!canVoteForCurrentVoter} onClick={() => finishVote(player.id)}>
                  {player.name}
                </button>
              ))}
          </div>
        </section>
      )}

      {state.phase === "voteResult" && (
        <section className="tool-surface">
          <div className="result-heading">
            <Vote size={24} />
            <div>
              <p className="eyebrow">投票結果</p>
              <h2>{state.tiedTargetIds.length > 1 ? "同票です" : `${getWerewolfPlayerName(state.players, state.lastExecutedId)}さんを追放しました`}</h2>
            </div>
          </div>
          <div className="result-table">
            {voteTally.rows.map(({ player, count }) => (
              <div className="result-row" key={player.id}>
                <strong>{player.name}</strong>
                <span>{count}票</span>
                <span>{state.tiedTargetIds.includes(player.id) ? "同票" : player.id === state.lastExecutedId ? "追放" : "継続"}</span>
                <span>{getWerewolfAssignment(state.assignments, player.id)?.alive ? "生存" : "脱落"}</span>
              </div>
            ))}
          </div>
          {state.tiedTargetIds.length > 1 ? (
            <div className="action-row">
              <button
                className="primary-button"
                disabled={!canControlWerewolf}
                onClick={() => setState({ ...state, phase: "vote", votes: {}, voteIndex: 0, tiedTargetIds: [] })}
              >
                <Vote size={18} />
                再投票
              </button>
              <button
                className="secondary-button"
                disabled={!canControlWerewolf}
                onClick={() => goToNextNight({ ...state, lastExecutedId: null })}
              >
                <ChevronRight size={18} />
                追放なしで夜へ
              </button>
            </div>
          ) : (
            <div className="action-row">
              <button className="primary-button" disabled={!canControlWerewolf} onClick={() => goToNextNight()}>
                <ChevronRight size={18} />
                次の夜へ
              </button>
            </div>
          )}
        </section>
      )}

      {state.phase === "result" && (
        <section className="tool-surface">
          <div className="result-heading">
            <Trophy size={24} />
            <div>
              <p className="eyebrow">ゲーム終了</p>
              <h2>{state.winner === "village" ? "村人側の勝ち" : "人狼側の勝ち"}</h2>
            </div>
          </div>
          <p className="talk-cue">{state.resultReason}</p>
          <div className="result-table">
            {state.players.map((player) => {
              const assignment = getWerewolfAssignment(state.assignments, player.id);
              return (
                <div className="result-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>{assignment ? werewolfRoleLabels[assignment.role] : "不明"}</span>
                  <span>{assignment?.alive ? "生存" : "脱落"}</span>
                  <span>{assignment?.role === "werewolf" ? "人狼側" : "村人側"}</span>
                </div>
              );
            })}
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlWerewolf} onClick={startWerewolfGame}>
              <RotateCcw size={18} />
              同じメンバーでもう一度
            </button>
            <button
              className="secondary-button"
              disabled={!canControlWerewolf}
              onClick={() => setState({ ...initialWerewolfState, players: state.players })}
            >
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

type YamanoteStep = "setup" | "play" | "complete";
type YamanoteThemeCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;
type YamanoteSeconds = 3 | 5 | 10;

type YamanoteAnswerLog = {
  id: string;
  playerId: string;
  playerName: string;
  answer: string;
};

type YamanoteState = {
  players: Player[];
  category: YamanoteCategory;
  includeAdultTopics: boolean;
  themeCount: YamanoteThemeCount;
  secondsPerTurn: YamanoteSeconds;
  step: YamanoteStep;
  deckThemeIds: string[];
  deckIndex: number;
  currentPlayerIndex: number;
  answerLog: YamanoteAnswerLog[];
  missCounts: Record<string, number>;
};

const yamanoteThemeCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const yamanoteSecondsOptions: SegmentedOption<string>[] = [
  { value: "3", label: "3秒" },
  { value: "5", label: "5秒" },
  { value: "10", label: "10秒" },
];

const initialYamanoteState: YamanoteState = {
  players: [],
  category: "all",
  includeAdultTopics: false,
  themeCount: 10,
  secondsPerTurn: 3,
  step: "setup",
  deckThemeIds: [],
  deckIndex: 0,
  currentPlayerIndex: 0,
  answerLog: [],
  missCounts: {},
};

type YamanoteRoomEnvelope = RoomProgressState & {
  yamanote?: YamanoteState;
};

function parseYamanoteStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "yamanote") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<YamanoteRoomEnvelope>) : {};
  return state.yamanote && typeof state.yamanote === "object" ? ({ ...initialYamanoteState, ...state.yamanote } as YamanoteState) : null;
}

function getYamanoteProgressStep(state: YamanoteState) {
  const stepOrder: Record<YamanoteStep, number> = {
    setup: 1,
    play: 2,
    complete: 3,
  };
  return stepOrder[state.step] ?? 1;
}

function describeYamanoteProgress(state: YamanoteState) {
  if (state.step === "setup") return "山手線ゲームの設定中です";
  if (state.step === "play") {
    const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
    const progress = state.deckThemeIds.length > 0 ? `${state.deckIndex + 1}/${state.deckThemeIds.length}` : "準備中";
    return currentPlayer ? `お題${progress}: ${currentPlayer.name}さんの番です` : `お題${progress}で進行中です`;
  }
  return "山手線ゲームが完了しました";
}

function buildYamanoteRoomEnvelope(yamanote: YamanoteState, updatedBy: string | null): YamanoteRoomEnvelope {
  return {
    phase: yamanote.step === "complete" ? "complete" : "playing",
    gameKey: "yamanote",
    gameTitle: findGameMeta("yamanote")?.title ?? "山手線ゲーム",
    step: getYamanoteProgressStep(yamanote),
    message: describeYamanoteProgress(yamanote),
    updatedBy,
    updatedAt: new Date().toISOString(),
    yamanote,
  };
}

function YamanoteGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<YamanoteState>("yamanote", initialYamanoteState);
  const [draftAnswer, setDraftAnswer] = useState("");
  const roomYamanoteState = parseYamanoteStateFromRoom(roomSnapshot);
  const isYamanoteRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "yamanote"));
  const activeYamanoteState = isYamanoteRoom ? (roomYamanoteState ?? initialYamanoteState) : storedState;
  const state = { ...initialYamanoteState, ...activeYamanoteState };
  const activeYamanoteCategory = !state.includeAdultTopics && state.category === "adult" ? "all" : state.category;
  const availableYamanoteCategories = state.includeAdultTopics ? yamanoteCategories : normalYamanoteCategories;
  const themePool = useMemo(
    () =>
      activeYamanoteCategory === "all"
        ? state.includeAdultTopics
          ? yamanoteThemes
          : normalYamanoteThemes
        : yamanoteThemes.filter((theme) => theme.category === activeYamanoteCategory),
    [activeYamanoteCategory, state.includeAdultTopics],
  );
  const selectedThemeCount = Math.min(state.themeCount, themePool.length);
  const activeTheme = yamanoteThemes.find((theme) => theme.id === state.deckThemeIds[state.deckIndex]) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());
  const progressLabel = state.deckThemeIds.length > 0 ? `${state.deckIndex + 1}/${state.deckThemeIds.length}` : "";
  const normalizedAnswers = new Set(state.answerLog.map((item) => item.answer.trim().toLowerCase()));
  const normalizedDraft = draftAnswer.trim().toLowerCase();
  const isDuplicateAnswer = Boolean(normalizedDraft && normalizedAnswers.has(normalizedDraft));
  const isRoomHost = isYamanoteRoom && roomSession?.participantRole === "host";
  const canControlYamanote = !isYamanoteRoom || (isRoomHost && Boolean(roomSnapshot));
  const canActForCurrentYamanotePlayer = !isYamanoteRoom || canControlYamanote || currentPlayer?.id === roomSession?.participantId;

  function setState(nextStateOrUpdater: YamanoteState | ((current: YamanoteState) => YamanoteState)) {
    if (isYamanoteRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isYamanoteRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildYamanoteRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "yamanote",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "yamanote",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if (state.step === "play" && !activeTheme) {
      setState({ ...state, step: "setup", deckThemeIds: [], deckIndex: 0, answerLog: [] });
    }
  }, [activeTheme, setState, state.step]);

  function startYamanote() {
    if (!canControlYamanote) return;
    const deckThemeIds = shuffle(themePool)
      .slice(0, selectedThemeCount)
      .map((theme) => theme.id);
    setState({
      ...state,
      step: "play",
      deckThemeIds,
      deckIndex: 0,
      currentPlayerIndex: 0,
      answerLog: [],
      missCounts: {},
    });
    setDraftAnswer("");
  }

  function rotatePlayer(extraMissForPlayerId?: string) {
    if (!canActForCurrentYamanotePlayer) return;
    setState({
      ...state,
      currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
      missCounts: extraMissForPlayerId
        ? { ...state.missCounts, [extraMissForPlayerId]: (state.missCounts[extraMissForPlayerId] ?? 0) + 1 }
        : state.missCounts,
    });
    setDraftAnswer("");
  }

  function addYamanoteAnswer() {
    const answer = draftAnswer.trim();
    if (!answer || !currentPlayer || isDuplicateAnswer || !canActForCurrentYamanotePlayer) return;
    setState({
      ...state,
      currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
      answerLog: [
        ...state.answerLog,
        { id: createId("answer"), playerId: currentPlayer.id, playerName: currentPlayer.name, answer },
      ],
    });
    setDraftAnswer("");
  }

  function moveToNextYamanoteTheme() {
    if (!canControlYamanote) return;
    const nextIndex = state.deckIndex + 1;
    if (nextIndex >= state.deckThemeIds.length) {
      setState({ ...state, step: "complete", answerLog: [] });
      setDraftAnswer("");
      return;
    }
    setState({
      ...state,
      deckIndex: nextIndex,
      currentPlayerIndex: nextIndex % Math.max(1, state.players.length),
      answerLog: [],
    });
    setDraftAnswer("");
  }

  return (
    <GameFrame
      title="山手線ゲーム"
      subtitle="お題に合う言葉を、リズムよく順番に答えていく古今東西ゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isYamanoteRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、回答記録、アウト、次のお題を同期します。"
                : "この端末では自分の番だけ回答・パス・アウト操作ができます。お題切り替えはホスト端末で行います。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を2人以上登録します。</li>
              <li>カテゴリ、今回使うお題数、1人の持ち時間を選びます。</li>
              <li>お題が出たら、全員で手拍子などの一定リズムを作ります。</li>
              <li>順番に、お題に合う言葉を1つずつ答えます。</li>
              <li>同じ答え、長すぎる沈黙、明らかに違う答えはアウトとして記録します。</li>
            </ol>
          </div>

          {isYamanoteRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を山手線ゲームのメンバーに使えます</strong>
              <p>各端末で自分の番を操作するには、ルーム参加者を取り込んでください。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      deckThemeIds: [],
                      deckIndex: 0,
                      currentPlayerIndex: 0,
                      answerLog: [],
                      missCounts: {},
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      deckThemeIds: [],
                      deckIndex: 0,
                      currentPlayerIndex: 0,
                      answerLog: [],
                      missCounts: {},
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlYamanote ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={2}
                maxPlayers={20}
                onChange={(players) =>
                  setState({
                    ...state,
                    players,
                    deckThemeIds: [],
                    deckIndex: 0,
                    currentPlayerIndex: 0,
                    answerLog: [],
                    missCounts: {},
                  })
                }
              />
              <ToggleSwitch
                label="Hな話題"
                description={
                  state.includeAdultTopics
                    ? "ON: 夜の話題・恋バナ寄りのお題も混ぜます。答えにくければスキップできます。"
                    : "OFF: 通常のお題だけで遊びます。"
                }
                checked={state.includeAdultTopics}
                onChange={(includeAdultTopics) =>
                  setState({
                    ...state,
                    includeAdultTopics,
                    category: state.category === "adult" ? "all" : state.category,
                    deckThemeIds: [],
                    deckIndex: 0,
                    answerLog: [],
                    missCounts: {},
                  })
                }
              />
              <SegmentedControl
                label="カテゴリ"
                options={availableYamanoteCategories}
                value={activeYamanoteCategory}
                onChange={(category) =>
                  setState({ ...state, category, deckThemeIds: [], deckIndex: 0, answerLog: [], missCounts: {} })
                }
              />
              <SegmentedControl
                label="今回のお題数"
                options={yamanoteThemeCountOptions}
                value={String(state.themeCount)}
                onChange={(themeCount) =>
                  setState({
                    ...state,
                    themeCount: Number(themeCount) as YamanoteThemeCount,
                    deckThemeIds: [],
                    deckIndex: 0,
                    answerLog: [],
                    missCounts: {},
                  })
                }
              />
              <SegmentedControl
                label="1人の持ち時間"
                options={yamanoteSecondsOptions}
                value={String(state.secondsPerTurn)}
                onChange={(secondsPerTurn) =>
                  setState({ ...state, secondsPerTurn: Number(secondsPerTurn) as YamanoteSeconds })
                }
              />
              <p className="soft-note">
                この条件では{themePool.length}問から、今回は{selectedThemeCount}問をランダムに使います。通常300問、大人向け30問です。
              </p>
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが参加者を取り込み、山手線ゲームを開始すると、この端末でも自分の番を操作できます。</p>
            </div>
          )}

          {state.includeAdultTopics && (
            <div className="notice-panel">
              <strong>Hな話題がONです</strong>
              <p>露骨すぎる話や答えにくい話は避け、場に合わなければすぐスキップしてください。</p>
            </div>
          )}
          <div className="notice-panel calm">
            <strong>今年流の遊び方</strong>
            <p>
              内輪すぎない範囲で「このメンバーの共通体験」「今日の会場にあるもの」などに寄せると盛り上がります。
              判断に迷ったら司会が明るく決めて、テンポを止めないのがコツです。
            </p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedThemeCount === 0 || !canControlYamanote} onClick={startYamanote}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlYamanote} onClick={() => setState(initialYamanoteState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "play" && activeTheme && currentPlayer && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">お題 {progressLabel}</p>
            <h2>{activeTheme.theme}</h2>
            <p>
              {currentPlayer.name}さんの番です。{state.secondsPerTurn}秒以内を目安に、まだ出ていない答えを1つ言います。
            </p>
          </div>
          <div className="chip-list">
            {activeTheme.examples.map((example) => (
              <span key={example}>例: {example}</span>
            ))}
          </div>
          <div className="answer-input-panel">
            {canActForCurrentYamanotePlayer ? (
              <>
                <label>
                  答えを記録
                  <input
                    value={draftAnswer}
                    onChange={(event) => setDraftAnswer(event.target.value)}
                    placeholder="答えを入力"
                    maxLength={32}
                  />
                </label>
                {isDuplicateAnswer && <p className="warning-text">同じ答えがすでに出ています。アウトにするか、別の答えにしてください。</p>}
                <div className="action-row">
                  <button className="primary-button" disabled={!draftAnswer.trim() || isDuplicateAnswer} onClick={addYamanoteAnswer}>
                    <Check size={18} />
                    セーフで次へ
                  </button>
                  <button className="secondary-button" onClick={() => rotatePlayer()}>
                    <ChevronRight size={18} />
                    パスで次へ
                  </button>
                  <button className="danger-button" onClick={() => rotatePlayer(currentPlayer.id)}>
                    <ShieldAlert size={18} />
                    アウト
                  </button>
                </div>
              </>
            ) : (
              <div className="howto-panel compact">
                <h3>{currentPlayer.name}さんの番です</h3>
                <p className="soft-note">この端末では待機中です。自分の番になると回答・パス・アウトを操作できます。</p>
              </div>
            )}
          </div>
          <div className="yamanote-board">
            <div>
              <h3>出た答え</h3>
              {state.answerLog.length === 0 ? (
                <EmptyState text="まだありません" />
              ) : (
                <div className="answer-log-list">
                  {state.answerLog.map((item) => (
                    <span key={item.id}>
                      {item.playerName}: {item.answer}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3>アウト記録</h3>
              <div className="score-list">
                {state.players.map((player) => (
                  <span key={player.id}>
                    {player.name}: {state.missCounts[player.id] ?? 0}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="howto-panel compact">
            <h3>判定の目安</h3>
            <ul className="rule-list">
              <li>すでに出た答えはアウトです。</li>
              <li>お題から大きく外れた答えは、司会判断でアウトにします。</li>
              <li>厳しくしすぎず、迷ったら「あり」にして次へ進むと場が止まりません。</li>
            </ul>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlYamanote} onClick={moveToNextYamanoteTheme}>
              {state.deckIndex + 1 >= state.deckThemeIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckThemeIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" disabled={!canControlYamanote} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlYamanote && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Timer size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckThemeIds.length}問おつかれさまでした</h2>
          <div className="score-list wide">
            {state.players.map((player) => (
              <span key={player.id}>
                {player.name}: アウト{state.missCounts[player.id] ?? 0}回
              </span>
            ))}
          </div>
          <p className="talk-cue">場が温まっていたら、カテゴリを変えてもう一度遊べます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlYamanote} onClick={startYamanote}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlYamanote} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

type JohariStep = "setup" | "self" | "peer" | "result" | "complete";
type JohariWordCount = 10 | 15 | 20 | 30 | 50 | 100 | 300;

type JohariState = {
  players: Player[];
  category: JohariCategory;
  wordCount: JohariWordCount;
  step: JohariStep;
  targetIndex: number;
  peerIndex: number;
  deckWordIds: string[];
  selfWordIds: string[];
  peerSelections: Record<string, string[]>;
};

const johariWordCountOptions: SegmentedOption<string>[] = [
  { value: "10", label: "10語" },
  { value: "15", label: "15語" },
  { value: "20", label: "20語" },
  { value: "30", label: "30語" },
  { value: "50", label: "50語" },
  { value: "100", label: "100語" },
  { value: "300", label: "300語" },
];

const initialJohariState: JohariState = {
  players: [],
  category: "all",
  wordCount: 20,
  step: "setup",
  targetIndex: 0,
  peerIndex: 0,
  deckWordIds: [],
  selfWordIds: [],
  peerSelections: {},
};

function ToggleWordGrid({
  words,
  selectedIds,
  onToggle,
}: {
  words: { id: string; label: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const selectedSet = new Set(selectedIds);
  return (
    <div className="word-choice-grid">
      {words.map((word) => (
        <button
          className={selectedSet.has(word.id) ? "selected-choice" : ""}
          key={word.id}
          onClick={() => onToggle(word.id)}
          type="button"
        >
          {word.label}
        </button>
      ))}
    </div>
  );
}

function WordList({ words }: { words: string[] }) {
  return words.length === 0 ? (
    <EmptyState text="今回は該当なし" />
  ) : (
    <div className="tag-list">
      {words.map((word) => (
        <span key={word}>{word}</span>
      ))}
    </div>
  );
}

type JohariRoomEnvelope = RoomProgressState & {
  johari?: JohariState;
};

function parseJohariStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "johari-window") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<JohariRoomEnvelope>) : {};
  return state.johari && typeof state.johari === "object" ? ({ ...initialJohariState, ...state.johari } as JohariState) : null;
}

function getJohariProgressStep(state: JohariState) {
  const stepOrder: Record<JohariStep, number> = {
    setup: 1,
    self: 2,
    peer: 3,
    result: 4,
    complete: 5,
  };
  return stepOrder[state.step] ?? 1;
}

function describeJohariProgress(state: JohariState) {
  const target = state.players[state.targetIndex] ?? null;
  if (state.step === "setup") return "ジョハリの窓の設定中です";
  if (state.step === "self") return target ? `${target.name}さん本人の選択中です` : "本人の選択中です";
  if (state.step === "peer") {
    const peers = target ? state.players.filter((player) => player.id !== target.id) : [];
    const currentPeer = peers[state.peerIndex] ?? null;
    return currentPeer && target
      ? `${currentPeer.name}さんが${target.name}さんへの印象を選択中です: ${state.peerIndex + 1}/${peers.length}`
      : "周りの選択中です";
  }
  if (state.step === "result") return target ? `${target.name}さんの結果を表示中です` : "結果を表示中です";
  return "ジョハリの窓が完了しました";
}

function buildJohariRoomEnvelope(johari: JohariState, updatedBy: string | null): JohariRoomEnvelope {
  return {
    phase: johari.step === "complete" ? "complete" : "playing",
    gameKey: "johari-window",
    gameTitle: findGameMeta("johari-window")?.title ?? "ジョハリの窓",
    step: getJohariProgressStep(johari),
    message: describeJohariProgress(johari),
    updatedBy,
    updatedAt: new Date().toISOString(),
    johari,
  };
}

function JohariWindowGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<JohariState>("johari-window", initialJohariState);
  const roomJohariState = parseJohariStateFromRoom(roomSnapshot);
  const isJohariRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "johari-window"));
  const activeJohariState = isJohariRoom ? (roomJohariState ?? initialJohariState) : storedState;
  const state = { ...initialJohariState, ...activeJohariState };
  const wordPool = useMemo(
    () => (state.category === "all" ? johariWords : johariWords.filter((word) => word.category === state.category)),
    [state.category],
  );
  const selectedWordCount = Math.min(state.wordCount, wordPool.length);
  const deckWords = state.deckWordIds
    .map((id) => johariWords.find((word) => word.id === id))
    .filter((word): word is (typeof johariWords)[number] => Boolean(word));
  const target = state.players[state.targetIndex] ?? null;
  const peers = target ? state.players.filter((player) => player.id !== target.id) : [];
  const currentPeer = peers[state.peerIndex] ?? null;
  const canStart = state.players.length >= 3 && state.players.every((player) => player.name.trim());
  const isRoomHost = isJohariRoom && roomSession?.participantRole === "host";
  const canControlJohari = !isJohariRoom || (isRoomHost && Boolean(roomSnapshot));
  const canSelectSelfWords = !isJohariRoom || canControlJohari || target?.id === roomSession?.participantId;
  const canSelectPeerWords = !isJohariRoom || canControlJohari || currentPeer?.id === roomSession?.participantId;
  const canMoveFromSelf = !isJohariRoom || canControlJohari || target?.id === roomSession?.participantId;
  const canMoveFromPeer = !isJohariRoom || canControlJohari || currentPeer?.id === roomSession?.participantId;

  function setState(nextStateOrUpdater: JohariState | ((current: JohariState) => JohariState)) {
    if (isJohariRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isJohariRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildJohariRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "johari-window",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "johari-window",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  function startJohari() {
    if (!canControlJohari) return;
    const deckWordIds = shuffle(wordPool)
      .slice(0, selectedWordCount)
      .map((word) => word.id);
    setState({
      ...state,
      step: "self",
      targetIndex: 0,
      peerIndex: 0,
      deckWordIds,
      selfWordIds: [],
      peerSelections: {},
    });
  }

  function toggleSelfWord(id: string) {
    if (!canSelectSelfWords) return;
    const selected = state.selfWordIds.includes(id)
      ? state.selfWordIds.filter((wordId) => wordId !== id)
      : [...state.selfWordIds, id];
    setState({ ...state, selfWordIds: selected });
  }

  function togglePeerWord(peerId: string, id: string) {
    if (isJohariRoom && !canControlJohari && roomSession?.participantId !== peerId) return;
    const current = state.peerSelections[peerId] ?? [];
    const selected = current.includes(id) ? current.filter((wordId) => wordId !== id) : [...current, id];
    setState({ ...state, peerSelections: { ...state.peerSelections, [peerId]: selected } });
  }

  function moveToNextPeer() {
    if (!canMoveFromPeer) return;
    if (state.peerIndex + 1 >= peers.length) {
      setState({ ...state, step: "result" });
      return;
    }
    setState({ ...state, peerIndex: state.peerIndex + 1 });
  }

  function moveToNextTarget() {
    if (!canControlJohari) return;
    if (state.targetIndex + 1 >= state.players.length) {
      setState({ ...state, step: "complete" });
      return;
    }
    setState({
      ...state,
      step: "self",
      targetIndex: state.targetIndex + 1,
      peerIndex: 0,
      selfWordIds: [],
      peerSelections: {},
    });
  }

  const johariResult = useMemo(() => {
    const selfSet = new Set(state.selfWordIds);
    const otherCounts = new Map<string, number>();
    Object.values(state.peerSelections).forEach((selection) => {
      selection.forEach((wordId) => otherCounts.set(wordId, (otherCounts.get(wordId) ?? 0) + 1));
    });
    const otherSet = new Set(otherCounts.keys());
    const labelOf = (id: string) => johariWords.find((word) => word.id === id)?.label ?? id;
    const deckIds = deckWords.map((word) => word.id);
    return {
      open: deckIds.filter((id) => selfSet.has(id) && otherSet.has(id)).map(labelOf),
      blind: deckIds.filter((id) => !selfSet.has(id) && otherSet.has(id)).map(labelOf),
      hidden: deckIds.filter((id) => selfSet.has(id) && !otherSet.has(id)).map(labelOf),
      unknown: deckIds.filter((id) => !selfSet.has(id) && !otherSet.has(id)).map(labelOf),
    };
  }, [deckWords, state.peerSelections, state.selfWordIds]);

  return (
    <GameFrame
      title="ジョハリの窓"
      subtitle="自分が選ぶ特徴と、周りが選ぶ特徴を見比べて、相互理解を深めます。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isJohariRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、対象者の切り替え、結果表示を同期します。"
                : "この端末では、自分が対象者または回答者になった時だけ選択できます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を3人以上登録します。</li>
              <li>対象者を1人ずつ回し、まず本人が自分に当てはまる特徴ワードを選びます。</li>
              <li>次に、他の参加者が対象者に当てはまりそうな特徴ワードを選びます。</li>
              <li>結果は「開放」「盲点」「秘密」「未知」の4つの窓に分かれて表示されます。</li>
              <li>欠点探しではなく、選ばれた言葉から「そう見えているんだ」と会話するゲームです。</li>
            </ol>
          </div>
          {isJohariRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者をジョハリの窓メンバーに使えます</strong>
              <p>それぞれの端末で本人選択や周りの選択をするには、ルーム参加者を取り込んでください。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      targetIndex: 0,
                      peerIndex: 0,
                      deckWordIds: [],
                      selfWordIds: [],
                      peerSelections: {},
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      targetIndex: 0,
                      peerIndex: 0,
                      deckWordIds: [],
                      selfWordIds: [],
                      peerSelections: {},
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlJohari ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={3}
                maxPlayers={12}
                onChange={(players) =>
                  setState({
                    ...state,
                    players,
                    targetIndex: 0,
                    peerIndex: 0,
                    deckWordIds: [],
                    selfWordIds: [],
                    peerSelections: {},
                  })
                }
              />
              <SegmentedControl
                label="特徴ワード"
                options={johariCategories}
                value={state.category}
                onChange={(category) => setState({ ...state, category, deckWordIds: [], selfWordIds: [], peerSelections: {} })}
              />
              <SegmentedControl
                label="今回使う語数"
                options={johariWordCountOptions}
                value={String(state.wordCount)}
                onChange={(wordCount) =>
                  setState({
                    ...state,
                    wordCount: Number(wordCount) as JohariWordCount,
                    deckWordIds: [],
                    selfWordIds: [],
                    peerSelections: {},
                  })
                }
              />
              <p className="soft-note">
                この条件では{wordPool.length}語から、今回は{selectedWordCount}語をランダムに使います。全体の特徴ワードは300語です。
              </p>
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが参加者を取り込み、ジョハリの窓を開始すると、この端末でも選択できます。</p>
            </div>
          )}
          <div className="notice-panel calm">
            <strong>心理的安全性を優先します</strong>
            <p>容姿や年齢をいじるゲームではありません。良い特徴、役割、見え方を共有する時間として進めます。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedWordCount === 0 || !canControlJohari} onClick={startJohari}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlJohari} onClick={() => setState(initialJohariState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "self" && target && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              対象者 {state.targetIndex + 1}/{state.players.length}
            </p>
            <h2>{target.name}さん本人の選択</h2>
            <p>自分に当てはまると思う特徴を選びます。多くても少なくても大丈夫です。</p>
          </div>
          {canSelectSelfWords ? (
            <ToggleWordGrid words={deckWords} selectedIds={state.selfWordIds} onToggle={toggleSelfWord} />
          ) : (
            <div className="howto-panel compact">
              <h3>{target.name}さんの選択待ち</h3>
              <p className="soft-note">本人が自分に当てはまる特徴を選んでいます。終わったら周りの選択へ進みます。</p>
            </div>
          )}
          <div className="action-row">
            <button
              className="primary-button"
              disabled={!canMoveFromSelf}
              onClick={() => setState({ ...state, step: "peer", peerIndex: 0 })}
            >
              <ChevronRight size={18} />
              周りの選択へ
            </button>
            <span className="inline-status">
              {canSelectSelfWords ? `${state.selfWordIds.length}語選択中` : "本人の選択待ち"}
            </span>
          </div>
        </section>
      )}

      {state.step === "peer" && target && currentPeer && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              周りの選択 {state.peerIndex + 1}/{peers.length}
            </p>
            <h2>
              {currentPeer.name}さんから見た{target.name}さん
            </h2>
            <p>対象者に当てはまりそうな特徴を選びます。本人が見ないように、スマホを少し隠して進めます。</p>
          </div>
          {canSelectPeerWords ? (
            <ToggleWordGrid
              words={deckWords}
              selectedIds={state.peerSelections[currentPeer.id] ?? []}
              onToggle={(id) => togglePeerWord(currentPeer.id, id)}
            />
          ) : (
            <div className="howto-panel compact">
              <h3>{currentPeer.name}さんの選択待ち</h3>
              <p className="soft-note">
                今は{currentPeer.name}さんが、{target.name}さんに当てはまりそうな特徴を選んでいます。
              </p>
            </div>
          )}
          <div className="action-row">
            <button className="primary-button" disabled={!canMoveFromPeer} onClick={moveToNextPeer}>
              <ChevronRight size={18} />
              {state.peerIndex + 1 >= peers.length ? "結果を見る" : "次の人へ"}
            </button>
            <span className="inline-status">
              {canSelectPeerWords ? `${(state.peerSelections[currentPeer.id] ?? []).length}語選択中` : "回答者の選択待ち"}
            </span>
          </div>
        </section>
      )}

      {state.step === "result" && target && (
        <section className="tool-surface">
          <div className="result-heading">
            <Eye size={24} />
            <div>
              <p className="eyebrow">4つの窓</p>
              <h2>{target.name}さんのジョハリの窓</h2>
            </div>
          </div>
          <div className="quadrant-grid">
            <div className="quadrant-card">
              <h3>開放の窓</h3>
              <p>自分も周りも選んだ特徴</p>
              <WordList words={johariResult.open} />
            </div>
            <div className="quadrant-card">
              <h3>盲点の窓</h3>
              <p>周りだけが選んだ特徴</p>
              <WordList words={johariResult.blind} />
            </div>
            <div className="quadrant-card">
              <h3>秘密の窓</h3>
              <p>自分だけが選んだ特徴</p>
              <WordList words={johariResult.hidden} />
            </div>
            <div className="quadrant-card">
              <h3>未知の窓</h3>
              <p>今回は誰も選ばなかった特徴</p>
              <WordList words={johariResult.unknown} />
            </div>
          </div>
          <div className="howto-panel compact">
            <h3>結果後の話し方</h3>
            <ul className="rule-list">
              <li>「意外だった言葉」を1つ選び、理由を明るく聞きます。</li>
              <li>盲点の窓は、本人を責める材料ではなく、周りから見た良い印象として扱います。</li>
              <li>深掘りしすぎず、本人が照れたら次の対象者へ進みます。</li>
            </ul>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlJohari} onClick={moveToNextTarget}>
              {state.targetIndex + 1 >= state.players.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.targetIndex + 1 >= state.players.length ? "完了" : "次の対象者"}
            </button>
            <button className="secondary-button" disabled={!canControlJohari} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlJohari && <p className="soft-note">次の対象者への切り替えはホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Eye size={32} />
          <p className="eyebrow">終了</p>
          <h2>全員分の窓を見ました</h2>
          <p className="talk-cue">印象に残った良い言葉を1つずつ持ち帰ると、気持ちよく終われます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlJohari} onClick={startJohari}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlJohari} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlJohari && <p className="soft-note">もう一度遊ぶ場合はホスト端末で開始します。</p>}
        </section>
      )}
    </GameFrame>
  );
}

type TurtleSoupStep = "setup" | "play" | "complete";
type TurtleSoupQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type TurtleSoupState = {
  players: Player[];
  category: TurtleSoupFilter;
  questionCount: TurtleSoupQuestionCount;
  step: TurtleSoupStep;
  caseId: string | null;
  deckCaseIds: string[];
  deckIndex: number;
  hintLevel: number;
  answerVisible: boolean;
  solvedCount: number;
  questionLog: { id: string; text: string; answer: "はい" | "いいえ" | "関係ありません" | "補足あり" }[];
};

const turtleSoupQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialTurtleSoupState: TurtleSoupState = {
  players: [],
  category: "all",
  questionCount: 10,
  step: "setup",
  caseId: null,
  deckCaseIds: [],
  deckIndex: 0,
  hintLevel: 0,
  answerVisible: false,
  solvedCount: 0,
  questionLog: [],
};

type TurtleSoupRoomEnvelope = RoomProgressState & {
  turtleSoup?: TurtleSoupState;
};

function parseTurtleSoupStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "turtle-soup") return null;
  const state =
    snapshot.room.state && typeof snapshot.room.state === "object"
      ? (snapshot.room.state as Partial<TurtleSoupRoomEnvelope>)
      : {};
  return state.turtleSoup && typeof state.turtleSoup === "object"
    ? ({ ...initialTurtleSoupState, ...state.turtleSoup } as TurtleSoupState)
    : null;
}

function getTurtleSoupProgressStep(state: TurtleSoupState) {
  const stepOrder: Record<TurtleSoupStep, number> = {
    setup: 1,
    play: 2,
    complete: 3,
  };
  return stepOrder[state.step] ?? 1;
}

function describeTurtleSoupProgress(state: TurtleSoupState) {
  if (state.step === "setup") return `ウミガメのスープの準備中です: ${state.players.length}人`;
  if (state.step === "play") {
    const current = state.deckCaseIds.length > 0 ? `${state.deckIndex + 1}/${state.deckCaseIds.length}` : "0/0";
    const facilitator = state.players.length > 0 ? state.players[state.deckIndex % state.players.length] : null;
    return facilitator
      ? `ウミガメのスープ: 問題${current}で${facilitator.name}さんが出題中です (質問${state.questionLog.length}件 / ヒント${state.hintLevel}件)`
      : `ウミガメのスープ: 問題${current}を進行中です (質問${state.questionLog.length}件 / ヒント${state.hintLevel}件)`;
  }
  return `ウミガメのスープが完了しました: ${state.solvedCount}/${state.deckCaseIds.length}問`;
}

function buildTurtleSoupRoomEnvelope(turtleSoup: TurtleSoupState, updatedBy: string | null): TurtleSoupRoomEnvelope {
  return {
    phase: turtleSoup.step === "complete" ? "complete" : "playing",
    gameKey: "turtle-soup",
    gameTitle: findGameMeta("turtle-soup")?.title ?? "ウミガメのスープ",
    step: getTurtleSoupProgressStep(turtleSoup),
    message: describeTurtleSoupProgress(turtleSoup),
    updatedBy,
    updatedAt: new Date().toISOString(),
    turtleSoup,
  };
}

function TurtleSoupGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<TurtleSoupState>("turtle-soup", initialTurtleSoupState);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState<"はい" | "いいえ" | "関係ありません" | "補足あり">("はい");
  const [privateTruthVisible, setPrivateTruthVisible] = useState(false);
  const roomTurtleSoupState = parseTurtleSoupStateFromRoom(roomSnapshot);
  const isTurtleSoupRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "turtle-soup"));
  const activeTurtleSoupState = isTurtleSoupRoom ? (roomTurtleSoupState ?? initialTurtleSoupState) : storedState;
  const state = { ...initialTurtleSoupState, ...activeTurtleSoupState };
  const casePool = useMemo(
    () => (state.category === "all" ? turtleSoupCases : turtleSoupCases.filter((item) => item.category === state.category)),
    [state.category],
  );
  const selectedQuestionCount = Math.min(state.questionCount, casePool.length);
  const activeCase = turtleSoupCases.find((item) => item.id === state.caseId) ?? null;
  const facilitator = state.players.length > 0 ? state.players[state.deckIndex % state.players.length] : null;
  const isRoomHost = isTurtleSoupRoom && roomSession?.participantRole === "host";
  const canControlTurtleSoup = !isTurtleSoupRoom || (isRoomHost && Boolean(roomSnapshot));
  const canFacilitateTurtleSoup = !isTurtleSoupRoom || canControlTurtleSoup || (Boolean(roomSnapshot) && facilitator?.id === roomSession?.participantId);
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());
  const progressLabel = state.deckCaseIds.length > 0 ? `${state.deckIndex + 1}/${state.deckCaseIds.length}` : "";

  function setState(nextStateOrUpdater: TurtleSoupState | ((current: TurtleSoupState) => TurtleSoupState)) {
    if (isTurtleSoupRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isTurtleSoupRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildTurtleSoupRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "turtle-soup",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "turtle-soup",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    setPrivateTruthVisible(false);
  }, [activeCase?.id, roomSession?.participantId]);

  useEffect(() => {
    if (state.step === "play" && !activeCase) {
      setState({ ...state, step: "setup", caseId: null, deckCaseIds: [], deckIndex: 0, hintLevel: 0, answerVisible: false });
    }
  }, [activeCase, setState, state.step]);

  function startTurtleSoup() {
    if (!canControlTurtleSoup) return;
    const deckCaseIds = shuffle(casePool)
      .slice(0, selectedQuestionCount)
      .map((item) => item.id);
    setState({
      ...state,
      step: "play",
      caseId: deckCaseIds[0] ?? null,
      deckCaseIds,
      deckIndex: 0,
      hintLevel: 0,
      answerVisible: false,
      solvedCount: 0,
      questionLog: [],
    });
  }

  function addTurtleQuestionLog() {
    if (!canFacilitateTurtleSoup) return;
    const text = draftQuestion.trim();
    if (!text) return;
    setState({
      ...state,
      questionLog: [...state.questionLog, { id: createId("question-log"), text, answer: draftAnswer }],
    });
    setDraftQuestion("");
    setDraftAnswer("はい");
  }

  function moveToNextTurtleCase(solved: boolean) {
    if (!canFacilitateTurtleSoup) return;
    const nextIndex = state.deckIndex + 1;
    const nextCaseId = state.deckCaseIds[nextIndex];
    const solvedCount = state.solvedCount + (solved ? 1 : 0);
    if (!nextCaseId) {
      setState({ ...state, step: "complete", caseId: null, hintLevel: 0, answerVisible: false, solvedCount });
      return;
    }
    setState({
      ...state,
      step: "play",
      caseId: nextCaseId,
      deckIndex: nextIndex,
      hintLevel: 0,
      answerVisible: false,
      solvedCount,
      questionLog: [],
    });
  }

  return (
    <GameFrame
      title="ウミガメのスープ"
      subtitle="はい・いいえ・関係ありませんで質問し、短い謎の真相を当てる水平思考ゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isTurtleSoupRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、質問ログ、ヒント、真相表示、次の問題を同期します。"
                : canFacilitateTurtleSoup
                  ? "この端末は今回の出題者です。質問ログ、ヒント、真相表示を操作できます。"
                  : "この端末では進行状況、質問ログ、ヒント、公開された真相を確認できます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>出題者を1人決めます。出題者だけが真相を見ます。</li>
              <li>他の参加者は「はい」「いいえ」「関係ありません」で答えられる質問をします。</li>
              <li>出題者は答えを見ながら、質問に短く返します。</li>
              <li>詰まったらヒントを1つずつ出します。真相に近づく会話を楽しみます。</li>
              <li>正解が出たら真相を読み上げ、すぐ次の問題へ進めます。</li>
            </ol>
          </div>

          {isTurtleSoupRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者をウミガメのスープメンバーに使えます</strong>
              <p>参加者一覧を取り込むと、出題者を問題ごとに順番で切り替えながら進行できます。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      caseId: null,
                      deckCaseIds: [],
                      deckIndex: 0,
                      hintLevel: 0,
                      answerVisible: false,
                      questionLog: [],
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      caseId: null,
                      deckCaseIds: [],
                      deckIndex: 0,
                      hintLevel: 0,
                      answerVisible: false,
                      questionLog: [],
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlTurtleSoup ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={2}
                maxPlayers={12}
                onChange={(players) => setState({ ...state, players, deckCaseIds: [], deckIndex: 0, caseId: null })}
              />
              <SegmentedControl
                label="カテゴリ"
                options={turtleSoupCategories}
                value={state.category}
                onChange={(category) => setState({ ...state, category, deckCaseIds: [], deckIndex: 0, caseId: null })}
              />
              <SegmentedControl
                label="今回の問題数"
                options={turtleSoupQuestionCountOptions}
                value={String(state.questionCount)}
                onChange={(questionCount) =>
                  setState({
                    ...state,
                    questionCount: Number(questionCount) as TurtleSoupQuestionCount,
                    deckCaseIds: [],
                    deckIndex: 0,
                    caseId: null,
                  })
                }
              />
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが参加者と問題数を決めると、この端末にも問題が同期されます。</p>
            </div>
          )}
          <p className="soft-note">
            この条件では{casePool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。全体の問題は300問です。
          </p>
          <div className="notice-panel calm">
            <strong>質問のコツ</strong>
            <p>「誰が」「いつ」「場所は」「見えているものは本物か」など、前提をほどく質問から始めると進みやすいです。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0 || !canControlTurtleSoup} onClick={startTurtleSoup}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlTurtleSoup} onClick={() => setState(initialTurtleSoupState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "play" && activeCase && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              問題 {progressLabel} / {activeCase.difficulty}
            </p>
            <h2>{activeCase.title}</h2>
            <p className="party-prompt-copy">{activeCase.story}</p>
            <p>{activeCase.question}</p>
            {facilitator && <p className="soft-note">今回の出題者: {facilitator.name}</p>}
          </div>
          <div className="howto-panel compact">
            <h3>出題者の返し方</h3>
            <ul className="rule-list">
              <li>答えられる質問には「はい」「いいえ」「関係ありません」で返します。</li>
              <li>近い質問には「かなり近い」「半分正解」など、少しだけ補足してもOKです。</li>
              <li>質問が止まったら、ヒントを1つだけ開きます。</li>
            </ul>
          </div>
          {state.hintLevel > 0 && (
            <div className="hint-list">
              {activeCase.hints.slice(0, state.hintLevel).map((hint, index) => (
                <p key={hint}>
                  ヒント{index + 1}: {hint}
                </p>
              ))}
            </div>
          )}
          <div className="question-log-panel">
            <h3>質問メモ</h3>
            <p>出題者が必要な時だけ記録します。記録すると全端末に同期されます。</p>
            <form
              className="question-log-form"
              onSubmit={(event) => {
                event.preventDefault();
                addTurtleQuestionLog();
              }}
            >
              <input
                value={draftQuestion}
                onChange={(event) => setDraftQuestion(event.target.value)}
                disabled={!canFacilitateTurtleSoup}
                placeholder="例: それは人間ですか？"
                maxLength={80}
              />
              <select
                value={draftAnswer}
                disabled={!canFacilitateTurtleSoup}
                onChange={(event) => setDraftAnswer(event.target.value as typeof draftAnswer)}
              >
                <option value="はい">はい</option>
                <option value="いいえ">いいえ</option>
                <option value="関係ありません">関係ありません</option>
                <option value="補足あり">補足あり</option>
              </select>
              <button className="secondary-button" disabled={!draftQuestion.trim() || !canFacilitateTurtleSoup} type="submit">
                <Plus size={18} />
                記録
              </button>
            </form>
            {state.questionLog.length > 0 && (
              <div className="question-log-list">
                {state.questionLog.map((item) => (
                  <div className="question-log-row" key={item.id}>
                    <span>{item.text}</span>
                    <strong>{item.answer}</strong>
                  </div>
                ))}
              </div>
            )}
            {isTurtleSoupRoom && !canFacilitateTurtleSoup && (
              <p className="soft-note">質問ログの記録は今回の出題者またはホスト端末で行います。</p>
            )}
          </div>
          <div className="action-row">
            <button
              className="secondary-button"
              disabled={state.hintLevel >= activeCase.hints.length || !canFacilitateTurtleSoup}
              onClick={() => setState({ ...state, hintLevel: Math.min(activeCase.hints.length, state.hintLevel + 1) })}
            >
              <MessageCircleQuestion size={18} />
              ヒントを出す
            </button>
            {isTurtleSoupRoom ? (
              <>
                <button className="secondary-button" disabled={!canFacilitateTurtleSoup} onClick={() => setPrivateTruthVisible(!privateTruthVisible)}>
                  {privateTruthVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  {privateTruthVisible ? "自分の真相確認を閉じる" : "出題者だけ真相を見る"}
                </button>
                <button className="secondary-button" disabled={!canFacilitateTurtleSoup} onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}>
                  {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  {state.answerVisible ? "全員の真相を隠す" : "真相を全員に表示"}
                </button>
              </>
            ) : (
              <button className="secondary-button" onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}>
                {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                {state.answerVisible ? "真相を隠す" : "出題者だけ真相を見る"}
              </button>
            )}
          </div>
          {privateTruthVisible && isTurtleSoupRoom && canFacilitateTurtleSoup && !state.answerVisible && (
            <div className="answer-panel wide">
              <strong>出題者用の真相</strong>
              <p>{activeCase.truth}</p>
            </div>
          )}
          {state.answerVisible && (
            <div className="answer-panel wide">
              <strong>{isTurtleSoupRoom ? "全員に表示中の真相" : "真相"}</strong>
              <p>{activeCase.truth}</p>
            </div>
          )}
          <div className="action-row">
            <button className="primary-button" disabled={!canFacilitateTurtleSoup} onClick={() => moveToNextTurtleCase(true)}>
              <Check size={18} />
              解けた
            </button>
            <button className="secondary-button" disabled={!canFacilitateTurtleSoup} onClick={() => moveToNextTurtleCase(false)}>
              <ChevronRight size={18} />
              次の問題
            </button>
          </div>
          {isTurtleSoupRoom && !canFacilitateTurtleSoup && <p className="soft-note">ヒント、真相表示、次の問題への進行は出題者またはホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <MessageCircleQuestion size={32} />
          <p className="eyebrow">終了</p>
          <h2>
            {state.solvedCount}/{state.deckCaseIds.length}問 解けました
          </h2>
          <p className="talk-cue">解けなかった問題も、真相を読んで「そういうことか」と笑えたら成功です。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlTurtleSoup} onClick={startTurtleSoup}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlTurtleSoup} onClick={() => setState({ ...state, step: "setup", caseId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlTurtleSoup && <p className="soft-note">再開や設定変更はホスト端末で行います。</p>}
        </section>
      )}
    </GameFrame>
  );
}

type AnonymousQuestionStep = "setup" | "question" | "complete";
type AnonymousQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type CustomAnonymousQuestion = {
  id: string;
  text: string;
};

type AnonymousQuestionState = {
  players: Player[];
  category: AnonymousQuestionFilter;
  questionCount: AnonymousQuestionCount;
  step: AnonymousQuestionStep;
  customQuestions: CustomAnonymousQuestion[];
  deckQuestionIds: string[];
  deckIndex: number;
};

const anonymousQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialAnonymousQuestionState: AnonymousQuestionState = {
  players: [],
  category: "all",
  questionCount: 10,
  step: "setup",
  customQuestions: [],
  deckQuestionIds: [],
  deckIndex: 0,
};

type AnonymousQuestionRoomEnvelope = RoomProgressState & {
  anonymousQuestion?: AnonymousQuestionState;
};

function parseAnonymousQuestionStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "anonymous-box") return null;
  const state =
    snapshot.room.state && typeof snapshot.room.state === "object"
      ? (snapshot.room.state as Partial<AnonymousQuestionRoomEnvelope>)
      : {};
  return state.anonymousQuestion && typeof state.anonymousQuestion === "object"
    ? ({ ...initialAnonymousQuestionState, ...state.anonymousQuestion } as AnonymousQuestionState)
    : null;
}

function getAnonymousQuestionProgressStep(state: AnonymousQuestionState) {
  const stepOrder: Record<AnonymousQuestionStep, number> = {
    setup: 1,
    question: 2,
    complete: 3,
  };
  return stepOrder[state.step] ?? 1;
}

function describeAnonymousQuestionProgress(state: AnonymousQuestionState) {
  if (state.step === "setup") return `匿名質問箱の準備中です: 投稿${state.customQuestions.length}件`;
  if (state.step === "question") {
    const current = state.deckQuestionIds.length > 0 ? `${state.deckIndex + 1}/${state.deckQuestionIds.length}` : "0/0";
    return `質問を開封中です: ${current}`;
  }
  return "匿名質問箱が完了しました";
}

function buildAnonymousQuestionRoomEnvelope(
  anonymousQuestion: AnonymousQuestionState,
  updatedBy: string | null,
): AnonymousQuestionRoomEnvelope {
  return {
    phase: anonymousQuestion.step === "complete" ? "complete" : "playing",
    gameKey: "anonymous-box",
    gameTitle: findGameMeta("anonymous-box")?.title ?? "匿名質問箱",
    step: getAnonymousQuestionProgressStep(anonymousQuestion),
    message: describeAnonymousQuestionProgress(anonymousQuestion),
    updatedBy,
    updatedAt: new Date().toISOString(),
    anonymousQuestion,
  };
}

function AnonymousQuestionBoxGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<AnonymousQuestionState>("anonymous-box", initialAnonymousQuestionState);
  const [draftQuestion, setDraftQuestion] = useState("");
  const roomAnonymousQuestionState = parseAnonymousQuestionStateFromRoom(roomSnapshot);
  const isAnonymousQuestionRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "anonymous-box"));
  const activeAnonymousQuestionState = isAnonymousQuestionRoom ? (roomAnonymousQuestionState ?? initialAnonymousQuestionState) : storedState;
  const state = { ...initialAnonymousQuestionState, ...activeAnonymousQuestionState };
  const isRoomHost = isAnonymousQuestionRoom && roomSession?.participantRole === "host";
  const canControlAnonymousQuestion = !isAnonymousQuestionRoom || (isRoomHost && Boolean(roomSnapshot));
  const canSubmitAnonymousQuestion = !isAnonymousQuestionRoom || Boolean(roomSnapshot);
  const questionPool = useMemo(
    () =>
      state.category === "all"
        ? anonymousQuestionPrompts
        : anonymousQuestionPrompts.filter((item) => item.category === state.category),
    [state.category],
  );
  const selectedQuestionCount = Math.min(state.questionCount, questionPool.length + state.customQuestions.length);
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim()) && selectedQuestionCount > 0;
  const currentQuestionId = state.deckQuestionIds[state.deckIndex] ?? null;
  const currentQuestion = currentQuestionId?.startsWith("custom:")
    ? state.customQuestions.find((item) => `custom:${item.id}` === currentQuestionId)?.text
    : anonymousQuestionPrompts.find((item) => `template:${item.id}` === currentQuestionId)?.question;
  const progressLabel = state.deckQuestionIds.length > 0 ? `${state.deckIndex + 1}/${state.deckQuestionIds.length}` : "";

  function setState(nextStateOrUpdater: AnonymousQuestionState | ((current: AnonymousQuestionState) => AnonymousQuestionState)) {
    if (isAnonymousQuestionRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isAnonymousQuestionRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildAnonymousQuestionRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "anonymous-box",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "anonymous-box",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if (state.step === "question" && !currentQuestion) {
      setState({ ...state, step: "setup", deckQuestionIds: [], deckIndex: 0 });
    }
  }, [currentQuestion, setState, state.step]);

  function addCustomQuestion() {
    const text = draftQuestion.trim();
    if (!text || !canSubmitAnonymousQuestion) return;
    setState({
      ...state,
      customQuestions: [...state.customQuestions, { id: createId("question"), text }],
      deckQuestionIds: [],
      deckIndex: 0,
    });
    setDraftQuestion("");
  }

  function removeCustomQuestion(id: string) {
    if (!canControlAnonymousQuestion) return;
    setState({
      ...state,
      customQuestions: state.customQuestions.filter((question) => question.id !== id),
      deckQuestionIds: [],
      deckIndex: 0,
    });
  }

  function startAnonymousBox() {
    if (!canControlAnonymousQuestion) return;
    const customIds = state.customQuestions.map((question) => `custom:${question.id}`);
    const templateLimit = Math.max(0, selectedQuestionCount - customIds.length);
    const templateIds = shuffle(questionPool)
      .slice(0, templateLimit)
      .map((question) => `template:${question.id}`);
    const deckQuestionIds = shuffle([...customIds, ...templateIds]).slice(0, selectedQuestionCount);
    setState({ ...state, step: "question", deckQuestionIds, deckIndex: 0 });
  }

  function moveToNextAnonymousQuestion() {
    if (!canControlAnonymousQuestion) return;
    const nextIndex = state.deckIndex + 1;
    if (nextIndex >= state.deckQuestionIds.length) {
      setState({ ...state, step: "complete" });
      return;
    }
    setState({ ...state, deckIndex: nextIndex });
  }

  return (
    <GameFrame
      title="匿名質問箱"
      subtitle="誰が書いたかを追わずに、答えやすい質問を引いて会話を広げます。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isAnonymousQuestionRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、質問開封、次の質問を同期します。"
                : "この端末では匿名質問を投稿できます。質問の開封と進行はホスト端末で行います。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を2人以上登録します。</li>
              <li>テンプレート質問のカテゴリと、今回使う質問数を選びます。</li>
              <li>追加したい質問があれば、スマホを回して匿名で投稿します。</li>
              <li>質問を1つずつ引き、答えたい人から答えます。答えたくない人はパスできます。</li>
              <li>投稿者探しはせず、答えやすい範囲で会話を楽しみます。</li>
            </ol>
          </div>

          {isAnonymousQuestionRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を匿名質問箱メンバーに使えます</strong>
              <p>参加者一覧を取り込むと、ルーム内の人数で開始条件を満たせます。投稿者名は質問には保存しません。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      deckQuestionIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      deckQuestionIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlAnonymousQuestion ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={2}
                maxPlayers={20}
                onChange={(players) => setState({ ...state, players, deckQuestionIds: [], deckIndex: 0 })}
              />
              <SegmentedControl
                label="テンプレートカテゴリ"
                options={anonymousQuestionCategories}
                value={state.category}
                onChange={(category) => setState({ ...state, category, deckQuestionIds: [], deckIndex: 0 })}
              />
              <SegmentedControl
                label="今回の質問数"
                options={anonymousQuestionCountOptions}
                value={String(state.questionCount)}
                onChange={(questionCount) =>
                  setState({
                    ...state,
                    questionCount: Number(questionCount) as AnonymousQuestionCount,
                    deckQuestionIds: [],
                    deckIndex: 0,
                  })
                }
              />
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが開始するまで、この端末から匿名質問を投稿できます。</p>
            </div>
          )}

          <div className="setup-block">
            <div className="setup-heading">
              <div>
                <h3>匿名で質問を追加</h3>
                <p>投稿者が分からないよう、名前は保存せずに質問だけ追加します。</p>
              </div>
              <span className="count-badge">{state.customQuestions.length}件</span>
            </div>
            <form
              className="question-submit-row"
              onSubmit={(event) => {
                event.preventDefault();
                addCustomQuestion();
              }}
            >
              <input
                value={draftQuestion}
                onChange={(event) => setDraftQuestion(event.target.value)}
                placeholder="答えやすい質問を書く"
                maxLength={80}
              />
              <button className="primary-button" disabled={!draftQuestion.trim() || !canSubmitAnonymousQuestion} type="submit">
                <Plus size={18} />
                追加
              </button>
            </form>
            {state.customQuestions.length > 0 && canControlAnonymousQuestion && (
              <div className="custom-question-list">
                {state.customQuestions.map((question) => (
                  <div className="custom-question-row" key={question.id}>
                    <span>{question.text}</span>
                    <button className="ghost-icon-button" onClick={() => removeCustomQuestion(question.id)} type="button">
                      <Trash2 size={18} />
                      <span className="sr-only">削除</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {state.customQuestions.length > 0 && !canControlAnonymousQuestion && (
              <p className="soft-note">投稿済みの質問はホストが確認します。内容から投稿者を当てにいかない前提で遊びます。</p>
            )}
          </div>
          <p className="soft-note">
            テンプレートは{questionPool.length}問、追加質問は{state.customQuestions.length}問です。今回は最大
            {selectedQuestionCount}問を使います。テンプレート全体は300問です。
          </p>
          <div className="notice-panel">
            <strong>投稿前の約束</strong>
            <p>個人攻撃、暴露、容姿いじり、答えにくい恋愛・収入・家族事情は避けます。困る質問は読まずにスキップできます。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || !canControlAnonymousQuestion} onClick={startAnonymousBox}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlAnonymousQuestion} onClick={() => setState(initialAnonymousQuestionState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "question" && currentQuestion && (
        <section className="tool-surface">
          <div className="prompt-panel question-card">
            <p className="eyebrow">質問 {progressLabel}</p>
            <h2>{currentQuestion}</h2>
            <p>答えたい人から話します。全員回答にしなくても大丈夫です。</p>
          </div>
          <div className="howto-panel compact">
            <h3>話し方</h3>
            <ul className="rule-list">
              <li>答えたくない人は「パス」でOKです。</li>
              <li>深掘りは、本人が楽しそうな時だけにします。</li>
              <li>投稿者を当てにいく流れになったら、次の質問へ進みます。</li>
            </ul>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlAnonymousQuestion} onClick={moveToNextAnonymousQuestion}>
              {state.deckIndex + 1 >= state.deckQuestionIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckQuestionIds.length ? "完了" : "次の質問"}
            </button>
            <button className="secondary-button" disabled={!canControlAnonymousQuestion} onClick={moveToNextAnonymousQuestion}>
              <ChevronRight size={18} />
              スキップ
            </button>
          </div>
          {!canControlAnonymousQuestion && <p className="soft-note">質問を進める操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <ListChecks size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckQuestionIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">答えやすかった質問をもう少し深掘りするか、カテゴリを変えて続けられます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlAnonymousQuestion} onClick={startAnonymousBox}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlAnonymousQuestion} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlAnonymousQuestion && <p className="soft-note">再開や設定変更はホスト端末で行います。</p>}
        </section>
      )}
    </GameFrame>
  );
}

type TwoChoiceChoice = "A" | "B" | "skip";
type TwoChoiceStep = "setup" | "vote" | "result" | "complete";
type TwoChoiceQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type TwoChoiceState = {
  players: Player[];
  category: TwoChoiceCategory;
  includeAdultTopics: boolean;
  questionCount: TwoChoiceQuestionCount;
  step: TwoChoiceStep;
  promptId: string | null;
  votes: Record<string, TwoChoiceChoice>;
  deckPromptIds: string[];
  deckIndex: number;
};

const twoChoiceQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialTwoChoiceState: TwoChoiceState = {
  players: [],
  category: "all",
  includeAdultTopics: false,
  questionCount: 10,
  step: "setup",
  promptId: null,
  votes: {},
  deckPromptIds: [],
  deckIndex: 0,
};

type TwoChoiceRoomEnvelope = RoomProgressState & {
  twoChoice?: TwoChoiceState;
};

function parseTwoChoiceStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "two-choice") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<TwoChoiceRoomEnvelope>) : {};
  return state.twoChoice && typeof state.twoChoice === "object" ? ({ ...initialTwoChoiceState, ...state.twoChoice } as TwoChoiceState) : null;
}

function getTwoChoiceProgressStep(state: TwoChoiceState) {
  const stepOrder: Record<TwoChoiceStep, number> = {
    setup: 1,
    vote: 2,
    result: 3,
    complete: 4,
  };
  return stepOrder[state.step] ?? 1;
}

function describeTwoChoiceProgress(state: TwoChoiceState) {
  if (state.step === "setup") return "二択トークの設定中です";
  if (state.step === "vote") {
    const votedCount = state.players.filter((player) => state.votes[player.id]).length;
    return `投票中です: ${votedCount}/${state.players.length}`;
  }
  if (state.step === "result") return "投票結果を表示中です";
  return "二択トークが完了しました";
}

function buildTwoChoiceRoomEnvelope(twoChoice: TwoChoiceState, updatedBy: string | null): TwoChoiceRoomEnvelope {
  return {
    phase: twoChoice.step === "complete" ? "complete" : "playing",
    gameKey: "two-choice",
    gameTitle: findGameMeta("two-choice")?.title ?? "二択トーク",
    step: getTwoChoiceProgressStep(twoChoice),
    message: describeTwoChoiceProgress(twoChoice),
    updatedBy,
    updatedAt: new Date().toISOString(),
    twoChoice,
  };
}

function roomParticipantsToPlayers(snapshot: RoomSnapshot, includeHost: boolean) {
  return snapshot.participants
    .filter((participant) => includeHost || participant.role !== "host")
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
    }));
}

function TwoChoiceGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<TwoChoiceState>("two-choice", initialTwoChoiceState);
  const roomTwoChoiceState = parseTwoChoiceStateFromRoom(roomSnapshot);
  const isTwoChoiceRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "two-choice"));
  const activeTwoChoiceState = isTwoChoiceRoom ? (roomTwoChoiceState ?? initialTwoChoiceState) : storedState;
  const state = { ...initialTwoChoiceState, ...activeTwoChoiceState };
  const isRoomHost = isTwoChoiceRoom && roomSession?.participantRole === "host";
  const canControlTwoChoice = !isTwoChoiceRoom || (isRoomHost && Boolean(roomSnapshot));
  const prompt = twoChoicePrompts.find((item) => item.id === state.promptId) ?? null;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());
  const activeTwoChoiceCategory = !state.includeAdultTopics && state.category === "adult" ? "all" : state.category;
  const availableTwoChoiceCategories = state.includeAdultTopics ? twoChoiceCategories : normalTwoChoiceCategories;
  const promptPool = useMemo(
    () =>
      activeTwoChoiceCategory === "all"
        ? state.includeAdultTopics
          ? twoChoicePrompts
          : normalTwoChoicePrompts
        : twoChoicePrompts.filter((item) => item.category === activeTwoChoiceCategory),
    [activeTwoChoiceCategory, state.includeAdultTopics],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";

  function setState(nextStateOrUpdater: TwoChoiceState | ((current: TwoChoiceState) => TwoChoiceState)) {
    if (isTwoChoiceRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isTwoChoiceRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildTwoChoiceRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "two-choice",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "two-choice",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if ((state.step === "vote" || state.step === "result") && !prompt) {
      setState({ ...state, step: "setup", promptId: null, votes: {}, deckPromptIds: [], deckIndex: 0 });
    }
  }, [prompt, setState, state.step]);

  const result = useMemo(() => {
    if (!prompt) return null;
    const byChoice = {
      A: state.players.filter((player) => state.votes[player.id] === "A"),
      B: state.players.filter((player) => state.votes[player.id] === "B"),
      skip: state.players.filter((player) => state.votes[player.id] === "skip"),
    };
    const total = byChoice.A.length + byChoice.B.length;
    return { byChoice, total };
  }, [prompt, state.players, state.votes]);

  function startTwoChoiceRound() {
    const deckPromptIds = shuffle(promptPool)
      .slice(0, selectedQuestionCount)
      .map((item) => item.id);
    setState({
      ...state,
      step: "vote",
      promptId: deckPromptIds[0] ?? null,
      votes: {},
      deckPromptIds,
      deckIndex: 0,
    });
  }

  function updateVote(playerId: string, choice: TwoChoiceChoice) {
    setState({ ...state, votes: { ...state.votes, [playerId]: choice } });
  }

  function moveToNextPrompt() {
    const nextIndex = state.deckIndex + 1;
    const nextPromptId = state.deckPromptIds[nextIndex];
    if (!nextPromptId) {
      setState({ ...state, step: "complete", votes: {}, promptId: null });
      return;
    }
    setState({ ...state, step: "vote", promptId: nextPromptId, deckIndex: nextIndex, votes: {} });
  }

  const votedCount = state.players.filter((player) => state.votes[player.id]).length;
  const allVoted = votedCount === state.players.length && state.players.length > 0;
  const canVoteForPlayer = (playerId: string) => !isTwoChoiceRoom || canControlTwoChoice || roomSession?.participantId === playerId;

  return (
    <GameFrame title="二択トーク" subtitle="選んだ理由を話すだけで、場がすぐ温まります。" onHome={onHome} onResetAll={onResetAll}>
      {isTwoChoiceRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、結果表示、次のお題を同期します。"
                : "この端末では自分の投票だけ操作できます。全員の投票状況と結果は同期されます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を2人以上登録します。</li>
              <li>カテゴリ、Hな話題のON/OFF、今回使う設問数を選びます。</li>
              <li>お題が出たら、全員がAかBを選びます。答えにくい人はパスできます。</li>
              <li>結果が出たら、少数派または気になった回答の人から理由を聞きます。</li>
              <li>正解はありません。違いを楽しみながら、軽く会話を広げるゲームです。</li>
            </ol>
          </div>

          {isTwoChoiceRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を二択トークメンバーに使えます</strong>
              <p>参加者それぞれの端末で自分の投票をするには、ルーム参加者を取り込んでください。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      promptId: null,
                      votes: {},
                      deckPromptIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      promptId: null,
                      votes: {},
                      deckPromptIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlTwoChoice ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={2}
                maxPlayers={20}
                onChange={(players) => setState({ ...state, players })}
              />
              <SegmentedControl
                label="カテゴリ"
                options={availableTwoChoiceCategories}
                value={activeTwoChoiceCategory}
                onChange={(category) => setState({ ...state, category, deckPromptIds: [], deckIndex: 0, promptId: null })}
              />
              <ToggleSwitch
                label="Hな話題"
                description={
                  state.includeAdultTopics
                    ? "ON: 全部に大人向けも混ぜます。カテゴリで大人向けだけも選べます。"
                    : "OFF: 軽いH寄りの恋バナや距離感の話題は出ません。"
                }
                checked={state.includeAdultTopics}
                onChange={(includeAdultTopics) =>
                  setState({
                    ...state,
                    includeAdultTopics,
                    category: state.category === "adult" ? "all" : state.category,
                    deckPromptIds: [],
                    deckIndex: 0,
                    promptId: null,
                  })
                }
              />
              <SegmentedControl
                label="今回の設問数"
                options={twoChoiceQuestionCountOptions}
                value={String(state.questionCount)}
                onChange={(questionCount) =>
                  setState({
                    ...state,
                    questionCount: Number(questionCount) as TwoChoiceQuestionCount,
                    deckPromptIds: [],
                    deckIndex: 0,
                    promptId: null,
                  })
                }
              />
              <p className="soft-note">
                この条件では{promptPool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。
                Hな話題は{state.includeAdultTopics ? "ON" : "OFF"}です。
              </p>
              {state.includeAdultTopics && (
                <div className="notice-panel">
                  <strong>Hな話題がONです</strong>
                  <p>軽いH寄りの恋バナや距離感の話題を含みます。苦手な人がいる場ではOFFにしてください。</p>
                </div>
              )}
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストがお題を開始すると、この端末で自分の投票を選べます。</p>
            </div>
          )}

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0 || !canControlTwoChoice} onClick={startTwoChoiceRound}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlTwoChoice} onClick={() => setState(initialTwoChoiceState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "vote" && prompt && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">お題 {progressLabel}</p>
            <h2>{prompt.question}</h2>
            <div className="choice-display">
              <span>A. {prompt.optionA}</span>
              <span>B. {prompt.optionB}</span>
            </div>
          </div>
          <div className="howto-panel compact">
            <h3>投票のしかた</h3>
            <ul className="rule-list">
              <li>直感で選んで大丈夫です。</li>
              <li>全員の投票が終わるまで、理由はまだ話さないと結果がきれいに出ます。</li>
              <li>迷った人は「今の気分なら」で選ぶか、パスを使います。</li>
            </ul>
          </div>

          <div className="vote-list">
            {state.players.map((player) => (
              <div className="vote-row" key={player.id}>
                <strong>{player.name || "名前なし"}</strong>
                <div className="vote-buttons">
                  <button
                    className={state.votes[player.id] === "A" ? "selected-choice" : ""}
                    disabled={!canVoteForPlayer(player.id)}
                    onClick={() => updateVote(player.id, "A")}
                  >
                    {prompt.optionA}
                  </button>
                  <button
                    className={state.votes[player.id] === "B" ? "selected-choice" : ""}
                    disabled={!canVoteForPlayer(player.id)}
                    onClick={() => updateVote(player.id, "B")}
                  >
                    {prompt.optionB}
                  </button>
                  <button
                    className={state.votes[player.id] === "skip" ? "selected-choice muted" : ""}
                    disabled={!canVoteForPlayer(player.id)}
                    onClick={() => updateVote(player.id, "skip")}
                  >
                    パス
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!allVoted || !canControlTwoChoice} onClick={() => setState({ ...state, step: "result" })}>
              <ChevronRight size={18} />
              結果を見る
            </button>
            <span className="inline-status">{votedCount}/{state.players.length} 投票済み</span>
          </div>
          {!canControlTwoChoice && <p className="soft-note">自分の投票だけ操作できます。結果表示はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "result" && prompt && result && (
        <section className="tool-surface">
          <div className="result-heading">
            <Trophy size={24} />
            <div>
              <p className="eyebrow">結果</p>
              <h2>{prompt.question}</h2>
            </div>
          </div>
          <ChoiceBar label={prompt.optionA} count={result.byChoice.A.length} total={result.total} />
          <ChoiceBar label={prompt.optionB} count={result.byChoice.B.length} total={result.total} />
          {result.byChoice.skip.length > 0 && (
            <p className="soft-note">パス: {result.byChoice.skip.map((player) => player.name).join("、")}</p>
          )}
          <div className="split-result">
            <NameCluster title={prompt.optionA} players={result.byChoice.A} />
            <NameCluster title={prompt.optionB} players={result.byChoice.B} />
          </div>
          <div className="howto-panel compact">
            <h3>結果後の声かけ</h3>
            <ul className="rule-list">
              <li>少なかった側から「どうして？」と聞くと話が広がりやすいです。</li>
              <li>同数なら、それぞれ1人ずつ理由を聞きます。</li>
              <li>盛り上がったら深掘りして、落ち着いたら次のお題へ進みます。</li>
            </ul>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlTwoChoice} onClick={moveToNextPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" disabled={!canControlTwoChoice} onClick={() => setState({ ...state, step: "setup", votes: {} })}>
              <Users size={18} />
              参加者を変える
            </button>
          </div>
          {!canControlTwoChoice && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Trophy size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">続ける場合は、同じ設定で新しい設問をシャッフルできます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlTwoChoice} onClick={startTwoChoiceRound}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlTwoChoice} onClick={() => setState({ ...state, step: "setup", votes: {}, promptId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

function ChoiceBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="choice-bar">
      <div className="choice-bar-label">
        <strong>{label}</strong>
        <span>{count}票</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function NameCluster({ title, players }: { title: string; players: Player[] }) {
  return (
    <div className="name-cluster">
      <h3>{title}</h3>
      {players.length === 0 ? <EmptyState text="なし" /> : <p>{players.map((player) => player.name).join("、")}</p>}
    </div>
  );
}

type ImpressionVoteChoice = string | "skip";
type ImpressionStep = "setup" | "vote" | "result" | "complete";
type ImpressionQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type ImpressionState = {
  players: Player[];
  category: ImpressionCategory;
  includeAdultTopics: boolean;
  questionCount: ImpressionQuestionCount;
  allowSelfVote: boolean;
  step: ImpressionStep;
  promptId: string | null;
  votes: Record<string, ImpressionVoteChoice>;
  deckPromptIds: string[];
  deckIndex: number;
};

const impressionQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialImpressionState: ImpressionState = {
  players: [],
  category: "all",
  includeAdultTopics: false,
  questionCount: 10,
  allowSelfVote: false,
  step: "setup",
  promptId: null,
  votes: {},
  deckPromptIds: [],
  deckIndex: 0,
};

type ImpressionRoomEnvelope = RoomProgressState & {
  impression?: ImpressionState;
};

function parseImpressionStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "impression-ranking") return null;
  const state =
    snapshot.room.state && typeof snapshot.room.state === "object"
      ? (snapshot.room.state as Partial<ImpressionRoomEnvelope>)
      : {};
  return state.impression && typeof state.impression === "object"
    ? ({ ...initialImpressionState, ...state.impression } as ImpressionState)
    : null;
}

function getImpressionProgressStep(state: ImpressionState) {
  const stepOrder: Record<ImpressionStep, number> = {
    setup: 1,
    vote: 2,
    result: 3,
    complete: 4,
  };
  return stepOrder[state.step] ?? 1;
}

function describeImpressionProgress(state: ImpressionState) {
  if (state.step === "setup") return "第一印象ランキングの設定中です";
  if (state.step === "vote") {
    const votedCount = state.players.filter((player) => state.votes[player.id]).length;
    return `投票中です: ${votedCount}/${state.players.length}`;
  }
  if (state.step === "result") return "ランキング結果を表示中です";
  return "第一印象ランキングが完了しました";
}

function buildImpressionRoomEnvelope(impression: ImpressionState, updatedBy: string | null): ImpressionRoomEnvelope {
  return {
    phase: impression.step === "complete" ? "complete" : "playing",
    gameKey: "impression-ranking",
    gameTitle: findGameMeta("impression-ranking")?.title ?? "第一印象ランキング",
    step: getImpressionProgressStep(impression),
    message: describeImpressionProgress(impression),
    updatedBy,
    updatedAt: new Date().toISOString(),
    impression,
  };
}

function ImpressionRankingGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<ImpressionState>("impression-ranking", initialImpressionState);
  const roomImpressionState = parseImpressionStateFromRoom(roomSnapshot);
  const isImpressionRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "impression-ranking"));
  const activeImpressionState = isImpressionRoom ? (roomImpressionState ?? initialImpressionState) : storedState;
  const state = { ...initialImpressionState, ...activeImpressionState };
  const isRoomHost = isImpressionRoom && roomSession?.participantRole === "host";
  const canControlImpression = !isImpressionRoom || (isRoomHost && Boolean(roomSnapshot));
  const prompt = impressionPrompts.find((item) => item.id === state.promptId) ?? null;
  const canStart = state.players.length >= 3 && state.players.every((player) => player.name.trim());
  const activeImpressionCategory = !state.includeAdultTopics && state.category === "adult" ? "all" : state.category;
  const availableImpressionCategories = state.includeAdultTopics ? impressionCategories : normalImpressionCategories;
  const promptPool = useMemo(
    () =>
      activeImpressionCategory === "all"
        ? state.includeAdultTopics
          ? impressionPrompts
          : normalImpressionPrompts
        : impressionPrompts.filter((item) => item.category === activeImpressionCategory),
    [activeImpressionCategory, state.includeAdultTopics],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";

  function setState(nextStateOrUpdater: ImpressionState | ((current: ImpressionState) => ImpressionState)) {
    if (isImpressionRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isImpressionRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildImpressionRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "impression-ranking",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "impression-ranking",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if ((state.step === "vote" || state.step === "result") && !prompt) {
      setState({ ...state, step: "setup", promptId: null, votes: {}, deckPromptIds: [], deckIndex: 0 });
    }
  }, [prompt, setState, state.step]);

  const result = useMemo(() => {
    const rows = state.players
      .map((player) => ({
        player,
        count: Object.values(state.votes).filter((targetId) => targetId === player.id).length,
      }))
      .sort((a, b) => b.count - a.count || a.player.name.localeCompare(b.player.name, "ja"));
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const topCount = rows[0]?.count ?? 0;
    const winners = topCount === 0 ? [] : rows.filter((row) => row.count === topCount).map((row) => row.player);
    const skipped = state.players.filter((player) => state.votes[player.id] === "skip");
    return { rows, total, topCount, winners, skipped };
  }, [state.players, state.votes]);

  function startImpressionRound() {
    const deckPromptIds = shuffle(promptPool)
      .slice(0, selectedQuestionCount)
      .map((item) => item.id);
    setState({
      ...state,
      step: "vote",
      promptId: deckPromptIds[0] ?? null,
      votes: {},
      deckPromptIds,
      deckIndex: 0,
    });
  }

  function updateImpressionVote(playerId: string, targetId: ImpressionVoteChoice) {
    setState({ ...state, votes: { ...state.votes, [playerId]: targetId } });
  }

  function moveToNextImpressionPrompt() {
    const nextIndex = state.deckIndex + 1;
    const nextPromptId = state.deckPromptIds[nextIndex];
    if (!nextPromptId) {
      setState({ ...state, step: "complete", votes: {}, promptId: null });
      return;
    }
    setState({ ...state, step: "vote", promptId: nextPromptId, deckIndex: nextIndex, votes: {} });
  }

  const votedCount = state.players.filter((player) => state.votes[player.id]).length;
  const allVoted = votedCount === state.players.length && state.players.length > 0;
  const canVoteForPlayer = (playerId: string) =>
    !isImpressionRoom || canControlImpression || roomSession?.participantId === playerId;

  return (
    <GameFrame
      title="第一印象ランキング"
      subtitle="一番当てはまりそうな人を選んで、明るい印象を共有するゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isImpressionRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、結果表示、次のお題を同期します。"
                : "この端末では自分の投票だけ操作できます。ランキング結果はホスト操作で同期されます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を3人以上登録します。</li>
              <li>カテゴリ、Hな話題のON/OFF、今回使う設問数、自分への投票の有無を選びます。</li>
              <li>お題が出たら、全員が「一番当てはまりそうな人」を1人選びます。迷う人はパスできます。</li>
              <li>結果が出たら、1位の人に短く明るい理由を聞きます。同票なら全員を1位として扱います。</li>
              <li>選ばれた人が嬉しくなる言い方を優先します。からかいすぎや暴露は避けて遊びます。</li>
            </ol>
          </div>

          {isImpressionRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を第一印象ランキングメンバーに使えます</strong>
              <p>参加者それぞれの端末で自分の投票をするには、ルーム参加者を取り込んでください。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      promptId: null,
                      votes: {},
                      deckPromptIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      promptId: null,
                      votes: {},
                      deckPromptIds: [],
                      deckIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlImpression ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={3}
                maxPlayers={12}
                onChange={(players) => setState({ ...state, players, votes: {} })}
              />
              <SegmentedControl
                label="カテゴリ"
                options={availableImpressionCategories}
                value={activeImpressionCategory}
                onChange={(category) => setState({ ...state, category, deckPromptIds: [], deckIndex: 0, promptId: null, votes: {} })}
              />
              <ToggleSwitch
                label="Hな話題"
                description={
                  state.includeAdultTopics
                    ? "ON: 夜の話題・恋バナ寄りの第一印象お題も混ぜます。"
                    : "OFF: 通常の第一印象お題だけで遊びます。"
                }
                checked={state.includeAdultTopics}
                onChange={(includeAdultTopics) =>
                  setState({
                    ...state,
                    includeAdultTopics,
                    category: state.category === "adult" ? "all" : state.category,
                    deckPromptIds: [],
                    deckIndex: 0,
                    promptId: null,
                    votes: {},
                  })
                }
              />
              <SegmentedControl
                label="今回の設問数"
                options={impressionQuestionCountOptions}
                value={String(state.questionCount)}
                onChange={(questionCount) =>
                  setState({
                    ...state,
                    questionCount: Number(questionCount) as ImpressionQuestionCount,
                    deckPromptIds: [],
                    deckIndex: 0,
                    promptId: null,
                    votes: {},
                  })
                }
              />
              <ToggleSwitch
                label="自分への投票"
                description={state.allowSelfVote ? "ON: 自分も候補に入ります。" : "OFF: 自分以外の人から選びます。"}
                checked={state.allowSelfVote}
                onChange={(allowSelfVote) => setState({ ...state, allowSelfVote, votes: {} })}
              />
              <p className="soft-note">
                この条件では{promptPool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。通常300問、大人向け30問です。
              </p>
              {state.includeAdultTopics && (
                <div className="notice-panel">
                  <strong>Hな話題がONです</strong>
                  <p>恋バナ寄りの印象お題を含みます。相手が答えにくそうなら、パスや次のお題へ切り替えてください。</p>
                </div>
              )}
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストがお題を開始すると、この端末で自分の投票を選べます。</p>
            </div>
          )}

          <div className="notice-panel calm">
            <strong>明るいランキング専用です</strong>
            <p>このゲームは印象を褒め合うためのものです。選んだ理由は短く、本人が受け取りやすい言い方にします。</p>
          </div>
          <div className="action-row">
            <button
              className="primary-button"
              disabled={!canStart || selectedQuestionCount === 0 || !canControlImpression}
              onClick={startImpressionRound}
            >
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlImpression} onClick={() => setState(initialImpressionState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "vote" && prompt && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">お題 {progressLabel}</p>
            <h2>{prompt.question}</h2>
            <p>直感で1人選びます。理由は結果を見るまで話さないと、投票がきれいに出ます。</p>
          </div>
          <div className="howto-panel compact">
            <h3>投票のしかた</h3>
            <ul className="rule-list">
              <li>「一番そう見える」で気軽に選びます。</li>
              <li>いじりやすさではなく、良い印象や楽しいイメージを優先します。</li>
              <li>決めきれない時や本人が困りそうな時はパスできます。</li>
            </ul>
          </div>

          <div className="vote-list">
            {state.players.map((voter) => {
              const candidates = state.allowSelfVote ? state.players : state.players.filter((player) => player.id !== voter.id);
              return (
                <div className="vote-row ranking-vote-row" key={voter.id}>
                  <strong>{voter.name || "名前なし"}</strong>
                  <div className="ranking-vote-buttons">
                    {candidates.map((candidate) => (
                      <button
                        className={state.votes[voter.id] === candidate.id ? "selected-choice" : ""}
                        disabled={!canVoteForPlayer(voter.id)}
                        key={candidate.id}
                        onClick={() => updateImpressionVote(voter.id, candidate.id)}
                      >
                        {candidate.name}
                      </button>
                    ))}
                    <button
                      className={state.votes[voter.id] === "skip" ? "selected-choice muted" : ""}
                      disabled={!canVoteForPlayer(voter.id)}
                      onClick={() => updateImpressionVote(voter.id, "skip")}
                    >
                      パス
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!allVoted || !canControlImpression} onClick={() => setState({ ...state, step: "result" })}>
              <ChevronRight size={18} />
              結果を見る
            </button>
            <span className="inline-status">{votedCount}/{state.players.length} 投票済み</span>
          </div>
          {!canControlImpression && <p className="soft-note">自分の投票だけ操作できます。結果表示はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "result" && prompt && (
        <section className="tool-surface">
          <div className="result-heading">
            <Trophy size={24} />
            <div>
              <p className="eyebrow">結果</p>
              <h2>{prompt.question}</h2>
            </div>
          </div>
          <p className="talk-cue">
            {result.winners.length > 0
              ? `今回の1位: ${result.winners.map((player) => player.name).join("、")}さん`
              : "今回は票が入りませんでした。次のお題へ進みましょう。"}
          </p>
          <div className="ranking-bars">
            {result.rows.map(({ player, count }) => (
              <ChoiceBar key={player.id} label={player.name} count={count} total={result.total} />
            ))}
          </div>
          {result.skipped.length > 0 && <p className="soft-note">パス: {result.skipped.map((player) => player.name).join("、")}</p>}
          <div className="howto-panel compact">
            <h3>結果後の声かけ</h3>
            <ul className="rule-list">
              <li>1位の人に「どのあたりがそう見えた？」と明るく聞きます。</li>
              <li>同票なら、それぞれ1人ずつ軽く理由を聞きます。</li>
              <li>本人が照れていたら深掘りしすぎず、次のお題へ進みます。</li>
            </ul>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlImpression} onClick={moveToNextImpressionPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" disabled={!canControlImpression} onClick={() => setState({ ...state, step: "setup", votes: {} })}>
              <Users size={18} />
              参加者を変える
            </button>
          </div>
          {!canControlImpression && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Sparkles size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">雰囲気がよければ、カテゴリを変えてもう一度遊べます。</p>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlImpression} onClick={startImpressionRound}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlImpression} onClick={() => setState({ ...state, step: "setup", votes: {}, promptId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

type PartyPackStep = "setup" | "prompt" | "complete";
type PartyPackQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type PartyPackState = {
  players: Player[];
  mode: PartyPackMode;
  questionCount: PartyPackQuestionCount;
  step: PartyPackStep;
  promptId: string | null;
  deckPromptIds: string[];
  deckIndex: number;
  answerVisible: boolean;
  currentPlayerIndex: number;
  votes: Record<string, string>;
  guesses: Record<string, string>;
  scoreCounts: Record<string, number>;
  safeCounts: Record<string, number>;
  missCounts: Record<string, number>;
  actionLog: string[];
};

const partyPackQuestionCountOptions: SegmentedOption<string>[] = [
  { value: "5", label: "5問" },
  { value: "10", label: "10問" },
  { value: "20", label: "20問" },
  { value: "30", label: "30問" },
  { value: "50", label: "50問" },
  { value: "100", label: "100問" },
  { value: "300", label: "300問" },
];

const initialPartyPackState: PartyPackState = {
  players: [],
  mode: "all",
  questionCount: 10,
  step: "setup",
  promptId: null,
  deckPromptIds: [],
  deckIndex: 0,
  answerVisible: false,
  currentPlayerIndex: 0,
  votes: {},
  guesses: {},
  scoreCounts: {},
  safeCounts: {},
  missCounts: {},
  actionLog: [],
};

function PartyModeGuide({ mode, compact = false }: { mode: PartyPackPromptMode; compact?: boolean }) {
  const guide = partyPackModeGuides[mode];
  return (
    <div className={`howto-panel ${compact ? "compact" : ""}`}>
      <h3>{guide.label}の詳しい進め方</h3>
      <p>{guide.description}</p>
      <ol className="rule-list">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="tip-list">
        {guide.tips.map((tip) => (
          <span key={tip}>{tip}</span>
        ))}
      </div>
    </div>
  );
}

type PartyPackRoomEnvelope = RoomProgressState & {
  partyPack?: PartyPackState;
};

function parsePartyPackStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "party-pack") return null;
  const state =
    snapshot.room.state && typeof snapshot.room.state === "object"
      ? (snapshot.room.state as Partial<PartyPackRoomEnvelope>)
      : {};
  return state.partyPack && typeof state.partyPack === "object"
    ? ({ ...initialPartyPackState, ...state.partyPack } as PartyPackState)
    : null;
}

function getPartyPackProgressStep(state: PartyPackState) {
  const stepOrder: Record<PartyPackStep, number> = {
    setup: 1,
    prompt: 2,
    complete: 3,
  };
  return stepOrder[state.step] ?? 1;
}

function isPartyPackTurnMode(mode: PartyPackPromptMode) {
  return mode === "yamanote" || mode === "reverse-word" || mode === "loanword-ban";
}

function isPartyPackOwnerMode(mode: PartyPackPromptMode) {
  return mode === "truth-lie" || mode === "acting" || mode === "hint-quiz";
}

function describePartyPackProgress(state: PartyPackState) {
  if (state.step === "setup") return `定番ゲームパックの設定中です: ${state.players.length}人`;
  if (state.step === "prompt") {
    const prompt = partyPackPrompts.find((item) => item.id === state.promptId) ?? null;
    const progress = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "準備中";
    const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
    const label = prompt ? partyPackModeGuides[prompt.mode].label : "定番ゲーム";
    if (prompt && (isPartyPackTurnMode(prompt.mode) || isPartyPackOwnerMode(prompt.mode)) && currentPlayer) {
      return `定番ゲームパック: ${label} ${progress}で${currentPlayer.name}さんの番です`;
    }
    return `定番ゲームパック: ${label} ${progress}を進行中です`;
  }
  return `定番ゲームパックが完了しました: ${state.deckPromptIds.length}問`;
}

function buildPartyPackRoomEnvelope(partyPack: PartyPackState, updatedBy: string | null): PartyPackRoomEnvelope {
  return {
    phase: partyPack.step === "complete" ? "complete" : "playing",
    gameKey: "party-pack",
    gameTitle: findGameMeta("party-pack")?.title ?? "定番ゲームパック",
    step: getPartyPackProgressStep(partyPack),
    message: describePartyPackProgress(partyPack),
    updatedBy,
    updatedAt: new Date().toISOString(),
    partyPack,
  };
}

function PartyPackGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [privateAnswerVisible, setPrivateAnswerVisible] = useState(false);
  const [storedState, setStoredState] = useStoredState<PartyPackState>("party-pack", initialPartyPackState);
  const roomPartyPackState = parsePartyPackStateFromRoom(roomSnapshot);
  const isPartyPackRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "party-pack"));
  const activePartyPackState = isPartyPackRoom ? (roomPartyPackState ?? initialPartyPackState) : storedState;
  const state = { ...initialPartyPackState, ...activePartyPackState };
  const prompt = partyPackPrompts.find((item) => item.id === state.promptId) ?? null;
  const selectedGuide = state.mode === "all" ? null : partyPackModeGuides[state.mode];
  const minPlayers = selectedGuide?.minPlayers ?? 3;
  const canStart = state.players.length >= minPlayers && state.players.every((player) => player.name.trim());
  const promptPool = useMemo(
    () => (state.mode === "all" ? partyPackPrompts : partyPackPrompts.filter((item) => item.mode === state.mode)),
    [state.mode],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";
  const currentHost = state.players.length > 0 ? state.players[state.currentPlayerIndex % state.players.length] : null;
  const isRoomHost = isPartyPackRoom && roomSession?.participantRole === "host";
  const canControlPartyPack = !isPartyPackRoom || (isRoomHost && Boolean(roomSnapshot));
  const canActForCurrentPartyPlayer = !isPartyPackRoom || canControlPartyPack || roomSession?.participantId === currentHost?.id;
  const canVoteForPartyPlayer = (playerId: string) => !isPartyPackRoom || canControlPartyPack || roomSession?.participantId === playerId;
  const canPeekPartyAnswer = !isPartyPackRoom || canControlPartyPack || roomSession?.participantId === currentHost?.id;
  const canRevealPartyAnswer = canPeekPartyAnswer;

  function setState(nextStateOrUpdater: PartyPackState | ((current: PartyPackState) => PartyPackState)) {
    if (isPartyPackRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isPartyPackRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildPartyPackRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "party-pack",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "party-pack",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    setPrivateAnswerVisible(false);
  }, [prompt?.id, roomSession?.participantId]);

  useEffect(() => {
    if (state.step === "prompt" && !prompt) {
      setState({
        ...state,
        step: "setup",
        promptId: null,
        deckPromptIds: [],
        deckIndex: 0,
        answerVisible: false,
        currentPlayerIndex: 0,
        votes: {},
        guesses: {},
        actionLog: [],
      });
    }
  }, [prompt, setState, state.step]);

  function startPartyPack() {
    const deckPromptIds = shuffle(promptPool)
      .slice(0, selectedQuestionCount)
      .map((item) => item.id);
    setState({
      ...state,
      step: "prompt",
      promptId: deckPromptIds[0] ?? null,
      deckPromptIds,
      deckIndex: 0,
      answerVisible: false,
      currentPlayerIndex: 0,
      votes: {},
      guesses: {},
      scoreCounts: createPlayerCountMap(state.players),
      safeCounts: createPlayerCountMap(state.players),
      missCounts: createPlayerCountMap(state.players),
      actionLog: [],
    });
  }

  function moveToNextPartyPrompt() {
    const nextIndex = state.deckIndex + 1;
    const nextPromptId = state.deckPromptIds[nextIndex];
    if (!nextPromptId) {
      setState({ ...state, step: "complete", promptId: null, answerVisible: false, actionLog: [] });
      return;
    }
    const currentPrompt = partyPackPrompts.find((item) => item.id === state.promptId) ?? null;
    const shouldRotateOwner = currentPrompt ? isPartyPackOwnerMode(currentPrompt.mode) : false;
    setState({
      ...state,
      step: "prompt",
      promptId: nextPromptId,
      deckIndex: nextIndex,
      answerVisible: false,
      currentPlayerIndex: shouldRotateOwner ? (state.currentPlayerIndex + 1) % Math.max(1, state.players.length) : state.currentPlayerIndex,
      votes: {},
      guesses: {},
      actionLog: [],
    });
  }

  const promptGuide = prompt ? partyPackModeGuides[prompt.mode] : null;
  const hiddenAnswer = prompt?.answer && (prompt.mode === "reverse-word" || prompt.mode === "hint-quiz");
  const openAnswer = prompt?.answer && prompt.mode === "typing";

  return (
    <GameFrame
      title="定番ゲームパック"
      subtitle="飲み会で回しやすい定番ゲームを、詳しい進行つきのお題カードにしたパックです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isPartyPackRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、パック内ミニゲーム、手番、回答、投票、結果、次のお題を同期します。"
                : "この端末では自分の番や自分の回答だけ操作できます。次のお題へ進む操作はホスト端末で行います。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>このパックの進め方</h3>
            <ol className="rule-list">
              <li>参加者を登録し、遊びたいゲームの種類を選びます。</li>
              <li>「全部」を選ぶと、山手線、多数派予想、逆さ言葉など10種類がランダムに出ます。</li>
              <li>各お題カードに、そのゲーム専用の進め方と注意点が表示されます。</li>
              <li>勝敗を厳しくしすぎず、短時間で笑って次へ進むのが基本です。</li>
              <li>誰かを困らせる罰ゲームではなく、意外な答えや言い間違いを会話のきっかけにします。</li>
            </ol>
          </div>

          {isPartyPackRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者を定番ゲームパックメンバーに使えます</strong>
              <p>参加者を取り込むと、パック内の手番、回答、投票、結果を端末ごとに同期できます。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      promptId: null,
                      deckPromptIds: [],
                      deckIndex: 0,
                      answerVisible: false,
                      currentPlayerIndex: 0,
                      votes: {},
                      guesses: {},
                      scoreCounts: {},
                      safeCounts: {},
                      missCounts: {},
                      actionLog: [],
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      promptId: null,
                      deckPromptIds: [],
                      deckIndex: 0,
                      answerVisible: false,
                      currentPlayerIndex: 0,
                      votes: {},
                      guesses: {},
                      scoreCounts: {},
                      safeCounts: {},
                      missCounts: {},
                      actionLog: [],
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlPartyPack ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={minPlayers}
                maxPlayers={20}
                onChange={(players) =>
                  setState({
                    ...state,
                    players,
                    currentPlayerIndex: 0,
                    votes: {},
                    guesses: {},
                    scoreCounts: {},
                    safeCounts: {},
                    missCounts: {},
                    actionLog: [],
                  })
                }
              />

              <SegmentedControl
                label="ゲームの種類"
                options={partyPackModes}
                value={state.mode}
                onChange={(mode) =>
                  setState({
                    ...state,
                    mode,
                    deckPromptIds: [],
                    deckIndex: 0,
                    promptId: null,
                    answerVisible: false,
                    currentPlayerIndex: 0,
                    votes: {},
                    guesses: {},
                    actionLog: [],
                  })
                }
              />
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストが参加者とミニゲームの種類を決めると、この端末にも同期されます。</p>
            </div>
          )}

          {state.mode === "all" ? (
            <div className="notice-panel calm">
              <strong>全部モード</strong>
              <p>
                10種類の定番ゲームを混ぜて出します。必要人数が多いカードも入るため、3人以上での開始にしています。
              </p>
            </div>
          ) : canControlPartyPack ? (
            <PartyModeGuide mode={state.mode} />
          ) : null}

          {canControlPartyPack && (
            <SegmentedControl
              label="今回の設問数"
              options={partyPackQuestionCountOptions}
              value={String(state.questionCount)}
              onChange={(questionCount) =>
                setState({
                  ...state,
                  questionCount: Number(questionCount) as PartyPackQuestionCount,
                  deckPromptIds: [],
                  deckIndex: 0,
                  promptId: null,
                  answerVisible: false,
                  votes: {},
                  guesses: {},
                  actionLog: [],
                })
              }
            />
          )}

          <p className="soft-note">
            この条件では{promptPool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。全体のお題は300問です。
          </p>

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0 || !canControlPartyPack} onClick={startPartyPack}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" disabled={!canControlPartyPack} onClick={() => setState(initialPartyPackState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "prompt" && prompt && promptGuide && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              {promptGuide.label} {progressLabel}
            </p>
            <h2>{prompt.title}</h2>
            <p className="party-prompt-copy">{prompt.instruction}</p>
            {currentHost && <p className="soft-note">今回の司会・親: {currentHost.name}</p>}
          </div>

          {prompt.options && (
            <div className="option-list">
              {prompt.options.map((option, index) => (
                <span key={option}>
                  {String.fromCharCode(65 + index)}. {option}
                </span>
              ))}
            </div>
          )}

          {prompt.chips && (
            <div className="chip-list">
              {prompt.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          )}

          {openAnswer && (
            <div className="answer-panel">
              <strong>入力する文</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          {hiddenAnswer && (
            <div className="action-row">
              {isPartyPackRoom ? (
                <>
                  <button
                    className="secondary-button"
                    disabled={!canPeekPartyAnswer}
                    type="button"
                    onClick={() => setPrivateAnswerVisible(!privateAnswerVisible)}
                  >
                    {privateAnswerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    {privateAnswerVisible ? "自分の答え確認を閉じる" : prompt.mode === "hint-quiz" ? "出題者だけ答えを見る" : "自分だけ答えを見る"}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canRevealPartyAnswer}
                    type="button"
                    onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
                  >
                    {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    {state.answerVisible ? "全員の答えを隠す" : "答えを全員に表示"}
                  </button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
                >
                  {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  {state.answerVisible ? "答えを隠す" : prompt.mode === "hint-quiz" ? "出題者だけ答えを見る" : "答えを見る"}
                </button>
              )}
            </div>
          )}

          {hiddenAnswer && privateAnswerVisible && canPeekPartyAnswer && !state.answerVisible && (
            <div className="answer-panel">
              <strong>自分用の答え</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          {hiddenAnswer && state.answerVisible && (
            <div className="answer-panel">
              <strong>{isPartyPackRoom ? "全員に表示中の答え" : "答え"}</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          <PartyPackInteractionPanel
            prompt={prompt}
            state={state}
            setState={setState}
            canControl={canControlPartyPack}
            canActForCurrentPlayer={canActForCurrentPartyPlayer}
            canVoteForPlayer={canVoteForPartyPlayer}
            isRoomMode={isPartyPackRoom}
          />

          <PartyModeGuide mode={prompt.mode} compact />

          <div className="action-row">
            <button className="primary-button" disabled={!canControlPartyPack} onClick={moveToNextPartyPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button
              className="secondary-button"
              disabled={!canControlPartyPack}
              onClick={() => setState({ ...state, step: "setup", promptId: null, answerVisible: false })}
            >
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlPartyPack && <p className="soft-note">次のお題へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <ListChecks size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">場が温まっていたら、種類を変えるか「全部」でテンポよくもう一周できます。</p>
          <div className="score-list wide">
            {state.players.map((player) => (
              <span key={player.id}>
                {player.name}: 得点{state.scoreCounts[player.id] ?? 0} / セーフ{state.safeCounts[player.id] ?? 0} / アウト{state.missCounts[player.id] ?? 0}
              </span>
            ))}
          </div>
          <div className="action-row centered">
            <button className="primary-button" disabled={!canControlPartyPack} onClick={startPartyPack}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" disabled={!canControlPartyPack} onClick={() => setState({ ...state, step: "setup", promptId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlPartyPack && <p className="soft-note">もう一度遊ぶ操作はホスト端末で行います。</p>}
        </section>
      )}
    </GameFrame>
  );
}

function PartyPackInteractionPanel({
  prompt,
  state,
  setState,
  canControl,
  canActForCurrentPlayer,
  canVoteForPlayer,
  isRoomMode,
}: {
  prompt: PartyPackPrompt;
  state: PartyPackState;
  setState: (state: PartyPackState) => void;
  canControl: boolean;
  canActForCurrentPlayer: boolean;
  canVoteForPlayer: (playerId: string) => boolean;
  isRoomMode: boolean;
}) {
  const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;

  function pushLog(message: string, nextState: Partial<PartyPackState> = {}) {
    setState({
      ...state,
      ...nextState,
      actionLog: [message, ...state.actionLog].slice(0, 8),
    });
  }

  function advanceTurn(message: string, nextState: Partial<PartyPackState> = {}) {
    pushLog(message, {
      ...nextState,
      currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
    });
  }

  function recordTurnResult(kind: "safe" | "miss" | "skip") {
    if (!currentPlayer || !canActForCurrentPlayer) return;
    if (kind === "safe") {
      advanceTurn(`${currentPlayer.name}さんはセーフ。次の人へ進みます。`, {
        safeCounts: { ...state.safeCounts, [currentPlayer.id]: (state.safeCounts[currentPlayer.id] ?? 0) + 1 },
      });
      return;
    }
    if (kind === "miss") {
      advanceTurn(`${currentPlayer.name}さんはアウト。笑って次の人へ進みます。`, {
        missCounts: { ...state.missCounts, [currentPlayer.id]: (state.missCounts[currentPlayer.id] ?? 0) + 1 },
      });
      return;
    }
    advanceTurn(`${currentPlayer.name}さんはパスしました。`);
  }

  if (prompt.mode === "majority" && prompt.options?.length) {
    const voteOptions = prompt.options.slice(0, 4);
    const tallyRows = voteOptions.map((option, index) => ({
      option,
      value: String(index),
      players: state.players.filter((player) => state.votes[player.id] === String(index)),
    }));
    const votedPlayers = state.players.filter((player) => state.votes[player.id]);
    const topCount = Math.max(0, ...tallyRows.map((row) => row.players.length));
    const winners = topCount === 0 ? [] : tallyRows.filter((row) => row.players.length === topCount);
    const winningPlayerIds = new Set(winners.flatMap((row) => row.players.map((player) => player.id)));

    function revealMajorityResult() {
      if ((!canControl && isRoomMode) || state.answerVisible) return;
      const nextScoreCounts = { ...state.scoreCounts };
      winningPlayerIds.forEach((playerId) => {
        nextScoreCounts[playerId] = (nextScoreCounts[playerId] ?? 0) + 1;
      });
      pushLog(`多数派は${winners.map((row) => row.option).join(" / ")}でした。`, {
        answerVisible: true,
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>多数派同期</h3>
          <ul className="rule-list">
            <li>各自の端末では自分の行だけ投票できます。</li>
            <li>ホストは全員分を代行入力できます。</li>
            <li>結果を出すと多数派と得点が同期されます。</li>
          </ul>
        </div>
        <div className="vote-list">
          {state.players.map((player) => (
            <div className="vote-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="vote-buttons">
                {voteOptions.map((option, index) => (
                  <button
                    className={state.votes[player.id] === String(index) ? "selected-choice" : ""}
                    disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                    key={option}
                    type="button"
                    onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}
                  >
                    {formatChoiceLabel(option, index)}
                  </button>
                ))}
                <button
                  className={state.votes[player.id] === "skip" ? "selected-choice muted" : ""}
                  disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                  type="button"
                  onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: "skip" } })}
                >
                  パス
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="action-row">
          <span className="inline-status">
            投票 {votedPlayers.length}/{state.players.length}
          </span>
          <button className="primary-button" disabled={(!canControl && isRoomMode) || state.answerVisible || votedPlayers.length === 0} onClick={revealMajorityResult}>
            <Check size={18} />
            結果を出す
          </button>
        </div>
        {state.answerVisible && <div className="split-result">{tallyRows.map((row, index) => <NameCluster key={row.value} title={formatChoiceLabel(row.option, index)} players={row.players} />)}</div>}
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: 得点{state.scoreCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (isPartyPackTurnMode(prompt.mode)) {
    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>手番同期</h3>
          <ul className="rule-list">
            <li>自分の番だけ、セーフ、パス、アウトを押せます。</li>
            <li>ホストは全員分を代行入力できます。</li>
            <li>判定は厳しくしすぎず、テンポよく次へ進みます。</li>
          </ul>
        </div>
        {currentPlayer && (
          <div className="turn-callout">
            <span>現在の番</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        )}
        <div className="action-row centered">
          <button className="primary-button" disabled={!currentPlayer || !canActForCurrentPlayer} onClick={() => recordTurnResult("safe")}>
            <Check size={18} />
            セーフ
          </button>
          <button className="secondary-button" disabled={!currentPlayer || !canActForCurrentPlayer} onClick={() => recordTurnResult("skip")}>
            <ChevronRight size={18} />
            パス
          </button>
          <button className="danger-button" disabled={!currentPlayer || !canActForCurrentPlayer} onClick={() => recordTurnResult("miss")}>
            <ShieldAlert size={18} />
            アウト
          </button>
        </div>
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>
              {player.name}: セーフ{state.safeCounts[player.id] ?? 0} / アウト{state.missCounts[player.id] ?? 0}
            </span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "truth-lie") {
    const speaker = currentPlayer;
    const voters = speaker ? state.players.filter((player) => player.id !== speaker.id) : state.players;
    const lieOptions = ["1つ目が嘘", "2つ目が嘘", "3つ目が嘘"];
    const answerKey = "truthLieAnswer";
    const answerChoice = state.guesses[answerKey] ?? "";
    const canJudge = canControl || canActForCurrentPlayer;
    const votedPlayers = voters.filter((player) => state.votes[player.id]);
    const correctPlayers = answerChoice ? voters.filter((player) => state.votes[player.id] === answerChoice) : [];

    function revealTruthLieResult() {
      if (!canJudge || !answerChoice || state.answerVisible) return;
      const nextScoreCounts = { ...state.scoreCounts };
      correctPlayers.forEach((player) => {
        nextScoreCounts[player.id] = (nextScoreCounts[player.id] ?? 0) + 1;
      });
      pushLog(`嘘は${Number(answerChoice) + 1}つ目。正解は${correctPlayers.length}人でした。`, {
        answerVisible: true,
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>嘘当て同期</h3>
          <ul className="rule-list">
            <li>話し手が正解を設定し、聞き手が投票します。</li>
            <li>結果を出すと正解者と得点が同期されます。</li>
          </ul>
        </div>
        {speaker && (
          <div className="turn-callout">
            <span>今回の話し手</span>
            <strong>{speaker.name}</strong>
          </div>
        )}
        <div className="answer-sync-list">
          <div className="answer-sync-row">
            <strong>正解設定</strong>
            <div className="vote-buttons">
              {lieOptions.map((option, index) => (
                <button
                  className={answerChoice === String(index) ? "selected-choice" : "secondary-button"}
                  disabled={!canJudge || state.answerVisible}
                  key={option}
                  type="button"
                  onClick={() => setState({ ...state, guesses: { ...state.guesses, [answerKey]: String(index) } })}
                >
                  {formatChoiceLabel(option, index)}
                </button>
              ))}
            </div>
          </div>
          {voters.map((player) => (
            <div className="answer-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="vote-buttons">
                {lieOptions.map((option, index) => (
                  <button
                    className={state.votes[player.id] === String(index) ? "selected-choice" : "secondary-button"}
                    disabled={!canVoteForPlayer(player.id) || state.answerVisible}
                    key={option}
                    type="button"
                    onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}
                  >
                    {formatChoiceLabel(option, index)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="action-row">
          <span className="inline-status">
            投票 {votedPlayers.length}/{voters.length}
          </span>
          <button className="primary-button" disabled={!canJudge || !answerChoice || state.answerVisible} onClick={revealTruthLieResult}>
            <Check size={18} />
            結果を出す
          </button>
        </div>
        {state.answerVisible && <div className="split-result"><NameCluster title="正解" players={correctPlayers} /><NameCluster title="惜しい" players={voters.filter((player) => state.votes[player.id] && state.votes[player.id] !== answerChoice)} /></div>}
        <div className="score-list wide">
          {state.players.map((player) => (
            <span key={player.id}>{player.name}: 得点{state.scoreCounts[player.id] ?? 0}</span>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "typing") {
    const answeredPlayers = state.players.filter((player) => state.guesses[player.id]?.trim());
    const correctPlayers = state.players.filter((player) => state.votes[player.id] === "correct");

    function markTypingCorrect(player: Player) {
      if ((!canVoteForPlayer(player.id) && !canControl) || state.votes[player.id] === "correct") return;
      pushLog(`${player.name}さんは誤字なしで入力完了。`, {
        votes: { ...state.votes, [player.id]: "correct" },
        scoreCounts: { ...state.scoreCounts, [player.id]: (state.scoreCounts[player.id] ?? 0) + 1 },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>早打ち同期</h3>
          <ul className="rule-list">
            <li>各自が入力できた文を自分の欄に入れます。</li>
            <li>誤字なしなら、本人またはホストが誤字なしを押します。</li>
          </ul>
        </div>
        <div className="typing-sync-list">
          {state.players.map((player) => {
            const answer = state.guesses[player.id] ?? "";
            const isCorrect = state.votes[player.id] === "correct";
            return (
              <div className="typing-sync-row" key={player.id}>
                <strong>{player.name}</strong>
                <input
                  aria-label={`${player.name}の入力文`}
                  disabled={!canVoteForPlayer(player.id) || isCorrect}
                  onChange={(event) => setState({ ...state, guesses: { ...state.guesses, [player.id]: event.currentTarget.value } })}
                  placeholder="入力した文"
                  value={answer}
                />
                <button className={isCorrect ? "selected-choice" : "secondary-button"} disabled={isCorrect || !answer.trim() || (!canVoteForPlayer(player.id) && !canControl)} onClick={() => markTypingCorrect(player)}>
                  誤字なし
                </button>
              </div>
            );
          })}
        </div>
        <div className="action-row">
          <span className="inline-status">入力 {answeredPlayers.length}/{state.players.length}</span>
          <span className="inline-status">誤字なし {correctPlayers.length}</span>
        </div>
        <div className="score-list wide">{state.players.map((player) => <span key={player.id}>{player.name}: 得点{state.scoreCounts[player.id] ?? 0}</span>)}</div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "value-meter") {
    const rows = state.players.map((player) => ({
      player,
      clue: state.guesses[player.id] ?? "",
      value: state.votes[player.id] ?? "",
    }));
    const answeredRows = rows.filter((row) => row.clue.trim() || row.value.trim());
    const sortedRows = rows
      .filter((row) => row.value.trim() && Number.isFinite(Number(row.value)))
      .sort((a, b) => Number(a.value) - Number(b.value));

    function updateMeter(playerId: string, nextValue: string, nextClue: string) {
      if (!canVoteForPlayer(playerId)) return;
      setState({
        ...state,
        votes: { ...state.votes, [playerId]: nextValue },
        guesses: { ...state.guesses, [playerId]: nextClue },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact">
          <h3>メーター同期</h3>
          <ul className="rule-list">
            <li>数字と、数字を言わない例えを各自で入力します。</li>
            <li>ホストが並び順を表示すると全端末に出ます。</li>
          </ul>
        </div>
        <div className="meter-sync-list">
          {rows.map(({ player, clue, value }) => (
            <div className="meter-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <input aria-label={`${player.name}の数字`} disabled={!canVoteForPlayer(player.id) || state.answerVisible} inputMode="numeric" max={100} min={1} onChange={(event) => updateMeter(player.id, event.currentTarget.value, clue)} placeholder="1-100" type="number" value={value} />
              <input aria-label={`${player.name}の例え`} disabled={!canVoteForPlayer(player.id) || state.answerVisible} onChange={(event) => updateMeter(player.id, value, event.currentTarget.value)} placeholder="数字を言わずに例える" value={clue} />
            </div>
          ))}
        </div>
        <div className="action-row">
          <span className="inline-status">入力 {answeredRows.length}/{state.players.length}</span>
          <button className="primary-button" disabled={!canControl && isRoomMode} onClick={() => pushLog("価値観メーターの並び順を表示しました。", { answerVisible: true })}>
            <Check size={18} />
            並び順を表示
          </button>
        </div>
        {state.answerVisible && <div className="answer-panel wide"><strong>小さい順</strong><p>{sortedRows.map((row) => `${row.player.name}(${row.value})`).join(" → ") || "まだ数字がありません"}</p></div>}
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "acting" && prompt.options?.length) {
    const actor = currentPlayer;
    const answerers = actor ? state.players.filter((player) => player.id !== actor.id) : state.players;
    const emotionOptions = prompt.options.slice(0, 4);
    const emotionKey = "actingEmotion";
    const selectedEmotion = state.guesses[emotionKey] ?? "";
    const canJudge = canControl || canActForCurrentPlayer;
    const votedPlayers = answerers.filter((player) => state.votes[player.id]);
    const correctPlayers = selectedEmotion ? answerers.filter((player) => state.votes[player.id] === selectedEmotion) : [];

    function revealActingResult() {
      if (!canJudge || !selectedEmotion || state.answerVisible) return;
      const nextScoreCounts = { ...state.scoreCounts };
      correctPlayers.forEach((player) => {
        nextScoreCounts[player.id] = (nextScoreCounts[player.id] ?? 0) + 1;
      });
      pushLog(`正解は「${emotionOptions[Number(selectedEmotion)]}」。正解は${correctPlayers.length}人でした。`, {
        answerVisible: true,
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact"><h3>演技同期</h3><ul className="rule-list"><li>演者だけが感情を選びます。</li><li>回答者は自分の回答だけ選べます。</li></ul></div>
        {actor && <div className="turn-callout"><span>今回の演者</span><strong>{actor.name}</strong></div>}
        <div className="answer-sync-list">
          <div className="answer-sync-row">
            <strong>演者の感情</strong>
            <div className="vote-buttons">{emotionOptions.map((option, index) => <button className={selectedEmotion === String(index) ? "selected-choice" : "secondary-button"} disabled={!canJudge || state.answerVisible} key={option} onClick={() => setState({ ...state, guesses: { ...state.guesses, [emotionKey]: String(index) } })}>{formatChoiceLabel(option, index)}</button>)}</div>
          </div>
          {answerers.map((player) => (
            <div className="answer-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <div className="vote-buttons">{emotionOptions.map((option, index) => <button className={state.votes[player.id] === String(index) ? "selected-choice" : "secondary-button"} disabled={!canVoteForPlayer(player.id) || state.answerVisible} key={option} onClick={() => setState({ ...state, votes: { ...state.votes, [player.id]: String(index) } })}>{formatChoiceLabel(option, index)}</button>)}</div>
            </div>
          ))}
        </div>
        <div className="action-row"><span className="inline-status">回答 {votedPlayers.length}/{answerers.length}</span><button className="primary-button" disabled={!canJudge || !selectedEmotion || state.answerVisible} onClick={revealActingResult}><Check size={18} />結果を出す</button></div>
        {state.answerVisible && <div className="split-result"><NameCluster title="正解" players={correctPlayers} /><NameCluster title="惜しい" players={answerers.filter((player) => state.votes[player.id] && state.votes[player.id] !== selectedEmotion)} /></div>}
        <div className="score-list wide">{state.players.map((player) => <span key={player.id}>{player.name}: 得点{state.scoreCounts[player.id] ?? 0}</span>)}</div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "hint-quiz") {
    const parent = currentPlayer;
    const answerers = parent ? state.players.filter((player) => player.id !== parent.id) : state.players;
    const answeredPlayers = answerers.filter((player) => state.guesses[player.id]?.trim());
    const correctPlayers = answerers.filter((player) => state.votes[player.id] === "correct");
    const canJudge = canControl || canActForCurrentPlayer;

    function markCorrect(player: Player) {
      if (!canJudge || state.votes[player.id] === "correct") return;
      const guess = state.guesses[player.id]?.trim();
      pushLog(`${player.name}さんが正解${guess ? `: ${guess}` : ""}。`, {
        answerVisible: true,
        votes: { ...state.votes, [player.id]: "correct" },
        scoreCounts: { ...state.scoreCounts, [player.id]: (state.scoreCounts[player.id] ?? 0) + 1 },
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact"><h3>ヒント回答同期</h3><ul className="rule-list"><li>出題者は答えを確認し、直接言わずにヒントを出します。</li><li>回答者は自分の回答を入力できます。</li></ul></div>
        {parent && <div className="turn-callout"><span>今回の出題者</span><strong>{parent.name}</strong></div>}
        <div className="guess-list">
          {answerers.map((player) => {
            const guess = state.guesses[player.id] ?? "";
            const isCorrect = state.votes[player.id] === "correct";
            return (
              <div className="guess-row" key={player.id}>
                <strong>{player.name}</strong>
                <input aria-label={`${player.name}の回答`} disabled={!canVoteForPlayer(player.id) || isCorrect} onChange={(event) => setState({ ...state, guesses: { ...state.guesses, [player.id]: event.currentTarget.value } })} placeholder="回答を入力" value={guess} />
                <button className={isCorrect ? "selected-choice" : "secondary-button"} disabled={!canJudge || isCorrect || !guess.trim()} onClick={() => markCorrect(player)}>{isCorrect ? "正解済み" : "正解"}</button>
              </div>
            );
          })}
        </div>
        <div className="action-row"><span className="inline-status">回答 {answeredPlayers.length}/{answerers.length}</span><span className="inline-status">正解 {correctPlayers.length}</span>{canJudge && <button className="secondary-button" onClick={() => pushLog("このお題は正解なしで流しました。", { answerVisible: true })}>正解なしで流す</button>}</div>
        <div className="score-list wide">{state.players.map((player) => <span key={player.id}>{player.name}: 得点{state.scoreCounts[player.id] ?? 0}</span>)}</div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (prompt.mode === "memory-drawing") {
    const donePlayers = state.players.filter((player) => state.votes[player.id] === "done" || state.votes[player.id] === "award");
    const awardedPlayers = state.players.filter((player) => state.votes[player.id] === "award");

    function markDrawing(player: Player, value: "done" | "award") {
      if ((!canVoteForPlayer(player.id) && !canControl) || (value === "award" && !canControl)) return;
      const nextScoreCounts = value === "award" ? { ...state.scoreCounts, [player.id]: (state.scoreCounts[player.id] ?? 0) + 1 } : state.scoreCounts;
      pushLog(value === "award" ? `${player.name}さんに拍手賞。` : `${player.name}さんが描き終わりました。`, {
        votes: { ...state.votes, [player.id]: value },
        scoreCounts: nextScoreCounts,
      });
    }

    return (
      <div className="url-interaction-panel">
        <div className="howto-panel compact"><h3>描画進行同期</h3><ul className="rule-list"><li>描き終わった人は自分の完了を押します。</li><li>ホストは拍手賞を記録できます。</li></ul></div>
        <div className="typing-sync-list">
          {state.players.map((player) => (
            <div className="typing-sync-row" key={player.id}>
              <strong>{player.name}</strong>
              <button className={state.votes[player.id] === "done" ? "selected-choice" : "secondary-button"} disabled={!canVoteForPlayer(player.id) || state.votes[player.id] === "award"} onClick={() => markDrawing(player, "done")}>描き終わった</button>
              <button className={state.votes[player.id] === "award" ? "selected-choice" : "secondary-button"} disabled={!canControl || state.votes[player.id] === "award"} onClick={() => markDrawing(player, "award")}>拍手賞</button>
            </div>
          ))}
        </div>
        <div className="action-row"><span className="inline-status">完了 {donePlayers.length}/{state.players.length}</span><span className="inline-status">拍手賞 {awardedPlayers.length}</span></div>
        <div className="score-list wide">{state.players.map((player) => <span key={player.id}>{player.name}: 得点{state.scoreCounts[player.id] ?? 0}</span>)}</div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  return (
    <div className="url-interaction-panel">
      <div className="action-row centered">
        <button className="primary-button" disabled={!currentPlayer || !canActForCurrentPlayer} onClick={() => currentPlayer && advanceTurn(`${currentPlayer.name}さんの成功を記録しました。`)}>
          <Check size={18} />
          成功
        </button>
        <button className="secondary-button" disabled={!currentPlayer || !canActForCurrentPlayer} onClick={() => currentPlayer && advanceTurn(`${currentPlayer.name}さんはスキップしました。`)}>
          <ChevronRight size={18} />
          スキップ
        </button>
      </div>
      <UrlActionLog logs={state.actionLog} />
    </div>
  );
}

type WordWolfStep = "setup" | "reveal" | "discussion" | "vote" | "result";

type WordWolfAssignment = {
  playerId: string;
  word: string;
  role: "majority" | "minority";
};

type WordWolfState = {
  players: Player[];
  category: WordWolfCategory;
  includeAdultTopics: boolean;
  seconds: number;
  step: WordWolfStep;
  topicId: string | null;
  assignments: WordWolfAssignment[];
  revealIndex: number;
  revealVisible: boolean;
  remainingSeconds: number;
  timerRunning: boolean;
  timerEndsAt: string | null;
  votes: Record<string, string>;
  voteIndex: number;
};

const wordWolfTimeOptions: SegmentedOption<"180" | "300" | "420">[] = [
  { value: "180", label: "3分" },
  { value: "300", label: "5分" },
  { value: "420", label: "7分" },
];

const initialWordWolfState: WordWolfState = {
  players: [],
  category: "all",
  includeAdultTopics: false,
  seconds: 300,
  step: "setup",
  topicId: null,
  assignments: [],
  revealIndex: 0,
  revealVisible: false,
  remainingSeconds: 300,
  timerRunning: false,
  timerEndsAt: null,
  votes: {},
  voteIndex: 0,
};

type WordWolfRoomEnvelope = RoomProgressState & {
  wordWolf?: WordWolfState;
};

function parseWordWolfStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "word-wolf") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<WordWolfRoomEnvelope>) : {};
  return state.wordWolf && typeof state.wordWolf === "object" ? ({ ...initialWordWolfState, ...state.wordWolf } as WordWolfState) : null;
}

function getWordWolfVoteResult(state: WordWolfState) {
  const tally = state.players.map((player) => ({
    player,
    count: Object.values(state.votes).filter((targetId) => targetId === player.id).length,
  }));
  const maxVotes = Math.max(0, ...tally.map((item) => item.count));
  const topTargets = tally.filter((item) => item.count === maxVotes && maxVotes > 0).map((item) => item.player.id);
  const minority = state.assignments.find((assignment) => assignment.role === "minority");
  const majorityWin = Boolean(minority && topTargets.length === 1 && topTargets[0] === minority.playerId);
  return { tally, topTargets, minority, majorityWin };
}

function getWordWolfProgressStep(state: WordWolfState) {
  const stepOrder: Record<WordWolfStep, number> = {
    setup: 1,
    reveal: 2,
    discussion: 3,
    vote: 4,
    result: 5,
  };
  return stepOrder[state.step] ?? 1;
}

function describeWordWolfProgress(state: WordWolfState) {
  if (state.step === "setup") return "ワードウルフの設定中です";
  if (state.step === "reveal") return "お題を配布しました。各自端末で自分のお題を確認してください";
  if (state.step === "discussion") return `会話タイム中です / 残り${formatTime(getSyncedTimerRemaining(state))}`;
  if (state.step === "vote") return `投票中です: ${Math.min(state.voteIndex + 1, state.players.length)}/${state.players.length}`;
  const result = getWordWolfVoteResult(state);
  return result.majorityWin ? "多数派が少数派を見破りました" : "少数派がうまく紛れ込みました";
}

function buildWordWolfRoomEnvelope(wordWolf: WordWolfState, updatedBy: string | null): WordWolfRoomEnvelope {
  return {
    phase: wordWolf.step === "result" ? "complete" : "playing",
    gameKey: "word-wolf",
    gameTitle: findGameMeta("word-wolf")?.title ?? "ワードウルフ",
    step: getWordWolfProgressStep(wordWolf),
    message: describeWordWolfProgress(wordWolf),
    updatedBy,
    updatedAt: new Date().toISOString(),
    wordWolf,
  };
}

function roomParticipantsToWordWolfPlayers(snapshot: RoomSnapshot, includeHost: boolean) {
  return snapshot.participants
    .filter((participant) => includeHost || participant.role !== "host")
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
    }));
}

function WordWolfGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const [ownWordVisible, setOwnWordVisible] = useState(false);
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<WordWolfState>("word-wolf", initialWordWolfState);
  const roomWordWolfState = parseWordWolfStateFromRoom(roomSnapshot);
  const isWordWolfRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "word-wolf"));
  const activeWordWolfState = isWordWolfRoom ? (roomWordWolfState ?? initialWordWolfState) : storedState;
  const state = { ...initialWordWolfState, ...activeWordWolfState };
  const isRoomHost = isWordWolfRoom && roomSession?.participantRole === "host";
  const canControlWordWolf = !isWordWolfRoom || (isRoomHost && Boolean(roomSnapshot));
  const activeWordWolfCategory = !state.includeAdultTopics && state.category === "adult" ? "all" : state.category;
  const availableWordWolfCategories = state.includeAdultTopics ? wordWolfCategories : normalWordWolfCategories;
  const topicPool = useMemo(
    () =>
      activeWordWolfCategory === "all"
        ? state.includeAdultTopics
          ? wordWolfTopics
          : normalWordWolfTopics
        : wordWolfTopics.filter((topic) => topic.category === activeWordWolfCategory),
    [activeWordWolfCategory, state.includeAdultTopics],
  );
  const selectedWordWolfCategory = wordWolfCategories.find((category) => category.value === activeWordWolfCategory);
  const canStart = state.players.length >= 4 && state.players.every((player) => player.name.trim());
  const currentRevealPlayer = state.players[state.revealIndex] ?? null;
  const currentRevealAssignment = currentRevealPlayer
    ? state.assignments.find((assignment) => assignment.playerId === currentRevealPlayer.id)
    : null;
  const currentVoter = state.players[state.voteIndex] ?? null;
  const ownAssignment = roomSession ? state.assignments.find((assignment) => assignment.playerId === roomSession.participantId) : null;
  const currentVoterIsThisParticipant = Boolean(isWordWolfRoom && currentVoter?.id === roomSession?.participantId);
  const canVoteForCurrentVoter = canControlWordWolf || currentVoterIsThisParticipant;
  const wordWolfResult = useMemo(() => getWordWolfVoteResult(state), [state.assignments, state.players, state.votes]);
  const wordWolfTimerNow = useSecondTick(state.step === "discussion" && state.timerRunning);
  const wordWolfRemainingSeconds = getSyncedTimerRemaining(state, wordWolfTimerNow);
  const wordWolfTimerRunning = state.timerRunning && wordWolfRemainingSeconds > 0;

  function setState(nextStateOrUpdater: WordWolfState | ((current: WordWolfState) => WordWolfState)) {
    if (isWordWolfRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isWordWolfRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildWordWolfRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "word-wolf",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "word-wolf",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if (state.step !== "discussion" || !state.timerRunning || wordWolfRemainingSeconds > 0 || !canControlWordWolf) return;
    setState((current) =>
      current.step === "discussion" && current.timerRunning && getSyncedTimerRemaining(current) === 0
        ? stopSyncedTimer(current, 0)
        : current,
    );
  }, [canControlWordWolf, state.step, state.timerRunning, wordWolfRemainingSeconds]);

  useEffect(() => {
    setOwnWordVisible(false);
  }, [ownAssignment?.word, state.step]);

  function startRound() {
    const topic = pickOne(topicPool);
    const minorityPlayerId = pickOne(state.players).id;
    const assignments = state.players.map((player) => ({
      playerId: player.id,
      role: player.id === minorityPlayerId ? "minority" : "majority",
      word: player.id === minorityPlayerId ? topic.minorityWord : topic.majorityWord,
    })) satisfies WordWolfAssignment[];

    setState({
      ...state,
      step: "reveal",
      topicId: topic.id,
      assignments,
      revealIndex: 0,
      revealVisible: false,
      remainingSeconds: state.seconds,
      timerRunning: false,
      timerEndsAt: null,
      votes: {},
      voteIndex: 0,
    });
  }

  return (
    <GameFrame
      title="ワードウルフ"
      subtitle="似ているけど少し違うお題を、会話と投票で見破るゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isWordWolfRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。配る、会話開始、投票、結果表示をルームへ同期します。"
                : "この端末では自分のお題確認と、自分の投票順の操作ができます。"}
            </p>
          </div>
          {ownAssignment && state.step !== "result" && (
            <div className="own-role-panel">
              <span>あなたのお題</span>
              <strong>{ownWordVisible ? ownAssignment.word : "非表示"}</strong>
              <button className="secondary-button" type="button" onClick={() => setOwnWordVisible(!ownWordVisible)}>
                {ownWordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                {ownWordVisible ? "隠す" : "見る"}
              </button>
            </div>
          )}
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を4人以上登録します。</li>
              <li>お題カテゴリとHな話題のON/OFFを選びます。</li>
              <li>アプリが多数派のお題と、1人だけ違う少数派のお題を配ります。</li>
              <li>スマホを順番に回し、自分のお題だけを確認します。</li>
              <li>会話タイムでは、お題そのものを言わずに特徴や経験を話します。</li>
              <li>最後に「少数派だと思う人」へ投票します。最多票が少数派なら多数派の勝ち、外したら少数派の勝ちです。</li>
            </ol>
          </div>

          {isWordWolfRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者をワードウルフメンバーに使えます</strong>
              <p>
                参加者それぞれの端末で自分のお題を確認するには、ルーム参加者を取り込んでください。ホストも遊ぶ場合は「全員」を使います。
              </p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToWordWolfPlayers(roomSnapshot, false),
                      assignments: [],
                      step: "setup",
                      votes: {},
                      voteIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToWordWolfPlayers(roomSnapshot, true),
                      assignments: [],
                      step: "setup",
                      votes: {},
                      voteIndex: 0,
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlWordWolf ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={4}
                maxPlayers={12}
                onChange={(players) => setState({ ...state, players })}
              />
              <SegmentedControl
                label="お題"
                options={availableWordWolfCategories}
                value={activeWordWolfCategory}
                onChange={(category) => setState({ ...state, category })}
              />
              <ToggleSwitch
                label="Hな話題"
                description={
                  state.includeAdultTopics
                    ? "ON: 全部に大人向けも混ぜます。カテゴリで大人向けだけも選べます。"
                    : "OFF: 軽い恋バナや距離感の強い話題は出ません。"
                }
                checked={state.includeAdultTopics}
                onChange={(includeAdultTopics) =>
                  setState({
                    ...state,
                    includeAdultTopics,
                    category: state.category === "adult" ? "all" : state.category,
                    topicId: null,
                    assignments: [],
                    votes: {},
                    voteIndex: 0,
                  })
                }
              />
              <p className="soft-note">
                {selectedWordWolfCategory?.label ?? "選択中"}: {topicPool.length}ペアからランダムに1つ配ります。
                Hな話題は{state.includeAdultTopics ? "ON" : "OFF"}です。
              </p>
              {state.includeAdultTopics && (
                <div className="notice-panel">
                  <strong>Hな話題がONです</strong>
                  <p>軽い恋バナや距離感の話題を含みます。苦手な人がいる場ではOFFにしてください。</p>
                </div>
              )}
              <SegmentedControl
                label="会話時間"
                options={wordWolfTimeOptions}
                value={String(state.seconds) as "180" | "300" | "420"}
                onChange={(seconds) =>
                  setState({
                    ...state,
                    seconds: Number(seconds),
                    remainingSeconds: Number(seconds),
                    timerRunning: false,
                    timerEndsAt: null,
                  })
                }
              />
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの準備待ち</h3>
              <p className="soft-note">ホストがお題を配ると、この端末に自分のお題確認ボタンが表示されます。</p>
            </div>
          )}

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || topicPool.length === 0 || !canControlWordWolf} onClick={startRound}>
              <Play size={18} />
              配る
            </button>
            <button className="secondary-button" disabled={!canControlWordWolf} onClick={() => setState(initialWordWolfState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {isWordWolfRoom && state.step === "reveal" && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">お題確認</p>
          <h2>{ownAssignment ? `${roomSession?.participantName}さんのお題` : "ホストの進行待ち"}</h2>
          <p className="soft-note">
            {ownAssignment
              ? "本人だけが見てください。会話が始まるまで、お題そのものは口に出さないでください。"
              : "この端末の参加者IDがプレイヤーに含まれていません。ホストがルーム参加者を取り込んでいるか確認してください。"}
          </p>
          <div className={`secret-word ${ownWordVisible ? "visible" : ""}`}>
            {ownAssignment ? (ownWordVisible ? ownAssignment.word : "お題を隠しています") : "未配布"}
          </div>
          <div className="action-row centered">
            <button className="primary-button" disabled={!ownAssignment} onClick={() => setOwnWordVisible(!ownWordVisible)}>
              {ownWordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {ownWordVisible ? "隠す" : "見る"}
            </button>
            <button
              className="secondary-button"
              disabled={!canControlWordWolf}
              onClick={() => setState({ ...state, step: "discussion", revealVisible: false, timerRunning: false, timerEndsAt: null })}
            >
              <ChevronRight size={18} />
              会話へ
            </button>
          </div>
          {!isRoomHost && <p className="soft-note">全員がお題を確認したら、ホストが会話タイムへ進めます。</p>}
        </section>
      )}

      {!isWordWolfRoom && state.step === "reveal" && currentRevealPlayer && currentRevealAssignment && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">
            {state.revealIndex + 1}/{state.players.length}
          </p>
          <h2>{currentRevealPlayer.name}さん</h2>
          <p className="soft-note">本人だけが見てください。見終わったら必ず「隠す」か「次へ」で画面を戻します。</p>
          <div className={`secret-word ${state.revealVisible ? "visible" : ""}`}>
            {state.revealVisible ? currentRevealAssignment.word : "お題を隠しています"}
          </div>
          <div className="action-row centered">
            <button className="primary-button" onClick={() => setState({ ...state, revealVisible: !state.revealVisible })}>
              {state.revealVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {state.revealVisible ? "隠す" : "見る"}
            </button>
            <button
              className="secondary-button"
              disabled={!state.revealVisible}
              onClick={() => {
                if (state.revealIndex + 1 >= state.players.length) {
                  setState({ ...state, step: "discussion", revealVisible: false, timerRunning: false, timerEndsAt: null });
                } else {
                  setState({ ...state, revealIndex: state.revealIndex + 1, revealVisible: false });
                }
              }}
            >
              <ChevronRight size={18} />
              次へ
            </button>
          </div>
        </section>
      )}

      {state.step === "discussion" && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">会話タイム</p>
          <div className="timer-display">{formatTime(wordWolfRemainingSeconds)}</div>
          <div className="howto-panel compact">
            <h3>会話のコツ</h3>
            <ul className="rule-list">
              <li>お題そのもの、略称、ほぼ同じ言葉は言わない。</li>
              <li>好き嫌い、思い出、使う場面、雰囲気などを遠回しに話す。</li>
              <li>自分が少数派かもと思ったら、周りに合わせすぎず自然に話す。</li>
            </ul>
          </div>
          <div className="action-row centered">
            <button
              className="primary-button"
              onClick={() => setState(toggleSyncedTimer(state, wordWolfTimerNow))}
              disabled={wordWolfRemainingSeconds === 0 || !canControlWordWolf}
            >
              {wordWolfTimerRunning ? <Pause size={18} /> : <Play size={18} />}
              {wordWolfTimerRunning ? "止める" : "開始"}
            </button>
            <button
              className="secondary-button"
              disabled={!canControlWordWolf}
              onClick={() => setState({ ...stopSyncedTimer(state, wordWolfRemainingSeconds), step: "vote" })}
            >
              <Vote size={18} />
              投票へ
            </button>
          </div>
          {!canControlWordWolf && <p className="soft-note">会話時間と投票への切り替えはホスト端末で操作します。</p>}
        </section>
      )}

      {state.step === "vote" && currentVoter && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">
              投票 {state.voteIndex + 1}/{state.players.length}
            </p>
            <h2>{currentVoter.name}さんの投票</h2>
            <p>少数派だと思う人を選んでください。自分には投票できません。同票の場合は少数派の勝ちとして扱います。</p>
          </div>
          <div className="candidate-grid">
            {state.players
              .filter((player) => player.id !== currentVoter.id)
              .map((player) => (
                <button
                  key={player.id}
                  disabled={!canVoteForCurrentVoter}
                  onClick={() => {
                    const nextVotes = { ...state.votes, [currentVoter.id]: player.id };
                    if (state.voteIndex + 1 >= state.players.length) {
                      setState({ ...state, votes: nextVotes, step: "result" });
                    } else {
                      setState({ ...state, votes: nextVotes, voteIndex: state.voteIndex + 1 });
                    }
                  }}
                >
                  {player.name}
                </button>
              ))}
          </div>
          {!canVoteForCurrentVoter && (
            <p className="soft-note">
              今は{currentVoter.name}さんの投票順です。自分の順番になると候補を選べます。
            </p>
          )}
        </section>
      )}

      {state.step === "result" && (
        <section className="tool-surface">
          <div className="result-heading">
            <Trophy size={24} />
            <div>
              <p className="eyebrow">結果</p>
              <h2>{wordWolfResult.majorityWin ? "多数派の勝ち" : "少数派の勝ち"}</h2>
            </div>
          </div>
          <div className="result-table">
            {wordWolfResult.tally.map(({ player, count }) => {
              const assignment = state.assignments.find((item) => item.playerId === player.id);
              return (
                <div className="result-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>{count}票</span>
                  <span>{assignment?.role === "minority" ? "少数派" : "多数派"}</span>
                  <span>{assignment?.word}</span>
                </div>
              );
            })}
          </div>
          <p className="talk-cue">
            少数派は{wordWolfResult.minority ? state.players.find((player) => player.id === wordWolfResult.minority?.playerId)?.name : "不明"}
            さんでした。
          </p>
          <p className="soft-note">同票や多数派に票が集まった場合は、少数派がうまく紛れ込めた扱いです。</p>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlWordWolf} onClick={startRound}>
              <RotateCcw size={18} />
              同じメンバーでもう一度
            </button>
            <button className="secondary-button" disabled={!canControlWordWolf} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlWordWolf && <p className="soft-note">もう一度遊ぶ操作はホスト端末で行います。</p>}
        </section>
      )}
    </GameFrame>
  );
}

type NgDifficulty = "easy" | "normal";
type NgWordStep = "setup" | "reveal" | "play" | "result";

type NgWordAssignment = {
  playerId: string;
  word: string;
  penaltyCount: number;
};

type NgWordState = {
  players: Player[];
  difficulty: NgDifficulty;
  seconds: number;
  step: NgWordStep;
  assignments: NgWordAssignment[];
  revealIndex: number;
  revealVisible: boolean;
  remainingSeconds: number;
  timerRunning: boolean;
  timerEndsAt: string | null;
};

const ngDifficultyOptions: SegmentedOption<NgDifficulty>[] = [
  { value: "easy", label: "かんたん" },
  { value: "normal", label: "普通" },
];

const ngWordTimeOptions: SegmentedOption<"300" | "600" | "900">[] = [
  { value: "300", label: "5分" },
  { value: "600", label: "10分" },
  { value: "900", label: "15分" },
];

const ngEasyWords = ["すごい", "なるほど", "たしかに", "やばい", "おいしい", "いいね", "ほんと", "なんで", "ありがとう", "ちょっと"];
const ngNormalWords = ["仕事", "明日", "最近", "好き", "眠い", "忙しい", "旅行", "ごはん", "休み", "楽しい"];

const initialNgWordState: NgWordState = {
  players: [],
  difficulty: "easy",
  seconds: 600,
  step: "setup",
  assignments: [],
  revealIndex: 0,
  revealVisible: false,
  remainingSeconds: 600,
  timerRunning: false,
  timerEndsAt: null,
};

function getNgWordPool(difficulty: NgDifficulty, playerCount: number) {
  const primary = difficulty === "easy" ? ngEasyWords : ngNormalWords;
  const secondary = difficulty === "easy" ? ngNormalWords : ngEasyWords;
  return playerCount <= primary.length ? primary : [...primary, ...secondary];
}

type NgWordRoomEnvelope = RoomProgressState & {
  ngWord?: NgWordState;
};

function parseNgWordStateFromRoom(snapshot: RoomSnapshot | null) {
  if (!snapshot || snapshot.room.currentGame !== "ng-word") return null;
  const state = snapshot.room.state && typeof snapshot.room.state === "object" ? (snapshot.room.state as Partial<NgWordRoomEnvelope>) : {};
  return state.ngWord && typeof state.ngWord === "object" ? ({ ...initialNgWordState, ...state.ngWord } as NgWordState) : null;
}

function getNgWordProgressStep(state: NgWordState) {
  const stepOrder: Record<NgWordStep, number> = {
    setup: 1,
    reveal: 2,
    play: 3,
    result: 4,
  };
  return stepOrder[state.step] ?? 1;
}

function describeNgWordProgress(state: NgWordState) {
  if (state.step === "setup") return "NGワードゲームの設定中です";
  if (state.step === "reveal") return "NGワードを配布確認中です";
  if (state.step === "play") {
    const totalPenalty = state.assignments.reduce((sum, assignment) => sum + assignment.penaltyCount, 0);
    return `会話中です: ${formatTime(getSyncedTimerRemaining(state))} / 踏んだ記録${totalPenalty}回`;
  }
  return "NGワードゲームの結果を表示中です";
}

function buildNgWordRoomEnvelope(ngWord: NgWordState, updatedBy: string | null): NgWordRoomEnvelope {
  return {
    phase: ngWord.step === "result" ? "complete" : "playing",
    gameKey: "ng-word",
    gameTitle: findGameMeta("ng-word")?.title ?? "NGワードゲーム",
    step: getNgWordProgressStep(ngWord),
    message: describeNgWordProgress(ngWord),
    updatedBy,
    updatedAt: new Date().toISOString(),
    ngWord,
  };
}

function NgWordGame({
  onHome,
  onResetAll,
  roomSessionOverride = null,
}: {
  onHome: () => void;
  onResetAll: () => void;
  roomSessionOverride?: RoomSession | null;
}) {
  const storedRoomSession = useMemo(() => readRoomSession(), []);
  const roomSession = roomSessionOverride ?? storedRoomSession;
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [roomSyncError, setRoomSyncError] = useState("");
  const roomSocketRef = useRef<Socket | null>(null);
  const [storedState, setStoredState] = useStoredState<NgWordState>("ng-word", initialNgWordState);
  const roomNgWordState = parseNgWordStateFromRoom(roomSnapshot);
  const isNgWordRoom = Boolean(roomSession && (!roomSnapshot || roomSnapshot.room.currentGame === "ng-word"));
  const activeNgWordState = isNgWordRoom ? (roomNgWordState ?? initialNgWordState) : storedState;
  const state = { ...initialNgWordState, ...activeNgWordState };
  const isRoomHost = isNgWordRoom && roomSession?.participantRole === "host";
  const canControlNgWord = !isNgWordRoom || (isRoomHost && Boolean(roomSnapshot));
  const canRecordNgPenalty = !isNgWordRoom || Boolean(roomSnapshot);
  const canStart = state.players.length >= 3 && state.players.every((player) => player.name.trim());
  const ngWordTimerNow = useSecondTick(state.step === "play" && state.timerRunning);
  const ngWordRemainingSeconds = getSyncedTimerRemaining(state, ngWordTimerNow);
  const ngWordTimerRunning = state.timerRunning && ngWordRemainingSeconds > 0;

  function setState(nextStateOrUpdater: NgWordState | ((current: NgWordState) => NgWordState)) {
    if (isNgWordRoom && roomSession && !roomSnapshot) {
      setRoomSyncError("ルーム情報を読み込み中です。少し待ってから操作してください。");
      return;
    }

    if (!isNgWordRoom || !roomSession || !roomSnapshot) {
      setStoredState(nextStateOrUpdater);
      return;
    }

    const nextState = typeof nextStateOrUpdater === "function" ? nextStateOrUpdater(state) : nextStateOrUpdater;
    const nextRoomState = buildNgWordRoomEnvelope(nextState, roomSession.participantId);
    setRoomSnapshot({
      ...roomSnapshot,
      room: {
        ...roomSnapshot.room,
        status: nextRoomState.phase === "complete" ? "complete" : "playing",
        currentGame: "ng-word",
        state: nextRoomState,
      },
    });
    roomSocketRef.current?.emit("room:state:update", {
      roomCode: roomSession.roomCode,
      currentGame: "ng-word",
      state: nextRoomState,
    });
  }

  useEffect(() => {
    if (!roomSession) return;
    let ignore = false;
    fetchRoomSnapshot(roomSession.roomCode, roomSession.participantId)
      .then((snapshot) => {
        if (!ignore) setRoomSnapshot(snapshot);
      })
      .catch((caught) => {
        if (!ignore) setRoomSyncError(toErrorMessage(caught));
      });

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
    });
    roomSocketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode: roomSession.roomCode, participantId: roomSession.participantId });
    });

    socket.on("room:updated", (nextSnapshot: RoomSnapshot | null) => {
      if (nextSnapshot) setRoomSnapshot(nextSnapshot);
    });

    socket.on("room:error", (payload: { error?: string }) => {
      setRoomSyncError(toErrorMessage(payload.error ?? "room_error"));
    });

    return () => {
      ignore = true;
      socket.disconnect();
      roomSocketRef.current = null;
    };
  }, [roomSession]);

  useEffect(() => {
    if (state.step !== "play" || !state.timerRunning || ngWordRemainingSeconds > 0 || !canControlNgWord) return;
    setState((current) =>
      current.step === "play" && current.timerRunning && getSyncedTimerRemaining(current) === 0
        ? stopSyncedTimer(current, 0)
        : current,
    );
  }, [canControlNgWord, state.step, state.timerRunning, ngWordRemainingSeconds]);

  function startRound() {
    if (!canControlNgWord) return;
    const words = shuffle(getNgWordPool(state.difficulty, state.players.length));
    const assignments = state.players.map((player, index) => ({
      playerId: player.id,
      word: words[index],
      penaltyCount: 0,
    }));
    setState({
      ...state,
      step: "reveal",
      assignments,
      revealIndex: 0,
      revealVisible: false,
      remainingSeconds: state.seconds,
      timerRunning: false,
      timerEndsAt: null,
    });
  }

  const currentRevealPlayer = state.players[state.revealIndex] ?? null;
  const currentRevealAssignment = currentRevealPlayer
    ? state.assignments.find((assignment) => assignment.playerId === currentRevealPlayer.id)
    : null;
  const resultRows = useMemo(() => {
    return state.assignments
      .map((assignment) => ({
        assignment,
        player: state.players.find((player) => player.id === assignment.playerId),
      }))
      .filter((row) => row.player)
      .sort((a, b) => a.assignment.penaltyCount - b.assignment.penaltyCount);
  }, [state.assignments, state.players]);
  const minPenalty = resultRows[0]?.assignment.penaltyCount ?? 0;
  const winners = resultRows.filter((row) => row.assignment.penaltyCount === minPenalty);

  function addPenalty(playerId: string) {
    if (!canRecordNgPenalty) return;
    setState({
      ...state,
      assignments: state.assignments.map((assignment) =>
        assignment.playerId === playerId ? { ...assignment, penaltyCount: assignment.penaltyCount + 1 } : assignment,
      ),
    });
  }

  return (
    <GameFrame
      title="NGワードゲーム"
      subtitle="言わせたい、でも自分は言わない。会話中に遊べます。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
      {isNgWordRoom && roomSession && (
        <section className="tool-surface room-sync-strip">
          <div>
            <p className="eyebrow">ルーム同期中</p>
            <h3>
              {roomSession.roomCode} / {roomSession.participantName}
              {isRoomHost ? " / ホスト" : ""}
            </h3>
            <p className="soft-note">
              {isRoomHost
                ? "この端末が進行役です。参加者取り込み、配布、タイマー、結果表示を同期します。"
                : "この端末では自分以外のNGワード確認と、踏んだ記録の追加ができます。"}
            </p>
          </div>
          {roomSyncError && <p className="room-message error">{roomSyncError}</p>}
        </section>
      )}

      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を3人以上登録します。</li>
              <li>アプリが参加者ごとにNGワードを1つずつ配ります。</li>
              <li>本人は自分のNGワードを見ません。他の人だけが確認します。</li>
              <li>会話中に自分のNGワードを言ったら、その人に+1点を記録します。</li>
              <li>制限時間が終わったら結果へ進み、点数が少ない人が勝ちです。</li>
            </ol>
          </div>

          {isNgWordRoom && roomSnapshot && (
            <div className="notice-panel calm">
              <strong>ルーム参加者をNGワードメンバーに使えます</strong>
              <p>ホストを司会にするなら「ホスト以外」、ホストも参加するなら「全員」を選びます。</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, false),
                      step: "setup",
                      assignments: [],
                      revealIndex: 0,
                      revealVisible: false,
                      timerRunning: false,
                      remainingSeconds: state.seconds,
                      timerEndsAt: null,
                    })
                  }
                >
                  <Users size={18} />
                  ホスト以外を使う
                </button>
                <button
                  className="secondary-button"
                  disabled={!isRoomHost}
                  type="button"
                  onClick={() =>
                    setState({
                      ...state,
                      players: roomParticipantsToPlayers(roomSnapshot, true),
                      step: "setup",
                      assignments: [],
                      revealIndex: 0,
                      revealVisible: false,
                      timerRunning: false,
                      remainingSeconds: state.seconds,
                      timerEndsAt: null,
                    })
                  }
                >
                  <Users size={18} />
                  全員を使う
                </button>
              </div>
            </div>
          )}

          {canControlNgWord ? (
            <>
              <PlayerSetup
                players={state.players}
                minPlayers={3}
                maxPlayers={12}
                onChange={(players) => setState({ ...state, players, assignments: [], revealIndex: 0, revealVisible: false })}
              />
              <SegmentedControl
                label="ワード"
                options={ngDifficultyOptions}
                value={state.difficulty}
                onChange={(difficulty) => setState({ ...state, difficulty, assignments: [], revealIndex: 0, revealVisible: false })}
              />
              <SegmentedControl
                label="時間"
                options={ngWordTimeOptions}
                value={String(state.seconds) as "300" | "600" | "900"}
                onChange={(seconds) =>
                  setState({
                    ...state,
                    seconds: Number(seconds),
                    remainingSeconds: Number(seconds),
                    timerRunning: false,
                    timerEndsAt: null,
                  })
                }
              />
            </>
          ) : (
            <div className="howto-panel compact">
              <h3>ホストの配布待ち</h3>
              <p className="soft-note">ホストがNGワードを配ると、この端末で自分以外のNGワードを確認できます。</p>
            </div>
          )}

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || !canControlNgWord} onClick={startRound}>
              <Play size={18} />
              配る
            </button>
            <button className="secondary-button" disabled={!canControlNgWord} onClick={() => setState(initialNgWordState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "reveal" && isNgWordRoom && (
        <section className="tool-surface">
          <div className="prompt-panel">
            <p className="eyebrow">配布確認</p>
            <h2>自分以外のNGワードを確認</h2>
            <p>本人のNGワードはその端末では表示しません。他の人のNGワードだけ見て、会話で自然に誘導します。</p>
          </div>

          <div className="result-table">
            {state.players.map((player) => {
              const assignment = state.assignments.find((item) => item.playerId === player.id);
              const isSelf = roomSession?.participantId === player.id;
              return (
                <div className="result-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>NG</span>
                  <span>{isSelf ? "あなたのNGワードは非表示" : assignment?.word ?? "未配布"}</span>
                </div>
              );
            })}
          </div>

          <div className="howto-panel compact">
            <h3>配布後の注意</h3>
            <ul className="rule-list">
              <li>自分のNGワードを聞き出そうとしすぎないようにします。</li>
              <li>他の人のNGワードを声に出して読まないようにします。</li>
              <li>全員が確認できたら、ホストが会話タイムへ進めます。</li>
            </ul>
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              disabled={!canControlNgWord}
              onClick={() => setState({ ...state, step: "play", revealVisible: false, timerRunning: false, timerEndsAt: null })}
            >
              <Play size={18} />
              会話へ進む
            </button>
            <button className="secondary-button" disabled={!canControlNgWord} onClick={startRound}>
              <RotateCcw size={18} />
              配り直す
            </button>
          </div>
          {!canControlNgWord && <p className="soft-note">会話へ進む操作はホスト端末で行います。</p>}
        </section>
      )}

      {state.step === "reveal" && !isNgWordRoom && currentRevealPlayer && currentRevealAssignment && (
        <section className="tool-surface center-flow">
          <p className="eyebrow">
            {state.revealIndex + 1}/{state.players.length}
          </p>
          <h2>{currentRevealPlayer.name}さんのNGワード</h2>
          <p className="soft-note">
            {currentRevealPlayer.name}さん本人は画面を見ないでください。他の人が確認したら、次の人へ回します。
          </p>
          <div className={`secret-word warning ${state.revealVisible ? "visible" : ""}`}>
            {state.revealVisible ? currentRevealAssignment.word : "NGワードを隠しています"}
          </div>
          <div className="action-row centered">
            <button className="primary-button" onClick={() => setState({ ...state, revealVisible: !state.revealVisible })}>
              {state.revealVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {state.revealVisible ? "隠す" : "見る"}
            </button>
            <button
              className="secondary-button"
              disabled={!state.revealVisible}
              onClick={() => {
                if (state.revealIndex + 1 >= state.players.length) {
                  setState({ ...state, step: "play", revealVisible: false });
                } else {
                  setState({ ...state, revealIndex: state.revealIndex + 1, revealVisible: false });
                }
              }}
            >
              <ChevronRight size={18} />
              次へ
            </button>
          </div>
          <div className="howto-panel compact">
            <h3>配るときの注意</h3>
            <ul className="rule-list">
              <li>本人に画面が見えない角度で確認します。</li>
              <li>NGワードを声に出して読まないようにします。</li>
              <li>見終わったら必ず隠してからスマホを渡します。</li>
            </ul>
          </div>
        </section>
      )}

      {state.step === "play" && (
        <section className="tool-surface">
          <div className="timer-strip">
            <div>
              <p className="eyebrow">会話タイム</p>
              <strong>{formatTime(ngWordRemainingSeconds)}</strong>
            </div>
            <button
              className="secondary-button"
              onClick={() => setState(toggleSyncedTimer(state, ngWordTimerNow))}
              disabled={ngWordRemainingSeconds === 0 || !canControlNgWord}
            >
              {ngWordTimerRunning ? <Pause size={18} /> : <Play size={18} />}
              {ngWordTimerRunning ? "止める" : "開始"}
            </button>
          </div>

          <div className="howto-panel compact">
            <h3>会話中の進め方</h3>
            <ul className="rule-list">
              <li>誰かが自分のNGワードを言ったら、その人の+1を押します。</li>
              <li>言ったか迷う場合は、その場の多数決で決めます。</li>
              <li>脱落はなしです。点が入っても最後まで会話に参加します。</li>
            </ul>
          </div>

          {isNgWordRoom && (
            <div className="result-table">
              {state.players.map((player) => {
                const assignment = state.assignments.find((item) => item.playerId === player.id);
                const isSelf = roomSession?.participantId === player.id;
                return (
                  <div className="result-row" key={player.id}>
                    <strong>{player.name}</strong>
                    <span>NG</span>
                    <span>{isSelf ? "あなたのNGワードは非表示" : assignment?.word ?? "未配布"}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="penalty-list">
            {state.players.map((player) => {
              const assignment = state.assignments.find((item) => item.playerId === player.id);
              return (
                <div className="penalty-row" key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{assignment?.penaltyCount ?? 0}点</span>
                  </div>
                  <button className="danger-button" disabled={!canRecordNgPenalty} onClick={() => addPenalty(player.id)}>
                    +1
                  </button>
                </div>
              );
            })}
          </div>

          <div className="action-row">
            <button
              className="secondary-button"
              disabled={!canControlNgWord}
              onClick={() =>
                setState({
                  ...stopSyncedTimer(state, ngWordRemainingSeconds),
                  step: "reveal",
                  revealIndex: 0,
                  revealVisible: false,
                })
              }
            >
              <Eye size={18} />
              確認し直す
            </button>
            <button
              className="primary-button"
              disabled={!canControlNgWord}
              onClick={() => setState({ ...stopSyncedTimer(state, ngWordRemainingSeconds), step: "result" })}
            >
              <Trophy size={18} />
              結果へ
            </button>
          </div>
          {!canControlNgWord && <p className="soft-note">タイマーと結果へ進む操作はホスト端末で行います。踏んだ記録はこの端末から追加できます。</p>}
        </section>
      )}

      {state.step === "result" && (
        <section className="tool-surface">
          <div className="result-heading">
            <Trophy size={24} />
            <div>
              <p className="eyebrow">結果</p>
              <h2>{winners.map((row) => row.player?.name).join("、")}さんの勝ち</h2>
            </div>
          </div>
          <div className="result-table">
            {resultRows.map(({ assignment, player }) => (
              <div className="result-row" key={assignment.playerId}>
                <strong>{player?.name}</strong>
                <span>{assignment.penaltyCount}点</span>
                <span>NG</span>
                <span>{assignment.word}</span>
              </div>
            ))}
          </div>
          <p className="talk-cue">言わせようとした場面を振り返ると、もう一段盛り上がります。</p>
          <p className="soft-note">同点の場合は全員勝ちとして扱うと、飲み会では終わり方が軽くなります。</p>
          <div className="action-row">
            <button className="primary-button" disabled={!canControlNgWord} onClick={startRound}>
              <RotateCcw size={18} />
              同じメンバーでもう一度
            </button>
            <button className="secondary-button" disabled={!canControlNgWord} onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
          {!canControlNgWord && <p className="soft-note">もう一度遊ぶ操作はホスト端末で行います。</p>}
        </section>
      )}
    </GameFrame>
  );
}

export default App;
