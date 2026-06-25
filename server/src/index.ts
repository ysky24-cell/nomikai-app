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
  setParticipantConnected,
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

app.post("/rooms/:code/game/start", async (request, response, next) => {
  try {
    const gameKey = readRequiredString(request.body?.gameKey, "game_key");
    const gameTitle = readRequiredString(request.body?.gameTitle, "game_title");
    const participantId = readOptionalString(request.body?.participantId) ?? null;
    const nextState = buildProgressState({
      phase: "playing",
      gameKey,
      gameTitle,
      step: 1,
      message: "ゲームを開始しました",
      updatedBy: participantId,
    });

    const snapshot = await updateRoomProgress({
      code: request.params.code,
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

    const participantId = readOptionalString(request.body?.participantId) ?? null;
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

    const participantId = readOptionalString(request.body?.participantId) ?? null;
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
    const participantId = readOptionalString(request.body?.participantId) ?? null;
    const nextState = buildProgressState({
      phase: "lobby",
      gameKey: null,
      gameTitle: null,
      step: 0,
      message: "待機中に戻しました",
      updatedBy: participantId,
    });

    const snapshot = await updateRoomProgress({
      code: request.params.code,
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

    socket.join(snapshot.room.code);
    socket.data.roomCode = snapshot.room.code;
    socket.data.participantId = payload.participantId;

    if (payload.participantId) {
      await setParticipantConnected(payload.participantId, true);
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

    const room = await updateRoomState(roomCode, payload.state ?? {}, payload.currentGame ?? null);
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
