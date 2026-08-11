import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Link,
  Play,
  QrCode,
  RefreshCw,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { johariWords } from "./data/johariWords";
import { normalWordWolfTopics } from "./data/wordWolfTopics";
import {
  isNativeSyncRoomGameKey,
  NEW_SYNC_ROOM_GAME_KEYS,
} from "./syncRoomCatalog";
import { getSyncGameDefinition } from "./syncGameDefinitions";

type SharedParticipant = {
  id: string;
  name: string;
  role: "host" | "player";
  connected: boolean;
};
type SharedGame =
  | {
      kind: "two-choice";
      prompt: string;
      deadlineAt: number | null;
      phase: string;
      answeredCount: number;
      participantCount: number;
      ownAnswer?: "A" | "B" | "pass";
      result?: { A: number; B: number; pass: number };
    }
  | {
      kind: "impression-ranking";
      prompt: string;
      phase: string;
      voteCount: number;
      participantCount: number;
      ownVote?: string;
      result?: Record<string, number>;
    }
  | {
      kind: "majority-game";
      prompt: string;
      phase: string;
      voteCount: number;
      participantCount: number;
      ownVote?: string;
      result?: Record<string, number>;
    }
  | {
      kind: "johari-window";
      prompt: string;
      phase: "self" | "peer" | "result" | string;
      deckWordIds: string[];
      participantCount: number;
      selfSubmittedCount: number;
      selfParticipantCount: number;
      peerSubmittedCount: number;
      peerRequiredCount: number;
      ownSelfSelection?: string[];
      ownSelfSubmitted?: boolean;
      ownPeerSelections?: Record<string, string[]>;
      ownPeerSubmitted?: Record<string, boolean>;
      result?: Record<string, { open: string[]; hidden: string[]; blind: string[]; unknown: string[] }>;
    }
  | {
      kind: "anonymous-box";
      prompt: string;
      entries: Array<{
        id: string;
        text: string;
        status: "unshown" | "displayed" | "answered" | "skipped";
      }>;
      ownEntry?: {
        id: string;
        text: string;
        status: "unshown" | "displayed" | "answered" | "skipped";
      };
    }
  | {
      kind: "word-wolf";
      phase: string;
      phaseDeadlineAt: number | null;
      participantCount: number;
      voteCount: number;
      ownTopic?: string;
      ownVote?: string;
      winner?: "majority" | "minority" | "draw";
      voteResults?: Record<string, number>;
    }
  | {
      kind: "ng-word";
      prompt: string;
      phase: "assigned" | "playing" | "revealed" | string;
      participantCount: number;
      assignedCount: number;
      assignments: Record<string, string | null>;
      hits: Array<{ id: string; targetParticipantId: string; markerParticipantId: string }>;
      hitCounts: Record<string, number>;
      result?: {
        assignments: Record<string, string>;
        hits: Array<{ id: string; targetParticipantId: string; markerParticipantId: string }>;
        hitCounts: Record<string, number>;
      };
    }
  | {
      kind: "turtle-soup";
      prompt: string;
      phase: "questioning" | "revealed" | string;
      questionCount: number;
      pendingQuestionCount: number;
      questions: Array<{
        id: string;
        askerId: string;
        text: string;
        classification: "yes" | "no" | "irrelevant" | null;
      }>;
      hintLevel: number;
      hints: string[];
      availableHints?: string[];
      hostTruth?: string;
      truth?: string;
    }
  | {
      kind: "yamanote";
      prompt: string;
      phase: "playing" | "finished" | string;
      playerOrder: string[];
      currentPlayerId: string | null;
      actedPlayerIds: string[];
      outIds: string[];
      answerHistory: Array<{
        id: string;
        playerId: string;
        action: "answer" | "pass" | "out";
        answer?: string;
      }>;
      result?: {
        answerHistory: Array<{
          id: string;
          playerId: string;
          action: "answer" | "pass" | "out";
          answer?: string;
        }>;
        outIds: string[];
      };
    }
  | {
      kind: "party-pack";
      prompt: string;
      promptId: string;
      instruction: string;
      mode: string;
      progression: "simultaneous" | "turn";
      phase: "playing" | "revealed" | string;
      playerOrder: string[];
      currentPlayerId: string | null;
      inputCount: number;
      participantCount: number;
      remainingCount: number;
      ownInput?: string;
      hostAnswer?: string;
      result?: {
        summary: string;
        inputs: Record<string, string>;
        scores: Record<string, number>;
        answer?: string;
        counts?: Record<string, number>;
      };
    }
  | {
      kind: "werewolf";
      phase: string;
      phaseDeadlineAt: number | null;
      aliveIds: string[];
      ownRole?: "werewolf" | "seer" | "guard" | "villager";
      teammates?: string[];
      ownSeerResults?: Array<{ targetId: string; role: string }>;
      ownVote?: string;
      tiedTargetIds?: string[];
      winner?: "werewolf" | "villager";
    }
  | {
      kind: "legacy-game";
      gameKey: string;
      prompt: string;
      mode: string;
      progression: "simultaneous" | "turn" | "count-up";
      phase: string;
      inputCount: number;
      participantCount: number;
      remainingCount: number;
      ownInput?: string;
      currentPlayerId?: string;
      currentTotal?: number;
      targetNumber?: number;
      turnHistory?: Array<{ playerId: string; add: number; total: number }>;
      result?: {
        inputs: Record<string, string>;
        summary: string;
        scores: Record<string, number>;
      };
    };
type SharedProjection = {
  code: string;
  status: "waiting" | "locked" | "playing" | "finished" | "closed";
  version: number;
  participants: SharedParticipant[];
  self: { id: string; role: "host" | "player" } | null;
  game?: SharedGame;
};
type SharedSession = {
  roomCode: string;
  participantId: string;
  participantName: string;
  role: "host" | "player";
  reconnectToken: string;
  hostToken?: string;
};
type CommandKind =
  | "reconnect"
  | "leave"
  | "kick"
  | "start"
  | "close"
  | "game_start"
  | "game_answer"
  | "game_reveal"
  | "johari_self_submit"
  | "johari_peer_submit"
  | "anonymous_submit"
  | "anonymous_moderate"
  | "game_vote"
  | "game_phase"
  | "werewolf_action"
  | "legacy_input"
  | "ng_word_hit"
  | "turtle_soup_question"
  | "turtle_soup_classify"
  | "turtle_soup_hint"
  | "yamanote_answer"
  | "party_pack_action";

const SHARED_SESSION_KEY = "nomikai:shared-room-session:v1";
const LEGACY_SYNC_GAME_KEYS = NEW_SYNC_ROOM_GAME_KEYS.filter(
  (key) => !isNativeSyncRoomGameKey(key),
);
const SHARED_GAME_MINIMUMS = {
  yamanote: 2,
  "ng-word": 3,
  "turtle-soup": 2,
  "party-pack": 3,
  "two-choice": 2,
  "anonymous-box": 2,
  "impression-ranking": 3,
  "majority-game": 3,
  "johari-window": 3,
  "word-wolf": 4,
  werewolf: 4,
} as const;

function minimumPlayersForGame(gameKey: string) {
  return SHARED_GAME_MINIMUMS[gameKey as keyof typeof SHARED_GAME_MINIMUMS] ?? 2;
}

function canStartWerewolf(participantCount: number) {
  return participantCount === 4 || participantCount >= 6;
}

const partyPackModeLabels: Record<string, string> = {
  yamanote: "山手線",
  majority: "多数派予想",
  "truth-lie": "2真実1嘘",
  "reverse-word": "逆さ言葉",
  "loanword-ban": "外来語禁止",
  typing: "早打ち",
  "memory-drawing": "記憶描き",
  "value-meter": "価値観メーター",
  acting: "ひとこと演技",
  "hint-quiz": "ヒントクイズ",
};

function readSession(): SharedSession | null {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SHARED_SESSION_KEY) ?? "null",
    ) as Partial<SharedSession> | null;
    if (
      !value ||
      typeof value !== "object" ||
      typeof value.roomCode !== "string" ||
      typeof value.participantId !== "string" ||
      typeof value.participantName !== "string" ||
      (value.role !== "host" && value.role !== "player") ||
      typeof value.reconnectToken !== "string"
    )
      return null;
    return value as SharedSession;
  } catch {
    return null;
  }
}

function writeSession(session: SharedSession) {
  try {
    window.localStorage.setItem(SHARED_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private browsing can reject storage */
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(SHARED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function commandId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ownProjection(
  projection: SharedProjection,
  session: SharedSession | null,
  online: boolean,
): SharedProjection {
  if (!session) return projection;
  return {
    ...projection,
    self: { id: session.participantId, role: session.role },
    participants: projection.participants.map((item) =>
      item.id === session.participantId ? { ...item, connected: online } : item,
    ),
  };
}

function roomError(error: unknown) {
  const code =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "request_failed";
  const labels: Record<string, string> = {
    nickname_required: "ニックネームを入力してください。",
    nickname_taken:
      "そのニックネームは既に使われています。別の名前を選んでください。",
    room_not_found: "ルームが見つかりません。コードを確認してください。",
    room_full: "このルームは満員です。",
    room_not_joinable: "このルームは参加受付を締め切っています。",
    room_closed: "このルームは終了しています。",
    werewolf_player_count_invalid:
      "人狼は4人、または6人以上で開始できます（5人構成は対象外です）。",
    participant_not_found:
      "参加者情報が見つかりません。もう一度参加してください。",
    token_invalid: "権限を確認できませんでした。復帰コードを確認してください。",
    reconnect_token_invalid:
      "復帰情報が期限切れです。もう一度参加してください。",
    version_conflict: "ルームが更新されました。最新状態を取得しています。",
    johari_deck_invalid: "ジョハリの窓の特徴ワードを準備できませんでした。もう一度開始してください。",
    johari_selection_invalid: "選択できる特徴ワードを確認してください。",
    johari_target_invalid: "評価対象を確認してください。",
    johari_submission_locked: "この入力はすでに提出済みです。",
    ng_word_difficulty_invalid: "NGワードの設定を確認してください。",
    hit_target_invalid: "ヒットを記録する対象を確認してください。",
    question_required: "質問を入力してください。",
    question_too_long: "質問は500文字以内で入力してください。",
    turtle_soup_classification_invalid: "回答分類を確認してください。",
    question_not_found: "その質問は見つかりません。最新状態を取得します。",
    turtle_soup_hint_invalid: "ヒントは順番に公開してください。",
    turtle_soup_hint_exhausted: "公開できるヒントはありません。",
    turtle_soup_hints_invalid: "ヒントの設定を確認してください。",
    yamanote_action_invalid: "山手線ゲームの操作を確認してください。",
    answer_required: "答えを入力してください。",
    answer_too_long: "答えは100文字以内で入力してください。",
    duplicate_answer: "その答えはすでに出ています。別の言葉を選んでください。",
    party_pack_mode_invalid: "パック内ミニゲームを確認してください。",
    input_already_submitted: "このラウンドの入力は提出済みです。",
    input_required: "回答を入力してください。",
    input_too_long: "回答は500文字以内で入力してください。",
    input_invalid: "このミニゲームの入力形式を確認してください。",
    rate_limited: "操作が多すぎます。少し待ってから試してください。",
    participant_required: "参加者情報が見つかりません。もう一度参加してください。",
    participant_auth_required:
      "参加者の認証に失敗しました。ルームコードから再参加してください。",
    subscribe_failed:
      "同期ルームの購読に失敗しました。参加者情報とAPI設定を確認してください。",
    command_required: "同期コマンドを送信できませんでした。",
    room_code_required: "ルームコードを確認してください。",
    internal_error: "同期サーバーでエラーが発生しました。",
    socket_action_timeout:
      "同期サーバーの応答がタイムアウトしました。接続状態を確認してください。",
  };
  return (
    labels[code] ??
    "ルームに接続できませんでした。サーバーの状態を確認してください。"
  );
}

function normalizeRoomStatus(status: unknown, phase?: unknown): SharedProjection["status"] {
  const value = typeof status === "string" ? status.trim().toLowerCase() : "";
  const phaseValue = typeof phase === "string" ? phase.trim().toLowerCase() : "";
  if (value === "closed") {
    return "closed";
  }
  if (["finished", "complete", "completed", "ended"].includes(value)) {
    return "finished";
  }
  if (value === "locked" || value === "locking") {
    return "locked";
  }
  if (!value) {
    if (phaseValue === "closed") return "closed";
    if (["finished", "complete", "completed", "ended"].includes(phaseValue)) {
      return "finished";
    }
    if (phaseValue === "locked" || phaseValue === "locking") return "locked";
  }
  if (
    ["playing", "active", "started", "in_progress"].includes(value) ||
    (!value && ["playing", "active", "started", "in_progress"].includes(phaseValue))
  ) {
    return "playing";
  }
  return "waiting";
}

function normalizeProjection(value: SharedProjection): SharedProjection {
  const candidate = value as SharedProjection & { phase?: string };
  return {
    ...value,
    status: normalizeRoomStatus(candidate.status, candidate.phase),
    game: normalizeGamePhase(value.game),
  };
}

function normalizeGamePhase(game: SharedGame | undefined): SharedGame | undefined {
  if (!game || !("phase" in game)) return game;
  const phase = typeof game.phase === "string" ? game.phase.toLowerCase() : "";
  if (["complete", "completed", "finished", "closed", "ended"].includes(phase)) {
    return {
      ...game,
      phase: game.kind === "werewolf" || game.kind === "legacy-game" ? "finished" : game.kind === "johari-window" ? "result" : "revealed",
    } as SharedGame;
  }
  if (phase === "active" || phase === "playing") {
    if (game.kind === "two-choice") return { ...game, phase: "answering" };
    if (
      game.kind === "impression-ranking" ||
      game.kind === "majority-game" ||
      game.kind === "word-wolf"
    ) {
      return { ...game, phase: "voting" };
    }
  }
  return game;
}

type RestCommandPayload = {
  roomCode: string;
  commandId: string;
  expectedVersion: number;
  kind: CommandKind | "join";
  participantId?: string;
  joinNonce?: string;
  [key: string]: unknown;
};

export function SharedRoomLobby({
  apiUrl,
  onPresenceChange,
}: {
  apiUrl: string;
  onPresenceChange?: (hasPresence: boolean) => void;
}) {
  const invitedCode = useMemo(() => {
    try {
      return (
        new URL(window.location.href).searchParams
          .get("room")
          ?.replace(/[^A-Za-z0-9]/g, "")
          .toUpperCase() ?? ""
      );
    } catch {
      return "";
    }
  }, []);
  const [session, setSession] = useState<SharedSession | null>(() =>
    readSession(),
  );
  const [projection, setProjection] = useState<SharedProjection | null>(null);
  const [roomCode, setRoomCode] = useState(invitedCode);
  const [nickname, setNickname] = useState("");
  const [hostName, setHostName] = useState("");
  const [mode, setMode] = useState<"join" | "create">(
    invitedCode ? "join" : "create",
  );
  const [connection, setConnection] = useState<
    "idle" | "connecting" | "subscribing" | "online" | "offline"
  >("idle");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [anonymousText, setAnonymousText] = useState("");
  const [legacyInput, setLegacyInput] = useState("");
  const [turtleQuestion, setTurtleQuestion] = useState("");
  const [yamanoteInput, setYamanoteInput] = useState("");
  const [partyPackInput, setPartyPackInput] = useState("");
  const [partyPackMode, setPartyPackMode] = useState("yamanote");
  const [johariSelfDraft, setJohariSelfDraft] = useState<string[]>([]);
  const [johariPeerDrafts, setJohariPeerDrafts] = useState<Record<string, string[]>>({});
  const [hostPrompt, setHostPrompt] = useState("今夜、どちらを選ぶ？");
  const [legacyPrompt, setLegacyPrompt] = useState(
    () => getSyncGameDefinition(LEGACY_SYNC_GAME_KEYS[0] ?? "yamanote").examplePrompt,
  );
  const [legacyGameKey, setLegacyGameKey] = useState<string>(
    LEGACY_SYNC_GAME_KEYS[0] ?? "yamanote",
  );
  const socketRef = useRef<Socket | null>(null);
  const socketSubscribedRef = useRef(false);
  const restCommandsRef = useRef(new Map<string, { command: RestCommandPayload; token: string }>());
  const lastWordWolfTopicIdRef = useRef<string | null>(null);

  function selectWordWolfTopic() {
    const candidates =
      normalWordWolfTopics.length > 1 && lastWordWolfTopicIdRef.current
        ? normalWordWolfTopics.filter(
            (topic) => topic.id !== lastWordWolfTopicIdRef.current,
          )
        : normalWordWolfTopics;
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (selected) lastWordWolfTopicIdRef.current = selected.id;
    return selected ?? { majorityWord: "話題A", minorityWord: "話題B" };
  }

  useEffect(() => {
    onPresenceChange?.(Boolean(session));
  }, [onPresenceChange, projection, session]);

  useEffect(() => {
    const handleRequestedGame = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (
        typeof key === "string" &&
        LEGACY_SYNC_GAME_KEYS.includes(
          key as (typeof LEGACY_SYNC_GAME_KEYS)[number],
        )
      ) {
        setLegacyGameKey(key);
        setLegacyPrompt(getSyncGameDefinition(key).examplePrompt);
      }
    };
    window.addEventListener(
      "nomikai:new-sync-game-request",
      handleRequestedGame,
    );
    return () =>
      window.removeEventListener(
        "nomikai:new-sync-game-request",
        handleRequestedGame,
      );
  }, []);

  const request = useCallback(
    async <T,>(
      path: string,
      options: { method?: string; body?: unknown; token?: string } = {},
    ) => {
      const response = await fetch(`${apiUrl}${path}`, {
        method: options.method ?? "GET",
        headers: options.body
          ? {
              "Content-Type": "application/json",
              ...(options.token ? { "x-room-token": options.token } : {}),
            }
          : options.token
            ? { "x-room-token": options.token }
            : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as
        T | { error?: string } | null;
      if (!response.ok)
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? payload.error || "request_failed"
            : "request_failed",
        );
      return payload as T;
    },
    [apiUrl],
  );

  const flushRestCommands = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || !socketSubscribedRef.current || socket.connected === false) {
      return;
    }
    for (const { command: queuedCommand, token } of restCommandsRef.current.values()) {
      socket.emit("v2:command", { command: queuedCommand, token });
    }
    restCommandsRef.current.clear();
  }, []);

  const queueRestCommand = useCallback(
    (command: RestCommandPayload, token: string) => {
      restCommandsRef.current.set(command.commandId, { command, token });
      if (restCommandsRef.current.size > 20) {
        const oldest = restCommandsRef.current.keys().next().value;
        if (oldest) restCommandsRef.current.delete(oldest);
      }
      flushRestCommands();
    },
    [flushRestCommands],
  );

  const refresh = useCallback(
    async (nextSession = session) => {
      if (!nextSession) return;
      let result = normalizeProjection(
        await request<SharedProjection>(
          `/v2/rooms/${encodeURIComponent(nextSession.roomCode)}?participantId=${encodeURIComponent(nextSession.participantId)}`,
          { token: nextSession.reconnectToken },
        ),
      );
      const own = result.participants.find(
        (item) => item.id === nextSession.participantId,
      );
      if (!own) {
        clearSession();
        setSession(null);
        setProjection(null);
        throw new Error("participant_not_found");
      }
      if (!own.connected) {
        const token = nextSession.reconnectToken;
        if (token) {
          const reconnectCommand: RestCommandPayload = {
            roomCode: nextSession.roomCode,
            commandId: commandId(),
            expectedVersion: result.version,
            kind: "reconnect",
            participantId: nextSession.participantId,
          };
          result = normalizeProjection(
            await request<SharedProjection>(
              `/v2/rooms/${encodeURIComponent(nextSession.roomCode)}/commands`,
              {
                method: "POST",
                token,
                body: reconnectCommand,
              },
            ),
          );
          restCommandsRef.current.set(reconnectCommand.commandId, {
            command: reconnectCommand,
            token,
          });
        }
      }
      setProjection(
        ownProjection(result, nextSession, socketSubscribedRef.current),
      );
      flushRestCommands();
      return result;
    },
    [flushRestCommands, request, session],
  );

  useEffect(() => {
    const stored = readSession();
    if (!stored) return;
    const timer = window.setTimeout(() => {
      setRoomCode(stored.roomCode);
      setMode("join");
      void refresh(stored).catch((caught) => setError(roomError(caught)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!session) {
      socketSubscribedRef.current = false;
      return;
    }

    const socket = io(apiUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socketSubscribedRef.current = false;

    const handleProjection = (raw: SharedProjection) => {
      const next = normalizeProjection(raw);
      socketSubscribedRef.current = true;
      if (!next.participants.some((item) => item.id === session.participantId)) {
        clearSession();
        setSession(null);
        setProjection(null);
        setConnection("offline");
        setError("この端末はルームから退出させられました。");
        return;
      }
      setProjection((current) => {
        if (current && next.version < current.version) return current;
        const nextProjection = ownProjection(next, session, true);
        if (
          current?.game?.kind === "two-choice" &&
          nextProjection.game?.kind === "two-choice" &&
          current.game.ownAnswer &&
          !nextProjection.game.ownAnswer
        ) {
          nextProjection.game = {
            ...nextProjection.game,
            ownAnswer: current.game.ownAnswer,
          };
        }
        if (
          current?.game?.kind === "anonymous-box" &&
          nextProjection.game?.kind === "anonymous-box" &&
          current.game.ownEntry &&
          !nextProjection.game.ownEntry
        ) {
          nextProjection.game = {
            ...nextProjection.game,
            ownEntry: current.game.ownEntry,
          };
        }
        return nextProjection;
      });
      const needsPrivateRefresh =
        next.game?.kind === "word-wolf" ||
        next.game?.kind === "werewolf" ||
        (next.game?.kind === "two-choice" && !next.game.ownAnswer) ||
        (next.game?.kind === "impression-ranking" && !next.game.ownVote) ||
        (next.game?.kind === "majority-game" && !next.game.ownVote) ||
        (next.game?.kind === "anonymous-box" && !next.game.ownEntry) ||
        (next.game?.kind === "legacy-game" && !next.game.ownInput);
      if (needsPrivateRefresh)
        void refresh(session).catch((caught) => setError(roomError(caught)));
      setConnection("online");
      setError("");
      flushRestCommands();
    };

    const handleSubscribeAck = (payload?: unknown) => {
      if (payload && typeof payload === "object" && "error" in payload) {
        const code = (payload as { error?: unknown }).error;
        setConnection("offline");
        setError(roomError(typeof code === "string" ? code : "subscribe_failed"));
        return;
      }
      if (
        payload &&
        typeof payload === "object" &&
        "ok" in payload &&
        (payload as { ok?: unknown }).ok === false
      ) {
        setConnection("offline");
        setError(roomError("subscribe_failed"));
        return;
      }
      if (
        payload &&
        typeof payload === "object" &&
        "projection" in payload &&
        (payload as { projection?: unknown }).projection
      ) {
        handleProjection(
          (payload as { projection: SharedProjection }).projection,
        );
        return;
      }
      socketSubscribedRef.current = true;
      setConnection("online");
      setError("");
      flushRestCommands();
    };

    const handleV2Error = (payload?: unknown) => {
      const code =
        typeof payload === "string"
          ? payload
          : payload && typeof payload === "object" && "error" in payload
            ? (payload as { error?: unknown }).error
            : "subscribe_failed";
      socketSubscribedRef.current = false;
      setConnection("offline");
      setError(roomError(typeof code === "string" ? code : "subscribe_failed"));
    };

    const handleConnect = () => {
      socketSubscribedRef.current = false;
      setConnection("subscribing");
      socket.emit(
        "v2:subscribe",
        {
          roomCode: session.roomCode,
          participantId: session.participantId,
          token:
            session.role === "host" ? session.hostToken : session.reconnectToken,
        },
        handleSubscribeAck,
      );
      void refresh(session).catch((caught) => {
        setConnection("offline");
        setError(roomError(caught));
      });
    };

    const handleDisconnect = () => {
      socketSubscribedRef.current = false;
      setConnection("offline");
    };
    const handleConnectError = () => {
      socketSubscribedRef.current = false;
      setConnection("offline");
      setError("同期サーバーに接続できません。Docker版のAPI URLを確認してください。");
    };

    socket.on("connect", handleConnect);
    socket.on("v2:projection", handleProjection);
    socket.on("v2:subscribe:ack", handleSubscribeAck);
    socket.on("v2:subscribed", handleSubscribeAck);
    socket.on("v2:error", handleV2Error);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    return () => {
      socket.off?.("connect", handleConnect);
      socket.off?.("v2:projection", handleProjection);
      socket.off?.("v2:subscribe:ack", handleSubscribeAck);
      socket.off?.("v2:subscribed", handleSubscribeAck);
      socket.off?.("v2:error", handleV2Error);
      socket.off?.("disconnect", handleDisconnect);
      socket.off?.("connect_error", handleConnectError);
      socketSubscribedRef.current = false;
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [apiUrl, flushRestCommands, refresh, session]);

  useEffect(() => {
    const sync = () => {
      if (navigator.onLine)
        void refresh().catch((caught) => setError(roomError(caught)));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (
      projection?.game?.kind !== "two-choice" ||
      projection.game.phase !== "answering" ||
      projection.game.deadlineAt === null
    )
      return;
    const deadlineAt = projection.game.deadlineAt;
    const timer = window.setInterval(() => {
      if (Date.now() >= deadlineAt) syncDeadline();
    }, 1_000);
    return () => window.clearInterval(timer);

    function syncDeadline() {
      void refresh().catch((caught) => setError(roomError(caught)));
    }
  }, [projection?.game, refresh]);

  useEffect(() => {
    const game = projection?.game;
    if (game?.kind !== "johari-window") {
      setJohariSelfDraft([]);
      setJohariPeerDrafts({});
      return;
    }
    setJohariSelfDraft([...(game.ownSelfSelection ?? [])]);
    setJohariPeerDrafts({ ...(game.ownPeerSelections ?? {}) });
  }, [projection?.game]);

  async function createRoom() {
    const name = hostName.trim();
    if (!name) {
      setError("ホスト名を入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{
        room: SharedProjection;
        hostToken: string;
        reconnectToken: string;
      }>("/v2/rooms", { method: "POST", body: { hostName: name } });
      const next: SharedSession = {
        roomCode: result.room.code,
        participantId: result.room.self?.id ?? "",
        participantName: name,
        role: "host",
        hostToken: result.hostToken,
        reconnectToken: result.reconnectToken,
      };
      writeSession(next);
      setSession(next);
      setProjection(ownProjection(normalizeProjection(result.room), next, false));
      setRoomCode(next.roomCode);
      setNotice("ルームを作成しました。参加用リンクを共有してください。");
    } catch (caught) {
      setError(roomError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    const code = roomCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const name = nickname.trim();
    if (!code || !name) {
      setError("ルームコードとニックネームを入力してください。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const current = await request<SharedProjection>(
        `/v2/rooms/${encodeURIComponent(code)}`,
      );
      const joinCommand: RestCommandPayload = {
        roomCode: code,
        commandId: commandId(),
        joinNonce: commandId(),
        expectedVersion: current.version,
        kind: "join",
        name,
      };
      const result = await request<
        SharedProjection & {
          credentials?: { participantId: string; reconnectToken: string };
        }
      >(`/v2/rooms/${encodeURIComponent(code)}/commands`, {
        method: "POST",
        body: joinCommand,
      });
      if (!result.credentials) throw new Error("participant_required");
      const next: SharedSession = {
        roomCode: code,
        participantId: result.credentials.participantId,
        participantName: name,
        role: "player",
        reconnectToken: result.credentials.reconnectToken,
      };
      writeSession(next);
      setSession(next);
      setProjection(ownProjection(normalizeProjection(result), next, false));
      queueRestCommand(joinCommand, "");
      setRoomCode(code);
      setNotice("ルームに参加しました。ホストの開始を待っています。");
    } catch (caught) {
      setError(roomError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function command(
    kind: CommandKind,
    extra: Record<string, unknown> = {},
    baseProjection: SharedProjection | null = projection,
  ): Promise<SharedProjection | null> {
    if (!session || !baseProjection) return null;
    const token =
      session.role === "host" ? session.hostToken : session.reconnectToken;
    if (!token) return null;
    setBusy(true);
    setError("");
    try {
      const commandPayload: RestCommandPayload = {
        roomCode: session.roomCode,
        commandId: commandId(),
        expectedVersion: baseProjection.version,
        kind,
        participantId: session.participantId,
        ...extra,
      };
      const result = await request<SharedProjection>(
        `/v2/rooms/${encodeURIComponent(session.roomCode)}/commands`,
        {
          method: "POST",
          token,
          body: commandPayload,
        },
      );
      const normalized = normalizeProjection(result);
      setProjection(
        ownProjection(
          normalized,
          session,
          kind === "leave" ? false : socketSubscribedRef.current,
        ),
      );
      if (kind !== "leave") queueRestCommand(commandPayload, token);
      setNotice(
        kind === "close"
          ? "参加受付を締め切りました。"
          : kind === "start"
            ? "ゲームの開始準備をしました。"
            : "ルームを更新しました。",
      );
      return normalized;
    } catch (caught) {
      if (caught instanceof Error && caught.message === "version_conflict") {
        try {
          const latest = await refresh();
          if (
            [
              "game_answer",
              "game_vote",
              "anonymous_submit",
              "werewolf_action",
              "legacy_input",
              "ng_word_hit",
              "turtle_soup_question",
              "party_pack_action",
            ].includes(kind) &&
            latest
          ) {
            const retryCommand: RestCommandPayload = {
              roomCode: session.roomCode,
              commandId: commandId(),
              expectedVersion: latest.version,
              kind,
              participantId: session.participantId,
              ...extra,
            };
            const retried = await request<SharedProjection>(
              `/v2/rooms/${encodeURIComponent(session.roomCode)}/commands`,
              {
                method: "POST",
                token,
                body: retryCommand,
              },
            );
            const normalized = normalizeProjection(retried);
            setProjection(
              ownProjection(
                normalized,
                session,
                socketSubscribedRef.current,
              ),
            );
            queueRestCommand(retryCommand, token);
            setError("");
            return normalized;
          }
        } catch {
          /* error shown below */
        }
      }
      setError(roomError(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startGame(extra: Record<string, unknown>) {
    const current = projection;
    if (!current) return;
    let readyProjection = current;
    if (current.status === "waiting") {
      const lockedProjection = await command("start", {}, current);
      if (!lockedProjection) return;
      readyProjection = lockedProjection;
    } else if (current.status !== "locked") {
      return;
    }
    await command("game_start", extra, readyProjection);
  }

  async function prepareRematch() {
    if (projection?.status !== "finished") return;
    await command("start");
  }

  function leaveLocal(
    message = "この端末のルーム情報を消去しました。ルーム自体は残っています。",
  ) {
    socketRef.current?.disconnect();
    socketSubscribedRef.current = false;
    restCommandsRef.current.clear();
    clearSession();
    setSession(null);
    setProjection(null);
    setConnection("idle");
    setNotice(message);
  }

  async function leaveRoom() {
    if (!session || !projection) {
      leaveLocal();
      return;
    }
    const leftProjection = await command("leave");
    if (!leftProjection) return;
    leaveLocal("ルームから退出しました。");
  }

  const inviteUrl = useMemo(() => {
    if (!projection) return "";
    const url = new URL(window.location.href);
    for (const key of [
      "token",
      "participantToken",
      "hostToken",
      "reconnectToken",
      "participantId",
      "transferCode",
    ]) {
      url.searchParams.delete(key);
    }
    url.searchParams.set("sync", "v2");
    url.searchParams.delete("room");
    url.searchParams.set("room", projection.code);
    return url.toString();
  }, [projection]);
  const isHost = session?.role === "host";
  const participantCount = projection?.participants.length ?? 0;
  const activeGame = projection?.game;
  const roomReadyForGame =
    projection?.status === "waiting" || projection?.status === "locked";
  const roomClosed = projection?.status === "closed";
  const legacyGame = activeGame?.kind === "legacy-game" ? activeGame : null;
  const johariGame = activeGame?.kind === "johari-window" ? activeGame : null;
  const ngWordGame = activeGame?.kind === "ng-word" ? activeGame : null;
  const turtleSoupGame = activeGame?.kind === "turtle-soup" ? activeGame : null;
  const yamanoteGame = activeGame?.kind === "yamanote" ? activeGame : null;
  const partyPackGame = activeGame?.kind === "party-pack" ? activeGame : null;
  const johariDeckWords = johariGame
    ? johariGame.deckWordIds
      .map((id) => johariWords.find((word) => word.id === id))
      .filter((word): word is (typeof johariWords)[number] => Boolean(word))
    : [];
  const selectedLegacyDefinition = getSyncGameDefinition(legacyGameKey);
  const activeLegacyDefinition = legacyGame
    ? getSyncGameDefinition(legacyGame.gameKey)
    : null;

  function selectLegacyGame(key: string) {
    const definition = getSyncGameDefinition(key);
    setLegacyGameKey(key);
    setLegacyPrompt(definition.examplePrompt);
  }

  function toggleJohariSelfWord(wordId: string) {
    if (!johariGame || johariGame.phase !== "self" || johariGame.ownSelfSubmitted) return;
    const next = johariSelfDraft.includes(wordId)
      ? johariSelfDraft.filter((id) => id !== wordId)
      : [...johariSelfDraft, wordId];
    setJohariSelfDraft(next);
    void command("johari_self_submit", { selectedWordIds: next, submit: false });
  }

  function submitJohariSelf() {
    if (!johariGame || johariGame.phase !== "self" || johariGame.ownSelfSubmitted) return;
    void command("johari_self_submit", { selectedWordIds: johariSelfDraft, submit: true });
  }

  function toggleJohariPeerWord(targetId: string, wordId: string) {
    if (!johariGame || johariGame.phase !== "peer" || johariGame.ownPeerSubmitted?.[targetId]) return;
    const current = johariPeerDrafts[targetId] ?? [];
    const next = current.includes(wordId)
      ? current.filter((id) => id !== wordId)
      : [...current, wordId];
    setJohariPeerDrafts((drafts) => ({ ...drafts, [targetId]: next }));
    void command("johari_peer_submit", { targetParticipantId: targetId, selectedWordIds: next, submit: false });
  }

  function submitJohariPeer(targetId: string) {
    if (!johariGame || johariGame.phase !== "peer" || johariGame.ownPeerSubmitted?.[targetId]) return;
    void command("johari_peer_submit", { targetParticipantId: targetId, selectedWordIds: johariPeerDrafts[targetId] ?? [], submit: true });
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice(value);
    }
  }

  return (
    <section
      id="shared-room-lobby"
      className="shared-room-lobby"
      aria-label="みんなのスマホで遊ぶ"
    >
      <div className="shared-room-heading">
        <div>
          <p className="eyebrow">v2同期ルーム（ゲーム別に正式/簡易）</p>
          <h2>みんなのスマホで遊ぶ</h2>
          <p>代表者がルームを作り、参加者は自分のスマホから参加できます。</p>
          <p className="soft-note">
            従来の簡易同期版とは別のv2ルームです。参加・開始・投票・結果はSocket.IOの投影で同期します。
          </p>
        </div>
        {activeGame?.kind === "legacy-game" && (
          <p className="soft-note">
            {activeGame.gameKey === "truth-lie-game"
              ? "1〜3またはA〜Cで回答"
              : activeGame.gameKey === "count-up-game"
                ? "1〜3をカンマ区切りで回答（例: 1,2）"
                : activeGame.gameKey === "reverse-word-game"
                  ? "お題を逆順に入力（順番に回答する手番制）"
                  : activeGame.gameKey === "value-meter-game"
                    ? "数値|理由（例: 72|甘め）で回答"
                    : activeGame.gameKey === "typing-speed-game"
                      ? "文章|ミリ秒（例: same text|1200）で回答"
                      : "お題に合わせて回答"}
          </p>
        )}
        <Users size={28} aria-hidden="true" />
      </div>
      {!projection && (
        <div className="shared-room-entry">
          <div
            className="shared-room-tabs"
            role="group"
            aria-label="ルーム操作"
          >
            <button
              type="button"
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              ルームを作る
            </button>
            <button
              type="button"
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              コードで参加
            </button>
          </div>
          {mode === "create" ? (
            <div className="shared-room-form">
              <label>
                ホスト名
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.currentTarget.value)}
                  placeholder="例：やすこ"
                  autoComplete="nickname"
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={createRoom}
              >
                <QrCode size={18} />
                ルームを作る
              </button>
            </div>
          ) : (
            <div className="shared-room-form">
              <label>
                ルームコード
                <input
                  value={roomCode}
                  onChange={(event) =>
                    setRoomCode(event.currentTarget.value.toUpperCase())
                  }
                  placeholder="6〜8文字"
                  inputMode="text"
                  maxLength={8}
                  autoCapitalize="characters"
                />
              </label>
              <label>
                ニックネーム
                <input
                  value={nickname}
                  onChange={(event) => setNickname(event.currentTarget.value)}
                  placeholder="例：あき"
                  autoComplete="nickname"
                />
              </label>
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={joinRoom}
              >
                <Users size={18} />
                参加する
              </button>
            </div>
          )}
          <p className="shared-room-fallback">
            QRが開けないときは、招待されたコードをここに入力してください。
          </p>
        </div>
      )}
      {projection && session && (
        <div className="shared-room-waiting">
          <div className="shared-room-invite">
            <div className="shared-room-qr">
              <QRCodeSVG
                value={inviteUrl}
                size={220}
                level="M"
                includeMargin
                aria-label="参加用QRコード"
              />
              <small>QRにはホスト権限を含めていません</small>
            </div>
            <div className="shared-room-code">
              <span>参加用ルームコード</span>
              <strong>{projection.code}</strong>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void copy(projection.code, "ルームコードをコピーしました。")
                }
              >
                <Copy size={16} />
                コードをコピー
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void copy(inviteUrl, "参加リンクをコピーしました。")
                }
              >
                <Link size={16} />
                リンクをコピー
              </button>
            </div>
          </div>
          <div className="shared-room-status" role="status" aria-live="polite">
            <span className={connection === "online" ? "online" : "offline"}>
              {connection === "online" ? (
                <Wifi size={16} />
              ) : (
                <WifiOff size={16} />
              )}
              {connection === "online"
                ? "接続中"
                : connection === "connecting"
                  ? "接続準備中…"
                  : connection === "subscribing"
                    ? "同期購読を確認中…"
                    : "オフライン・再接続待ち"}
            </span>
            <span>
              {projection.status === "waiting"
                ? "開始待ち"
                : projection.status === "locked"
                  ? "開始準備中（参加受付終了）"
                  : projection.status === "playing"
                    ? "ゲーム中"
                    : projection.status === "finished"
                      ? "ゲーム完了（再戦準備可）"
                      : "ルーム終了（参加受付終了）"}
            </span>
            <button
              className="ghost-icon-button"
              type="button"
              onClick={() =>
                void refresh().catch((caught) => setError(roomError(caught)))
              }
              aria-label="ルームを更新"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="shared-room-participants">
            <h3>参加者 {participantCount}人</h3>
            {projection.participants.map((item) => (
              <div className="shared-room-participant" key={item.id}>
                <span>
                  <strong>
                    {item.name}
                    {item.id === session.participantId ? "（あなた）" : ""}
                  </strong>
                  <small>
                    {item.role === "host" ? "ホスト" : "参加者"} /{" "}
                    {item.connected ? "接続中" : "離席中"}
                  </small>
                </span>
                {isHost && item.role !== "host" && (
                  <button
                    type="button"
                    className="ghost-icon-button"
                    disabled={busy}
                    onClick={() =>
                      void command("kick", { targetParticipantId: item.id })
                    }
                    aria-label={`${item.name}を退出させる`}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!isHost && roomReadyForGame && (
            <p className="shared-room-waiting-note">
              <span>
                <Check size={16} />
                参加できました
              </span>
              ホストが開始するまで、この画面を開いたままにしてください。
            </p>
          )}
          {isHost && roomReadyForGame && (
            <div className="shared-room-host-actions">
              <label>
                設問
                <input
                  value={hostPrompt}
                  onChange={(event) => setHostPrompt(event.currentTarget.value)}
                />
              </label>
              <div className="shared-room-host-actions">
                <p className="soft-note">
                  <strong>専用同期ゲーム</strong>：参加者一覧をそのまま使います。ゲーム開始後の追加参加や、別の「参加」操作はありません。
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || participantCount < minimumPlayersForGame("yamanote") || !hostPrompt.trim()}
                  onClick={() => void startGame({ gameKind: "yamanote", prompt: hostPrompt.trim() || "東京の駅名" })}
                >
                  <Play size={18} />
                  山手線ゲームを開始（2人以上）
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || participantCount < minimumPlayersForGame("ng-word") || !hostPrompt.trim()}
                  onClick={() => void startGame({ gameKind: "ng-word", prompt: hostPrompt.trim() || "今日あったうれしいこと", ngWordDifficulty: "easy" })}
                >
                  <Play size={18} />
                  NGワードゲームを開始（3人以上）
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || participantCount < minimumPlayersForGame("turtle-soup") || !hostPrompt.trim()}
                  onClick={() => void startGame({ gameKind: "turtle-soup", prompt: hostPrompt.trim() || "なぜ彼は傘を持たずに外出した？" })}
                >
                  <Play size={18} />
                  ウミガメのスープを開始（2人以上）
                </button>
                <label>
                  パックのミニゲーム
                  <select value={partyPackMode} onChange={(event) => setPartyPackMode(event.currentTarget.value)}>
                    <option value="yamanote">山手線</option>
                    <option value="majority">多数派予想</option>
                    <option value="truth-lie">2真実1嘘</option>
                    <option value="reverse-word">逆さ言葉</option>
                    <option value="loanword-ban">外来語禁止</option>
                    <option value="typing">早打ち</option>
                    <option value="memory-drawing">記憶描き</option>
                    <option value="value-meter">価値観メーター</option>
                    <option value="acting">ひとこと演技</option>
                    <option value="hint-quiz">ヒントクイズ</option>
                  </select>
                </label>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || participantCount < minimumPlayersForGame("party-pack") || !hostPrompt.trim()}
                  onClick={() => void startGame({ gameKind: "party-pack", partyPackMode, prompt: hostPrompt.trim() || "最近ハマっていること" })}
                >
                  <Play size={18} />
                  定番ゲームパックを開始（3人以上）
                </button>
              </div>
              <button
                className="primary-button"
                type="button"
                disabled={
                  busy ||
                  participantCount < minimumPlayersForGame("two-choice") ||
                  !hostPrompt.trim()
                }
                onClick={() =>
                  void startGame({
                    gameKind: "two-choice",
                    prompt: hostPrompt.trim(),
                    deadlineAt: Date.now() + 60_000,
                  })
                }
              >
                <Play size={18} />
                二択トークを開始（2人以上・60秒）
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || participantCount < minimumPlayersForGame("anonymous-box")
                }
                onClick={() =>
                  void startGame({
                    gameKind: "anonymous-box",
                    prompt: hostPrompt.trim() || "匿名で質問を投稿",
                  })
                }
              >
                <Play size={18} />
                匿名質問箱を開始（2人以上）
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || participantCount < minimumPlayersForGame("word-wolf")
                }
                onClick={() => {
                  const topic = selectWordWolfTopic();
                  void startGame({
                    gameKind: "word-wolf",
                    prompt: hostPrompt.trim() || "お題を話そう",
                    majorityTopic: topic.majorityWord,
                    minorityTopic: topic.minorityWord,
                    minorityCount: Math.max(1, Math.floor(participantCount / 5)),
                    deadlineAt: Date.now() + 60_000,
                  });
                }}
              >
                <Play size={18} />
                ワードウルフを開始（4人以上）
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || !canStartWerewolf(participantCount)
                }
                onClick={() =>
                  void startGame({
                    gameKind: "werewolf",
                    prompt: hostPrompt.trim() || "夜の議論",
                    deadlineAt: Date.now() + 60_000,
                  })
                }
              >
                <Play size={18} />
                人狼を開始（4人、または6人以上）
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={() => void command("close")}
              >
                <X size={18} />
                参加を締め切る
              </button>
            </div>
          )}
          {isHost && roomReadyForGame && (
            <div className="shared-room-host-actions">
              <p className="soft-note">
                <strong>ジョハリの窓</strong>：ホストも通常の参加者として、まず自分の特徴、次に他の全員への印象を選びます。提出内容は結果まで非公開で、最後の提出後に自動で結果が開きます。別の参加操作は不要です。
              </p>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || participantCount < minimumPlayersForGame("johari-window")
                }
                onClick={() =>
                  void startGame({
                    gameKind: "johari-window",
                    prompt: hostPrompt.trim() || "自分と周りから見た特徴",
                    johariDeckWordIds: johariWords.slice(0, 20).map((word) => word.id),
                  })
                }
              >
                <Play size={18} />
                ジョハリの窓を開始（3人以上）
              </button>
            </div>
          )}
          {isHost && roomReadyForGame && (
            <button
              className="secondary-button"
              type="button"
              disabled={
                busy ||
                participantCount < minimumPlayersForGame("impression-ranking") ||
                !hostPrompt.trim()
              }
              onClick={() =>
                void startGame({
                  gameKind: "impression-ranking",
                  prompt: hostPrompt.trim() || "一番当てはまりそうな人は？",
                })
              }
            >
              <Play size={18} />
              第一印象ランキングを開始（3人以上）
            </button>
          )}
          {isHost && roomReadyForGame && (
            <button
              className="secondary-button"
              type="button"
              disabled={
                busy ||
                participantCount < minimumPlayersForGame("majority-game") ||
                !hostPrompt.trim()
              }
              onClick={() =>
                void startGame({
                  gameKind: "majority-game",
                  prompt: hostPrompt.trim() || "AとB、どちらが多数派？",
                })
              }
            >
              <Play size={18} />
              マジョリティゲームを開始（3人以上）
            </button>
          )}
          {isHost && roomReadyForGame && (
            <div className="shared-room-host-actions">
              <label>
                ゲームを選ぶ
                <select
                  value={legacyGameKey}
                  onChange={(event) =>
                    selectLegacyGame(event.currentTarget.value)
                  }
                >
                  {LEGACY_SYNC_GAME_KEYS.map((key) => (
                    <option value={key} key={key}>
                      {getSyncGameDefinition(key).title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="soft-note">
                <strong>{selectedLegacyDefinition.title}</strong>：
                {selectedLegacyDefinition.rule}
              </p>
              <label>
                {selectedLegacyDefinition.title}のお題
                <input
                  value={legacyPrompt}
                  onChange={(event) => setLegacyPrompt(event.currentTarget.value)}
                  placeholder={selectedLegacyDefinition.examplePrompt}
                />
              </label>
              <p className="soft-note">
                お題例：{selectedLegacyDefinition.examplePrompt}
              </p>
              <p className="soft-note">
                最低参加人数：{minimumPlayersForGame(legacyGameKey)}人（現在 {participantCount}人）
              </p>
              <button
                className="secondary-button"
                type="button"
                disabled={
                  busy || participantCount < minimumPlayersForGame(legacyGameKey)
                }
                onClick={() =>
                  void startGame({
                    gameKind: "legacy-game",
                    legacyGameKey,
                    mode: selectedLegacyDefinition.progression,
                    prompt:
                      legacyPrompt.trim() ||
                      selectedLegacyDefinition.examplePrompt,
                  })
                }
              >
                <Play size={18} />
                {selectedLegacyDefinition.title}を開始
              </button>
            </div>
          )}
          {projection.status === "playing" && (
            <p className="shared-room-waiting-note">
              <Check size={16} />
              ホストがゲームを開始しました。このルームは全員で同期できます。
            </p>
          )}
          {roomClosed ? (
            <div className="shared-room-game-card shared-room-result" role="status">
              <h3>ルーム終了</h3>
              <p>このルームは完全終了しました。参加受付とゲーム操作はできません。</p>
              <button
                type="button"
                className="primary-button"
                onClick={() => leaveLocal()}
              >
                新しいルームを作る
              </button>
            </div>
          ) : (
            <>
          {activeGame?.kind === "two-choice" && (
            <div className="shared-room-game-card">
              <h3>二択トーク</h3>
              <p>{activeGame.prompt}</p>
              {activeGame.phase === "answering" ? (
                <>
                  <div className="shared-room-choice-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || Boolean(activeGame.ownAnswer)}
                      onClick={() =>
                        void command("game_answer", { choice: "A" })
                      }
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || Boolean(activeGame.ownAnswer)}
                      onClick={() =>
                        void command("game_answer", { choice: "B" })
                      }
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || Boolean(activeGame.ownAnswer)}
                      onClick={() =>
                        void command("game_answer", { choice: "pass" })
                      }
                    >
                      パス
                    </button>
                  </div>
                  <p className="soft-note">
                    回答済み {activeGame.answeredCount}/
                    {activeGame.participantCount}
                    人。ほかの人の回答はまだ表示されません。
                  </p>
                  {isHost && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void command("game_reveal")}
                    >
                      締切って結果を公開
                    </button>
                  )}
                </>
              ) : (
                <div className="shared-room-result">
                  <strong>結果</strong>
                  <span>
                    A {activeGame.result?.A ?? 0} / B{" "}
                    {activeGame.result?.B ?? 0} / パス{" "}
                    {activeGame.result?.pass ?? 0}
                  </span>
                </div>
              )}
            </div>
          )}
          {ngWordGame && (
            <div className="shared-room-game-card">
              <h3>NGワードゲーム</h3>
              <p>{ngWordGame.prompt}</p>
              <p className="soft-note">
                自分のNGワードは結果公開まで表示されません。他の人のNGワードは確認できます。ヒットは罰や飲酒ではなく、記録だけを共有します。
              </p>
              <div className="shared-room-anonymous-list">
                {projection.participants.map((participant) => (
                  <div className="shared-room-anonymous-entry" key={participant.id}>
                    <strong>{participant.name}{participant.id === session.participantId ? "（あなた）" : ""}</strong>
                    <span>
                      {participant.id === session.participantId && ngWordGame.phase !== "revealed"
                        ? "あなたのNGワードは非表示"
                        : ngWordGame.assignments[participant.id] ?? "未配布"}
                    </span>
                    <small>ヒット記録 {ngWordGame.hitCounts[participant.id] ?? 0}回</small>
                    {ngWordGame.phase === "playing" && participant.id !== session.participantId && participant.connected && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void command("ng_word_hit", { targetParticipantId: participant.id })}
                      >
                        この人のヒットを記録
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="soft-note">
                記録済み {ngWordGame.hits.length}件。誰が誰のヒットを記録したかを共有しています。
              </p>
              {ngWordGame.hits.length > 0 && (
                <div className="shared-room-anonymous-list">
                  <strong>ヒット記録の履歴</strong>
                  {ngWordGame.hits.map((hit) => (
                    <span key={hit.id}>
                      {projection.participants.find((item) => item.id === hit.markerParticipantId)?.name ?? hit.markerParticipantId}さんが、{projection.participants.find((item) => item.id === hit.targetParticipantId)?.name ?? hit.targetParticipantId}さんを記録
                    </span>
                  ))}
                </div>
              )}
              {ngWordGame.phase === "assigned" && isHost && (
                <button type="button" className="primary-button" disabled={busy} onClick={() => void command("game_phase")}>
                  会話タイムへ進む
                </button>
              )}
              {ngWordGame.phase === "assigned" && !isHost && (
                <p className="soft-note">ホストが配布確認を終えて会話タイムへ進めるまでお待ちください。</p>
              )}
              {ngWordGame.phase === "playing" && isHost && (
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_reveal")}>
                  結果を公開して終了
                </button>
              )}
              {ngWordGame.phase === "revealed" && (
                <div className="shared-room-result">
                  <strong>結果</strong>
                  <p>NGワードとヒット記録を公開しました。飲酒ペナルティはありません。</p>
                  {Object.entries(ngWordGame.result?.assignments ?? ngWordGame.assignments).map(([participantId, word]) => (
                    <span key={participantId}>
                      {projection.participants.find((item) => item.id === participantId)?.name ?? participantId}：{word}（{ngWordGame.result?.hitCounts[participantId] ?? ngWordGame.hitCounts[participantId] ?? 0}回）
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {turtleSoupGame && (
            <div className="shared-room-game-card">
              <h3>ウミガメのスープ</h3>
              <p>{turtleSoupGame.prompt}</p>
              {turtleSoupGame.hostTruth && isHost && (
                <div className="notice-panel calm">
                  <strong>ホストだけに表示：truth</strong>
                  <p>{turtleSoupGame.hostTruth}</p>
                </div>
              )}
              {turtleSoupGame.hints.length > 0 && (
                <div className="shared-room-result">
                  <strong>公開済みヒント</strong>
                  {turtleSoupGame.hints.map((hint, index) => <span key={`${index}-${hint}`}>{index + 1}. {hint}</span>)}
                </div>
              )}
              {turtleSoupGame.phase === "questioning" && (
                <>
                  <div className="shared-room-form">
                    <label>
                      質問を投稿
                      <textarea value={turtleQuestion} onChange={(event) => setTurtleQuestion(event.currentTarget.value)} maxLength={500} placeholder="例：その日は晴れていましたか？" />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || !turtleQuestion.trim()}
                      onClick={() => void command("turtle_soup_question", { text: turtleQuestion.trim() }).then(() => setTurtleQuestion(""))}
                    >
                      質問を共有
                    </button>
                  </div>
                  <p className="soft-note">
                    質問 {turtleSoupGame.questionCount}件 / 未分類 {turtleSoupGame.pendingQuestionCount}件。質問文は全員に共有され、truth はまだ公開されません。
                  </p>
                </>
              )}
              <div className="shared-room-anonymous-list">
                {turtleSoupGame.questions.length === 0 ? (
                  <p className="soft-note">まだ質問はありません。</p>
                ) : turtleSoupGame.questions.map((question) => (
                  <div className="shared-room-anonymous-entry" key={question.id}>
                    <p>{question.text}</p>
                    <small>
                      {projection.participants.find((item) => item.id === question.askerId)?.name ?? question.askerId}さん / {question.classification === "yes" ? "はい" : question.classification === "no" ? "いいえ" : question.classification === "irrelevant" ? "関係ありません" : "未分類"}
                    </small>
                    {isHost && turtleSoupGame.phase === "questioning" && (
                      <div className="shared-room-choice-actions">
                        <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("turtle_soup_classify", { turtleSoupQuestionId: question.id, turtleSoupClassification: "yes" })}>はい</button>
                        <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("turtle_soup_classify", { turtleSoupQuestionId: question.id, turtleSoupClassification: "no" })}>いいえ</button>
                        <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("turtle_soup_classify", { turtleSoupQuestionId: question.id, turtleSoupClassification: "irrelevant" })}>関係ありません</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {turtleSoupGame.phase === "questioning" && isHost && (
                <div className="shared-room-choice-actions">
                  <button type="button" className="secondary-button" disabled={busy || turtleSoupGame.hintLevel >= (turtleSoupGame.availableHints?.length ?? turtleSoupGame.hintLevel)} onClick={() => void command("turtle_soup_hint")}>ヒントを1つ公開</button>
                  <button type="button" className="primary-button" disabled={busy || turtleSoupGame.pendingQuestionCount > 0} onClick={() => void command("game_reveal")}>truthを公開して終了</button>
                </div>
              )}
              {turtleSoupGame.phase === "questioning" && !isHost && <p className="soft-note">ホストが質問を分類し、必要なヒントを公開しています。</p>}
              {turtleSoupGame.phase === "revealed" && turtleSoupGame.truth && (
                <div className="shared-room-result">
                  <strong>truth</strong>
                  <p>{turtleSoupGame.truth}</p>
                </div>
              )}
            </div>
          )}
          {yamanoteGame && (
            <div className="shared-room-game-card">
              <h3>山手線ゲーム</h3>
              <p><strong>お題：</strong>{yamanoteGame.prompt}</p>
              {yamanoteGame.phase === "playing" && (
                <p className="soft-note">
                  {yamanoteGame.currentPlayerId === session.participantId
                    ? "あなたの番です。答える、パス、アウトのいずれかを選んでください。"
                    : `次は${projection.participants.find((item) => item.id === yamanoteGame.currentPlayerId)?.name ?? "次の参加者"}さんの番です。`}
                </p>
              )}
              {yamanoteGame.phase === "playing" && yamanoteGame.currentPlayerId === session.participantId && (
                <div className="shared-room-form">
                  <label>
                    あなたの言葉
                    <input value={yamanoteInput} onChange={(event) => setYamanoteInput(event.currentTarget.value)} maxLength={100} placeholder="例：新宿" />
                  </label>
                  <div className="shared-room-choice-actions">
                    <button type="button" className="primary-button" disabled={busy || !yamanoteInput.trim()} onClick={() => void command("yamanote_answer", { yamanoteAction: "answer", input: yamanoteInput.trim() }).then(() => setYamanoteInput(""))}>答える</button>
                    <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("yamanote_answer", { yamanoteAction: "pass" })}>パス</button>
                    <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("yamanote_answer", { yamanoteAction: "out" })}>アウト</button>
                  </div>
                </div>
              )}
              <p className="soft-note">回答履歴 {yamanoteGame.answerHistory.length}件。重複回答はサーバーが拒否します。</p>
              <div className="shared-room-anonymous-list">
                {yamanoteGame.answerHistory.map((entry) => (
                  <span key={entry.id}>
                    {projection.participants.find((item) => item.id === entry.playerId)?.name ?? entry.playerId}：{entry.action === "answer" ? entry.answer : entry.action === "pass" ? "パス" : "アウト"}
                  </span>
                ))}
              </div>
              {isHost && yamanoteGame.phase === "playing" && (
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_reveal")}>ここでラウンドを終了</button>
              )}
              {yamanoteGame.phase === "finished" && (
                <div className="shared-room-result">
                  <strong>ラウンド完了</strong>
                  <p>参加者の番を一巡しました。アウトになった人：{yamanoteGame.outIds.length ? yamanoteGame.outIds.map((id) => projection.participants.find((item) => item.id === id)?.name ?? id).join("、") : "なし"}</p>
                </div>
              )}
            </div>
          )}
          {partyPackGame && (
            <div className="shared-room-game-card">
              <h3>定番ゲームパック：{partyPackModeLabels[partyPackGame.mode] ?? partyPackGame.mode}</h3>
              <p><strong>お題：</strong>{partyPackGame.prompt}</p>
              <p>{partyPackGame.instruction}</p>
              {partyPackGame.hostAnswer && isHost && <p className="soft-note">ホストだけに表示される正解：{partyPackGame.hostAnswer}</p>}
              {partyPackGame.phase === "playing" && (
                <p className="soft-note">
                  {partyPackGame.progression === "turn"
                    ? partyPackGame.currentPlayerId === session.participantId
                      ? "あなたの番です。入力すると次の参加者へ進みます。"
                      : `次は${projection.participants.find((item) => item.id === partyPackGame.currentPlayerId)?.name ?? "次の参加者"}さんの番です。`
                    : `入力済み ${partyPackGame.inputCount}/${partyPackGame.participantCount}人。回答は結果公開まで非表示です。`}
                </p>
              )}
              {partyPackGame.phase === "playing" && (partyPackGame.progression === "simultaneous" || partyPackGame.currentPlayerId === session.participantId) && (
                <div className="shared-room-form">
                  <label>
                    あなたの回答
                    <input value={partyPackInput} onChange={(event) => setPartyPackInput(event.currentTarget.value)} maxLength={500} placeholder={partyPackGame.mode === "majority" ? "A / B / pass" : partyPackGame.mode === "value-meter" ? "72|理由" : partyPackGame.mode === "typing" ? "文章|1200" : "回答を入力"} />
                  </label>
                  <button type="button" className="primary-button" disabled={busy || !partyPackInput.trim() || Boolean(partyPackGame.ownInput)} onClick={() => void command("party_pack_action", { input: partyPackInput.trim() }).then(() => setPartyPackInput(""))}>回答を送信</button>
                </div>
              )}
              {partyPackGame.phase === "playing" && partyPackGame.progression === "turn" && !partyPackGame.currentPlayerId && <p className="soft-note">全員の入力が揃いました。ホストが結果を公開します。</p>}
              {partyPackGame.phase === "playing" && isHost && (
                <button type="button" className="secondary-button" disabled={busy || partyPackGame.remainingCount > 0} onClick={() => void command("game_reveal")}>結果を公開して終了</button>
              )}
              {partyPackGame.phase === "revealed" && partyPackGame.result && (
                <div className="shared-room-result">
                  <strong>結果</strong>
                  <p>{partyPackGame.result.summary}</p>
                  {partyPackGame.result.answer && <span>正解：{partyPackGame.result.answer}</span>}
                  {Object.entries(partyPackGame.result.inputs).map(([participantId, input]) => <span key={participantId}>{projection.participants.find((item) => item.id === participantId)?.name ?? participantId}：{input}（{partyPackGame.result?.scores[participantId] ?? 0}）</span>)}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "johari-window" && (
            <div className="shared-room-game-card">
              <h3>ジョハリの窓</h3>
              <p>{activeGame.prompt}</p>
              <p className="soft-note">
                ホストも参加者の一人です。選択内容は結果が開くまで、本人以外には表示されません。
              </p>
              {activeGame.phase === "self" && (
                <>
                  <p>
                    自分の特徴を選択中：提出済み {activeGame.selfSubmittedCount}/
                    {activeGame.selfParticipantCount}人
                  </p>
                  <div className="shared-room-choice-actions">
                    {johariDeckWords.map((word) => (
                      <button
                        type="button"
                        className={johariSelfDraft.includes(word.id) ? "primary-button" : "secondary-button"}
                        key={word.id}
                        disabled={busy || Boolean(activeGame.ownSelfSubmitted)}
                        onClick={() => toggleJohariSelfWord(word.id)}
                      >
                        {word.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || Boolean(activeGame.ownSelfSubmitted)}
                    onClick={submitJohariSelf}
                  >
                    {activeGame.ownSelfSubmitted ? "自分の特徴を提出済み" : "自分の特徴を提出"}
                  </button>
                </>
              )}
              {activeGame.phase === "peer" && (
                <>
                  <p>
                    他の参加者への印象：提出済み {activeGame.peerSubmittedCount}/
                    {activeGame.peerRequiredCount}件
                  </p>
                  <p className="soft-note">
                    他の参加者を順番待ちにせず、それぞれのカードへ自由に入力できます。
                  </p>
                  {projection.participants
                    .filter((item) => item.connected && item.id !== session.participantId)
                    .map((target) => {
                      const selected = johariPeerDrafts[target.id] ?? activeGame.ownPeerSelections?.[target.id] ?? [];
                      const submitted = activeGame.ownPeerSubmitted?.[target.id] === true;
                      return (
                        <div className="shared-room-anonymous-entry" key={target.id}>
                          <strong>{target.name}さんへの印象</strong>
                          <div className="shared-room-choice-actions">
                            {johariDeckWords.map((word) => (
                              <button
                                type="button"
                                className={selected.includes(word.id) ? "primary-button" : "secondary-button"}
                                key={word.id}
                                disabled={busy || submitted}
                                onClick={() => toggleJohariPeerWord(target.id, word.id)}
                              >
                                {word.label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy || submitted}
                            onClick={() => submitJohariPeer(target.id)}
                          >
                            {submitted ? "この人への入力を提出済み" : "この人への入力を提出"}
                          </button>
                        </div>
                      );
                    })}
                </>
              )}
              {activeGame.phase === "result" && (
                <div className="shared-room-result">
                  <strong>4つの窓</strong>
                  {Object.entries(activeGame.result ?? {}).map(([participantId, panes]) => {
                    const participant = projection.participants.find((item) => item.id === participantId);
                    const labels = (ids: string[]) => ids.map((id) => johariWords.find((word) => word.id === id)?.label ?? id);
                    return (
                      <div className="shared-room-anonymous-entry" key={participantId}>
                        <h4>{participant?.name ?? participantId}さん</h4>
                        <span>開放の窓：{labels(panes.open).join("、") || "なし"}</span>
                        <span>秘密の窓：{labels(panes.hidden).join("、") || "なし"}</span>
                        <span>盲点の窓：{labels(panes.blind).join("、") || "なし"}</span>
                        <span>未知の窓：{labels(panes.unknown).join("、") || "なし"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "anonymous-box" && (
            <div className="shared-room-game-card">
              <h3>匿名質問箱</h3>
              <p>{activeGame.prompt}</p>
              {!isHost && (
                <div className="shared-room-form">
                  <label>
                    匿名で投稿
                    <textarea
                      value={anonymousText}
                      onChange={(event) =>
                        setAnonymousText(event.currentTarget.value)
                      }
                      maxLength={500}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || !anonymousText.trim()}
                    onClick={() => {
                      void command("anonymous_submit", {
                        text: anonymousText,
                      }).then(() => setAnonymousText(""));
                    }}
                  >
                    投稿する
                  </button>
                </div>
              )}
              {isHost && (
                <div className="shared-room-anonymous-list">
                  {activeGame.entries.length === 0 ? (
                    <p className="soft-note">未表示の投稿はありません。</p>
                  ) : (
                    activeGame.entries.map((entry) => (
                      <div
                        className="shared-room-anonymous-entry"
                        key={entry.id}
                      >
                        <p>{entry.text}</p>
                        <span>{entry.status}</span>
                        {entry.status === "unshown" && (
                          <div>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy}
                              onClick={() =>
                                void command("anonymous_moderate", {
                                  targetEntryId: entry.id,
                                  moderationStatus: "displayed",
                                })
                              }
                            >
                              表示する
                            </button>
                            <button
                              type="button"
                              className="ghost-icon-button"
                              disabled={busy}
                              aria-label="投稿をスキップ"
                              onClick={() =>
                                void command("anonymous_moderate", {
                                  targetEntryId: entry.id,
                                  moderationStatus: "skipped",
                                })
                              }
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "word-wolf" && (
            <div className="shared-room-game-card">
              <h3>ワードウルフ</h3>
              <p>
                フェーズ：{activeGame.phase} / 投票 {activeGame.voteCount}/
                {activeGame.participantCount}
              </p>
              {activeGame.ownTopic && (
                <p>
                  <strong>あなたのお題：</strong>
                  {activeGame.ownTopic}
                </p>
              )}
              {activeGame.phase === "discussion" && isHost && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void command("game_phase")}
                >
                  投票へ進む
                </button>
              )}
              {activeGame.phase === "voting" && (
                <div className="shared-room-choice-actions">
                  {projection.participants
                    .filter((item) => item.id !== session.participantId)
                    .map((item) => (
                      <button
                        type="button"
                        className="secondary-button"
                        key={item.id}
                        disabled={busy || Boolean(activeGame.ownVote)}
                        onClick={() =>
                          void command("game_vote", { voteTargetId: item.id })
                        }
                      >
                        {item.name}に投票
                      </button>
                    ))}
                  {isHost && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void command("game_reveal")}
                    >
                      投票を締切る
                    </button>
                  )}
                </div>
              )}
              {activeGame.phase === "revealed" && (
                <div className="shared-room-result">
                  勝者：{activeGame.winner} / 投票結果{" "}
                  {JSON.stringify(activeGame.voteResults)}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "werewolf" && (
            <div className="shared-room-game-card">
              <h3>人狼</h3>
              <p>フェーズ：{activeGame.phase}</p>
              {activeGame.ownRole && (
                <p>
                  <strong>あなたの役職：</strong>
                  {activeGame.ownRole}
                </p>
              )}
              {activeGame.teammates && (
                <p>生存中の仲間：{activeGame.teammates.join(", ") || "なし"}</p>
              )}
              {activeGame.ownSeerResults?.map((result) => (
                <p key={`${result.targetId}-${result.role}`}>
                  占い結果：{result.targetId} = {result.role}
                </p>
              ))}
              {activeGame.phase === "night" && activeGame.ownRole && (
                <div className="shared-room-choice-actions">
                  {activeGame.ownRole === "werewolf" &&
                    projection.participants
                      .filter(
                        (item) =>
                          activeGame.aliveIds.includes(item.id) &&
                          item.id !== session.participantId,
                      )
                      .map((item) => (
                        <button
                          type="button"
                          className="secondary-button"
                          key={item.id}
                          disabled={busy}
                          onClick={() =>
                            void command("werewolf_action", {
                              action: "kill",
                              targetParticipantId: item.id,
                            })
                          }
                        >
                          {item.name}を襲撃
                        </button>
                      ))}
                  {activeGame.ownRole === "guard" &&
                    projection.participants
                      .filter((item) => activeGame.aliveIds.includes(item.id))
                      .map((item) => (
                        <button
                          type="button"
                          className="secondary-button"
                          key={item.id}
                          disabled={busy}
                          onClick={() =>
                            void command("werewolf_action", {
                              action: "guard",
                              targetParticipantId: item.id,
                            })
                          }
                        >
                          {item.name}を護衛
                        </button>
                      ))}
                  {activeGame.ownRole === "seer" &&
                    projection.participants
                      .filter(
                        (item) =>
                          activeGame.aliveIds.includes(item.id) &&
                          item.id !== session.participantId,
                      )
                      .map((item) => (
                        <button
                          type="button"
                          className="secondary-button"
                          key={item.id}
                          disabled={busy}
                          onClick={() =>
                            void command("werewolf_action", {
                              action: "inspect",
                              targetParticipantId: item.id,
                            })
                          }
                        >
                          {item.name}を占う
                        </button>
                      ))}
                </div>
              )}
              {(activeGame.phase === "voting" ||
                activeGame.phase === "revote") && (
                <div className="shared-room-choice-actions">
                  {projection.participants
                    .filter(
                      (item) =>
                        activeGame.aliveIds.includes(item.id) &&
                        item.id !== session.participantId &&
                        (activeGame.phase !== "revote" ||
                          activeGame.tiedTargetIds?.includes(item.id)),
                    )
                    .map((item) => (
                      <button
                        type="button"
                        className="secondary-button"
                        key={item.id}
                        disabled={busy || Boolean(activeGame.ownVote)}
                        onClick={() =>
                          void command("game_vote", { voteTargetId: item.id })
                        }
                      >
                        {item.name}に投票
                      </button>
                    ))}
                  {isHost && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void command("game_reveal")}
                    >
                      投票を締切る
                    </button>
                  )}
                </div>
              )}
              {isHost && activeGame.phase !== "finished" && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void command("game_phase")}
                >
                  次のフェーズへ
                </button>
              )}
              {activeGame.phase === "finished" && (
                <div className="shared-room-result">
                  勝者：{activeGame.winner}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "impression-ranking" && (
            <div className="shared-room-game-card">
              <h3>第一印象ランキング</h3>
              <p>{activeGame.prompt}</p>
              {activeGame.phase === "voting" ? (
                <>
                  <div className="shared-room-choice-actions">
                    {projection.participants
                      .filter((item) => item.id !== session.participantId)
                      .map((item) => (
                        <button
                          type="button"
                          className="secondary-button"
                          key={item.id}
                          disabled={busy || Boolean(activeGame.ownVote)}
                          onClick={() =>
                            void command("game_vote", { voteTargetId: item.id })
                          }
                        >
                          {item.name}
                        </button>
                      ))}
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || Boolean(activeGame.ownVote)}
                      onClick={() =>
                        void command("game_vote", { voteTargetId: "skip" })
                      }
                    >
                      パス
                    </button>
                  </div>
                  <p className="soft-note">
                    投票済み {activeGame.voteCount}/
                    {activeGame.participantCount}
                    人。投票内容は結果公開まで非表示です。
                  </p>
                  {isHost && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        busy ||
                        activeGame.voteCount < activeGame.participantCount
                      }
                      onClick={() => void command("game_reveal")}
                    >
                      結果を公開
                    </button>
                  )}
                </>
              ) : (
                <div className="shared-room-result">
                  <strong>結果</strong>
                  {Object.entries(activeGame.result ?? {})
                    .sort(([, left], [, right]) => right - left)
                    .map(([target, count]) => (
                      <span key={target}>
                        {target === "skip"
                          ? "パス"
                          : (projection.participants.find(
                              (item) => item.id === target,
                            )?.name ?? target)}
                        : {count}票
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}
          {activeGame?.kind === "majority-game" && (
            <div className="shared-room-game-card">
              <h3>マジョリティゲーム</h3>
              <p>{activeGame.prompt}</p>
              {activeGame.phase === "voting" ? (
                <>
                  <div className="shared-room-choice-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || Boolean(activeGame.ownVote)}
                      onClick={() =>
                        void command("game_vote", { voteTargetId: "A" })
                      }
                    >
                      A
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || Boolean(activeGame.ownVote)}
                      onClick={() =>
                        void command("game_vote", { voteTargetId: "B" })
                      }
                    >
                      B
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy || Boolean(activeGame.ownVote)}
                      onClick={() =>
                        void command("game_vote", { voteTargetId: "skip" })
                      }
                    >
                      パス
                    </button>
                  </div>
                  <p className="soft-note">
                    投票済み {activeGame.voteCount}/
                    {activeGame.participantCount}
                    人。投票内容は結果公開まで非表示です。
                  </p>
                  {isHost && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        busy ||
                        activeGame.voteCount < activeGame.participantCount
                      }
                      onClick={() => void command("game_reveal")}
                    >
                      全員の結果を公開
                    </button>
                  )}
                </>
              ) : (
                <div className="shared-room-result">
                  <strong>結果</strong>
                  {Object.entries(activeGame.result ?? {})
                    .sort(([, left], [, right]) => right - left)
                    .map(([target, count]) => (
                      <span key={target}>
                        {target}: {count}票
                      </span>
                    ))}
                </div>
              )}
            </div>
          )}

          {legacyGame?.kind === "legacy-game" && activeLegacyDefinition && (
            <div className="shared-room-game-card">
              <p className="eyebrow">
                {legacyGame.progression === "simultaneous"
                  ? "みんなで同時入力"
                  : "順番に進行"}
              </p>
              <h3>{activeLegacyDefinition.title}</h3>
              <p>{activeLegacyDefinition.rule}</p>
              <p>
                <strong>今回のお題：</strong>
                {legacyGame.prompt}
              </p>
              {legacyGame.progression === "count-up" && (
                <p className="soft-note">
                  現在 {legacyGame.currentTotal ?? 0} / 目標{" "}
                  {legacyGame.targetNumber ?? 30}
                </p>
              )}
              {legacyGame.phase === "playing" && (
                <>
                  <p className="soft-note">
                    {legacyGame.progression === "simultaneous"
                      ? legacyGame.ownInput
                        ? `送信済みです。残り${legacyGame.remainingCount}人の入力を待っています。`
                        : `入力済み ${legacyGame.inputCount}/${legacyGame.participantCount}人。あなたの回答はほかの参加者には見えません。`
                      : legacyGame.currentPlayerId === session.participantId
                        ? "あなたの番です。入力すると次の人へ自動で進みます。"
                        : `次は${projection!.participants.find((item) => item.id === legacyGame.currentPlayerId)?.name ?? "次の参加者"}さんの番です。`}
                  </p>
                  <div className="shared-room-form">
                    <label>
                      {activeLegacyDefinition.inputLabel}
                      <input
                        value={legacyInput}
                        onChange={(event) =>
                          setLegacyInput(event.currentTarget.value)
                        }
                        placeholder={activeLegacyDefinition.inputPlaceholder}
                        maxLength={500}
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        busy ||
                        !legacyInput.trim() ||
                    (legacyGame.progression === "simultaneous" && Boolean(legacyGame.ownInput)) ||
                        ((legacyGame.progression === "turn" ||
                          legacyGame.progression === "count-up") &&
                          legacyGame.currentPlayerId !== session.participantId)
                      }
                      onClick={() => {
                        void command("legacy_input", {
                          input: legacyInput.trim(),
                        }).then(() => setLegacyInput(""));
                      }}
                    >
                      入力を送信
                    </button>
                  </div>
                </>
              )}
              {legacyGame.phase === "finished" && (
                <div className="shared-room-result">
                  <strong>このラウンドの結果</strong>
                  <p>{legacyGame.result?.summary}</p>
                  {Object.entries(legacyGame.result?.inputs ?? {}).map(
                    ([participantId, input]) => (
                      <span key={participantId}>
                        {projection!.participants.find(
                          (item) => item.id === participantId,
                        )?.name ?? participantId}
                        : {input}（
                        {legacyGame.result?.scores[participantId] ?? 0}）
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          )}
          {projection.status === "finished" && (
            <div className="shared-room-host-actions">
              {isHost ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void prepareRematch()}
                >
                  このルームで再戦準備
                </button>
              ) : (
                <p className="shared-room-waiting-note">
                  ホストがこのルームで再戦準備をするまでお待ちください。
                </p>
              )}
            </div>
          )}
            </>
          )}
          <button
            type="button"
            className="secondary-button shared-room-leave"
            disabled={busy}
            onClick={() => void leaveRoom()}
          >
            ルームから退出する
          </button>
        </div>
      )}
      {notice && (
        <p className="shared-room-message" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="shared-room-message error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
