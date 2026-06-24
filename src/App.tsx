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
import { normalTwoChoicePrompts, twoChoiceCategories, twoChoicePrompts, type TwoChoiceCategory } from "./data/twoChoicePrompts";
import {
  normalWordWolfTopics,
  wordWolfCategories,
  wordWolfTopics,
  type WordWolfCategory,
} from "./data/wordWolfTopics";

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

type TwoChoiceChoice = "A" | "B" | "skip";
type TwoChoiceStep = "setup" | "vote" | "result" | "complete";
type TwoChoiceQuestionCount = 5 | 10 | 20 | 30 | 50 | 100 | 300;

type TwoChoiceState = {
  players: Player[];
  category: TwoChoiceCategory;
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
  questionCount: 10,
  step: "setup",
  promptId: null,
  votes: {},
  deckPromptIds: [],
  deckIndex: 0,
};

function TwoChoiceGame({ onHome }: { onHome: () => void }) {
  const [storedState, setState] = useStoredState<TwoChoiceState>("two-choice", initialTwoChoiceState);
  const state = { ...initialTwoChoiceState, ...storedState };
  const prompt = twoChoicePrompts.find((item) => item.id === state.promptId) ?? null;
  const canStart = state.players.length >= 2 && state.players.every((player) => player.name.trim());
  const promptPool = useMemo(
    () =>
      state.category === "all"
        ? normalTwoChoicePrompts
        : twoChoicePrompts.filter((item) => item.category === state.category),
    [state.category],
  );
  const selectedQuestionCount = Math.min(state.questionCount, promptPool.length);
  const progressLabel = state.deckPromptIds.length > 0 ? `${state.deckIndex + 1}/${state.deckPromptIds.length}` : "";
  const isTwoChoiceAdultCategory = state.category === "adult";

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
    <GameFrame title="二択トーク" subtitle="選んだ理由を話すだけで、場がすぐ温まります。" onHome={onHome}>
      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を2人以上登録します。</li>
              <li>カテゴリと今回使う設問数を選びます。</li>
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
            options={twoChoiceCategories}
            value={state.category}
            onChange={(category) => setState({ ...state, category, deckPromptIds: [], deckIndex: 0, promptId: null })}
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
            「通常全部」には大人向けカテゴリを含めていません。
          </p>
          {isTwoChoiceAdultCategory && (
            <div className="notice-panel">
              <strong>大人向けカテゴリです</strong>
              <p>軽いH寄りの恋バナや距離感の話題を含みます。苦手な人がいる場では、別カテゴリを選んでください。</p>
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

type WordWolfStep = "setup" | "reveal" | "discussion" | "vote" | "result";

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

const wordWolfTimeOptions: SegmentedOption<"180" | "300" | "420">[] = [
  { value: "180", label: "3分" },
  { value: "300", label: "5分" },
  { value: "420", label: "7分" },
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
  const topicPool = useMemo(
    () => (state.category === "all" ? normalWordWolfTopics : wordWolfTopics.filter((topic) => topic.category === state.category)),
    [state.category],
  );
  const isAdultCategory = state.category === "adult";
  const selectedWordWolfCategory = wordWolfCategories.find((category) => category.value === state.category);

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
    <GameFrame title="ワードウルフ" subtitle="似ているけど少し違うお題を、会話と投票で見破るゲームです。" onHome={onHome}>
      {state.step === "setup" && (
        <section className="tool-surface">
          <div className="howto-panel">
            <h3>進め方</h3>
            <ol className="rule-list">
              <li>参加者を4人以上登録します。</li>
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
            options={wordWolfCategories}
            value={state.category}
            onChange={(category) => setState({ ...state, category })}
          />
          <p className="soft-note">
            {selectedWordWolfCategory?.label ?? "選択中"}: {topicPool.length}ペアからランダムに1つ配ります。
            「通常全部」には大人向けカテゴリを含めていません。
          </p>
          {isAdultCategory && (
            <div className="notice-panel">
              <strong>大人向けカテゴリです</strong>
              <p>軽い恋バナや距離感の話題を含みます。苦手な人がいる場では、別カテゴリを選んでください。</p>
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
