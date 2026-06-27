import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { config } from "./config.js";
import {
  addParticipant,
  checkDatabase,
  closeRoom,
  createRoom,
  findRoomByCode,
  listRoomEvents,
  pool,
  removeRoomParticipant,
  setParticipantConnected,
  transferRoomHost,
  updateRoomProgress,
  updateRoomState,
} from "./db.js";
import { checkRedis, redis } from "./redis.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.clientOrigin,
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_request, response) => {
  const checks = await Promise.allSettled([checkDatabase(), checkRedis()]);
  const dbOk = checks[0].status === "fulfilled";
  const redisOk = checks[1].status === "fulfilled";

  response.status(dbOk && redisOk ? 200 : 503).json({
    ok: dbOk && redisOk,
    service: "nomikai-room-server",
    uptime: process.uptime(),
    checks: {
      db: dbOk ? "ok" : "error",
      redis: redisOk ? "ok" : "error",
    },
  });
});

app.post("/rooms", async (request, response, next) => {
  try {
    const hostName = readOptionalString(request.body?.hostName);
    const result = await createRoom(hostName);
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/rooms/:code", async (request, response, next) => {
  try {
    const snapshot = await findRoomByCode(request.params.code);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    const participantId = readOptionalString(request.query.participantId);
    response.json(sanitizeRoomSnapshotForParticipant(snapshot, findParticipant(snapshot, participantId)));
  } catch (error) {
    next(error);
  }
});

app.get("/rooms/:code/events", async (request, response, next) => {
  try {
    const snapshot = await findRoomByCode(request.params.code);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    const events = await listRoomEvents(snapshot.room.code);
    response.json({
      room: {
        code: snapshot.room.code,
        status: snapshot.room.status,
        currentGame: snapshot.room.currentGame,
      },
      events: events.map(sanitizeRoomEvent),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/join", async (request, response, next) => {
  try {
    const name = readRequiredString(request.body?.name, "name");
    const participant = await addParticipant(request.params.code, name);
    if (!participant) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    const snapshot = await findRoomByCode(request.params.code);
    if (snapshot) {
      await emitRoomSnapshot(snapshot.room.code);
    }

    const participantSnapshot = snapshot ? sanitizeRoomSnapshotForParticipant(snapshot, participant) : null;
    response.status(201).json({ participant, room: participantSnapshot?.room ?? null });
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/host/transfer", async (request, response, next) => {
  try {
    const requesterParticipantId = readRequiredString(request.body?.participantId, "participant_id");
    const targetParticipantId = readRequiredString(request.body?.targetParticipantId, "target_participant_id");
    const snapshot = await transferRoomHost(request.params.code, requesterParticipantId, targetParticipantId);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(snapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(snapshot, findParticipant(snapshot, requesterParticipantId)));
  } catch (error) {
    next(error);
  }
});

app.delete("/rooms/:code/participants/:targetParticipantId", async (request, response, next) => {
  try {
    const requesterParticipantId = readRequiredString(request.body?.participantId, "participant_id");
    const snapshot = await removeRoomParticipant(request.params.code, requesterParticipantId, request.params.targetParticipantId);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(snapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(snapshot, findParticipant(snapshot, requesterParticipantId)));
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/game/start", async (request, response, next) => {
  try {
    const gameKey = readRequiredString(request.body?.gameKey, "game_key");
    const gameTitle = readRequiredString(request.body?.gameTitle, "game_title");
    const participantId = readRequiredString(request.body?.participantId, "participant_id");
    const currentSnapshot = await findRoomByCode(request.params.code);
    if (!currentSnapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    if (isClosedRoom(currentSnapshot)) {
      response.status(409).json({ error: "room_closed" });
      return;
    }
    if (!isHostParticipant(currentSnapshot, participantId)) {
      response.status(403).json({ error: "host_required" });
      return;
    }

    const nextState = buildProgressState({
      phase: "playing",
      gameKey,
      gameTitle,
      step: 1,
      message: "ゲームを開始しました",
      updatedBy: participantId,
    });

    const snapshot = await updateRoomProgress({
      code: currentSnapshot.room.code,
      status: "playing",
      currentGame: gameKey,
      state: nextState,
      participantId,
      eventType: "game_started",
    });

    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(snapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(snapshot, findParticipant(snapshot, participantId)));
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/game/advance", async (request, response, next) => {
  try {
    const snapshot = await findRoomByCode(request.params.code);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    if (isClosedRoom(snapshot)) {
      response.status(409).json({ error: "room_closed" });
      return;
    }

    const currentState = readProgressState(snapshot.room.state, snapshot.room.currentGame);
    if (!currentState.gameKey) {
      response.status(400).json({ error: "game_not_started" });
      return;
    }

    const participantId = readRequiredString(request.body?.participantId, "participant_id");
    if (!isHostParticipant(snapshot, participantId)) {
      response.status(403).json({ error: "host_required" });
      return;
    }

    const nextState = buildProgressState({
      ...currentState,
      phase: "playing",
      step: currentState.step + 1,
      message: "次の進行へ進みました",
      updatedBy: participantId,
    });

    const updatedSnapshot = await updateRoomProgress({
      code: snapshot.room.code,
      status: "playing",
      currentGame: currentState.gameKey,
      state: nextState,
      participantId,
      eventType: "game_advanced",
    });

    if (!updatedSnapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(updatedSnapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(updatedSnapshot, findParticipant(updatedSnapshot, participantId)));
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/game/complete", async (request, response, next) => {
  try {
    const snapshot = await findRoomByCode(request.params.code);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    if (isClosedRoom(snapshot)) {
      response.status(409).json({ error: "room_closed" });
      return;
    }

    const currentState = readProgressState(snapshot.room.state, snapshot.room.currentGame);
    if (!currentState.gameKey) {
      response.status(400).json({ error: "game_not_started" });
      return;
    }

    const participantId = readRequiredString(request.body?.participantId, "participant_id");
    if (!isHostParticipant(snapshot, participantId)) {
      response.status(403).json({ error: "host_required" });
      return;
    }

    const nextState = buildProgressState({
      ...currentState,
      phase: "complete",
      message: "ゲームを完了しました",
      updatedBy: participantId,
    });

    const updatedSnapshot = await updateRoomProgress({
      code: snapshot.room.code,
      status: "complete",
      currentGame: currentState.gameKey,
      state: nextState,
      participantId,
      eventType: "game_completed",
    });

    if (!updatedSnapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(updatedSnapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(updatedSnapshot, findParticipant(updatedSnapshot, participantId)));
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/game/reset", async (request, response, next) => {
  try {
    const participantId = readRequiredString(request.body?.participantId, "participant_id");
    const currentSnapshot = await findRoomByCode(request.params.code);
    if (!currentSnapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    if (isClosedRoom(currentSnapshot)) {
      response.status(409).json({ error: "room_closed" });
      return;
    }
    if (!isHostParticipant(currentSnapshot, participantId)) {
      response.status(403).json({ error: "host_required" });
      return;
    }

    const nextState = buildProgressState({
      phase: "lobby",
      gameKey: null,
      gameTitle: null,
      step: 0,
      message: "待機中に戻しました",
      updatedBy: participantId,
    });

    const snapshot = await updateRoomProgress({
      code: currentSnapshot.room.code,
      status: "waiting",
      currentGame: null,
      state: nextState,
      participantId,
      eventType: "game_reset",
    });

    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(snapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(snapshot, findParticipant(snapshot, participantId)));
  } catch (error) {
    next(error);
  }
});

app.post("/rooms/:code/close", async (request, response, next) => {
  try {
    const participantId = readRequiredString(request.body?.participantId, "participant_id");
    const snapshot = await findRoomByCode(request.params.code);
    if (!snapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }
    if (!isHostParticipant(snapshot, participantId)) {
      response.status(403).json({ error: "host_required" });
      return;
    }
    if (isClosedRoom(snapshot)) {
      response.status(409).json({ error: "room_closed" });
      return;
    }

    const currentState = readProgressState(snapshot.room.state, snapshot.room.currentGame);
    const nextState = buildProgressState({
      ...currentState,
      phase: "complete",
      message: "ルームを終了しました",
      updatedBy: participantId,
    });

    const updatedSnapshot = await closeRoom(snapshot.room.code, participantId, nextState);
    if (!updatedSnapshot) {
      response.status(404).json({ error: "room_not_found" });
      return;
    }

    await emitRoomSnapshot(updatedSnapshot.room.code);
    response.json(sanitizeRoomSnapshotForParticipant(updatedSnapshot, findParticipant(updatedSnapshot, participantId)));
  } catch (error) {
    if (error instanceof Error && error.message === "host_required") {
      response.status(403).json({ error: "host_required" });
      return;
    }
    if (error instanceof Error && error.message === "room_closed") {
      response.status(409).json({ error: "room_closed" });
      return;
    }
    next(error);
  }
});

io.on("connection", (socket) => {
  socket.on("room:join", async (payload: { roomCode?: string; participantId?: string }) => {
    const roomCode = payload.roomCode?.trim().toUpperCase();
    if (!roomCode) {
      socket.emit("room:error", { error: "room_code_required" });
      return;
    }

    const snapshot = await findRoomByCode(roomCode);
    if (!snapshot) {
      socket.emit("room:error", { error: "room_not_found" });
      return;
    }

    const participantId = readOptionalString(payload.participantId) ?? null;
    if (participantId && !findParticipant(snapshot, participantId)) {
      socket.emit("room:error", { error: "participant_not_found" });
      return;
    }

    socket.join(snapshot.room.code);
    socket.data.roomCode = snapshot.room.code;
    socket.data.participantId = participantId;

    if (participantId) {
      await setParticipantConnected(participantId, true);
    }

    await emitRoomSnapshot(snapshot.room.code);
  });

  socket.on("room:state:update", async (payload: { roomCode?: string; state?: unknown; currentGame?: string | null }) => {
    const roomCode = payload.roomCode?.trim().toUpperCase();
    if (!roomCode) {
      socket.emit("room:error", { error: "room_code_required" });
      return;
    }

    const currentSnapshot = await findRoomByCode(roomCode);
    if (!currentSnapshot) {
      socket.emit("room:error", { error: "room_not_found" });
      return;
    }
    if (isClosedRoom(currentSnapshot)) {
      socket.emit("room:error", { error: "room_closed" });
      return;
    }

    if (socket.data.roomCode !== currentSnapshot.room.code || !socket.rooms.has(currentSnapshot.room.code)) {
      socket.emit("room:error", { error: "room_join_required" });
      return;
    }

    const participantId = typeof socket.data.participantId === "string" ? socket.data.participantId : null;
    const requester = findParticipant(currentSnapshot, participantId);
    if (!requester) {
      socket.emit("room:error", { error: "participant_required" });
      return;
    }

    const currentGame = payload.currentGame ?? currentSnapshot.room.currentGame;
    let stateToPersist: unknown = restoreProtectedSecretFields(
      currentGame,
      currentSnapshot.room.state,
      payload.state ?? {},
      requester,
    );
    const authorizationError = validateStateUpdateAuthorization(currentSnapshot, requester, currentGame, stateToPersist);
    if (authorizationError) {
      socket.emit("room:error", { error: authorizationError });
      return;
    }
    stateToPersist = normalizeSyncedTimerState(currentGame, currentSnapshot.room.state, stateToPersist);

    const room = await updateRoomState(
      roomCode,
      stateToPersist,
      currentGame,
      readRoomStatusFromState(stateToPersist, currentGame),
    );
    if (!room) {
      socket.emit("room:error", { error: "room_not_found" });
      return;
    }

    await redis.set(`room:${room.code}:state`, JSON.stringify(room.state));
    await emitRoomSnapshot(room.code);
  });

  socket.on("disconnect", async () => {
    const participantId = socket.data.participantId as string | undefined;
    const roomCode = socket.data.roomCode as string | undefined;

    if (participantId) {
      await setParticipantConnected(participantId, false);
    }

    if (roomCode) {
      await emitRoomSnapshot(roomCode);
    }
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message === "room_closed") {
    response.status(409).json({ error: message });
    return;
  }
  if (message === "host_required") {
    response.status(403).json({ error: message });
    return;
  }
  if (message === "participant_not_found") {
    response.status(404).json({ error: message });
    return;
  }
  response.status(400).json({ error: message });
});

server.listen(config.port, () => {
  console.log(`Nomikai room server listening on ${config.port}`);
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function shutdown() {
  await Promise.allSettled([redis.quit(), pool.end()]);
  server.close(() => {
    process.exit(0);
  });
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field}_required`);
  }
  return value.trim();
}

function readRoomStatusFromState(stateValue: unknown, currentGame: string | null) {
  if (stateValue && typeof stateValue === "object") {
    const state = stateValue as { phase?: unknown };
    if (state.phase === "complete") return "complete";
    if (state.phase === "lobby") return "waiting";
  }
  return currentGame ? "playing" : "waiting";
}

function normalizeSyncedTimerState(currentGame: string | null, currentStateValue: unknown, nextStateValue: unknown) {
  const branchKey = getSyncedTimerBranchKey(currentGame);
  if (!branchKey) return nextStateValue;
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  const currentBranch = currentState ? asRecord(currentState[branchKey]) : null;
  const nextBranch = nextState ? asRecord(nextState[branchKey]) : null;
  if (!nextState || !nextBranch) return nextStateValue;

  const normalizedBranch = normalizeSyncedTimerBranch(currentBranch, nextBranch);
  if (normalizedBranch === nextBranch) return nextStateValue;
  return {
    ...nextState,
    [branchKey]: normalizedBranch,
  };
}

function getSyncedTimerBranchKey(currentGame: string | null) {
  if (currentGame === "werewolf-game") return "werewolf";
  if (currentGame === "word-wolf") return "wordWolf";
  if (currentGame === "ng-word") return "ngWord";
  return null;
}

function normalizeSyncedTimerBranch(currentBranch: Record<string, unknown> | null, nextBranch: Record<string, unknown>) {
  const currentRunning = currentBranch?.timerRunning === true;
  const nextRunning = nextBranch.timerRunning === true;
  const now = Date.now();

  if (nextRunning && !currentRunning) {
    const remainingSeconds = readNonnegativeInteger(nextBranch.remainingSeconds) ?? 0;
    return {
      ...nextBranch,
      remainingSeconds,
      timerRunning: remainingSeconds > 0,
      timerEndsAt: remainingSeconds > 0 ? new Date(now + remainingSeconds * 1000).toISOString() : null,
    };
  }

  if (!nextRunning && currentRunning) {
    return {
      ...nextBranch,
      remainingSeconds: readSyncedTimerRemaining(currentBranch, now),
      timerRunning: false,
      timerEndsAt: null,
    };
  }

  if (nextRunning && currentRunning) {
    const currentEndsAt = readString(currentBranch?.timerEndsAt);
    return currentEndsAt ? { ...nextBranch, timerEndsAt: currentEndsAt } : nextBranch;
  }

  if (nextBranch.timerEndsAt !== null && typeof nextBranch.timerEndsAt !== "undefined") {
    return { ...nextBranch, timerEndsAt: null };
  }

  return nextBranch;
}

function readSyncedTimerRemaining(branch: Record<string, unknown> | null, now = Date.now()) {
  const fallback = readNonnegativeInteger(branch?.remainingSeconds) ?? 0;
  if (!branch?.timerRunning || !branch.timerEndsAt) return fallback;
  const endTime = Date.parse(String(branch.timerEndsAt));
  if (!Number.isFinite(endTime)) return fallback;
  return Math.max(0, Math.ceil((endTime - now) / 1000));
}

type RoomSnapshot = NonNullable<Awaited<ReturnType<typeof findRoomByCode>>>;
type RoomParticipant = RoomSnapshot["participants"][number];

function findParticipant(snapshot: RoomSnapshot, participantId: string | null | undefined) {
  if (!participantId) return null;
  return snapshot.participants.find((participant) => participant.id === participantId) ?? null;
}

function isHostParticipant(snapshot: RoomSnapshot, participantId: string | null | undefined) {
  return findParticipant(snapshot, participantId)?.role === "host";
}

function isClosedRoom(snapshot: RoomSnapshot) {
  return snapshot.room.status === "closed";
}

function sanitizeRoomEvent(event: {
  id: string;
  roomId: string;
  participantId: string | null;
  participantName: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
}) {
  return {
    id: event.id,
    roomId: event.roomId,
    participantId: event.participantId,
    participantName: event.participantName,
    eventType: event.eventType,
    payload: summarizeRoomEventPayload(event.eventType, event.payload),
    createdAt: event.createdAt,
  };
}

function summarizeRoomEventPayload(eventType: string, value: unknown) {
  const payload = asRecord(value) ?? {};
  const state = asRecord(payload.state);
  const summary: Record<string, unknown> = {};

  copyStringField(summary, "status", payload.status);
  copyStringField(summary, "currentGame", payload.currentGame);
  copyStringField(summary, "gameKey", payload.gameKey ?? state?.gameKey ?? payload.currentGame);
  copyStringField(summary, "gameTitle", payload.gameTitle ?? state?.gameTitle);
  copyNumberField(summary, "step", payload.step ?? state?.step);
  copyStringField(summary, "message", payload.message ?? state?.message ?? defaultRoomEventMessage(eventType));
  copyStringField(summary, "targetParticipantId", payload.targetParticipantId);
  copyStringField(summary, "targetName", payload.targetName);
  copyStringField(summary, "promotedHostId", payload.promotedHostId);
  copyStringField(summary, "promotedHostName", payload.promotedHostName);
  copyStringField(summary, "hostName", payload.hostName);
  copyStringField(summary, "name", payload.name);

  return summary;
}

function copyStringField(target: Record<string, unknown>, key: string, value: unknown) {
  const text = readString(value);
  if (text) {
    target[key] = text;
  }
}

function copyNumberField(target: Record<string, unknown>, key: string, value: unknown) {
  const number = readFiniteNumber(value);
  if (number !== null) {
    target[key] = number;
  }
}

function defaultRoomEventMessage(eventType: string) {
  if (eventType === "room_created") return "ルームを作成しました";
  if (eventType === "participant_joined") return "参加者が入りました";
  if (eventType === "participant_removed") return "参加者を外しました";
  if (eventType === "host_transferred") return "ホストを交代しました";
  if (eventType === "game_started") return "ゲームを開始しました";
  if (eventType === "game_advanced") return "次の進行へ進みました";
  if (eventType === "game_completed") return "ゲームを完了しました";
  if (eventType === "game_reset") return "待機中に戻しました";
  if (eventType === "room_closed") return "ルームを終了しました";
  return null;
}

function validateStateUpdateAuthorization(
  snapshot: RoomSnapshot,
  requester: RoomParticipant,
  requestedGame: string | null,
  nextStateValue: unknown,
) {
  const activeGame = snapshot.room.currentGame;
  if (activeGame !== requestedGame) {
    return "game_mismatch";
  }
  if (requester.role === "host") {
    return null;
  }
  if (!activeGame) {
    return "host_required";
  }

  const currentState = readProgressState(snapshot.room.state, activeGame);
  const nextState = readProgressState(nextStateValue, requestedGame);
  if (nextState.updatedBy !== requester.id) {
    return "participant_update_mismatch";
  }
  if (currentState.gameKey !== nextState.gameKey || currentState.gameTitle !== nextState.gameTitle) {
    return "host_required";
  }
  return validateParticipantScopedStateChange(activeGame, snapshot.room.state, nextStateValue, requester.id, {
    current: currentState,
    next: nextState,
    phaseOrStepChanged: currentState.phase !== nextState.phase || currentState.step !== nextState.step,
  });
}

function validateParticipantScopedStateChange(
  activeGame: string,
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
  progress: ParticipantProgressChange,
) {
  switch (activeGame) {
    case "werewolf-game":
      return validateWerewolfParticipantVoteChange(currentStateValue, nextStateValue, requesterId, progress);
    case "word-wolf":
      return validateWordWolfParticipantVoteChange(currentStateValue, nextStateValue, requesterId, progress);
    case "ng-word":
      return validateNgWordPenaltyChange(currentStateValue, nextStateValue, progress);
    case "two-choice":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateOwnedMapBranchChange(currentStateValue, nextStateValue, "twoChoice", requesterId, ["votes"]);
    case "impression-ranking":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateOwnedMapBranchChange(currentStateValue, nextStateValue, "impression", requesterId, ["votes"]);
    case "majority-game":
    case "large-majority-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateOwnedMapChange(currentStateValue, nextStateValue, activeGame, requesterId, ["votes"]);
    case "reverse-word-game":
    case "loanword-ban-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateTurnResultChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "song-association-quiz":
    case "drawing-quiz":
    case "memory-logo-drawing":
    case "weird-karuta-game":
    case "emo-hint-game":
    case "person-hint-quiz":
    case "humming-intro-quiz":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateGuessGameChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "truth-lie-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateTruthLieChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "value-meter-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateValueMeterChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "typing-speed-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateTypingChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "acting-phrase-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateActingChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "count-up-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateCountUpChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "hazard-card-game":
    case "safe-random-draw":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateDrawChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "party-sugoroku":
    case "life-event-sugoroku":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateSugorokuChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "territory-board-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateTerritoryChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "resource-negotiation-game":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateResourceChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "arm-wrestling-tournament":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateUrlCandidateTournamentChange(currentStateValue, nextStateValue, activeGame, requesterId);
    case "yamanote":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateYamanoteParticipantChange(currentStateValue, nextStateValue, requesterId);
    case "party-pack":
      if (progress.phaseOrStepChanged) return "host_required";
      return validatePartyPackParticipantChange(currentStateValue, nextStateValue, requesterId);
    case "johari-window":
      return validateJohariParticipantChange(currentStateValue, nextStateValue, requesterId, progress);
    case "turtle-soup":
      return validateTurtleSoupParticipantChange(currentStateValue, nextStateValue, requesterId, progress);
    case "anonymous-box":
      if (progress.phaseOrStepChanged) return "host_required";
      return validateAnonymousQuestionSubmission(currentStateValue, nextStateValue);
    default:
      return progress.phaseOrStepChanged ? "host_required" : null;
  }
}

type ParticipantProgressChange = {
  current: Omit<ProgressState, "updatedAt">;
  next: Omit<ProgressState, "updatedAt">;
  phaseOrStepChanged: boolean;
};

function validateWerewolfParticipantVoteChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
  progress: ParticipantProgressChange,
) {
  const branchChange = readSingleBranchChange(currentStateValue, nextStateValue, "werewolf");
  if ("error" in branchChange) return branchChange.error;

  const expectedState = buildWerewolfParticipantVoteState(branchChange.currentState, branchChange.nextState, requesterId);
  const expectedBranch = expectedState ? asRecord(expectedState.werewolf) : null;
  if (!expectedState || !expectedBranch || !isDeepEqual(branchChange.nextBranch, expectedBranch)) {
    return "participant_field_forbidden";
  }

  const expectedProgress = readProgressState(expectedState, "werewolf-game");
  if (progress.next.phase !== expectedProgress.phase || progress.next.step !== expectedProgress.step) {
    return "host_required";
  }

  return null;
}

function validateWordWolfParticipantVoteChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
  progress: ParticipantProgressChange,
) {
  const branchChange = readSingleBranchChange(currentStateValue, nextStateValue, "wordWolf");
  if ("error" in branchChange) return branchChange.error;

  const expectedState = buildWordWolfParticipantVoteState(branchChange.currentState, branchChange.nextState, requesterId);
  const expectedBranch = expectedState ? asRecord(expectedState.wordWolf) : null;
  if (!expectedState || !expectedBranch || !isDeepEqual(branchChange.nextBranch, expectedBranch)) {
    return "participant_field_forbidden";
  }

  const expectedProgress = readProgressState(expectedState, "word-wolf");
  if (progress.next.phase !== expectedProgress.phase || progress.next.step !== expectedProgress.step) {
    return "host_required";
  }

  return null;
}

function validateNgWordPenaltyChange(currentStateValue: unknown, nextStateValue: unknown, progress: ParticipantProgressChange) {
  if (progress.phaseOrStepChanged) return "host_required";

  const branchChange = readSingleBranchChange(currentStateValue, nextStateValue, "ngWord");
  if ("error" in branchChange) return branchChange.error;
  if (branchChange.currentBranch.step !== "play" || branchChange.nextBranch.step !== "play") {
    return "host_required";
  }

  const currentWithoutAssignments = { ...branchChange.currentBranch };
  const nextWithoutAssignments = { ...branchChange.nextBranch };
  delete currentWithoutAssignments.assignments;
  delete nextWithoutAssignments.assignments;
  if (!isDeepEqual(currentWithoutAssignments, nextWithoutAssignments)) {
    return "participant_field_forbidden";
  }

  const currentAssignments = readRecordArray(branchChange.currentBranch.assignments);
  const nextAssignments = readRecordArray(branchChange.nextBranch.assignments);
  if (currentAssignments.length === 0 || currentAssignments.length !== nextAssignments.length) {
    return "participant_field_forbidden";
  }

  let incrementCount = 0;
  for (const currentAssignment of currentAssignments) {
    const playerId = readString(currentAssignment.playerId);
    const nextAssignment = playerId ? nextAssignments.find((assignment) => assignment.playerId === playerId) : null;
    if (!playerId || !nextAssignment) {
      return "participant_field_forbidden";
    }

    const currentPenalty = readFiniteNumber(currentAssignment.penaltyCount);
    const nextPenalty = readFiniteNumber(nextAssignment.penaltyCount);
    if (currentPenalty === null || nextPenalty === null) {
      return "participant_field_forbidden";
    }

    const expectedSame = { ...currentAssignment, penaltyCount: nextPenalty };
    if (!isDeepEqual(nextAssignment, expectedSame)) {
      return "participant_field_forbidden";
    }

    if (nextPenalty === currentPenalty + 1) {
      incrementCount += 1;
    } else if (nextPenalty !== currentPenalty) {
      return "participant_field_forbidden";
    }
  }

  return incrementCount === 1 ? null : "participant_field_forbidden";
}

function readSingleBranchChange(currentStateValue: unknown, nextStateValue: unknown, branchKey: string) {
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  if (!currentState || !nextState) return { error: "participant_field_forbidden" as const };

  const changedTopLevelKeys = getChangedKeys(currentState, nextState).filter((key) => !progressStateKeys.has(key));
  if (changedTopLevelKeys.length !== 1 || changedTopLevelKeys[0] !== branchKey) {
    return { error: "participant_field_forbidden" as const };
  }

  const currentBranch = asRecord(currentState[branchKey]);
  const nextBranch = asRecord(nextState[branchKey]);
  if (!currentBranch || !nextBranch) return { error: "participant_field_forbidden" as const };

  return { currentState, nextState, currentBranch, nextBranch };
}

function buildWordWolfParticipantVoteState(
  currentState: Record<string, unknown>,
  requestedState: Record<string, unknown>,
  requesterId: string,
) {
  const currentBranch = asRecord(currentState.wordWolf);
  const requestedBranch = asRecord(requestedState.wordWolf);
  if (!currentBranch || !requestedBranch || currentBranch.step !== "vote") return null;

  const playerIds = readRecordArray(currentBranch.players).map((player) => readString(player.id)).filter(isString);
  const currentVoteIndex = readFiniteNumber(currentBranch.voteIndex);
  if (currentVoteIndex === null || playerIds[currentVoteIndex] !== requesterId) return null;

  const voteTargetId = readSingleOwnedVoteTarget(currentBranch.votes, requestedBranch.votes, requesterId);
  if (!voteTargetId || voteTargetId === requesterId || !playerIds.includes(voteTargetId)) return null;

  const expectedBranch = cloneJson(currentBranch) as Record<string, unknown>;
  expectedBranch.votes = { ...(asRecord(currentBranch.votes) ?? {}), [requesterId]: voteTargetId };
  const isFinalVote = currentVoteIndex + 1 >= playerIds.length;
  if (isFinalVote) {
    expectedBranch.step = "result";
  } else {
    expectedBranch.voteIndex = currentVoteIndex + 1;
  }

  return buildPreparedParticipantRoomState({
    currentState,
    requestedState,
    branchKey: "wordWolf",
    branch: expectedBranch,
    gameKey: "word-wolf",
    phase: isFinalVote ? "complete" : "playing",
    step: isFinalVote ? 5 : 4,
    requesterId,
  });
}

function buildWerewolfParticipantVoteState(
  currentState: Record<string, unknown>,
  requestedState: Record<string, unknown>,
  requesterId: string,
) {
  const currentBranch = asRecord(currentState.werewolf);
  const requestedBranch = asRecord(requestedState.werewolf);
  if (!currentBranch || !requestedBranch || currentBranch.phase !== "vote") return null;

  const players = readRecordArray(currentBranch.players);
  const assignments = readRecordArray(currentBranch.assignments);
  const alivePlayerIds = getAliveWerewolfPlayerIds(players, assignments);
  const currentVoteIndex = readFiniteNumber(currentBranch.voteIndex);
  if (currentVoteIndex === null || alivePlayerIds[currentVoteIndex] !== requesterId) return null;

  const voteTargetId = readSingleOwnedVoteTarget(currentBranch.votes, requestedBranch.votes, requesterId);
  if (!voteTargetId || voteTargetId === requesterId || !alivePlayerIds.includes(voteTargetId)) return null;

  const expectedBranch = cloneJson(currentBranch) as Record<string, unknown>;
  const expectedVotes = { ...(asRecord(currentBranch.votes) ?? {}), [requesterId]: voteTargetId };
  expectedBranch.votes = expectedVotes;

  const isFinalVote = currentVoteIndex + 1 >= alivePlayerIds.length;
  if (!isFinalVote) {
    expectedBranch.voteIndex = currentVoteIndex + 1;
    return buildPreparedParticipantRoomState({
      currentState,
      requestedState,
      branchKey: "werewolf",
      branch: expectedBranch,
      gameKey: "werewolf-game",
      phase: "playing",
      step: 5,
      requesterId,
    });
  }

  const tally = tallyTargets(expectedVotes, alivePlayerIds);
  expectedBranch.timerRunning = false;
  if (tally.topTargetIds.length !== 1) {
    expectedBranch.phase = "voteResult";
    expectedBranch.tiedTargetIds = tally.topTargetIds;
    expectedBranch.lastExecutedId = null;
    expectedBranch.actionLog = buildWerewolfActionLog(`同票です。${tally.maxVotes}票で並びました。`, currentBranch.actionLog);
    return buildPreparedParticipantRoomState({
      currentState,
      requestedState,
      branchKey: "werewolf",
      branch: expectedBranch,
      gameKey: "werewolf-game",
      phase: "playing",
      step: 6,
      requesterId,
    });
  }

  const executedId = tally.topTargetIds[0];
  const nextAssignments = markWerewolfAssignmentDead(assignments, executedId);
  const executedName = getPlayerName(players, executedId);
  const outcome = getWerewolfServerOutcome(nextAssignments);
  const actionMessage = `${executedName}さんを追放しました。`;
  expectedBranch.assignments = nextAssignments;
  expectedBranch.tiedTargetIds = [];
  expectedBranch.lastExecutedId = executedId;
  expectedBranch.actionLog = buildWerewolfActionLog(actionMessage, currentBranch.actionLog);

  if (outcome) {
    expectedBranch.phase = "result";
    expectedBranch.winner = outcome.winner;
    expectedBranch.resultReason = `${actionMessage}${outcome.reason}`;
    return buildPreparedParticipantRoomState({
      currentState,
      requestedState,
      branchKey: "werewolf",
      branch: expectedBranch,
      gameKey: "werewolf-game",
      phase: "complete",
      step: 7,
      requesterId,
    });
  }

  expectedBranch.phase = "voteResult";
  return buildPreparedParticipantRoomState({
    currentState,
    requestedState,
    branchKey: "werewolf",
    branch: expectedBranch,
    gameKey: "werewolf-game",
    phase: "playing",
    step: 6,
    requesterId,
  });
}

function buildPreparedParticipantRoomState(input: {
  currentState: Record<string, unknown>;
  requestedState: Record<string, unknown>;
  branchKey: string;
  branch: Record<string, unknown>;
  gameKey: string;
  phase: "playing" | "complete";
  step: number;
  requesterId: string;
}) {
  const preparedState = cloneJson(input.requestedState) as Record<string, unknown>;
  preparedState[input.branchKey] = input.branch;
  preparedState.phase = input.phase;
  preparedState.gameKey = input.gameKey;
  preparedState.gameTitle = typeof input.currentState.gameTitle === "string" ? input.currentState.gameTitle : input.gameKey;
  preparedState.step = input.step;
  preparedState.updatedBy = input.requesterId;
  preparedState.updatedAt = typeof input.requestedState.updatedAt === "string" ? input.requestedState.updatedAt : new Date().toISOString();
  return preparedState;
}

function readSingleOwnedVoteTarget(currentVotesValue: unknown, nextVotesValue: unknown, requesterId: string) {
  const currentVotes = asRecord(currentVotesValue) ?? {};
  const nextVotes = asRecord(nextVotesValue) ?? {};
  const changedVoteKeys = getChangedKeys(currentVotes, nextVotes);
  if (changedVoteKeys.length !== 1 || changedVoteKeys[0] !== requesterId) return null;
  return readString(nextVotes[requesterId]);
}

function getAliveWerewolfPlayerIds(players: Record<string, unknown>[], assignments: Record<string, unknown>[]) {
  const aliveByPlayerId = new Map<string, boolean>();
  for (const assignment of assignments) {
    const playerId = readString(assignment.playerId);
    if (playerId) {
      aliveByPlayerId.set(playerId, assignment.alive === true);
    }
  }
  return players
    .map((player) => readString(player.id))
    .filter((playerId): playerId is string => typeof playerId === "string" && aliveByPlayerId.get(playerId) === true);
}

function tallyTargets(votes: Record<string, unknown>, targetIds: string[]) {
  const rows = targetIds.map((targetId) => ({
    targetId,
    count: Object.values(votes).filter((voteTargetId) => voteTargetId === targetId).length,
  }));
  const maxVotes = Math.max(0, ...rows.map((row) => row.count));
  return {
    maxVotes,
    topTargetIds: rows.filter((row) => row.count === maxVotes && maxVotes > 0).map((row) => row.targetId),
  };
}

function markWerewolfAssignmentDead(assignments: Record<string, unknown>[], playerId: string) {
  return assignments.map((assignment) =>
    assignment.playerId === playerId ? { ...assignment, alive: false } : assignment,
  );
}

function getWerewolfServerOutcome(assignments: Record<string, unknown>[]) {
  const alive = assignments.filter((assignment) => assignment.alive === true);
  const werewolves = alive.filter((assignment) => assignment.role === "werewolf").length;
  const villagers = alive.length - werewolves;
  if (werewolves === 0) {
    return { winner: "village", reason: "人狼を全員追放しました。" };
  }
  if (werewolves >= villagers) {
    return { winner: "werewolves", reason: "人狼の数が村人側以上になりました。" };
  }
  return null;
}

function buildWerewolfActionLog(message: string, currentLogValue: unknown) {
  const currentLog = Array.isArray(currentLogValue)
    ? currentLogValue.filter((item): item is string => typeof item === "string")
    : [];
  return [message, ...currentLog].slice(0, 10);
}

function getPlayerName(players: Record<string, unknown>[], playerId: string) {
  return players.find((player) => player.id === playerId && typeof player.name === "string")?.name ?? "該当者なし";
}

function readRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isString(value: string | null): value is string {
  return Boolean(value);
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNonnegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

const progressStateKeys = new Set(["phase", "gameKey", "gameTitle", "step", "message", "updatedBy", "updatedAt"]);

function validateOwnedMapBranchChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  branchKey: string,
  requesterId: string,
  mapKeys: string[],
) {
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  if (!currentState || !nextState) return "participant_field_forbidden";

  const changedTopLevelKeys = getChangedKeys(currentState, nextState).filter((key) => !progressStateKeys.has(key));
  if (changedTopLevelKeys.length !== 1 || changedTopLevelKeys[0] !== branchKey) {
    return "participant_field_forbidden";
  }

  const currentBranch = asRecord(currentState[branchKey]);
  const nextBranch = asRecord(nextState[branchKey]);
  if (!currentBranch || !nextBranch) return "participant_field_forbidden";

  const allowedMapKeys = new Set(mapKeys);
  const changedBranchKeys = getChangedKeys(currentBranch, nextBranch);
  if (changedBranchKeys.length === 0 || changedBranchKeys.some((key) => !allowedMapKeys.has(key))) {
    return "participant_field_forbidden";
  }

  for (const mapKey of changedBranchKeys) {
    const currentMap = asRecord(currentBranch[mapKey]) ?? {};
    const nextMap = asRecord(nextBranch[mapKey]) ?? {};
    const changedParticipantKeys = getChangedKeys(currentMap, nextMap);
    if (changedParticipantKeys.length === 0 || changedParticipantKeys.some((key) => key !== requesterId)) {
      return "participant_field_forbidden";
    }
  }

  return null;
}

function validateUrlCandidateOwnedMapChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
  mapKeys: string[],
) {
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  if (!currentState || !nextState) return "participant_field_forbidden";

  const currentBranch = currentState ? asRecord(currentState.urlCandidate) : null;
  const nextBranch = nextState ? asRecord(nextState.urlCandidate) : null;
  if (!currentBranch || !nextBranch || currentBranch.key !== gameKey || nextBranch.key !== gameKey) {
    return "participant_field_forbidden";
  }

  const changedTopLevelKeys = getChangedKeys(currentState, nextState).filter((key) => !progressStateKeys.has(key));
  if (changedTopLevelKeys.length !== 1 || changedTopLevelKeys[0] !== "urlCandidate") {
    return "participant_field_forbidden";
  }

  const changedUrlCandidateKeys = getChangedKeys(currentBranch, nextBranch);
  if (changedUrlCandidateKeys.length !== 1 || changedUrlCandidateKeys[0] !== "state") {
    return "participant_field_forbidden";
  }

  return validateOwnedStateMaps(currentBranch.state, nextBranch.state, requesterId, mapKeys);
}

function validateOwnedStateMaps(currentValue: unknown, nextValue: unknown, requesterId: string, mapKeys: string[]) {
  const currentState = asRecord(currentValue);
  const nextState = asRecord(nextValue);
  if (!currentState || !nextState) return "participant_field_forbidden";

  const allowedMapKeys = new Set(mapKeys);
  const changedKeys = getChangedKeys(currentState, nextState);
  if (changedKeys.length === 0 || changedKeys.some((key) => !allowedMapKeys.has(key))) {
    return "participant_field_forbidden";
  }

  for (const mapKey of changedKeys) {
    const currentMap = asRecord(currentState[mapKey]) ?? {};
    const nextMap = asRecord(nextState[mapKey]) ?? {};
    const changedParticipantKeys = getChangedKeys(currentMap, nextMap);
    if (changedParticipantKeys.length === 0 || changedParticipantKeys.some((key) => key !== requesterId)) {
      return "participant_field_forbidden";
    }
  }

  return null;
}

function validateUrlCandidateGuessGameChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);

  if (isOnlyChangedKeys(changedKeys, ["guesses"])) {
    if (requesterId === currentPlayerId) return "participant_field_forbidden";
    return validateOwnedStateMaps(change.currentInnerState, change.nextInnerState, requesterId, ["guesses"]);
  }

  if (requesterId === currentPlayerId && validateUrlCandidateJudgeChange(change.currentInnerState, change.nextInnerState)) {
    return null;
  }

  return "participant_field_forbidden";
}

function validateUrlCandidateTruthLieChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);

  if (requesterId !== currentPlayerId && isOnlyChangedKeys(changedKeys, ["votes"])) {
    return validateOwnedStateMaps(change.currentInnerState, change.nextInnerState, requesterId, ["votes"]);
  }

  if (requesterId === currentPlayerId && validateUrlCandidateOwnerAnswerChange(change.currentInnerState, change.nextInnerState, "truthLieAnswer")) {
    return null;
  }

  return "participant_field_forbidden";
}

function validateUrlCandidateValueMeterChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";
  return validateOwnedStateMaps(change.currentInnerState, change.nextInnerState, requesterId, ["guesses", "votes"]);
}

function validateUrlCandidateTypingChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  if (isOnlyChangedKeys(changedKeys, ["guesses"])) {
    return validateOwnedStateMaps(change.currentInnerState, change.nextInnerState, requesterId, ["guesses"]);
  }
  if (validateUrlCandidateSelfCorrectChange(change.currentInnerState, change.nextInnerState, requesterId)) {
    return null;
  }

  return "participant_field_forbidden";
}

function validateUrlCandidateActingChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);

  if (requesterId !== currentPlayerId && isOnlyChangedKeys(changedKeys, ["votes"])) {
    return validateOwnedStateMaps(change.currentInnerState, change.nextInnerState, requesterId, ["votes"]);
  }

  if (requesterId === currentPlayerId && validateUrlCandidateOwnerAnswerChange(change.currentInnerState, change.nextInnerState, "actingEmotion")) {
    return null;
  }

  return "participant_field_forbidden";
}

function validateUrlCandidateTurnResultChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";
  return validateUrlCandidateTurnRecord(change.currentInnerState, change.nextInnerState, requesterId)
    ? null
    : "participant_field_forbidden";
}

function validateUrlCandidateCountUpChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  const allowedKeys = ["numberValue", "currentPlayerIndex", "safeCounts", "missCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return "participant_field_forbidden";
  if (!changedKeys.includes("numberValue") || !changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 1)) return "participant_field_forbidden";
  if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";

  const currentNumber = readNonnegativeInteger(change.currentInnerState.numberValue);
  const nextNumber = readNonnegativeInteger(change.nextInnerState.numberValue);
  if (currentNumber === null || nextNumber === null || nextNumber <= currentNumber || nextNumber - currentNumber > 3) {
    return "participant_field_forbidden";
  }

  const hasSafeChange = changedKeys.includes("safeCounts");
  const hasMissChange = changedKeys.includes("missCounts");
  if (hasSafeChange === hasMissChange) return "participant_field_forbidden";
  if (hasSafeChange && !validateScoreIncrement(change.currentInnerState.safeCounts, change.nextInnerState.safeCounts, requesterId)) {
    return "participant_field_forbidden";
  }
  if (hasMissChange && !validateScoreIncrement(change.currentInnerState.missCounts, change.nextInnerState.missCounts, requesterId)) {
    return "participant_field_forbidden";
  }

  return null;
}

function validateUrlCandidateDrawChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  const allowedKeys = ["drawnCount", "currentPlayerIndex", "safeCounts", "missCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return "participant_field_forbidden";
  if (!changedKeys.includes("drawnCount") || !changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 1)) return "participant_field_forbidden";
  if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";

  const currentDrawnCount = readNonnegativeInteger(change.currentInnerState.drawnCount);
  const nextDrawnCount = readNonnegativeInteger(change.nextInnerState.drawnCount);
  const hazardIndex = readNonnegativeInteger(change.currentInnerState.hazardIndex);
  if (currentDrawnCount === null || nextDrawnCount !== currentDrawnCount + 1 || nextDrawnCount > 8 || hazardIndex === null) {
    return "participant_field_forbidden";
  }

  const shouldMiss = nextDrawnCount === hazardIndex;
  const hasSafeChange = changedKeys.includes("safeCounts");
  const hasMissChange = changedKeys.includes("missCounts");
  if (shouldMiss) {
    if (hasSafeChange || !hasMissChange) return "participant_field_forbidden";
    return validateScoreIncrement(change.currentInnerState.missCounts, change.nextInnerState.missCounts, requesterId)
      ? null
      : "participant_field_forbidden";
  }
  if (!hasSafeChange || hasMissChange) return "participant_field_forbidden";
  return validateScoreIncrement(change.currentInnerState.safeCounts, change.nextInnerState.safeCounts, requesterId)
    ? null
    : "participant_field_forbidden";
}

function validateUrlCandidateSugorokuChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  const allowedKeys = ["positions", "currentPlayerIndex", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return "participant_field_forbidden";
  if (!changedKeys.includes("positions") || !changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 1)) return "participant_field_forbidden";
  if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";
  if (!validateSingleOwnedNumberDelta(change.currentInnerState.positions, change.nextInnerState.positions, requesterId, 1, 6)) {
    return "participant_field_forbidden";
  }
  return null;
}

function validateUrlCandidateTerritoryChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  const allowedKeys = ["territory", "currentPlayerIndex", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return "participant_field_forbidden";
  if (!changedKeys.includes("territory") || !changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 1)) return "participant_field_forbidden";
  if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";

  const currentTerritory = asRecord(change.currentInnerState.territory) ?? {};
  const nextTerritory = asRecord(change.nextInnerState.territory) ?? {};
  const changedCells = getChangedKeys(currentTerritory, nextTerritory);
  if (changedCells.length !== 1) return "participant_field_forbidden";
  const cell = readNonnegativeInteger(Number(changedCells[0]));
  if (cell === null || cell > 24 || typeof currentTerritory[changedCells[0]] !== "undefined") return "participant_field_forbidden";
  return nextTerritory[changedCells[0]] === requesterId ? null : "participant_field_forbidden";
}

function validateUrlCandidateResourceChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  if (isOnlyChangedKeys(changedKeys, ["resourceCounts", "actionLog"]) && changedKeys.includes("resourceCounts") && changedKeys.includes("actionLog")) {
    if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";
    return validateSingleOwnedNumberDelta(change.currentInnerState.resourceCounts, change.nextInnerState.resourceCounts, requesterId, -1, 1)
      ? null
      : "participant_field_forbidden";
  }

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";
  if (!isOnlyChangedKeys(changedKeys, ["currentPlayerIndex", "actionLog"]) || !changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 1)) return "participant_field_forbidden";
  return validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)
    ? null
    : "participant_field_forbidden";
}

function validateUrlCandidateTournamentChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  gameKey: string,
  requesterId: string,
) {
  const change = readUrlCandidateStateChange(currentStateValue, nextStateValue, gameKey);
  if ("error" in change) return change.error;
  if (change.currentInnerState.step !== "play" || change.nextInnerState.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentInnerState);
  const secondPlayerId = getUrlCandidateOffsetPlayerId(change.currentInnerState, 1);
  if (requesterId !== currentPlayerId && requesterId !== secondPlayerId) return "participant_field_forbidden";

  const changedKeys = getChangedKeys(change.currentInnerState, change.nextInnerState);
  const allowedKeys = ["currentPlayerIndex", "completedPairs", "scoreCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return "participant_field_forbidden";
  if (!changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("completedPairs") || !changedKeys.includes("scoreCounts") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validateAdvancedPlayerIndex(change.currentInnerState, change.nextInnerState, 2)) return "participant_field_forbidden";
  if (!validatePrependedActionLog(change.currentInnerState.actionLog, change.nextInnerState.actionLog)) return "participant_field_forbidden";

  const currentCompletedPairs = readNonnegativeInteger(change.currentInnerState.completedPairs);
  const nextCompletedPairs = readNonnegativeInteger(change.nextInnerState.completedPairs);
  if (currentCompletedPairs === null || nextCompletedPairs !== currentCompletedPairs + 1) return "participant_field_forbidden";

  const currentScores = asRecord(change.currentInnerState.scoreCounts) ?? {};
  const nextScores = asRecord(change.nextInnerState.scoreCounts) ?? {};
  const changedScoreKeys = getChangedKeys(currentScores, nextScores);
  if (changedScoreKeys.length !== 1) return "participant_field_forbidden";
  const winnerId = changedScoreKeys[0];
  if (winnerId !== currentPlayerId && winnerId !== secondPlayerId) return "participant_field_forbidden";
  return validateScoreIncrement(change.currentInnerState.scoreCounts, change.nextInnerState.scoreCounts, winnerId)
    ? null
    : "participant_field_forbidden";
}

function readUrlCandidateStateChange(currentStateValue: unknown, nextStateValue: unknown, gameKey: string) {
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  if (!currentState || !nextState) return { error: "participant_field_forbidden" as const };

  const changedTopLevelKeys = getChangedKeys(currentState, nextState).filter((key) => !progressStateKeys.has(key));
  if (changedTopLevelKeys.length !== 1 || changedTopLevelKeys[0] !== "urlCandidate") {
    return { error: "participant_field_forbidden" as const };
  }

  const currentBranch = asRecord(currentState.urlCandidate);
  const nextBranch = asRecord(nextState.urlCandidate);
  if (!currentBranch || !nextBranch || currentBranch.key !== gameKey || nextBranch.key !== gameKey) {
    return { error: "participant_field_forbidden" as const };
  }

  const changedBranchKeys = getChangedKeys(currentBranch, nextBranch);
  if (changedBranchKeys.length !== 1 || changedBranchKeys[0] !== "state") {
    return { error: "participant_field_forbidden" as const };
  }

  const currentInnerState = asRecord(currentBranch.state);
  const nextInnerState = asRecord(nextBranch.state);
  if (!currentInnerState || !nextInnerState) return { error: "participant_field_forbidden" as const };

  return { currentState, nextState, currentBranch, nextBranch, currentInnerState, nextInnerState };
}

function validateUrlCandidateJudgeChange(currentState: Record<string, unknown>, nextState: Record<string, unknown>) {
  const changedKeys = getChangedKeys(currentState, nextState);
  const allowedKeys = ["answerVisible", "votes", "scoreCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return false;
  if (!validateAnswerVisibleChange(currentState.answerVisible, nextState.answerVisible)) return false;
  if (!validatePrependedActionLog(currentState.actionLog, nextState.actionLog)) return false;

  const currentVotes = asRecord(currentState.votes) ?? {};
  const nextVotes = asRecord(nextState.votes) ?? {};
  const changedVoteKeys = getChangedKeys(currentVotes, nextVotes);
  if (changedVoteKeys.length === 0) {
    if (currentState.answerVisible === true || nextState.answerVisible !== true) return false;
    return getChangedKeys(asRecord(currentState.scoreCounts) ?? {}, asRecord(nextState.scoreCounts) ?? {}).length === 0;
  }
  if (changedVoteKeys.length !== 1) return false;
  if (currentState.answerVisible !== true && nextState.answerVisible !== true) return false;

  const judgedPlayerId = changedVoteKeys[0];
  if (nextVotes[judgedPlayerId] !== "correct") return false;
  return validateScoreIncrement(currentState.scoreCounts, nextState.scoreCounts, judgedPlayerId);
}

function validateUrlCandidateOwnerAnswerChange(currentState: Record<string, unknown>, nextState: Record<string, unknown>, answerKey: string) {
  const changedKeys = getChangedKeys(currentState, nextState);
  if (isOnlyChangedKeys(changedKeys, ["guesses"])) {
    return validateSpecialGuessChange(currentState.guesses, nextState.guesses, answerKey);
  }
  const allowedKeys = ["answerVisible", "scoreCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return false;
  if (currentState.answerVisible === true || nextState.answerVisible !== true) return false;
  if (!validatePrependedActionLog(currentState.actionLog, nextState.actionLog)) return false;

  const answerChoice = readString((asRecord(currentState.guesses) ?? {})[answerKey]);
  if (!answerChoice) return false;
  return validateScoreIncrementsForCorrectVotes(currentState.votes, currentState.scoreCounts, nextState.scoreCounts, answerChoice);
}

function validateUrlCandidateSelfCorrectChange(currentState: Record<string, unknown>, nextState: Record<string, unknown>, requesterId: string) {
  const changedKeys = getChangedKeys(currentState, nextState);
  if (!changedKeys.every((key) => ["votes", "scoreCounts", "actionLog"].includes(key))) return false;
  if (!validatePrependedActionLog(currentState.actionLog, nextState.actionLog)) return false;

  const currentVotes = asRecord(currentState.votes) ?? {};
  const nextVotes = asRecord(nextState.votes) ?? {};
  const changedVoteKeys = getChangedKeys(currentVotes, nextVotes);
  if (changedVoteKeys.length !== 1 || changedVoteKeys[0] !== requesterId || nextVotes[requesterId] !== "correct") return false;
  return validateScoreIncrement(currentState.scoreCounts, nextState.scoreCounts, requesterId);
}

function validateSpecialGuessChange(currentValue: unknown, nextValue: unknown, key: string) {
  const currentMap = asRecord(currentValue) ?? {};
  const nextMap = asRecord(nextValue) ?? {};
  const changedKeys = getChangedKeys(currentMap, nextMap);
  return changedKeys.length === 1 && changedKeys[0] === key && typeof nextMap[key] === "string";
}

function validateAnswerVisibleChange(currentValue: unknown, nextValue: unknown) {
  return currentValue === nextValue || (nextValue === true && currentValue !== true);
}

function validatePrependedActionLog(currentValue: unknown, nextValue: unknown) {
  const currentLog = Array.isArray(currentValue) ? currentValue.filter((item): item is string => typeof item === "string") : [];
  const nextLog = Array.isArray(nextValue) ? nextValue.filter((item): item is string => typeof item === "string") : [];
  if (currentLog.length === 0 && nextLog.length === 0) return true;
  if (nextLog.length !== Math.min(currentLog.length + 1, 8)) return false;
  return currentLog.slice(0, 7).every((item, index) => nextLog[index + 1] === item);
}

function validateScoreIncrement(currentValue: unknown, nextValue: unknown, playerId: string) {
  const currentScores = asRecord(currentValue) ?? {};
  const nextScores = asRecord(nextValue) ?? {};
  const changedScoreKeys = getChangedKeys(currentScores, nextScores);
  if (changedScoreKeys.length !== 1 || changedScoreKeys[0] !== playerId) return false;
  return readFiniteNumber(nextScores[playerId]) === (readFiniteNumber(currentScores[playerId]) ?? 0) + 1;
}

function validateScoreIncrementsForCorrectVotes(
  votesValue: unknown,
  currentScoresValue: unknown,
  nextScoresValue: unknown,
  answerChoice: string,
) {
  const votes = asRecord(votesValue) ?? {};
  const currentScores = asRecord(currentScoresValue) ?? {};
  const nextScores = asRecord(nextScoresValue) ?? {};
  const changedScoreKeys = getChangedKeys(currentScores, nextScores);
  const expectedScoreKeys = Object.entries(votes)
    .filter(([, vote]) => vote === answerChoice)
    .map(([playerId]) => playerId);
  if (changedScoreKeys.length !== expectedScoreKeys.length) return false;
  return expectedScoreKeys.every(
    (playerId) =>
      changedScoreKeys.includes(playerId) &&
      readFiniteNumber(nextScores[playerId]) === (readFiniteNumber(currentScores[playerId]) ?? 0) + 1,
  );
}

function getUrlCandidateCurrentPlayerId(state: Record<string, unknown>) {
  const players = readRecordArray(state.players);
  const currentPlayerIndex = readFiniteNumber(state.currentPlayerIndex) ?? 0;
  const currentPlayer = players[currentPlayerIndex % Math.max(1, players.length)] ?? null;
  return currentPlayer ? readString(currentPlayer.id) : null;
}

function getUrlCandidateOffsetPlayerId(state: Record<string, unknown>, offset: number) {
  const players = readRecordArray(state.players);
  if (players.length === 0) return null;
  const currentPlayerIndex = readNonnegativeInteger(state.currentPlayerIndex) ?? 0;
  const player = players[(currentPlayerIndex + offset) % players.length] ?? null;
  return player ? readString(player.id) : null;
}

function validateUrlCandidateTurnRecord(currentState: Record<string, unknown>, nextState: Record<string, unknown>, playerId: string) {
  const changedKeys = getChangedKeys(currentState, nextState);
  const allowedKeys = ["currentPlayerIndex", "safeCounts", "missCounts", "actionLog"];
  if (!changedKeys.every((key) => allowedKeys.includes(key))) return false;
  if (!changedKeys.includes("currentPlayerIndex") || !changedKeys.includes("actionLog")) return false;
  if (!validateAdvancedPlayerIndex(currentState, nextState, 1)) return false;
  if (!validatePrependedActionLog(currentState.actionLog, nextState.actionLog)) return false;

  const hasSafeChange = changedKeys.includes("safeCounts");
  const hasMissChange = changedKeys.includes("missCounts");
  if (hasSafeChange && hasMissChange) return false;
  if (hasSafeChange) return validateScoreIncrement(currentState.safeCounts, nextState.safeCounts, playerId);
  if (hasMissChange) return validateScoreIncrement(currentState.missCounts, nextState.missCounts, playerId);
  return true;
}

function validateAdvancedPlayerIndex(currentState: Record<string, unknown>, nextState: Record<string, unknown>, offset: number) {
  const players = readRecordArray(currentState.players);
  const currentPlayerIndex = readNonnegativeInteger(currentState.currentPlayerIndex);
  const nextPlayerIndex = readNonnegativeInteger(nextState.currentPlayerIndex);
  if (players.length === 0 || currentPlayerIndex === null || nextPlayerIndex === null) return false;
  return nextPlayerIndex === (currentPlayerIndex + offset) % players.length;
}

function validateSingleOwnedNumberDelta(
  currentValue: unknown,
  nextValue: unknown,
  playerId: string,
  minDelta: number,
  maxDelta: number,
) {
  const currentMap = asRecord(currentValue) ?? {};
  const nextMap = asRecord(nextValue) ?? {};
  const changedKeys = getChangedKeys(currentMap, nextMap);
  if (changedKeys.length !== 1 || changedKeys[0] !== playerId) return false;

  const currentNumber = readFiniteNumber(currentMap[playerId]) ?? 0;
  const nextNumber = readFiniteNumber(nextMap[playerId]);
  if (nextNumber === null || nextNumber < 0) return false;
  const delta = nextNumber - currentNumber;
  return Number.isInteger(delta) && delta >= minDelta && delta <= maxDelta && delta !== 0;
}

function validateYamanoteParticipantChange(currentStateValue: unknown, nextStateValue: unknown, requesterId: string) {
  const change = readSingleBranchChange(currentStateValue, nextStateValue, "yamanote");
  if ("error" in change) return change.error;
  if (change.currentBranch.step !== "play" || change.nextBranch.step !== "play") return "host_required";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentBranch);
  if (requesterId !== currentPlayerId) return "participant_field_forbidden";
  const changedKeys = getChangedKeys(change.currentBranch, change.nextBranch);

  if (isOnlyChangedKeys(changedKeys, ["currentPlayerIndex"])) {
    return validateAdvancedPlayerIndex(change.currentBranch, change.nextBranch, 1) ? null : "participant_field_forbidden";
  }

  if (isOnlyChangedKeys(changedKeys, ["currentPlayerIndex", "missCounts"])) {
    return validateAdvancedPlayerIndex(change.currentBranch, change.nextBranch, 1) &&
      validateScoreIncrement(change.currentBranch.missCounts, change.nextBranch.missCounts, requesterId)
      ? null
      : "participant_field_forbidden";
  }

  if (isOnlyChangedKeys(changedKeys, ["currentPlayerIndex", "answerLog"])) {
    return validateAdvancedPlayerIndex(change.currentBranch, change.nextBranch, 1) &&
      validateYamanoteAnswerAppend(change.currentBranch.answerLog, change.nextBranch.answerLog, requesterId)
      ? null
      : "participant_field_forbidden";
  }

  return "participant_field_forbidden";
}

function validatePartyPackParticipantChange(currentStateValue: unknown, nextStateValue: unknown, requesterId: string) {
  const change = readSingleBranchChange(currentStateValue, nextStateValue, "partyPack");
  if ("error" in change) return change.error;
  if (change.currentBranch.step !== "prompt" || change.nextBranch.step !== "prompt") return "host_required";
  if (change.currentBranch.promptId !== change.nextBranch.promptId) return "host_required";

  const mode = readPartyPackPromptMode(change.currentBranch.promptId);
  if (!mode) return "participant_field_forbidden";

  const currentPlayerId = getUrlCandidateCurrentPlayerId(change.currentBranch);
  const changedKeys = getChangedKeys(change.currentBranch, change.nextBranch);
  if (
    requesterId === currentPlayerId &&
    partyPackParticipantRevealModes.has(mode) &&
    isOnlyChangedKeys(changedKeys, ["answerVisible"]) &&
    typeof change.nextBranch.answerVisible === "boolean"
  ) {
    return null;
  }

  switch (mode) {
    case "majority":
      if (change.currentBranch.answerVisible === true || change.nextBranch.answerVisible === true) return "participant_field_forbidden";
      return validateOwnedStateMaps(change.currentBranch, change.nextBranch, requesterId, ["votes"]);
    case "yamanote":
    case "reverse-word":
    case "loanword-ban":
      if (requesterId !== currentPlayerId) return "participant_field_forbidden";
      return validateUrlCandidateTurnRecord(change.currentBranch, change.nextBranch, requesterId) ? null : "participant_field_forbidden";
    case "truth-lie":
      return validateTruthLieBranchChange(change.currentBranch, change.nextBranch, requesterId, "truthLieAnswer");
    case "typing":
      return validateTypingBranchChange(change.currentBranch, change.nextBranch, requesterId);
    case "memory-drawing":
      return validateMemoryDrawingBranchChange(change.currentBranch, change.nextBranch, requesterId);
    case "value-meter":
      if (change.currentBranch.answerVisible === true || change.nextBranch.answerVisible === true) return "participant_field_forbidden";
      return validateOwnedStateMaps(change.currentBranch, change.nextBranch, requesterId, ["guesses", "votes"]);
    case "acting":
      return validateActingBranchChange(change.currentBranch, change.nextBranch, requesterId, "actingEmotion");
    case "hint-quiz":
      return validateGuessBranchChange(change.currentBranch, change.nextBranch, requesterId);
    default:
      return "participant_field_forbidden";
  }
}

function validateJohariParticipantChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
  progress: ParticipantProgressChange,
) {
  const change = readSingleBranchChange(currentStateValue, nextStateValue, "johari");
  if ("error" in change) return change.error;
  const currentStep = readString(change.currentBranch.step);
  const nextStep = readString(change.nextBranch.step);
  if (!nextStep || !validateProgressForBranchStep(progress.next, nextStep, { setup: 1, self: 2, peer: 3, result: 4, complete: 5 })) {
    return "host_required";
  }

  if (currentStep === "self" && nextStep === "self") {
    const targetId = getIndexedPlayerId(change.currentBranch, "targetIndex");
    if (requesterId !== targetId) return "participant_field_forbidden";
    const changedKeys = getChangedKeys(change.currentBranch, change.nextBranch);
    return isOnlyChangedKeys(changedKeys, ["selfWordIds"]) && validateWordSelection(change.nextBranch.selfWordIds, change.currentBranch.deckWordIds)
      ? null
      : "participant_field_forbidden";
  }

  if (currentStep === "self" && nextStep === "peer") {
    const targetId = getIndexedPlayerId(change.currentBranch, "targetIndex");
    if (requesterId !== targetId) return "participant_field_forbidden";
    const expectedBranch = { ...change.currentBranch, step: "peer", peerIndex: 0 };
    return isDeepEqual(change.nextBranch, expectedBranch) ? null : "participant_field_forbidden";
  }

  if (currentStep === "peer" && nextStep === "peer") {
    const currentPeerId = getJohariCurrentPeerId(change.currentBranch);
    if (requesterId !== currentPeerId) return "participant_field_forbidden";
    const changedKeys = getChangedKeys(change.currentBranch, change.nextBranch);
    if (isOnlyChangedKeys(changedKeys, ["peerSelections"])) {
      return validateOwnedWordSelectionMap(change.currentBranch.peerSelections, change.nextBranch.peerSelections, requesterId, change.currentBranch.deckWordIds)
        ? null
        : "participant_field_forbidden";
    }
    const currentPeerIndex = readNonnegativeInteger(change.currentBranch.peerIndex);
    const nextPeerIndex = readNonnegativeInteger(change.nextBranch.peerIndex);
    if (isOnlyChangedKeys(changedKeys, ["peerIndex"]) && currentPeerIndex !== null && nextPeerIndex === currentPeerIndex + 1) {
      return null;
    }
  }

  if (currentStep === "peer" && nextStep === "result") {
    const currentPeerId = getJohariCurrentPeerId(change.currentBranch);
    if (requesterId !== currentPeerId) return "participant_field_forbidden";
    const expectedBranch = { ...change.currentBranch, step: "result" };
    return isDeepEqual(change.nextBranch, expectedBranch) ? null : "participant_field_forbidden";
  }

  return "participant_field_forbidden";
}

function validateTurtleSoupParticipantChange(
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
  progress: ParticipantProgressChange,
) {
  const change = readSingleBranchChange(currentStateValue, nextStateValue, "turtleSoup");
  if ("error" in change) return change.error;
  if (change.currentBranch.step !== "play") return "host_required";

  const facilitatorId = getTurtleSoupFacilitatorId(change.currentBranch);
  if (requesterId !== facilitatorId) return "participant_field_forbidden";

  const nextStep = readString(change.nextBranch.step);
  if (!nextStep || !validateProgressForBranchStep(progress.next, nextStep, { setup: 1, play: 2, complete: 3 })) {
    return "host_required";
  }

  const changedKeys = getChangedKeys(change.currentBranch, change.nextBranch);
  if (change.nextBranch.step === "play") {
    if (isOnlyChangedKeys(changedKeys, ["questionLog"])) {
      return validateTurtleQuestionLogAppend(change.currentBranch.questionLog, change.nextBranch.questionLog)
        ? null
        : "participant_field_forbidden";
    }
    if (isOnlyChangedKeys(changedKeys, ["hintLevel"])) {
      const currentHintLevel = readNonnegativeInteger(change.currentBranch.hintLevel);
      const nextHintLevel = readNonnegativeInteger(change.nextBranch.hintLevel);
      return currentHintLevel !== null && nextHintLevel === currentHintLevel + 1 ? null : "participant_field_forbidden";
    }
    if (isOnlyChangedKeys(changedKeys, ["answerVisible"]) && typeof change.nextBranch.answerVisible === "boolean") {
      return null;
    }
    if (validateTurtleNextCaseChange(change.currentBranch, change.nextBranch, false)) {
      return null;
    }
  }

  if (change.nextBranch.step === "complete" && validateTurtleNextCaseChange(change.currentBranch, change.nextBranch, true)) {
    return null;
  }

  return "participant_field_forbidden";
}

function validateYamanoteAnswerAppend(currentValue: unknown, nextValue: unknown, requesterId: string) {
  const currentLog = readRecordArray(currentValue);
  const nextLog = readRecordArray(nextValue);
  if (nextLog.length !== currentLog.length + 1) return false;
  if (!currentLog.every((item, index) => isDeepEqual(item, nextLog[index]))) return false;

  const added = nextLog[nextLog.length - 1];
  const answer = readString(added.answer);
  if (readString(added.id) === null || readString(added.playerId) !== requesterId || readString(added.playerName) === null || !answer) return false;

  const currentAnswers = new Set(
    currentLog
      .map((item) => readString(item.answer)?.toLowerCase())
      .filter((answer): answer is string => typeof answer === "string"),
  );
  return !currentAnswers.has(answer.toLowerCase());
}

const partyPackPromptModes = new Set([
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

const partyPackParticipantRevealModes = new Set(["truth-lie", "typing", "acting", "hint-quiz"]);

function readPartyPackPromptMode(value: unknown) {
  const promptId = readString(value);
  if (!promptId) return null;
  const mode = promptId.replace(/-\d+$/, "");
  return partyPackPromptModes.has(mode) ? mode : null;
}

function validateTruthLieBranchChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, requesterId: string, answerKey: string) {
  const currentPlayerId = getUrlCandidateCurrentPlayerId(currentBranch);
  const changedKeys = getChangedKeys(currentBranch, nextBranch);
  if (requesterId !== currentPlayerId && isOnlyChangedKeys(changedKeys, ["votes"])) {
    return validateOwnedStateMaps(currentBranch, nextBranch, requesterId, ["votes"]);
  }
  if (requesterId === currentPlayerId && validateUrlCandidateOwnerAnswerChange(currentBranch, nextBranch, answerKey)) {
    return null;
  }
  return "participant_field_forbidden";
}

function validateActingBranchChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, requesterId: string, answerKey: string) {
  const currentPlayerId = getUrlCandidateCurrentPlayerId(currentBranch);
  const changedKeys = getChangedKeys(currentBranch, nextBranch);
  if (requesterId !== currentPlayerId && isOnlyChangedKeys(changedKeys, ["votes"])) {
    return validateOwnedStateMaps(currentBranch, nextBranch, requesterId, ["votes"]);
  }
  if (requesterId === currentPlayerId && validateUrlCandidateOwnerAnswerChange(currentBranch, nextBranch, answerKey)) {
    return null;
  }
  return "participant_field_forbidden";
}

function validateTypingBranchChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, requesterId: string) {
  const changedKeys = getChangedKeys(currentBranch, nextBranch);
  if (isOnlyChangedKeys(changedKeys, ["guesses"])) {
    return validateOwnedStateMaps(currentBranch, nextBranch, requesterId, ["guesses"]);
  }
  if (validateUrlCandidateSelfCorrectChange(currentBranch, nextBranch, requesterId)) {
    return null;
  }
  return "participant_field_forbidden";
}

function validateGuessBranchChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, requesterId: string) {
  const currentPlayerId = getUrlCandidateCurrentPlayerId(currentBranch);
  const changedKeys = getChangedKeys(currentBranch, nextBranch);
  if (isOnlyChangedKeys(changedKeys, ["guesses"])) {
    if (requesterId === currentPlayerId) return "participant_field_forbidden";
    return validateOwnedStateMaps(currentBranch, nextBranch, requesterId, ["guesses"]);
  }
  if (requesterId === currentPlayerId && validateUrlCandidateJudgeChange(currentBranch, nextBranch)) {
    return null;
  }
  return "participant_field_forbidden";
}

function validateMemoryDrawingBranchChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, requesterId: string) {
  const changedKeys = getChangedKeys(currentBranch, nextBranch);
  if (!isOnlyChangedKeys(changedKeys, ["votes", "actionLog"]) || !changedKeys.includes("votes") || !changedKeys.includes("actionLog")) {
    return "participant_field_forbidden";
  }
  if (!validatePrependedActionLog(currentBranch.actionLog, nextBranch.actionLog)) return "participant_field_forbidden";
  const currentVotes = asRecord(currentBranch.votes) ?? {};
  const nextVotes = asRecord(nextBranch.votes) ?? {};
  const changedVoteKeys = getChangedKeys(currentVotes, nextVotes);
  return changedVoteKeys.length === 1 && changedVoteKeys[0] === requesterId && nextVotes[requesterId] === "done"
    ? null
    : "participant_field_forbidden";
}

function validateProgressForBranchStep(progress: Omit<ProgressState, "updatedAt">, branchStep: string, stepOrder: Record<string, number>) {
  const expectedStep = stepOrder[branchStep];
  if (!expectedStep) return false;
  const expectedPhase = branchStep === "complete" ? "complete" : "playing";
  return progress.phase === expectedPhase && progress.step === expectedStep;
}

function getIndexedPlayerId(state: Record<string, unknown>, indexKey: string) {
  const players = readRecordArray(state.players);
  const index = readNonnegativeInteger(state[indexKey]);
  if (index === null) return null;
  return readString(players[index]?.id);
}

function getJohariCurrentPeerId(state: Record<string, unknown>) {
  const targetId = getIndexedPlayerId(state, "targetIndex");
  const peers = readRecordArray(state.players).filter((player) => readString(player.id) !== targetId);
  const peerIndex = readNonnegativeInteger(state.peerIndex);
  if (peerIndex === null) return null;
  return readString(peers[peerIndex]?.id);
}

function validateWordSelection(value: unknown, deckWordIdsValue: unknown) {
  const deckWordIds = new Set((Array.isArray(deckWordIdsValue) ? deckWordIdsValue : []).filter((item): item is string => typeof item === "string"));
  const selectedIds = Array.isArray(value) ? value : [];
  return selectedIds.every((item) => typeof item === "string" && deckWordIds.has(item));
}

function validateOwnedWordSelectionMap(currentValue: unknown, nextValue: unknown, requesterId: string, deckWordIdsValue: unknown) {
  const currentMap = asRecord(currentValue) ?? {};
  const nextMap = asRecord(nextValue) ?? {};
  const changedKeys = getChangedKeys(currentMap, nextMap);
  return changedKeys.length === 1 && changedKeys[0] === requesterId && validateWordSelection(nextMap[requesterId], deckWordIdsValue);
}

function getTurtleSoupFacilitatorId(state: Record<string, unknown>) {
  const players = readRecordArray(state.players);
  if (players.length === 0) return null;
  const deckIndex = readNonnegativeInteger(state.deckIndex) ?? 0;
  return readString(players[deckIndex % players.length]?.id);
}

function validateTurtleQuestionLogAppend(currentValue: unknown, nextValue: unknown) {
  const currentLog = readRecordArray(currentValue);
  const nextLog = readRecordArray(nextValue);
  if (nextLog.length !== currentLog.length + 1) return false;
  if (!currentLog.every((item, index) => isDeepEqual(item, nextLog[index]))) return false;

  const added = nextLog[nextLog.length - 1];
  return readString(added.id) !== null &&
    readString(added.text) !== null &&
    ["はい", "いいえ", "関係ありません", "補足あり"].includes(String(added.answer));
}

function validateTurtleNextCaseChange(currentBranch: Record<string, unknown>, nextBranch: Record<string, unknown>, completesGame: boolean) {
  const currentDeckIndex = readNonnegativeInteger(currentBranch.deckIndex);
  const currentSolvedCount = readNonnegativeInteger(currentBranch.solvedCount);
  const nextSolvedCount = readNonnegativeInteger(nextBranch.solvedCount);
  const deckCaseIds = Array.isArray(currentBranch.deckCaseIds) ? currentBranch.deckCaseIds : [];
  if (currentDeckIndex === null || currentSolvedCount === null || nextSolvedCount === null) return false;
  if (nextSolvedCount !== currentSolvedCount && nextSolvedCount !== currentSolvedCount + 1) return false;

  const nextIndex = currentDeckIndex + 1;
  if (completesGame) {
    if (deckCaseIds[nextIndex]) return false;
    const expectedBranch = {
      ...currentBranch,
      step: "complete",
      caseId: null,
      hintLevel: 0,
      answerVisible: false,
      solvedCount: nextSolvedCount,
    };
    return isDeepEqual(nextBranch, expectedBranch);
  }

  const nextCaseId = deckCaseIds[nextIndex];
  if (typeof nextCaseId !== "string") return false;
  const expectedBranch = {
    ...currentBranch,
    step: "play",
    caseId: nextCaseId,
    deckIndex: nextIndex,
    hintLevel: 0,
    answerVisible: false,
    solvedCount: nextSolvedCount,
    questionLog: [],
  };
  return isDeepEqual(nextBranch, expectedBranch);
}

function isOnlyChangedKeys(changedKeys: string[], allowedKeys: string[]) {
  return changedKeys.length > 0 && changedKeys.every((key) => allowedKeys.includes(key));
}

function validateAnonymousQuestionSubmission(currentStateValue: unknown, nextStateValue: unknown) {
  const currentState = asRecord(currentStateValue);
  const nextState = asRecord(nextStateValue);
  if (!currentState || !nextState) return "participant_field_forbidden";

  const changedTopLevelKeys = getChangedKeys(currentState, nextState).filter((key) => !progressStateKeys.has(key));
  if (changedTopLevelKeys.length !== 1 || changedTopLevelKeys[0] !== "anonymousQuestion") {
    return "participant_field_forbidden";
  }

  const currentBranch = asRecord(currentState.anonymousQuestion);
  const nextBranch = asRecord(nextState.anonymousQuestion);
  if (!currentBranch || !nextBranch) return "participant_field_forbidden";
  if (currentBranch.step !== "setup" || nextBranch.step !== "setup") {
    return "host_required";
  }

  const changedBranchKeys = getChangedKeys(currentBranch, nextBranch);
  if (changedBranchKeys.length !== 1 || changedBranchKeys[0] !== "customQuestions") {
    return "participant_field_forbidden";
  }

  const currentQuestions = Array.isArray(currentBranch.customQuestions) ? currentBranch.customQuestions : [];
  const nextQuestions = Array.isArray(nextBranch.customQuestions) ? nextBranch.customQuestions : [];
  if (nextQuestions.length !== currentQuestions.length + 1) {
    return "participant_field_forbidden";
  }
  for (let index = 0; index < currentQuestions.length; index += 1) {
    if (!isDeepEqual(currentQuestions[index], nextQuestions[index])) {
      return "participant_field_forbidden";
    }
  }

  const addedQuestion = asRecord(nextQuestions[nextQuestions.length - 1]);
  if (!addedQuestion || typeof addedQuestion.id !== "string" || typeof addedQuestion.text !== "string" || !addedQuestion.text.trim()) {
    return "participant_field_forbidden";
  }

  return null;
}

function getChangedKeys(currentValue: Record<string, unknown>, nextValue: Record<string, unknown>) {
  const keys = new Set([...Object.keys(currentValue), ...Object.keys(nextValue)]);
  return [...keys].filter((key) => !isDeepEqual(currentValue[key], nextValue[key]));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isDeepEqual(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortJsonValue(record[key])]));
  }
  return value;
}

function sanitizeRoomSnapshotForParticipant(snapshot: RoomSnapshot, requester: RoomParticipant | null): RoomSnapshot {
  if (requester?.role === "host") {
    return snapshot;
  }

  const nextSnapshot = cloneJson(snapshot) as RoomSnapshot;
  const state = asRecord(nextSnapshot.room.state);
  if (!state) {
    return nextSnapshot;
  }

  const currentGame = nextSnapshot.room.currentGame ?? readProgressState(state, null).gameKey;
  if (currentGame === "werewolf-game") {
    maskWerewolfState(state, requester?.id ?? null);
  }
  if (currentGame === "word-wolf") {
    maskWordWolfState(state, requester?.id ?? null);
  }
  if (currentGame === "ng-word") {
    maskNgWordState(state, requester?.id ?? null);
  }

  return nextSnapshot;
}

function maskWerewolfState(state: Record<string, unknown>, participantId: string | null) {
  const werewolf = asRecord(state.werewolf);
  if (!werewolf || werewolf.phase === "result") return;

  werewolf.assignments = maskAssignments(werewolf.assignments, (assignment) => {
    if (assignment.playerId === participantId) return assignment;
    return {
      ...assignment,
      role: "hidden",
    };
  });
  werewolf.werewolfTargetId = null;
  werewolf.seerTargetId = null;
  werewolf.knightTargetId = null;
}

function maskWordWolfState(state: Record<string, unknown>, participantId: string | null) {
  const wordWolf = asRecord(state.wordWolf);
  if (!wordWolf || wordWolf.step === "result") return;

  wordWolf.topicId = null;
  wordWolf.assignments = maskAssignments(wordWolf.assignments, (assignment) => {
    if (assignment.playerId === participantId) return assignment;
    return {
      ...assignment,
      role: "hidden",
      word: "",
    };
  });
}

function maskNgWordState(state: Record<string, unknown>, participantId: string | null) {
  const ngWord = asRecord(state.ngWord);
  if (!ngWord || ngWord.step === "result") return;

  ngWord.assignments = maskAssignments(ngWord.assignments, (assignment) => {
    if (participantId && assignment.playerId !== participantId) return assignment;
    return {
      ...assignment,
      word: "",
    };
  });
}

function restoreProtectedSecretFields(
  currentGame: string | null,
  currentStateValue: unknown,
  nextStateValue: unknown,
  requester: RoomParticipant,
) {
  if (requester.role === "host") {
    return nextStateValue ?? {};
  }

  const nextState = cloneJson(nextStateValue ?? {}) as Record<string, unknown>;
  const currentState = asRecord(currentStateValue);
  if (!currentState || !asRecord(nextState)) {
    return nextState;
  }

  if (currentGame === "werewolf-game") {
    const preparedState = buildWerewolfParticipantVoteState(currentState, nextState, requester.id);
    if (preparedState) return preparedState;
    restoreRecordFields(currentState, nextState, "werewolf", ["assignments", "werewolfTargetId", "seerTargetId", "knightTargetId"]);
  }
  if (currentGame === "word-wolf") {
    const preparedState = buildWordWolfParticipantVoteState(currentState, nextState, requester.id);
    if (preparedState) return preparedState;
    restoreRecordFields(currentState, nextState, "wordWolf", ["topicId", "assignments"]);
  }
  if (currentGame === "ng-word") {
    restoreNgWordAssignmentWords(currentState, nextState);
  }

  return nextState;
}

function restoreRecordFields(
  currentState: Record<string, unknown>,
  nextState: Record<string, unknown>,
  branchKey: string,
  fieldKeys: string[],
) {
  const currentBranch = asRecord(currentState[branchKey]);
  const nextBranch = asRecord(nextState[branchKey]);
  if (!currentBranch || !nextBranch) return;

  for (const fieldKey of fieldKeys) {
    nextBranch[fieldKey] = cloneJson(currentBranch[fieldKey]);
  }
}

function restoreNgWordAssignmentWords(currentState: Record<string, unknown>, nextState: Record<string, unknown>) {
  const currentBranch = asRecord(currentState.ngWord);
  const nextBranch = asRecord(nextState.ngWord);
  if (!currentBranch || !nextBranch) return;

  const currentAssignments = Array.isArray(currentBranch.assignments) ? currentBranch.assignments : [];
  const nextAssignments = Array.isArray(nextBranch.assignments) ? nextBranch.assignments : [];
  const currentWords = new Map<string, unknown>();
  for (const assignment of currentAssignments) {
    const currentAssignment = asRecord(assignment);
    if (currentAssignment && typeof currentAssignment.playerId === "string") {
      currentWords.set(currentAssignment.playerId, currentAssignment.word);
    }
  }

  nextBranch.assignments = nextAssignments.map((assignment) => {
    const nextAssignment = asRecord(assignment);
    if (!nextAssignment || typeof nextAssignment.playerId !== "string") return assignment;
    return {
      ...nextAssignment,
      word: currentWords.get(nextAssignment.playerId) ?? nextAssignment.word,
    };
  });
}

function maskAssignments(value: unknown, mask: (assignment: Record<string, unknown>) => Record<string, unknown>) {
  if (!Array.isArray(value)) return [];
  return value.map((assignment) => {
    const record = asRecord(assignment);
    return record ? mask(record) : assignment;
  });
}

function cloneJson(value: unknown): unknown {
  if (typeof value === "undefined") return undefined;
  return JSON.parse(JSON.stringify(value));
}

async function emitRoomSnapshot(roomCode: string) {
  const snapshot = await findRoomByCode(roomCode);
  if (!snapshot) {
    io.to(roomCode).emit("room:updated", null);
    return;
  }

  const sockets = await io.in(snapshot.room.code).fetchSockets();
  await Promise.all(
    sockets.map(async (socket) => {
      const participantId = typeof socket.data.participantId === "string" ? socket.data.participantId : null;
      const requester = findParticipant(snapshot, participantId);
      socket.emit("room:updated", sanitizeRoomSnapshotForParticipant(snapshot, requester));
    }),
  );
}

type ProgressPhase = "lobby" | "playing" | "complete";

type ProgressState = {
  phase: ProgressPhase;
  gameKey: string | null;
  gameTitle: string | null;
  step: number;
  message: string;
  updatedBy: string | null;
  updatedAt: string;
};

function buildProgressState(input: Omit<ProgressState, "updatedAt">) {
  return {
    ...input,
    updatedAt: new Date().toISOString(),
  };
}

function readProgressState(value: unknown, currentGame: string | null): Omit<ProgressState, "updatedAt"> {
  if (value && typeof value === "object") {
    const state = value as Partial<ProgressState>;
    return {
      phase: state.phase === "complete" ? "complete" : state.phase === "lobby" ? "lobby" : "playing",
      gameKey: typeof state.gameKey === "string" ? state.gameKey : currentGame,
      gameTitle: typeof state.gameTitle === "string" ? state.gameTitle : currentGame,
      step: typeof state.step === "number" && Number.isFinite(state.step) ? state.step : 0,
      message: typeof state.message === "string" ? state.message : "",
      updatedBy: typeof state.updatedBy === "string" ? state.updatedBy : null,
    };
  }

  return {
    phase: currentGame ? "playing" : "lobby",
    gameKey: currentGame,
    gameTitle: currentGame,
    step: currentGame ? 1 : 0,
    message: "",
    updatedBy: null,
  };
}
