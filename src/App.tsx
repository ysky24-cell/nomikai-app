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
  Timer,
  Trash2,
  Trophy,
  Users,
  Vote,
} from "lucide-react";

type GameKey = "two-choice" | "word-wolf" | "ng-word";

type Player = {
  id: string;
  name: string;
};

type GameMeta = {
  key: GameKey;
  title: string;
  description: string;
  people: string;
  minutes: string;
  accent: "teal" | "coral" | "indigo";
  icon: LucideIcon;
};

const STORAGE_PREFIX = "nomikai-app:v1:";

const activeGames: GameMeta[] = [
  {
    key: "two-choice",
    title: "二択トーク",
    description: "A/Bで投票して、理由から会話を広げる",
    people: "2人から",
    minutes: "3分から",
    accent: "teal",
    icon: Vote,
  },
  {
    key: "word-wolf",
    title: "ワードウルフ",
    description: "似たお題を話しながら少数派を探す",
    people: "4人から",
    minutes: "5分から",
    accent: "coral",
    icon: MessageCircleQuestion,
  },
  {
    key: "ng-word",
    title: "NGワードゲーム",
    description: "本人だけ知らない言葉を言わないように会話する",
    people: "3人から",
    minutes: "5分から",
    accent: "indigo",
    icon: ShieldAlert,
  },
];

const futureGames = [
  "ジョハリの窓",
  "ウミガメのスープ",
  "第一印象ランキング",
  "匿名質問箱",
];

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

function App() {
  const [activeGame, setActiveGame] = useState<GameKey | null>(null);

  if (activeGame === "two-choice") {
    return <TwoChoiceGame onHome={() => setActiveGame(null)} />;
  }

  if (activeGame === "word-wolf") {
    return <WordWolfGame onHome={() => setActiveGame(null)} />;
  }

  if (activeGame === "ng-word") {
    return <NgWordGame onHome={() => setActiveGame(null)} />;
  }

  return <HomeScreen onStart={setActiveGame} />;
}

function HomeScreen({ onStart }: { onStart: (game: GameKey) => void }) {
  return (
    <main className="app-shell">
      <section className="top-bar" aria-label="アプリ概要">
        <div>
          <p className="eyebrow">1台共有モード</p>
          <h1>飲み会アプリ</h1>
          <p className="lead">幹事のスマホを回して、すぐ遊べるミニゲーム集。</p>
        </div>
        <div className="status-pill">
          <Check size={18} />
          DB不要
        </div>
      </section>

      <section className="game-grid" aria-label="遊べるゲーム">
        {activeGames.map((game) => {
          const Icon = game.icon;
          return (
            <article className={`game-card accent-${game.accent}`} key={game.key}>
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
  options: SegmentedOption<T>[];
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

function GameFrame({
  title,
  subtitle,
  onHome,
  children,
}: {
  title: string;
  subtitle: string;
  onHome: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell">
      <nav className="game-nav" aria-label="ゲーム操作">
        <button className="secondary-button" onClick={onHome}>
          <Home size={18} />
          トップ
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

type TwoChoiceCategory = "icebreak" | "food" | "holiday";
type TwoChoiceChoice = "A" | "B" | "skip";
type TwoChoiceStep = "setup" | "vote" | "result";

type TwoChoicePrompt = {
  id: string;
  category: TwoChoiceCategory;
  question: string;
  optionA: string;
  optionB: string;
};

type TwoChoiceState = {
  players: Player[];
  category: TwoChoiceCategory;
  step: TwoChoiceStep;
  promptId: string | null;
  votes: Record<string, TwoChoiceChoice>;
  usedPromptIds: string[];
};

const twoChoiceCategoryOptions: SegmentedOption<TwoChoiceCategory>[] = [
  { value: "icebreak", label: "アイスブレイク" },
  { value: "food", label: "食べ物" },
  { value: "holiday", label: "休日" },
];

const twoChoicePrompts: TwoChoicePrompt[] = [
  { id: "icebreak-sea-mountain", category: "icebreak", question: "旅行するなら？", optionA: "海", optionB: "山" },
  { id: "icebreak-morning-night", category: "icebreak", question: "自分に近いのは？", optionA: "朝型", optionB: "夜型" },
  { id: "icebreak-sweet-salty", category: "icebreak", question: "今食べるなら？", optionA: "甘いもの", optionB: "しょっぱいもの" },
  { id: "icebreak-plan-feel", category: "icebreak", question: "動き方はどっち？", optionA: "計画派", optionB: "直感派" },
  { id: "icebreak-home-out", category: "icebreak", question: "休日の気分は？", optionA: "家でゆっくり", optionB: "外に出かける" },
  { id: "food-ramen-curry", category: "food", question: "今日の締めなら？", optionA: "ラーメン", optionB: "カレー" },
  { id: "food-yakiniku-sushi", category: "food", question: "ごほうびご飯なら？", optionA: "焼肉", optionB: "寿司" },
  { id: "food-coffee-tea", category: "food", question: "一息つくなら？", optionA: "コーヒー", optionB: "紅茶" },
  { id: "food-rice-bread", category: "food", question: "朝ごはんは？", optionA: "ごはん", optionB: "パン" },
  { id: "food-ice-cake", category: "food", question: "デザートなら？", optionA: "アイス", optionB: "ケーキ" },
  { id: "holiday-planned-free", category: "holiday", question: "休みの日は？", optionA: "予定を入れる", optionB: "何も決めない" },
  { id: "holiday-far-near", category: "holiday", question: "出かけるなら？", optionA: "遠出", optionB: "近場" },
  { id: "holiday-movie-walk", category: "holiday", question: "空き時間なら？", optionA: "映画", optionB: "散歩" },
  { id: "holiday-alone-people", category: "holiday", question: "回復するなら？", optionA: "ひとり時間", optionB: "誰かと会う" },
  { id: "holiday-early-sleep", category: "holiday", question: "休日の朝は？", optionA: "早起き", optionB: "寝坊" },
];

const initialTwoChoiceState: TwoChoiceState = {
  players: [],
  category: "icebreak",
  step: "setup",
  promptId: null,
  votes: {},
  usedPromptIds: [],
};

function TwoChoiceGame({ onHome }: { onHome: () => void }) {
  const [state, setState] = useStoredState<TwoChoiceState>("two-choice", initialTwoChoiceState);
  const prompt = twoChoicePrompts.find((item) => item.id === state.promptId) ?? null;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());

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

  function selectPrompt(nextCategory = state.category) {
    const pool = twoChoicePrompts.filter((item) => item.category === nextCategory);
    const usedInCategory = state.usedPromptIds.filter((id) => pool.some((item) => item.id === id));
    let candidates = pool.filter((item) => !usedInCategory.includes(item.id));
    let nextUsed = usedInCategory;
    if (candidates.length === 0) {
      candidates = pool;
      nextUsed = [];
    }
    const nextPrompt = pickOne(candidates);
    setState({
      ...state,
      category: nextCategory,
      step: "vote",
      promptId: nextPrompt.id,
      votes: {},
      usedPromptIds: [...nextUsed, nextPrompt.id],
    });
  }

  function updateVote(playerId: string, choice: TwoChoiceChoice) {
    setState({ ...state, votes: { ...state.votes, [playerId]: choice } });
  }

  const votedCount = state.players.filter((player) => state.votes[player.id]).length;
  const allVoted = votedCount === state.players.length && state.players.length > 0;

  return (
    <GameFrame title="二択トーク" subtitle="選んだ理由を話すだけで、場がすぐ温まります。" onHome={onHome}>
      {state.step === "setup" && (
        <section className="tool-surface">
          <PlayerSetup
            players={state.players}
            minPlayers={2}
            maxPlayers={20}
            onChange={(players) => setState({ ...state, players })}
          />
          <SegmentedControl
            label="カテゴリ"
            options={twoChoiceCategoryOptions}
            value={state.category}
            onChange={(category) => setState({ ...state, category })}
          />
          <div className="action-row">
            <button className="primary-button" disabled={!canStart} onClick={() => selectPrompt()}>
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
            <p className="eyebrow">お題</p>
            <h2>{prompt.question}</h2>
            <div className="choice-display">
              <span>A. {prompt.optionA}</span>
              <span>B. {prompt.optionB}</span>
            </div>
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
          <p className="talk-cue">少なかった側から理由を聞くと、話が広がりやすいです。</p>
          <div className="action-row">
            <button className="primary-button" onClick={() => selectPrompt()}>
              <ChevronRight size={18} />
              次のお題
            </button>
            <button className="secondary-button" onClick={() => setState({ ...state, step: "setup", votes: {} })}>
              <Users size={18} />
              参加者を変える
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

type WordWolfCategory = "all" | "food" | "daily" | "outing";
type WordWolfStep = "setup" | "reveal" | "discussion" | "vote" | "result";

type WordWolfTopicPair = {
  id: string;
  majorityWord: string;
  minorityWord: string;
  category: Exclude<WordWolfCategory, "all">;
};

type WordWolfAssignment = {
  playerId: string;
  word: string;
  role: "majority" | "minority";
};

type WordWolfState = {
  players: Player[];
  category: WordWolfCategory;
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

const wordWolfCategoryOptions: SegmentedOption<WordWolfCategory>[] = [
  { value: "all", label: "全部" },
  { value: "food", label: "食べ物" },
  { value: "daily", label: "日常" },
  { value: "outing", label: "おでかけ" },
];

const wordWolfTimeOptions: SegmentedOption<"180" | "300" | "420">[] = [
  { value: "180", label: "3分" },
  { value: "300", label: "5分" },
  { value: "420", label: "7分" },
];

const wordWolfTopics: WordWolfTopicPair[] = [
  { id: "ramen-udon", majorityWord: "ラーメン", minorityWord: "うどん", category: "food" },
  { id: "coffee-tea", majorityWord: "コーヒー", minorityWord: "紅茶", category: "food" },
  { id: "yakiniku-shabu", majorityWord: "焼肉", minorityWord: "しゃぶしゃぶ", category: "food" },
  { id: "curry-stew", majorityWord: "カレー", minorityWord: "シチュー", category: "food" },
  { id: "convenience-super", majorityWord: "コンビニ", minorityWord: "スーパー", category: "daily" },
  { id: "bike-train", majorityWord: "自転車", minorityWord: "電車", category: "daily" },
  { id: "movie-karaoke", majorityWord: "映画館", minorityWord: "カラオケ", category: "outing" },
  { id: "sea-pool", majorityWord: "海", minorityWord: "プール", category: "outing" },
  { id: "fireworks-light", majorityWord: "花火", minorityWord: "イルミネーション", category: "outing" },
  { id: "onsen-sauna", majorityWord: "温泉", minorityWord: "サウナ", category: "outing" },
];

const initialWordWolfState: WordWolfState = {
  players: [],
  category: "all",
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

function WordWolfGame({ onHome }: { onHome: () => void }) {
  const [state, setState] = useStoredState<WordWolfState>("word-wolf", initialWordWolfState);
  const canStart = state.players.length >= 4 && state.players.every((player) => player.name.trim());

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
    const pool = state.category === "all" ? wordWolfTopics : wordWolfTopics.filter((topic) => topic.category === state.category);
    const topic = pickOne(pool);
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
    <GameFrame title="ワードウルフ" subtitle="会話から少数派を見つける推理ゲームです。" onHome={onHome}>
      {state.step === "setup" && (
        <section className="tool-surface">
          <PlayerSetup
            players={state.players}
            minPlayers={4}
            maxPlayers={12}
            onChange={(players) => setState({ ...state, players })}
          />
          <SegmentedControl
            label="お題"
            options={wordWolfCategoryOptions}
            value={state.category}
            onChange={(category) => setState({ ...state, category })}
          />
          <SegmentedControl
            label="会話時間"
            options={wordWolfTimeOptions}
            value={String(state.seconds) as "180" | "300" | "420"}
            onChange={(seconds) => setState({ ...state, seconds: Number(seconds), remainingSeconds: Number(seconds) })}
          />
          <div className="action-row">
            <button className="primary-button" disabled={!canStart} onClick={startRound}>
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
          <p className="soft-note">自分のお題をそのまま言わずに話してください。</p>
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
            <p>少数派だと思う人を選んでください。</p>
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

function NgWordGame({ onHome }: { onHome: () => void }) {
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
    <GameFrame title="NGワードゲーム" subtitle="言わせたい、でも自分は言わない。会話中に遊べます。" onHome={onHome}>
      {state.step === "setup" && (
        <section className="tool-surface">
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
          <p className="soft-note">{currentRevealPlayer.name}さん本人は画面を見ないでください。</p>
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
