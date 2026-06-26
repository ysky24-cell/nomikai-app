import http from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { config } from "./config.js";
import {
  addParticipant,
  checkDatabase,
  createRoom,
  findRoomByCode,
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
    response.json(snapshot);
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
      io.to(snapshot.room.code).emit("room:updated", snapshot);
    }

    response.status(201).json({ participant, room: snapshot?.room ?? null });
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
    response.json(snapshot);
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
    response.json(snapshot);
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
    response.json(snapshot);
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
    response.json(updatedSnapshot);
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
    response.json(updatedSnapshot);
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
    response.json(snapshot);
  } catch (error) {
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

    const latestSnapshot = await findRoomByCode(roomCode);
    io.to(snapshot.room.code).emit("room:updated", latestSnapshot);
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
    const authorizationError = validateStateUpdateAuthorization(currentSnapshot, requester, currentGame, payload.state);
    if (authorizationError) {
      socket.emit("room:error", { error: authorizationError });
      return;
    }

    const room = await updateRoomState(
      roomCode,
      payload.state ?? {},
      currentGame,
      readRoomStatusFromState(payload.state, currentGame),
    );
    if (!room) {
      socket.emit("room:error", { error: "room_not_found" });
      return;
    }

    await redis.set(`room:${room.code}:state`, JSON.stringify(room.state));
    const snapshot = await findRoomByCode(room.code);
    io.to(room.code).emit("room:updated", snapshot);
  });

  socket.on("disconnect", async () => {
    const participantId = socket.data.participantId as string | undefined;
    const roomCode = socket.data.roomCode as string | undefined;

    if (participantId) {
      await setParticipantConnected(participantId, false);
    }

    if (roomCode) {
      const snapshot = await findRoomByCode(roomCode);
      io.to(roomCode).emit("room:updated", snapshot);
    }
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown_error";
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

type RoomSnapshot = NonNullable<Awaited<ReturnType<typeof findRoomByCode>>>;
type RoomParticipant = RoomSnapshot["participants"][number];

function findParticipant(snapshot: RoomSnapshot, participantId: string | null | undefined) {
  if (!participantId) return null;
  return snapshot.participants.find((participant) => participant.id === participantId) ?? null;
}

function isHostParticipant(snapshot: RoomSnapshot, participantId: string | null | undefined) {
  return findParticipant(snapshot, participantId)?.role === "host";
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
  if (
    currentState.phase !== nextState.phase ||
    currentState.gameKey !== nextState.gameKey ||
    currentState.gameTitle !== nextState.gameTitle ||
    currentState.step !== nextState.step
  ) {
    return "host_required";
  }
  return validateParticipantScopedStateChange(activeGame, snapshot.room.state, nextStateValue, requester.id);
}

function validateParticipantScopedStateChange(
  activeGame: string,
  currentStateValue: unknown,
  nextStateValue: unknown,
  requesterId: string,
) {
  switch (activeGame) {
    case "two-choice":
      return validateOwnedMapBranchChange(currentStateValue, nextStateValue, "twoChoice", requesterId, ["votes"]);
    case "impression-ranking":
      return validateOwnedMapBranchChange(currentStateValue, nextStateValue, "impression", requesterId, ["votes"]);
    case "majority-game":
    case "large-majority-game":
      return validateUrlCandidateOwnedMapChange(currentStateValue, nextStateValue, activeGame, requesterId, ["votes"]);
    case "anonymous-box":
      return validateAnonymousQuestionSubmission(currentStateValue, nextStateValue);
    default:
      return null;
  }
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

async function emitRoomSnapshot(roomCode: string) {
  const snapshot = await findRoomByCode(roomCode);
  io.to(roomCode).emit("room:updated", snapshot);
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
