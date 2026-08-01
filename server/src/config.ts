import { createHash } from "node:crypto";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

function readBoundedInteger(name: string, value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const raw = value?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return parsed;
}

function readServiceUrl(name: string, fallback: string, protocols: readonly string[]) {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (isProduction) throw new Error(`${name}_required`);
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol)) throw new Error("protocol");
  } catch {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return raw;
}

function rejectProductionPlaceholder(name: string, value: string | undefined) {
  if (!isProduction || !value) return;
  const normalized = value.trim().toLowerCase();
  if (/^(?:change[_-]?me|changeme|replace[_-]?me|your[_-]?(?:password|secret)|password)$/.test(normalized) || /(?:change[_-]?me|changeme|replace[_-]?me)/.test(normalized)) {
    throw new Error(`${name}_placeholder_not_allowed`);
  }
}

function readClientOrigin(value: string | undefined) {
  const raw = value?.trim();
  if (!raw && isProduction) throw new Error("client_origin_required");

  const origins = (raw || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) throw new Error("client_origin_required");
  const normalizedOrigins = origins.map((origin) => {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
      if (!parsed.hostname || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
        throw new Error("origin");
      }
      const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (isProduction && ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::"].includes(hostname)) {
        throw new Error("loopback");
      }
      return parsed.origin;
    } catch {
      throw new Error("invalid_client_origin");
    }
  });

  return normalizedOrigins.length <= 1 ? normalizedOrigins[0]! : normalizedOrigins;
}

function stableForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableForHash);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableForHash(record[key])]),
  );
}

export type IdempotencyContext = {
  key: string;
  roomCode: string;
  commandId: string;
  bodyHash: string;
  actorId: string;
};

export function hashIdempotencyBody(body: unknown) {
  const canonical = JSON.stringify(stableForHash(body)) ?? "null";
  return createHash("sha256").update(canonical).digest("hex");
}

export function createIdempotencyContext(
  roomCode: string,
  commandId: string,
  actorId: string | undefined,
  body: unknown,
): IdempotencyContext | null {
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const normalizedCommandId = commandId.trim();
  const normalizedActorId = actorId?.trim() ?? "";
  if (!normalizedRoomCode || !normalizedCommandId || !normalizedActorId) return null;

  const bodyHash = hashIdempotencyBody(body);
  const key = [
    "idempotency",
    "v2",
    normalizedActorId,
    normalizedRoomCode,
    normalizedCommandId,
  ].map((part) => encodeURIComponent(part)).join(":");

  return {
    key,
    roomCode: normalizedRoomCode,
    commandId: normalizedCommandId,
    bodyHash,
    actorId: normalizedActorId,
  };
}

const databaseUrl = readServiceUrl("DATABASE_URL", "postgres://nomikai:nomikai@localhost:5432/nomikai", ["postgres:", "postgresql:"]);
const redisUrl = readServiceUrl("REDIS_URL", "redis://localhost:6379", ["redis:", "rediss:"]);
rejectProductionPlaceholder("database_url", databaseUrl);
rejectProductionPlaceholder("redis_url", redisUrl);
rejectProductionPlaceholder("postgres_password", process.env.POSTGRES_PASSWORD);

const idempotencyTtlSeconds = readBoundedInteger(
  "IDEMPOTENCY_TTL_SECONDS",
  process.env.IDEMPOTENCY_TTL_SECONDS,
  86_400,
  60,
  7 * 24 * 60 * 60,
);

export const config = {
  port: readBoundedInteger("PORT", process.env.PORT, 3000, 1, 65_535),
  databaseUrl,
  redisUrl,
  clientOrigin: readClientOrigin(process.env.CLIENT_ORIGIN),
  v2Repository: (() => {
    const value = process.env.V2_REPOSITORY?.trim() || "postgres";
    if (value !== "postgres" && value !== "memory") throw new Error("invalid_v2_repository");
    if (isProduction && value === "memory") throw new Error("memory_v2_repository_not_allowed_in_production");
    return value;
  })(),
  socketIoInstances: readBoundedInteger("SOCKETIO_INSTANCES", process.env.SOCKETIO_INSTANCES, 1, 1, 64),
  v2CleanupIntervalMs: readBoundedInteger(
    "V2_CLEANUP_INTERVAL_MS",
    process.env.V2_CLEANUP_INTERVAL_MS,
    60_000,
    30_000,
    86_400_000,
  ),
  idempotencyTtlSeconds,
  idempotencyTtlMs: idempotencyTtlSeconds * 1000,
  legacyPresenceHeartbeatTtlMs: readBoundedInteger(
    "LEGACY_PRESENCE_HEARTBEAT_TTL_MS",
    process.env.LEGACY_PRESENCE_HEARTBEAT_TTL_MS,
    120_000,
    15_000,
    600_000,
  ),
  legacyRoomStateTtlSeconds: readBoundedInteger(
    "LEGACY_ROOM_STATE_TTL_SECONDS",
    process.env.LEGACY_ROOM_STATE_TTL_SECONDS,
    300,
    60,
    86_400,
  ),
};
