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
