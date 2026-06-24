import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Home,
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
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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

function isUrlCandidateGameKey(key: GameKey | null): key is UrlCandidateGameKey {
  return Boolean(key && key in urlCandidateGameByKey);
}

function App() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);

  function resetAllGames() {
    clearStoredGameStates();
    setActiveGame(null);
  }

  if (activeGame === "yamanote") {
    return <YamanoteGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "two-choice") {
    return <TwoChoiceGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "word-wolf") {
    return <WordWolfGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "ng-word") {
    return <NgWordGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "impression-ranking") {
    return <ImpressionRankingGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "party-pack") {
    return <PartyPackGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "johari-window") {
    return <JohariWindowGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "turtle-soup") {
    return <TurtleSoupGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (activeGame === "anonymous-box") {
    return <AnonymousQuestionBoxGame onHome={() => setActiveGame(null)} onResetAll={resetAllGames} />;
  }

  if (isUrlCandidateGameKey(activeGame)) {
    return (
      <UrlCandidateGame
        config={urlCandidateGameByKey[activeGame]}
        onHome={() => setActiveGame(null)}
        onResetAll={resetAllGames}
      />
    );
  }

  return <HomeScreen onStart={setActiveGame} onResetAll={resetAllGames} />;
}

function HomeScreen({ onStart, onResetAll }: { onStart: (game: GameKey) => void; onResetAll: () => void }) {
  const [filter, setFilter] = useState<HomeFilter>("all");
  const visibleGames = filter === "all" ? activeGames : activeGames.filter((game) => game.groups.includes(filter));

  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="アプリ概要">
        <div>
          <p className="eyebrow">1台共有モード</p>
          <h1>飲み会アプリ</h1>
          <p className="lead">幹事のスマホを回して、すぐ遊べるミニゲーム集。</p>
        </div>
        <div className="top-actions">
          <div className="status-pill">
            <Check size={18} />
            DB不要
          </div>
          <button className="secondary-button reset-all-button" onClick={onResetAll}>
            <RotateCcw size={18} />
            初期化
          </button>
        </div>
      </section>

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
};

function createPlayerPositions(players: Player[]) {
  return Object.fromEntries(players.map((player) => [player.id, 0]));
}

function createHazardIndex() {
  return Math.floor(Math.random() * 8) + 1;
}

function UrlCandidateGame({
  config,
  onHome,
  onResetAll,
}: {
  config: UrlCandidateGameConfig;
  onHome: () => void;
  onResetAll: () => void;
}) {
  const [storedState, setState] = useStoredState<UrlCandidateState>(config.key, initialUrlCandidateState);
  const state = { ...initialUrlCandidateState, ...storedState };
  const promptPool = useMemo(
    () => config.prompts.filter((prompt) => state.includeAdultTopics || prompt.rating === "normal"),
    [config.prompts, state.includeAdultTopics],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const prompt = config.prompts.find((item) => item.id === state.deckPromptIds[state.deckIndex]) ?? null;
  const currentPlayer = state.players[state.currentPlayerIndex % Math.max(1, state.players.length)] ?? null;
  const canStart = state.players.length >= config.minPlayers && state.players.every((player) => player.name.trim());
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";
  const normalCount = config.prompts.filter((item) => item.rating === "normal").length;
  const adultCount = config.prompts.filter((item) => item.rating === "adult").length;

  useEffect(() => {
    if (state.step === "play" && !prompt) {
      setState({ ...state, step: "setup", deckPromptIds: [], deckIndex: 0, answerVisible: false });
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
    });
  }

  function moveToNextUrlPrompt() {
    const nextIndex = state.deckIndex + 1;
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
    });
  }

  return (
    <GameFrame title={config.title} subtitle={config.description} onHome={onHome} onResetAll={onResetAll}>
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

          <PlayerSetup
            players={state.players}
            minPlayers={config.minPlayers}
            maxPlayers={config.maxPlayers}
            onChange={(players) => setState({ ...state, players })}
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
              setState({ ...state, includeAdultTopics, deckPromptIds: [], deckIndex: 0, answerVisible: false })
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

          <div className="howto-panel compact">
            <h3>判定と安全の目安</h3>
            <ul className="rule-list">
              {config.judgeTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0} onClick={startUrlCandidateGame}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialUrlCandidateState)}>
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
                <span key={option}>
                  {String.fromCharCode(65 + index)}. {option}
                </span>
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

          {config.answerMode === "hidden" && prompt.answer && (
            <div className="action-row">
              <button
                className="secondary-button"
                onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
              >
                {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                {state.answerVisible ? "答えを隠す" : "出題者だけ答えを見る"}
              </button>
            </div>
          )}

          {config.answerMode === "hidden" && prompt.answer && state.answerVisible && (
            <div className="answer-panel">
              <strong>答え</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          <UrlCandidateInteractionPanel config={config} prompt={prompt} state={state} setState={setState} />

          <div className="howto-panel compact">
            <h3>このゲームの進め方</h3>
            <ol className="rule-list">
              {config.playSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="action-row">
            <button className="primary-button" onClick={moveToNextUrlPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", answerVisible: false })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Trophy size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">違う設問数やHな話題ON/OFFに変えると、同じゲームでも雰囲気を変えて遊べます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startUrlCandidateGame}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
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
}: {
  config: UrlCandidateGameConfig;
  prompt: UrlCandidatePrompt;
  state: UrlCandidateState;
  setState: (state: UrlCandidateState) => void;
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

  if (config.kind === "count-up") {
    const target = prompt.targetNumber ?? 30;
    return (
      <div className="url-interaction-panel">
        <div className="url-counter">
          <span>現在</span>
          <strong>{state.numberValue}</strong>
          <span>目標 {target}</span>
        </div>
        <div className="action-row centered">
          {[1, 2, 3].map((step) => (
            <button
              className="secondary-button"
              key={step}
              onClick={() => {
                if (!currentPlayer) return;
                const nextValue = state.numberValue + step;
                const message =
                  nextValue >= target
                    ? `${currentPlayer.name}さんが${target}以上に到達。アウトとして笑って次へ。`
                    : `${currentPlayer.name}さんが${nextValue}まで進めました。`;
                pushLog(message, {
                  numberValue: Math.min(nextValue, target),
                  currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
                });
              }}
            >
              +{step}
            </button>
          ))}
          <button className="secondary-button" onClick={() => pushLog("数字を0に戻しました。", { numberValue: 0 })}>
            <RotateCcw size={18} />
            数字を戻す
          </button>
        </div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (config.kind === "hazard" || config.kind === "draw") {
    const nextDraw = state.drawnCount + 1;
    const isHazard = nextDraw === state.hazardIndex;
    return (
      <div className="url-interaction-panel">
        <div className="draw-status">
          <strong>{state.drawnCount}/8枚</strong>
          <span>1枚だけはずれがあります</span>
        </div>
        <div className="action-row centered">
          <button
            className={isHazard ? "danger-button" : "primary-button"}
            disabled={state.drawnCount >= 8}
            onClick={() => {
              if (!currentPlayer) return;
              const message = isHazard
                ? `${currentPlayer.name}さんがはずれ。安全な一言お題で場を温めます。`
                : `${currentPlayer.name}さんはセーフ。`;
              pushLog(message, {
                drawnCount: nextDraw,
                currentPlayerIndex: (state.currentPlayerIndex + 1) % Math.max(1, state.players.length),
              });
            }}
          >
            <ShieldAlert size={18} />
            1枚引く
          </button>
          <button
            className="secondary-button"
            onClick={() => pushLog("カードを混ぜ直しました。", { drawnCount: 0, hazardIndex: createHazardIndex() })}
          >
            <RotateCcw size={18} />
            混ぜ直す
          </button>
        </div>
        <UrlActionLog logs={state.actionLog} />
      </div>
    );
  }

  if (config.kind === "sugoroku") {
    return (
      <div className="url-interaction-panel">
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
      </div>
    );
  }

  if (config.kind === "territory") {
    const cells = Array.from({ length: 25 }, (_, index) => String(index));
    return (
      <div className="url-interaction-panel">
        <p className="soft-note">{currentPlayer ? `${currentPlayer.name}さんが取るマスを選びます。` : "参加者が必要です。"}</p>
        <div className="territory-grid">
          {cells.map((cell) => {
            const ownerId = state.territory[cell];
            const owner = state.players.find((player) => player.id === ownerId);
            return (
              <button
                key={cell}
                className={owner ? "owned" : ""}
                disabled={Boolean(owner) || !currentPlayer}
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
      </div>
    );
  }

  if (config.kind === "tournament") {
    return (
      <div className="url-interaction-panel">
        <div className="matchup-panel">
          <span>{currentPlayer?.name ?? "参加者A"}</span>
          <strong>VS</strong>
          <span>{secondPlayer?.name ?? "参加者B"}</span>
        </div>
        <div className="action-row centered">
          {[currentPlayer, secondPlayer].filter(Boolean).map((player) => (
            <button
              className="primary-button"
              key={player!.id}
              onClick={() =>
                pushLog(`${player!.name}さんが勝ち。無理なく拍手で次の対戦へ。`, {
                  currentPlayerIndex: (state.currentPlayerIndex + 2) % Math.max(1, state.players.length),
                  completedPairs: state.completedPairs + 1,
                })
              }
            >
              {player!.name}が勝ち
            </button>
          ))}
        </div>
        <UrlActionLog logs={state.actionLog} />
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

function YamanoteGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<YamanoteState>("yamanote", initialYamanoteState);
  const [draftAnswer, setDraftAnswer] = useState("");
  const state = { ...initialYamanoteState, ...storedState };
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

  useEffect(() => {
    if (state.step === "play" && !activeTheme) {
      setState({ ...state, step: "setup", deckThemeIds: [], deckIndex: 0, answerLog: [] });
    }
  }, [activeTheme, setState, state.step]);

  function startYamanote() {
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
    if (!answer || !currentPlayer || isDuplicateAnswer) return;
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
          <PlayerSetup
            players={state.players}
            minPlayers={2}
            maxPlayers={20}
            onChange={(players) => setState({ ...state, players })}
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
              })
            }
          />
          <SegmentedControl
            label="カテゴリ"
            options={availableYamanoteCategories}
            value={activeYamanoteCategory}
            onChange={(category) => setState({ ...state, category, deckThemeIds: [], deckIndex: 0, answerLog: [] })}
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
            <button className="primary-button" disabled={!canStart || selectedThemeCount === 0} onClick={startYamanote}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialYamanoteState)}>
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
            <button className="primary-button" onClick={moveToNextYamanoteTheme}>
              {state.deckIndex + 1 >= state.deckThemeIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckThemeIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
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
            <button className="primary-button" onClick={startYamanote}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
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

function JohariWindowGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<JohariState>("johari-window", initialJohariState);
  const state = { ...initialJohariState, ...storedState };
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

  function startJohari() {
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
    const selected = state.selfWordIds.includes(id)
      ? state.selfWordIds.filter((wordId) => wordId !== id)
      : [...state.selfWordIds, id];
    setState({ ...state, selfWordIds: selected });
  }

  function togglePeerWord(peerId: string, id: string) {
    const current = state.peerSelections[peerId] ?? [];
    const selected = current.includes(id) ? current.filter((wordId) => wordId !== id) : [...current, id];
    setState({ ...state, peerSelections: { ...state.peerSelections, [peerId]: selected } });
  }

  function moveToNextPeer() {
    if (state.peerIndex + 1 >= peers.length) {
      setState({ ...state, step: "result" });
      return;
    }
    setState({ ...state, peerIndex: state.peerIndex + 1 });
  }

  function moveToNextTarget() {
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
          <PlayerSetup
            players={state.players}
            minPlayers={3}
            maxPlayers={12}
            onChange={(players) => setState({ ...state, players })}
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
          <div className="notice-panel calm">
            <strong>心理的安全性を優先します</strong>
            <p>容姿や年齢をいじるゲームではありません。良い特徴、役割、見え方を共有する時間として進めます。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedWordCount === 0} onClick={startJohari}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialJohariState)}>
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
          <ToggleWordGrid words={deckWords} selectedIds={state.selfWordIds} onToggle={toggleSelfWord} />
          <div className="action-row">
            <button className="primary-button" onClick={() => setState({ ...state, step: "peer", peerIndex: 0 })}>
              <ChevronRight size={18} />
              周りの選択へ
            </button>
            <span className="inline-status">{state.selfWordIds.length}語選択中</span>
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
          <ToggleWordGrid
            words={deckWords}
            selectedIds={state.peerSelections[currentPeer.id] ?? []}
            onToggle={(id) => togglePeerWord(currentPeer.id, id)}
          />
          <div className="action-row">
            <button className="primary-button" onClick={moveToNextPeer}>
              <ChevronRight size={18} />
              {state.peerIndex + 1 >= peers.length ? "結果を見る" : "次の人へ"}
            </button>
            <span className="inline-status">{(state.peerSelections[currentPeer.id] ?? []).length}語選択中</span>
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
            <button className="primary-button" onClick={moveToNextTarget}>
              {state.targetIndex + 1 >= state.players.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.targetIndex + 1 >= state.players.length ? "完了" : "次の対象者"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Eye size={32} />
          <p className="eyebrow">終了</p>
          <h2>全員分の窓を見ました</h2>
          <p className="talk-cue">印象に残った良い言葉を1つずつ持ち帰ると、気持ちよく終われます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startJohari}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
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

function TurtleSoupGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<TurtleSoupState>("turtle-soup", initialTurtleSoupState);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState<"はい" | "いいえ" | "関係ありません" | "補足あり">("はい");
  const state = { ...initialTurtleSoupState, ...storedState };
  const casePool = useMemo(
    () => (state.category === "all" ? turtleSoupCases : turtleSoupCases.filter((item) => item.category === state.category)),
    [state.category],
  );
  const selectedQuestionCount = Math.min(state.questionCount, casePool.length);
  const activeCase = turtleSoupCases.find((item) => item.id === state.caseId) ?? null;
  const facilitator = state.players.length > 0 ? state.players[state.deckIndex % state.players.length] : null;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());
  const progressLabel = state.deckCaseIds.length > 0 ? `${state.deckIndex + 1}/${state.deckCaseIds.length}` : "";

  useEffect(() => {
    if (state.step === "play" && !activeCase) {
      setState({ ...state, step: "setup", caseId: null, deckCaseIds: [], deckIndex: 0, hintLevel: 0, answerVisible: false });
    }
  }, [activeCase, setState, state.step]);

  function startTurtleSoup() {
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
          <PlayerSetup
            players={state.players}
            minPlayers={2}
            maxPlayers={12}
            onChange={(players) => setState({ ...state, players })}
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
          <p className="soft-note">
            この条件では{casePool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。全体の問題は300問です。
          </p>
          <div className="notice-panel calm">
            <strong>質問のコツ</strong>
            <p>「誰が」「いつ」「場所は」「見えているものは本物か」など、前提をほどく質問から始めると進みやすいです。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0} onClick={startTurtleSoup}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialTurtleSoupState)}>
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
            <p>出題者が必要な時だけ記録します。記録しなくても遊べます。</p>
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
                placeholder="例: それは人間ですか？"
                maxLength={80}
              />
              <select value={draftAnswer} onChange={(event) => setDraftAnswer(event.target.value as typeof draftAnswer)}>
                <option value="はい">はい</option>
                <option value="いいえ">いいえ</option>
                <option value="関係ありません">関係ありません</option>
                <option value="補足あり">補足あり</option>
              </select>
              <button className="secondary-button" disabled={!draftQuestion.trim()} type="submit">
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
          </div>
          <div className="action-row">
            <button
              className="secondary-button"
              disabled={state.hintLevel >= activeCase.hints.length}
              onClick={() => setState({ ...state, hintLevel: Math.min(activeCase.hints.length, state.hintLevel + 1) })}
            >
              <MessageCircleQuestion size={18} />
              ヒントを出す
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}>
              {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
              {state.answerVisible ? "真相を隠す" : "出題者だけ真相を見る"}
            </button>
          </div>
          {state.answerVisible && (
            <div className="answer-panel wide">
              <strong>真相</strong>
              <p>{activeCase.truth}</p>
            </div>
          )}
          <div className="action-row">
            <button className="primary-button" onClick={() => moveToNextTurtleCase(true)}>
              <Check size={18} />
              解けた
            </button>
            <button className="secondary-button" onClick={() => moveToNextTurtleCase(false)}>
              <ChevronRight size={18} />
              次の問題
            </button>
          </div>
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
            <button className="primary-button" onClick={startTurtleSoup}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", caseId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
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

function AnonymousQuestionBoxGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<AnonymousQuestionState>("anonymous-box", initialAnonymousQuestionState);
  const [draftQuestion, setDraftQuestion] = useState("");
  const state = { ...initialAnonymousQuestionState, ...storedState };
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

  function addCustomQuestion() {
    const text = draftQuestion.trim();
    if (!text) return;
    setState({
      ...state,
      customQuestions: [...state.customQuestions, { id: createId("question"), text }],
    });
    setDraftQuestion("");
  }

  function removeCustomQuestion(id: string) {
    setState({ ...state, customQuestions: state.customQuestions.filter((question) => question.id !== id) });
  }

  function startAnonymousBox() {
    const customIds = state.customQuestions.map((question) => `custom:${question.id}`);
    const templateLimit = Math.max(0, selectedQuestionCount - customIds.length);
    const templateIds = shuffle(questionPool)
      .slice(0, templateLimit)
      .map((question) => `template:${question.id}`);
    const deckQuestionIds = shuffle([...customIds, ...templateIds]).slice(0, selectedQuestionCount);
    setState({ ...state, step: "question", deckQuestionIds, deckIndex: 0 });
  }

  function moveToNextAnonymousQuestion() {
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
          <PlayerSetup
            players={state.players}
            minPlayers={2}
            maxPlayers={20}
            onChange={(players) => setState({ ...state, players })}
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
          <div className="setup-block">
            <div className="setup-heading">
              <div>
                <h3>匿名で質問を追加</h3>
                <p>投稿者が分からないよう、入力後はすぐ追加します。</p>
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
              <button className="primary-button" disabled={!draftQuestion.trim()} type="submit">
                <Plus size={18} />
                追加
              </button>
            </form>
            {state.customQuestions.length > 0 && (
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
            <button className="primary-button" disabled={!canStart} onClick={startAnonymousBox}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialAnonymousQuestionState)}>
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
            <button className="primary-button" onClick={moveToNextAnonymousQuestion}>
              {state.deckIndex + 1 >= state.deckQuestionIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckQuestionIds.length ? "完了" : "次の質問"}
            </button>
            <button className="secondary-button" onClick={moveToNextAnonymousQuestion}>
              <ChevronRight size={18} />
              スキップ
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <ListChecks size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckQuestionIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">答えやすかった質問をもう少し深掘りするか、カテゴリを変えて続けられます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startAnonymousBox}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
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

function TwoChoiceGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<TwoChoiceState>("two-choice", initialTwoChoiceState);
  const state = { ...initialTwoChoiceState, ...storedState };
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

  return (
    <GameFrame title="二択トーク" subtitle="選んだ理由を話すだけで、場がすぐ温まります。" onHome={onHome} onResetAll={onResetAll}>
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
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0} onClick={startTwoChoiceRound}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialTwoChoiceState)}>
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
                    onClick={() => updateVote(player.id, "A")}
                  >
                    {prompt.optionA}
                  </button>
                  <button
                    className={state.votes[player.id] === "B" ? "selected-choice" : ""}
                    onClick={() => updateVote(player.id, "B")}
                  >
                    {prompt.optionB}
                  </button>
                  <button
                    className={state.votes[player.id] === "skip" ? "selected-choice muted" : ""}
                    onClick={() => updateVote(player.id, "skip")}
                  >
                    パス
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="action-row">
            <button className="primary-button" disabled={!allVoted} onClick={() => setState({ ...state, step: "result" })}>
              <ChevronRight size={18} />
              結果を見る
            </button>
            <span className="inline-status">{votedCount}/{state.players.length} 投票済み</span>
          </div>
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
            <button className="primary-button" onClick={moveToNextPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", votes: {} })}>
              <Users size={18} />
              参加者を変える
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Trophy size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">続ける場合は、同じ設定で新しい設問をシャッフルできます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startTwoChoiceRound}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", votes: {}, promptId: null })}>
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

function ImpressionRankingGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<ImpressionState>("impression-ranking", initialImpressionState);
  const state = { ...initialImpressionState, ...storedState };
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

  return (
    <GameFrame
      title="第一印象ランキング"
      subtitle="一番当てはまりそうな人を選んで、明るい印象を共有するゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
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
          <PlayerSetup
            players={state.players}
            minPlayers={3}
            maxPlayers={12}
            onChange={(players) => setState({ ...state, players })}
          />
          <SegmentedControl
            label="カテゴリ"
            options={availableImpressionCategories}
            value={activeImpressionCategory}
            onChange={(category) => setState({ ...state, category, deckPromptIds: [], deckIndex: 0, promptId: null })}
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
          <div className="notice-panel calm">
            <strong>明るいランキング専用です</strong>
            <p>このゲームは印象を褒め合うためのものです。選んだ理由は短く、本人が受け取りやすい言い方にします。</p>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0} onClick={startImpressionRound}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialImpressionState)}>
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
                        key={candidate.id}
                        onClick={() => updateImpressionVote(voter.id, candidate.id)}
                      >
                        {candidate.name}
                      </button>
                    ))}
                    <button
                      className={state.votes[voter.id] === "skip" ? "selected-choice muted" : ""}
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
            <button className="primary-button" disabled={!allVoted} onClick={() => setState({ ...state, step: "result" })}>
              <ChevronRight size={18} />
              結果を見る
            </button>
            <span className="inline-status">{votedCount}/{state.players.length} 投票済み</span>
          </div>
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
            <button className="primary-button" onClick={moveToNextImpressionPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", votes: {} })}>
              <Users size={18} />
              参加者を変える
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <Sparkles size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">雰囲気がよければ、カテゴリを変えてもう一度遊べます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startImpressionRound}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", votes: {}, promptId: null })}>
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

function PartyPackGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [storedState, setState] = useStoredState<PartyPackState>("party-pack", initialPartyPackState);
  const state = { ...initialPartyPackState, ...storedState };
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
  const currentHost = state.players.length > 0 ? state.players[state.deckIndex % state.players.length] : null;

  useEffect(() => {
    if (state.step === "prompt" && !prompt) {
      setState({ ...state, step: "setup", promptId: null, deckPromptIds: [], deckIndex: 0, answerVisible: false });
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
    });
  }

  function moveToNextPartyPrompt() {
    const nextIndex = state.deckIndex + 1;
    const nextPromptId = state.deckPromptIds[nextIndex];
    if (!nextPromptId) {
      setState({ ...state, step: "complete", promptId: null, answerVisible: false });
      return;
    }
    setState({ ...state, step: "prompt", promptId: nextPromptId, deckIndex: nextIndex, answerVisible: false });
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

          <PlayerSetup
            players={state.players}
            minPlayers={minPlayers}
            maxPlayers={20}
            onChange={(players) => setState({ ...state, players })}
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
              })
            }
          />

          {state.mode === "all" ? (
            <div className="notice-panel calm">
              <strong>全部モード</strong>
              <p>
                10種類の定番ゲームを混ぜて出します。必要人数が多いカードも入るため、3人以上での開始にしています。
              </p>
            </div>
          ) : (
            <PartyModeGuide mode={state.mode} />
          )}

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
              })
            }
          />

          <p className="soft-note">
            この条件では{promptPool.length}問から、今回は{selectedQuestionCount}問をランダムに使います。全体のお題は300問です。
          </p>

          <div className="action-row">
            <button className="primary-button" disabled={!canStart || selectedQuestionCount === 0} onClick={startPartyPack}>
              <Play size={18} />
              はじめる
            </button>
            <button className="secondary-button" onClick={() => setState(initialPartyPackState)}>
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
              <button
                className="secondary-button"
                onClick={() => setState({ ...state, answerVisible: !state.answerVisible })}
              >
                {state.answerVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                {state.answerVisible ? "答えを隠す" : prompt.mode === "hint-quiz" ? "出題者だけ答えを見る" : "答えを見る"}
              </button>
            </div>
          )}

          {hiddenAnswer && state.answerVisible && (
            <div className="answer-panel">
              <strong>答え</strong>
              <p>{prompt.answer}</p>
            </div>
          )}

          <PartyModeGuide mode={prompt.mode} compact />

          <div className="action-row">
            <button className="primary-button" onClick={moveToNextPartyPrompt}>
              {state.deckIndex + 1 >= state.deckPromptIds.length ? <Check size={18} /> : <ChevronRight size={18} />}
              {state.deckIndex + 1 >= state.deckPromptIds.length ? "完了" : "次のお題"}
            </button>
            <button
              className="secondary-button"
              onClick={() => setState({ ...state, step: "setup", promptId: null, answerVisible: false })}
            >
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}

      {state.step === "complete" && (
        <section className="tool-surface center-flow">
          <ListChecks size={32} />
          <p className="eyebrow">終了</p>
          <h2>{state.deckPromptIds.length}問おつかれさまでした</h2>
          <p className="talk-cue">場が温まっていたら、種類を変えるか「全部」でテンポよくもう一周できます。</p>
          <div className="action-row centered">
            <button className="primary-button" onClick={startPartyPack}>
              <RotateCcw size={18} />
              もう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", promptId: null })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
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
  votes: {},
  voteIndex: 0,
};

function WordWolfGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [state, setState] = useStoredState<WordWolfState>("word-wolf", initialWordWolfState);
  const canStart = state.players.length >= 4 && state.players.every((player) => player.name.trim());
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

  useEffect(() => {
    if (state.step !== "discussion" || !state.timerRunning) return;
    const timer = window.setInterval(() => {
      setState((current) => {
        if (current.step !== "discussion" || !current.timerRunning) return current;
        const next = Math.max(0, current.remainingSeconds - 1);
        return {
          ...current,
          remainingSeconds: next,
          timerRunning: next > 0,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setState, state.step, state.timerRunning]);

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
      votes: {},
      voteIndex: 0,
    });
  }

  const currentRevealPlayer = state.players[state.revealIndex] ?? null;
  const currentRevealAssignment = currentRevealPlayer
    ? state.assignments.find((assignment) => assignment.playerId === currentRevealPlayer.id)
    : null;
  const currentVoter = state.players[state.voteIndex] ?? null;

  const wordWolfResult = useMemo(() => {
    const tally = state.players.map((player) => ({
      player,
      count: Object.values(state.votes).filter((targetId) => targetId === player.id).length,
    }));
    const maxVotes = Math.max(0, ...tally.map((item) => item.count));
    const topTargets = tally.filter((item) => item.count === maxVotes && maxVotes > 0).map((item) => item.player.id);
    const minority = state.assignments.find((assignment) => assignment.role === "minority");
    const majorityWin = Boolean(minority && topTargets.length === 1 && topTargets[0] === minority.playerId);
    return { tally, topTargets, minority, majorityWin };
  }, [state.assignments, state.players, state.votes]);

  return (
    <GameFrame
      title="ワードウルフ"
      subtitle="似ているけど少し違うお題を、会話と投票で見破るゲームです。"
      onHome={onHome}
      onResetAll={onResetAll}
    >
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
            onChange={(seconds) => setState({ ...state, seconds: Number(seconds), remainingSeconds: Number(seconds) })}
          />
          <div className="action-row">
            <button className="primary-button" disabled={!canStart || topicPool.length === 0} onClick={startRound}>
              <Play size={18} />
              配る
            </button>
            <button className="secondary-button" onClick={() => setState(initialWordWolfState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "reveal" && currentRevealPlayer && currentRevealAssignment && (
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
                  setState({ ...state, step: "discussion", revealVisible: false });
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
          <div className="timer-display">{formatTime(state.remainingSeconds)}</div>
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
              onClick={() => setState({ ...state, timerRunning: !state.timerRunning })}
              disabled={state.remainingSeconds === 0}
            >
              {state.timerRunning ? <Pause size={18} /> : <Play size={18} />}
              {state.timerRunning ? "止める" : "開始"}
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "vote", timerRunning: false })}>
              <Vote size={18} />
              投票へ
            </button>
          </div>
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
            <button className="primary-button" onClick={startRound}>
              <RotateCcw size={18} />
              同じメンバーでもう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
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
};

function getNgWordPool(difficulty: NgDifficulty, playerCount: number) {
  const primary = difficulty === "easy" ? ngEasyWords : ngNormalWords;
  const secondary = difficulty === "easy" ? ngNormalWords : ngEasyWords;
  return playerCount <= primary.length ? primary : [...primary, ...secondary];
}

function NgWordGame({ onHome, onResetAll }: { onHome: () => void; onResetAll: () => void }) {
  const [state, setState] = useStoredState<NgWordState>("ng-word", initialNgWordState);
  const canStart = state.players.length >= 3 && state.players.every((player) => player.name.trim());

  useEffect(() => {
    if (state.step !== "play" || !state.timerRunning) return;
    const timer = window.setInterval(() => {
      setState((current) => {
        if (current.step !== "play" || !current.timerRunning) return current;
        const next = Math.max(0, current.remainingSeconds - 1);
        return {
          ...current,
          remainingSeconds: next,
          timerRunning: next > 0,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setState, state.step, state.timerRunning]);

  function startRound() {
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
          <PlayerSetup
            players={state.players}
            minPlayers={3}
            maxPlayers={12}
            onChange={(players) => setState({ ...state, players })}
          />
          <SegmentedControl
            label="ワード"
            options={ngDifficultyOptions}
            value={state.difficulty}
            onChange={(difficulty) => setState({ ...state, difficulty })}
          />
          <SegmentedControl
            label="時間"
            options={ngWordTimeOptions}
            value={String(state.seconds) as "300" | "600" | "900"}
            onChange={(seconds) => setState({ ...state, seconds: Number(seconds), remainingSeconds: Number(seconds) })}
          />
          <div className="action-row">
            <button className="primary-button" disabled={!canStart} onClick={startRound}>
              <Play size={18} />
              配る
            </button>
            <button className="secondary-button" onClick={() => setState(initialNgWordState)}>
              <RotateCcw size={18} />
              リセット
            </button>
          </div>
        </section>
      )}

      {state.step === "reveal" && currentRevealPlayer && currentRevealAssignment && (
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
              <strong>{formatTime(state.remainingSeconds)}</strong>
            </div>
            <button
              className="secondary-button"
              onClick={() => setState({ ...state, timerRunning: !state.timerRunning })}
              disabled={state.remainingSeconds === 0}
            >
              {state.timerRunning ? <Pause size={18} /> : <Play size={18} />}
              {state.timerRunning ? "止める" : "開始"}
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

          <div className="penalty-list">
            {state.players.map((player) => {
              const assignment = state.assignments.find((item) => item.playerId === player.id);
              return (
                <div className="penalty-row" key={player.id}>
                  <div>
                    <strong>{player.name}</strong>
                    <span>{assignment?.penaltyCount ?? 0}点</span>
                  </div>
                  <button className="danger-button" onClick={() => addPenalty(player.id)}>
                    +1
                  </button>
                </div>
              );
            })}
          </div>

          <div className="action-row">
            <button
              className="secondary-button"
              onClick={() => setState({ ...state, step: "reveal", revealIndex: 0, revealVisible: false, timerRunning: false })}
            >
              <Eye size={18} />
              確認し直す
            </button>
            <button className="primary-button" onClick={() => setState({ ...state, step: "result", timerRunning: false })}>
              <Trophy size={18} />
              結果へ
            </button>
          </div>
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
            <button className="primary-button" onClick={startRound}>
              <RotateCcw size={18} />
              同じメンバーでもう一度
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup" })}>
              <Users size={18} />
              設定へ
            </button>
          </div>
        </section>
      )}
    </GameFrame>
  );
}

export default App;
