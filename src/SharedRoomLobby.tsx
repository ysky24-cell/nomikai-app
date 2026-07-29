import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link, Play, QrCode, RefreshCw, Users, Wifi, WifiOff, X } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import { NEW_SYNC_ROOM_GAME_KEYS } from "./syncRoomCatalog";

type SharedParticipant = { id: string; name: string; role: "host" | "player"; connected: boolean };
type SharedGame =
  | { kind: "two-choice"; prompt: string; deadlineAt: number | null; phase: "answering" | "revealed"; answeredCount: number; participantCount: number; ownAnswer?: "A" | "B" | "pass"; result?: { A: number; B: number; pass: number } }
  | { kind: "impression-ranking"; prompt: string; phase: "voting" | "revealed"; voteCount: number; participantCount: number; ownVote?: string; result?: Record<string, number> }
  | { kind: "majority-game"; prompt: string; phase: "voting" | "revealed"; voteCount: number; participantCount: number; ownVote?: string; result?: Record<string, number> }
  | { kind: "anonymous-box"; prompt: string; entries: Array<{ id: string; text: string; status: "unshown" | "displayed" | "answered" | "skipped" }>; ownEntry?: { id: string; text: string; status: "unshown" | "displayed" | "answered" | "skipped" } }
  | { kind: "word-wolf"; phase: "discussion" | "voting" | "revealed"; phaseDeadlineAt: number | null; participantCount: number; voteCount: number; ownTopic?: string; ownVote?: string; winner?: "majority" | "minority" | "draw"; voteResults?: Record<string, number> }
  | { kind: "werewolf"; phase: "night" | "day" | "voting" | "revote" | "finished"; phaseDeadlineAt: number | null; aliveIds: string[]; ownRole?: "werewolf" | "seer" | "guard" | "villager"; teammates?: string[]; ownSeerResults?: Array<{ targetId: string; role: string }>; ownVote?: string; tiedTargetIds?: string[]; winner?: "werewolf" | "villager" }
  | { kind: "legacy-game"; gameKey: string; prompt: string; mode: string; phase: "playing" | "finished"; inputCount: number; participantCount: number; ownInput?: string; result?: { inputs: Record<string, string>; summary: string; scores: Record<string, number> } };
type SharedProjection = {
  code: string;
  status: "waiting" | "playing" | "closed";
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
type CommandKind = "reconnect" | "leave" | "kick" | "start" | "close" | "game_start" | "game_answer" | "game_reveal" | "anonymous_submit" | "anonymous_moderate" | "game_vote" | "game_phase" | "werewolf_action" | "legacy_input";

const SHARED_SESSION_KEY = "nomikai:shared-room-session:v1";
const NATIVE_SYNC_GAME_KEYS = new Set(["two-choice", "impression-ranking", "majority-game", "anonymous-box", "word-wolf", "werewolf-game"]);
const LEGACY_SYNC_GAME_KEYS = NEW_SYNC_ROOM_GAME_KEYS.filter((key) => !NATIVE_SYNC_GAME_KEYS.has(key));

function readSession(): SharedSession | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(SHARED_SESSION_KEY) ?? "null") as Partial<SharedSession> | null;
    if (!value || typeof value !== "object" || typeof value.roomCode !== "string" || typeof value.participantId !== "string" || typeof value.participantName !== "string" || (value.role !== "host" && value.role !== "player") || typeof value.reconnectToken !== "string") return null;
    return value as SharedSession;
  } catch {
    return null;
  }
}

function writeSession(session: SharedSession) {
  try { window.localStorage.setItem(SHARED_SESSION_KEY, JSON.stringify(session)); } catch { /* private browsing can reject storage */ }
}

function clearSession() {
  try { window.localStorage.removeItem(SHARED_SESSION_KEY); } catch { /* ignore */ }
}

function commandId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cmd-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ownProjection(projection: SharedProjection, session: SharedSession | null, online: boolean): SharedProjection {
  if (!session) return projection;
  return {
    ...projection,
    self: { id: session.participantId, role: session.role },
    participants: projection.participants.map((item) => item.id === session.participantId ? { ...item, connected: online } : item),
  };
}

function roomError(error: unknown) {
  const code = error instanceof Error ? error.message : "request_failed";
  const labels: Record<string, string> = {
    nickname_required: "ニックネームを入力してください。",
    nickname_taken: "そのニックネームは既に使われています。別の名前を選んでください。",
    room_not_found: "ルームが見つかりません。コードを確認してください。",
    room_full: "このルームは満員です。",
    room_not_joinable: "このルームは参加受付を締め切っています。",
    room_closed: "このルームは終了しています。",
    participant_not_found: "参加者情報が見つかりません。もう一度参加してください。",
    token_invalid: "権限を確認できませんでした。復帰コードを確認してください。",
    reconnect_token_invalid: "復帰情報が期限切れです。もう一度参加してください。",
    version_conflict: "ルームが更新されました。最新状態を取得しています。",
    rate_limited: "操作が多すぎます。少し待ってから試してください。",
  };
  return labels[code] ?? "ルームに接続できませんでした。サーバーの状態を確認してください。";
}

export function SharedRoomLobby({ apiUrl, onPresenceChange }: { apiUrl: string; onPresenceChange?: (hasPresence: boolean) => void }) {
  const invitedCode = useMemo(() => {
    try { return new URL(window.location.href).searchParams.get("room")?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() ?? ""; } catch { return ""; }
  }, []);
  const [session, setSession] = useState<SharedSession | null>(() => readSession());
  const [projection, setProjection] = useState<SharedProjection | null>(null);
  const [roomCode, setRoomCode] = useState(invitedCode);
  const [nickname, setNickname] = useState("");
  const [hostName, setHostName] = useState("");
  const [mode, setMode] = useState<"join" | "create">(invitedCode ? "join" : "create");
  const [connection, setConnection] = useState<"idle" | "connecting" | "online" | "offline">("idle");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [anonymousText, setAnonymousText] = useState("");
  const [legacyInput, setLegacyInput] = useState("");
  const [hostPrompt, setHostPrompt] = useState("今夜、どちらを選ぶ？");
  const [legacyGameKey, setLegacyGameKey] = useState<string>(LEGACY_SYNC_GAME_KEYS[0] ?? "yamanote");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    onPresenceChange?.(Boolean(session));
  }, [onPresenceChange, projection, session]);

  useEffect(() => {
    const handleRequestedGame = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      if (typeof key === "string" && LEGACY_SYNC_GAME_KEYS.includes(key as typeof LEGACY_SYNC_GAME_KEYS[number])) {
        setLegacyGameKey(key as typeof legacyGameKey);
      }
    };
    window.addEventListener("nomikai:new-sync-game-request", handleRequestedGame);
    return () => window.removeEventListener("nomikai:new-sync-game-request", handleRequestedGame);
  }, []);

  const request = useCallback(async <T,>(path: string, options: { method?: string; body?: unknown; token?: string } = {}) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json", ...(options.token ? { "x-room-token": options.token } : {}) } : options.token ? { "x-room-token": options.token } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => null) as T | { error?: string } | null;
    if (!response.ok) throw new Error(payload && typeof payload === "object" && "error" in payload ? payload.error || "request_failed" : "request_failed");
    return payload as T;
  }, [apiUrl]);

  const refresh = useCallback(async (nextSession = session) => {
    if (!nextSession) return;
    let result = await request<SharedProjection>(`/v2/rooms/${encodeURIComponent(nextSession.roomCode)}?participantId=${encodeURIComponent(nextSession.participantId)}`, { token: nextSession.reconnectToken });
    const own = result.participants.find((item) => item.id === nextSession.participantId);
    if (!own) {
      clearSession();
      setSession(null);
      setProjection(null);
      throw new Error("participant_not_found");
    }
    if (!own.connected) {
      const token = nextSession.reconnectToken;
      if (token) {
        result = await request<SharedProjection>(`/v2/rooms/${encodeURIComponent(nextSession.roomCode)}/commands`, {
          method: "POST",
          token,
          body: { commandId: commandId(), expectedVersion: result.version, kind: "reconnect", participantId: nextSession.participantId },
        });
      }
    }
    setProjection(ownProjection(result, nextSession, navigator.onLine));
    return result;
  }, [request, session]);

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
    if (!session) return;
    const timer = window.setTimeout(() => setConnection("connecting"), 0);
    const socket = io(apiUrl, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnection("online");
      socket.emit("v2:subscribe", { roomCode: session.roomCode, participantId: session.participantId, token: session.role === "host" ? session.hostToken : session.reconnectToken });
      void refresh(session).catch((caught) => setError(roomError(caught)));
    });
    socket.on("v2:projection", (next: SharedProjection) => {
      if (!next.participants.some((item) => item.id === session.participantId)) {
        clearSession();
        setSession(null);
        setProjection(null);
        setError("この端末はルームから退出させられました。");
        return;
      }
      setProjection((current) => {
        if (current && next.version < current.version) return current;
        const nextProjection = ownProjection(next, session, true);
        if (current?.game?.kind === "two-choice" && nextProjection.game?.kind === "two-choice" && current.game.ownAnswer && !nextProjection.game.ownAnswer) {
          nextProjection.game = { ...nextProjection.game, ownAnswer: current.game.ownAnswer };
        }
        if (current?.game?.kind === "anonymous-box" && nextProjection.game?.kind === "anonymous-box" && current.game.ownEntry && !nextProjection.game.ownEntry) {
          nextProjection.game = { ...nextProjection.game, ownEntry: current.game.ownEntry };
        }
        return nextProjection;
      });
      const needsPrivateRefresh = next.game?.kind === "word-wolf" || next.game?.kind === "werewolf" || (next.game?.kind === "two-choice" && !next.game.ownAnswer) || (next.game?.kind === "impression-ranking" && !next.game.ownVote) || (next.game?.kind === "majority-game" && !next.game.ownVote) || (next.game?.kind === "anonymous-box" && !next.game.ownEntry) || (next.game?.kind === "legacy-game" && !next.game.ownInput);
      if (needsPrivateRefresh) void refresh(session).catch((caught) => setError(roomError(caught)));
      setConnection("online");
      setError("");
    });
    socket.on("disconnect", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    return () => { window.clearTimeout(timer); socket.disconnect(); if (socketRef.current === socket) socketRef.current = null; };
  }, [apiUrl, refresh, session]);

  useEffect(() => {
    const sync = () => { if (navigator.onLine) void refresh().catch((caught) => setError(roomError(caught))); };
    const onVisibility = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", onVisibility); };
  }, [refresh]);

  useEffect(() => {
    if (projection?.game?.kind !== "two-choice" || projection.game.phase !== "answering" || projection.game.deadlineAt === null) return;
    const deadlineAt = projection.game.deadlineAt;
    const timer = window.setInterval(() => {
      if (Date.now() >= deadlineAt) syncDeadline();
    }, 1_000);
    return () => window.clearInterval(timer);

    function syncDeadline() {
      void refresh().catch((caught) => setError(roomError(caught)));
    }
  }, [projection?.game, refresh]);

  async function createRoom() {
    const name = hostName.trim();
    if (!name) { setError("ホスト名を入力してください。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ room: SharedProjection; hostToken: string; reconnectToken: string }>("/v2/rooms", { method: "POST", body: { hostName: name } });
      const next: SharedSession = { roomCode: result.room.code, participantId: result.room.self?.id ?? "", participantName: name, role: "host", hostToken: result.hostToken, reconnectToken: result.reconnectToken };
      writeSession(next); setSession(next); setProjection(ownProjection(result.room, next, false)); setRoomCode(next.roomCode); setNotice("ルームを作成しました。参加用リンクを共有してください。");
    } catch (caught) { setError(roomError(caught)); } finally { setBusy(false); }
  }

  async function joinRoom() {
    const code = roomCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const name = nickname.trim();
    if (!code || !name) { setError("ルームコードとニックネームを入力してください。"); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const current = await request<SharedProjection>(`/v2/rooms/${encodeURIComponent(code)}`);
      const result = await request<SharedProjection & { credentials?: { participantId: string; reconnectToken: string } }>(`/v2/rooms/${encodeURIComponent(code)}/commands`, { method: "POST", body: { commandId: commandId(), expectedVersion: current.version, kind: "join", name } });
      if (!result.credentials) throw new Error("participant_required");
      const next: SharedSession = { roomCode: code, participantId: result.credentials.participantId, participantName: name, role: "player", reconnectToken: result.credentials.reconnectToken };
      writeSession(next); setSession(next); setProjection(ownProjection(result, next, false)); setRoomCode(code); setNotice("ルームに参加しました。ホストの開始を待っています。");
    } catch (caught) { setError(roomError(caught)); } finally { setBusy(false); }
  }

  async function command(kind: CommandKind, extra: Record<string, unknown> = {}) {
    if (!session || !projection) return;
    const token = session.role === "host" ? session.hostToken : session.reconnectToken;
    if (!token) return;
    setBusy(true); setError("");
    try {
      const result = await request<SharedProjection>(`/v2/rooms/${encodeURIComponent(session.roomCode)}/commands`, { method: "POST", token, body: { commandId: commandId(), expectedVersion: projection.version, kind, participantId: session.participantId, ...extra } });
      setProjection(ownProjection(result, session, connection === "online"));
      setNotice(kind === "close" ? "参加受付を締め切りました。" : kind === "start" ? "ゲームを開始しました。" : "ルームを更新しました。");
    } catch (caught) {
      if (caught instanceof Error && caught.message === "version_conflict") {
        try {
          const latest = await refresh();
          if (["game_answer", "game_vote", "anonymous_submit", "werewolf_action", "legacy_input"].includes(kind) && latest) {
            const retried = await request<SharedProjection>(`/v2/rooms/${encodeURIComponent(session.roomCode)}/commands`, { method: "POST", token, body: { commandId: commandId(), expectedVersion: latest.version, kind, participantId: session.participantId, ...extra } });
            setProjection(ownProjection(retried, session, connection === "online"));
            setError("");
            return;
          }
        } catch { /* error shown below */ }
      }
      setError(roomError(caught));
    } finally { setBusy(false); }
  }

  function leaveLocal() {
    socketRef.current?.disconnect();
    clearSession(); setSession(null); setProjection(null); setConnection("idle"); setNotice("この端末のルーム情報を消去しました。ルーム自体は残っています。");
  }

  const inviteUrl = useMemo(() => {
    if (!projection) return "";
    const url = new URL(window.location.href);
    for (const key of ["token", "participantToken", "hostToken", "reconnectToken", "participantId", "transferCode"]) {
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

  async function copy(value: string, message: string) {
    try { await navigator.clipboard.writeText(value); setNotice(message); } catch { setNotice(value); }
  }

  return (
    <section id="shared-room-lobby" className="shared-room-lobby" aria-label="みんなのスマホで遊ぶ">
      <div className="shared-room-heading">
        <div><p className="eyebrow">複数端末モード</p><h2>みんなのスマホで遊ぶ</h2><p>代表者がルームを作り、参加者は自分のスマホから参加できます。</p></div>
        {activeGame?.kind === "legacy-game" && <p className="soft-note">{activeGame.gameKey === "truth-lie-game" ? "1〜3またはA〜Cで回答" : activeGame.gameKey === "count-up-game" ? "1〜3をカンマ区切りで回答（例: 1,2）" : activeGame.gameKey === "value-meter-game" ? "数値|理由（例: 72|甘め）で回答" : activeGame.gameKey === "typing-speed-game" ? "文章|ミリ秒（例: same text|1200）で回答" : "お題に合わせて回答"}</p>}
        <Users size={28} aria-hidden="true" />
      </div>
      {!projection && (
        <div className="shared-room-entry">
          <div className="shared-room-tabs" role="group" aria-label="ルーム操作">
            <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>ルームを作る</button>
            <button type="button" className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>コードで参加</button>
          </div>
          {mode === "create" ? (
            <div className="shared-room-form"><label>ホスト名<input value={hostName} onChange={(event) => setHostName(event.currentTarget.value)} placeholder="例：やすこ" autoComplete="nickname" /></label><button className="primary-button" type="button" disabled={busy} onClick={createRoom}><QrCode size={18} />ルームを作る</button></div>
          ) : (
            <div className="shared-room-form"><label>ルームコード<input value={roomCode} onChange={(event) => setRoomCode(event.currentTarget.value.toUpperCase())} placeholder="6〜8文字" inputMode="text" maxLength={8} autoCapitalize="characters" /></label><label>ニックネーム<input value={nickname} onChange={(event) => setNickname(event.currentTarget.value)} placeholder="例：あき" autoComplete="nickname" /></label><button className="primary-button" type="button" disabled={busy} onClick={joinRoom}><Users size={18} />参加する</button></div>
          )}
          <p className="shared-room-fallback">QRが開けないときは、招待されたコードをここに入力してください。</p>
        </div>
      )}
      {projection && session && (
        <div className="shared-room-waiting">
          <div className="shared-room-invite">
            <div className="shared-room-qr"><QRCodeSVG value={inviteUrl} size={220} level="M" includeMargin aria-label="参加用QRコード" /><small>QRにはホスト権限を含めていません</small></div>
            <div className="shared-room-code"><span>参加用ルームコード</span><strong>{projection.code}</strong><button type="button" className="secondary-button" onClick={() => void copy(projection.code, "ルームコードをコピーしました。")}><Copy size={16} />コードをコピー</button><button type="button" className="secondary-button" onClick={() => void copy(inviteUrl, "参加リンクをコピーしました。")}><Link size={16} />リンクをコピー</button></div>
          </div>
          <div className="shared-room-status" role="status" aria-live="polite"><span className={connection === "online" ? "online" : "offline"}>{connection === "online" ? <Wifi size={16} /> : <WifiOff size={16} />}{connection === "online" ? "接続中" : connection === "connecting" ? "接続中…" : "オフライン・再接続待ち"}</span><span>{projection.status === "waiting" ? "開始待ち" : projection.status === "playing" ? "ゲーム中" : "参加受付終了"}</span><button className="ghost-icon-button" type="button" onClick={() => void refresh().catch((caught) => setError(roomError(caught)))} aria-label="ルームを更新"><RefreshCw size={16} /></button></div>
          <div className="shared-room-participants"><h3>参加者 {participantCount}人</h3>{projection.participants.map((item) => <div className="shared-room-participant" key={item.id}><span><strong>{item.name}{item.id === session.participantId ? "（あなた）" : ""}</strong><small>{item.role === "host" ? "ホスト" : "参加者"} / {item.connected ? "接続中" : "離席中"}</small></span>{isHost && item.role !== "host" && <button type="button" className="ghost-icon-button" disabled={busy} onClick={() => void command("kick", { targetParticipantId: item.id })} aria-label={`${item.name}を退出させる`}><X size={16} /></button>}</div>)}</div>
          {!isHost && projection.status === "waiting" && <p className="shared-room-waiting-note"><span><Check size={16} />参加できました</span>ホストが開始するまで、この画面を開いたままにしてください。</p>}
          {isHost && projection.status === "waiting" && <div className="shared-room-host-actions"><label>設問<input value={hostPrompt} onChange={(event) => setHostPrompt(event.currentTarget.value)} /></label><button className="primary-button" type="button" disabled={busy || !hostPrompt.trim()} onClick={() => void command("game_start", { gameKind: "two-choice", prompt: hostPrompt.trim(), deadlineAt: Date.now() + 60_000 })}><Play size={18} />二択トークを開始（60秒）</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void command("game_start", { gameKind: "anonymous-box", prompt: hostPrompt.trim() || "匿名で質問を投稿" })}><Play size={18} />匿名質問箱を開始</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void command("game_start", { gameKind: "word-wolf", prompt: hostPrompt.trim() || "お題を話そう", majorityTopic: "海", minorityTopic: "山", minorityCount: 1, deadlineAt: Date.now() + 60_000 })}><Play size={18} />ワードウルフを開始</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void command("game_start", { gameKind: "werewolf", prompt: hostPrompt.trim() || "夜の議論", deadlineAt: Date.now() + 60_000 })}><Play size={18} />人狼を開始</button><button className="danger-button" type="button" disabled={busy} onClick={() => void command("close")}><X size={18} />参加を締め切る</button></div>}
          {isHost && projection.status === "waiting" && <button className="secondary-button" type="button" disabled={busy || projection.participants.length < 3 || !hostPrompt.trim()} onClick={() => void command("game_start", { gameKind: "impression-ranking", prompt: hostPrompt.trim() || "一番当てはまりそうな人は？" })}><Play size={18} />第一印象ランキングを開始（3人以上）</button>}
          {isHost && projection.status === "waiting" && <button className="secondary-button" type="button" disabled={busy || projection.participants.length < 3 || !hostPrompt.trim()} onClick={() => void command("game_start", { gameKind: "majority-game", prompt: hostPrompt.trim() || "AとB、どちらが多数派？" })}><Play size={18} />マジョリティゲームを開始（3人以上）</button>}
          {isHost && projection.status === "waiting" && <div className="shared-room-host-actions"><label>正式版ゲーム<select value={legacyGameKey} onChange={(event) => setLegacyGameKey(event.currentTarget.value as typeof legacyGameKey)}>{LEGACY_SYNC_GAME_KEYS.map((key) => <option value={key} key={key}>{key}</option>)}</select></label><button className="secondary-button" type="button" disabled={busy || !hostPrompt.trim()} onClick={() => void command("game_start", { gameKind: "legacy-game", legacyGameKey, mode: "shared-input", prompt: hostPrompt.trim() })}><Play size={18} />このゲームを開始</button></div>}
          {projection.status === "playing" && <p className="shared-room-waiting-note"><Check size={16} />ホストがゲームを開始しました。このルームは全員で同期できます。</p>}
          {activeGame?.kind === "two-choice" && <div className="shared-room-game-card"><h3>二択トーク</h3><p>{activeGame.prompt}</p>{activeGame.phase === "answering" ? <><div className="shared-room-choice-actions"><button type="button" className="primary-button" disabled={busy || Boolean(activeGame.ownAnswer)} onClick={() => void command("game_answer", { choice: "A" })}>A</button><button type="button" className="primary-button" disabled={busy || Boolean(activeGame.ownAnswer)} onClick={() => void command("game_answer", { choice: "B" })}>B</button><button type="button" className="secondary-button" disabled={busy || Boolean(activeGame.ownAnswer)} onClick={() => void command("game_answer", { choice: "pass" })}>パス</button></div><p className="soft-note">回答済み {activeGame.answeredCount}/{activeGame.participantCount}人。ほかの人の回答はまだ表示されません。</p>{isHost && <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_reveal")}>締切って結果を公開</button>}</> : <div className="shared-room-result"><strong>結果</strong><span>A {activeGame.result?.A ?? 0} / B {activeGame.result?.B ?? 0} / パス {activeGame.result?.pass ?? 0}</span></div>}</div>}
          {activeGame?.kind === "anonymous-box" && <div className="shared-room-game-card"><h3>匿名質問箱</h3><p>{activeGame.prompt}</p>{!isHost && <div className="shared-room-form"><label>匿名で投稿<textarea value={anonymousText} onChange={(event) => setAnonymousText(event.currentTarget.value)} maxLength={500} /></label><button type="button" className="primary-button" disabled={busy || !anonymousText.trim()} onClick={() => { void command("anonymous_submit", { text: anonymousText }).then(() => setAnonymousText("")); }}>投稿する</button></div>}{isHost && <div className="shared-room-anonymous-list">{activeGame.entries.length === 0 ? <p className="soft-note">未表示の投稿はありません。</p> : activeGame.entries.map((entry) => <div className="shared-room-anonymous-entry" key={entry.id}><p>{entry.text}</p><span>{entry.status}</span>{entry.status === "unshown" && <div><button type="button" className="secondary-button" disabled={busy} onClick={() => void command("anonymous_moderate", { targetEntryId: entry.id, moderationStatus: "displayed" })}>表示する</button><button type="button" className="ghost-icon-button" disabled={busy} aria-label="投稿をスキップ" onClick={() => void command("anonymous_moderate", { targetEntryId: entry.id, moderationStatus: "skipped" })}><X size={16} /></button></div>}</div>)}</div>}</div>}
          {activeGame?.kind === "word-wolf" && <div className="shared-room-game-card"><h3>ワードウルフ</h3><p>フェーズ：{activeGame.phase} / 投票 {activeGame.voteCount}/{activeGame.participantCount}</p>{activeGame.ownTopic && <p><strong>あなたのお題：</strong>{activeGame.ownTopic}</p>}{activeGame.phase === "discussion" && isHost && <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_phase")}>投票へ進む</button>}{activeGame.phase === "voting" && <div className="shared-room-choice-actions">{projection.participants.filter((item) => item.id !== session.participantId).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: item.id })}>{item.name}に投票</button>)}{isHost && <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_reveal")}>投票を締切る</button>}</div>}{activeGame.phase === "revealed" && <div className="shared-room-result">勝者：{activeGame.winner} / 投票結果 {JSON.stringify(activeGame.voteResults)}</div>}</div>}
          {activeGame?.kind === "werewolf" && <div className="shared-room-game-card"><h3>人狼</h3><p>フェーズ：{activeGame.phase}</p>{activeGame.ownRole && <p><strong>あなたの役職：</strong>{activeGame.ownRole}</p>}{activeGame.teammates && <p>生存中の仲間：{activeGame.teammates.join(", ") || "なし"}</p>}{activeGame.ownSeerResults?.map((result) => <p key={`${result.targetId}-${result.role}`}>占い結果：{result.targetId} = {result.role}</p>)}{activeGame.phase === "night" && activeGame.ownRole && <div className="shared-room-choice-actions">{activeGame.ownRole === "werewolf" && projection.participants.filter((item) => activeGame.aliveIds.includes(item.id) && item.id !== session.participantId).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy} onClick={() => void command("werewolf_action", { action: "kill", targetParticipantId: item.id })}>{item.name}を襲撃</button>)}{activeGame.ownRole === "guard" && projection.participants.filter((item) => activeGame.aliveIds.includes(item.id)).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy} onClick={() => void command("werewolf_action", { action: "guard", targetParticipantId: item.id })}>{item.name}を護衛</button>)}{activeGame.ownRole === "seer" && projection.participants.filter((item) => activeGame.aliveIds.includes(item.id) && item.id !== session.participantId).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy} onClick={() => void command("werewolf_action", { action: "inspect", targetParticipantId: item.id })}>{item.name}を占う</button>)}</div>}{(activeGame.phase === "voting" || activeGame.phase === "revote") && <div className="shared-room-choice-actions">{projection.participants.filter((item) => activeGame.aliveIds.includes(item.id) && item.id !== session.participantId && (activeGame.phase !== "revote" || activeGame.tiedTargetIds?.includes(item.id))).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: item.id })}>{item.name}に投票</button>)}{isHost && <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_reveal")}>投票を締切る</button>}</div>}{isHost && activeGame.phase !== "finished" && <button type="button" className="secondary-button" disabled={busy} onClick={() => void command("game_phase")}>次のフェーズへ</button>}{activeGame.phase === "finished" && <div className="shared-room-result">勝者：{activeGame.winner}</div>}</div>}
          {activeGame?.kind === "impression-ranking" && <div className="shared-room-game-card"><h3>第一印象ランキング</h3><p>{activeGame.prompt}</p>{activeGame.phase === "voting" ? <><div className="shared-room-choice-actions">{projection.participants.filter((item) => item.id !== session.participantId).map((item) => <button type="button" className="secondary-button" key={item.id} disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: item.id })}>{item.name}</button>)}<button type="button" className="secondary-button" disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: "skip" })}>パス</button></div><p className="soft-note">投票済み {activeGame.voteCount}/{activeGame.participantCount}人。投票内容は結果公開まで非表示です。</p>{isHost && <button type="button" className="secondary-button" disabled={busy || activeGame.voteCount < activeGame.participantCount} onClick={() => void command("game_reveal")}>結果を公開</button>}</> : <div className="shared-room-result"><strong>結果</strong>{Object.entries(activeGame.result ?? {}).sort(([, left], [, right]) => right - left).map(([target, count]) => <span key={target}>{target === "skip" ? "パス" : projection.participants.find((item) => item.id === target)?.name ?? target}: {count}票</span>)}</div>}</div>}
          {activeGame?.kind === "majority-game" && <div className="shared-room-game-card"><h3>マジョリティゲーム</h3><p>{activeGame.prompt}</p>{activeGame.phase === "voting" ? <><div className="shared-room-choice-actions"><button type="button" className="primary-button" disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: "A" })}>A</button><button type="button" className="primary-button" disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: "B" })}>B</button><button type="button" className="secondary-button" disabled={busy || Boolean(activeGame.ownVote)} onClick={() => void command("game_vote", { voteTargetId: "skip" })}>パス</button></div><p className="soft-note">投票済み {activeGame.voteCount}/{activeGame.participantCount}人。投票内容は結果公開まで非表示です。</p>{isHost && <button type="button" className="secondary-button" disabled={busy || activeGame.voteCount < activeGame.participantCount} onClick={() => void command("game_reveal")}>全員の結果を公開</button>}</> : <div className="shared-room-result"><strong>結果</strong>{Object.entries(activeGame.result ?? {}).sort(([, left], [, right]) => right - left).map(([target, count]) => <span key={target}>{target}: {count}票</span>)}</div>}</div>}
          {activeGame?.kind === "legacy-game" && <div className="shared-room-game-card"><h3>{activeGame.gameKey}</h3><p>{activeGame.prompt}</p><p className="soft-note">入力済み {activeGame.inputCount}/{activeGame.participantCount}人。全員の入力がそろうまで結果は表示されません。</p>{activeGame.phase === "playing" ? <div className="shared-room-form"><label>あなたの回答<input value={legacyInput} onChange={(event) => setLegacyInput(event.currentTarget.value)} maxLength={500} /></label><button type="button" className="primary-button" disabled={busy || !legacyInput.trim() || Boolean(activeGame.ownInput)} onClick={() => { void command("legacy_input", { input: legacyInput.trim() }).then(() => setLegacyInput("")); }}>入力を送信</button>{isHost && <button type="button" className="secondary-button" disabled={busy || activeGame.inputCount < activeGame.participantCount} onClick={() => void command("game_reveal")}>全員の結果を公開</button>}</div> : <div className="shared-room-result"><strong>結果</strong><p>{activeGame.result?.summary}</p>{Object.entries(activeGame.result?.inputs ?? {}).map(([participantId, input]) => <span key={participantId}>{projection.participants.find((item) => item.id === participantId)?.name ?? participantId}: {input}（{activeGame.result?.scores[participantId] ?? 0}）</span>)}</div>}</div>}
          <button type="button" className="secondary-button shared-room-leave" onClick={leaveLocal}>この端末の接続を外す</button>
        </div>
      )}
      {notice && <p className="shared-room-message" role="status">{notice}</p>}
      {error && <p className="shared-room-message error" role="alert">{error}</p>}
    </section>
  );
}
