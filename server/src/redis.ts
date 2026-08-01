import { Redis } from "ioredis";
import { config, type IdempotencyContext } from "./config.js";

export const redis = new Redis(config.redisUrl);

export async function checkRedis() {
  const result = await redis.ping();
  if (result !== "PONG") {
    throw new Error("redis_unavailable");
  }
}

type StoredIdempotencyResult = {
  actorId: string;
  roomCode: string;
  commandId: string;
  bodyHash: string;
  result: unknown;
};

function parseStoredIdempotencyResult(raw: string): StoredIdempotencyResult {
  try {
    const stored = JSON.parse(raw) as Partial<StoredIdempotencyResult>;
    if (
      !stored ||
      typeof stored.actorId !== "string" ||
      typeof stored.roomCode !== "string" ||
      typeof stored.commandId !== "string" ||
      typeof stored.bodyHash !== "string" ||
      !("result" in stored)
    ) {
      throw new Error("shape");
    }
    return stored as StoredIdempotencyResult;
  } catch {
    throw new Error("idempotency_conflict");
  }
}

function assertIdempotencyContextMatches(stored: StoredIdempotencyResult, context: IdempotencyContext) {
  if (
    stored.actorId !== context.actorId ||
    stored.roomCode !== context.roomCode ||
    stored.commandId !== context.commandId ||
    stored.bodyHash !== context.bodyHash
  ) {
    throw new Error("idempotency_conflict");
  }
}

/**
 * Shared idempotency storage is deliberately actor-bound. Callers must build a
 * context after authentication; an empty actor can never read or write a
 * result.
 */
export async function readRedisIdempotencyResult(context: IdempotencyContext | null) {
  if (!context?.actorId.trim()) return null;

  const raw = await redis.get(context.key);
  if (!raw) return null;

  const stored = parseStoredIdempotencyResult(raw);
  assertIdempotencyContextMatches(stored, context);
  return stored.result;
}

export async function writeRedisIdempotencyResult(context: IdempotencyContext | null, result: unknown) {
  if (!context?.actorId.trim()) return false;

  const stored: StoredIdempotencyResult = {
    actorId: context.actorId,
    roomCode: context.roomCode,
    commandId: context.commandId,
    bodyHash: context.bodyHash,
    result,
  };
  const status = await redis.set(
    context.key,
    JSON.stringify(stored),
    "EX",
    config.idempotencyTtlSeconds,
    "NX",
  );
  if (status === "OK") return true;

  // NX only tells us that a stable actor/room/command key already exists.
  // Read the stored hash so a command-id reuse with a different body is an
  // explicit conflict instead of looking like a cache miss.
  const existingRaw = await redis.get(context.key);
  if (!existingRaw) return false;
  const existing = parseStoredIdempotencyResult(existingRaw);
  assertIdempotencyContextMatches(existing, context);
  return false;
}

export async function cacheLegacyRoomState(roomCode: string, state: unknown) {
  const normalizedCode = roomCode.trim().toUpperCase();
  if (!normalizedCode) return false;

  const status = await redis.set(
    `room:${normalizedCode}:state`,
    JSON.stringify(state),
    "EX",
    config.legacyRoomStateTtlSeconds,
  );
  return status === "OK";
}

function v2PresenceKey(roomCode: string) {
  return `v2:presence:${roomCode.trim().toUpperCase()}`;
}

const removeV2PresenceFieldsScript = `
  local key = KEYS[1]
  local exact = ARGV[1]
  local prefix = ARGV[2]
  for _, field in ipairs(redis.call('HKEYS', key)) do
    if (exact ~= '' and field == exact) or (exact == '' and string.sub(field, 1, string.len(prefix)) == prefix) then
      redis.call('HDEL', key, field)
    end
  end
  if redis.call('HLEN', key) == 0 then redis.call('DEL', key) end
  return 1
`;

const removeExpiredV2PresenceFieldScript = `
  local key = KEYS[1]
  if redis.call('HGET', key, ARGV[1]) == ARGV[2] then
    redis.call('HDEL', key, ARGV[1])
    if redis.call('HLEN', key) == 0 then redis.call('DEL', key) end
  end
  return 1
`;

/**
 * Presence is transport state, not room state. Each socket gets its own
 * short-lived hash field, so two tabs can coexist and a crashed API process
 * eventually disappears without changing the room snapshot version.
 */
export async function setV2ParticipantPresence(roomCode: string, participantId: string, connected: boolean, sourceId = "rest") {
  const normalizedCode = roomCode.trim().toUpperCase();
  const normalizedParticipantId = participantId.trim();
  const normalizedSourceId = sourceId.trim() || "rest";
  if (!normalizedCode || !normalizedParticipantId || redis.status !== "ready") return;
  const key = v2PresenceKey(normalizedCode);
  const field = `${normalizedParticipantId}|${normalizedSourceId}`;
  if (connected) {
    await redis.hset(key, field, String(Date.now()));
    await redis.expire(key, Math.ceil(config.legacyPresenceHeartbeatTtlMs / 1000));
    return;
  }
  await redis.eval(
    removeV2PresenceFieldsScript,
    1,
    key,
    sourceId.trim() ? field : "",
    `${normalizedParticipantId}|`,
  );
}

/** Returns null when Redis is not ready, allowing the caller to use local sockets. */
export async function readV2ActiveParticipantIds(roomCode: string) {
  const normalizedCode = roomCode.trim().toUpperCase();
  if (!normalizedCode || redis.status !== "ready") return null;
  const entries = await redis.hgetall(v2PresenceKey(normalizedCode));
  const now = Date.now();
  const activeParticipantIds = new Set<string>();
  const expiredFields: Array<[string, string]> = [];
  const ttlMs = config.legacyPresenceHeartbeatTtlMs;

  for (const [field, rawTimestamp] of Object.entries(entries)) {
    const participantId = field.split("|", 1)[0]?.trim();
    const timestamp = Number(rawTimestamp);
    if (!participantId || !Number.isFinite(timestamp) || now - timestamp > ttlMs) {
      expiredFields.push([field, rawTimestamp]);
      continue;
    }
    activeParticipantIds.add(participantId);
  }

  // A Redis hash has one TTL, so an active socket could otherwise keep an
  // abandoned socket field alive forever. Expire fields independently using
  // their heartbeat timestamp and leave the key TTL only as a crash fallback.
  if (expiredFields.length > 0) {
    await Promise.all(expiredFields.map(([field, rawTimestamp]) => redis.eval(
      removeExpiredV2PresenceFieldScript,
      1,
      v2PresenceKey(normalizedCode),
      field,
      rawTimestamp,
    )));
  }
  return activeParticipantIds;
}
