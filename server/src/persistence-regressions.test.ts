import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createIdempotencyContext, hashIdempotencyBody } from "./config.js";

const runIntegration = process.env.RUN_PERSISTENCE_INTEGRATION === "1";

test("idempotency context is actor-bound and body-sensitive", () => {
  const first = createIdempotencyContext(" abcd ", " command-1 ", " actor-1 ", { b: 2, a: 1 });
  const reordered = createIdempotencyContext("ABCD", "command-1", "actor-1", { a: 1, b: 2 });
  const changedBody = createIdempotencyContext("ABCD", "command-1", "actor-1", { a: 1, b: 3 });

  assert.ok(first);
  assert.equal(first.key.includes("actor-1"), true);
  assert.equal(first.bodyHash, hashIdempotencyBody({ a: 1, b: 2 }));
  assert.equal(reordered?.key, first.key);
  assert.equal(changedBody?.key, first.key);
  assert.notEqual(changedBody?.bodyHash, first.bodyHash);
  assert.equal(createIdempotencyContext("ABCD", "command-1", undefined, {}), null);
});

test("PostgreSQL snapshot/event and shared idempotency/outbox paths regressions", { skip: !runIntegration }, async () => {
  const [{ PostgresRoomRepository }, db, redisModule] = await Promise.all([
    import("./domain/postgresRoomRepository.js"),
    import("./db.js"),
    import("./redis.js"),
  ]);
  const code = `TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
  const context = createIdempotencyContext(code, randomUUID(), "participant-1", { kind: "start", value: 1 });
  assert.ok(context);

  const now = Date.now();
  const room = {
    id: randomUUID(),
    code,
    status: "waiting" as const,
    version: 0,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
    hostTokenHash: "host-hash",
    participants: [{
      id: "participant-1",
      name: "Host",
      role: "host" as const,
      reconnectTokenHash: "reconnect-hash",
      connected: true,
    }],
  };
  const repository = new PostgresRoomRepository();
  const legacyRoomId = randomUUID();
  const legacyParticipantId = randomUUID();
  let schemaMutationStarted = false;

  try {
    await repository.create(room);
    const createdEvents = await db.pool.query<{ eventType: string }>(
      "SELECT event_type AS \"eventType\" FROM v2_room_events WHERE room_code = $1 ORDER BY id",
      [code],
    );
    assert.deepEqual(createdEvents.rows.map((event) => event.eventType), ["v2_room_created"]);

    // A reconnect/presence update may race a game snapshot save. The
    // versioned snapshot must not restore stale connection state.
    assert.equal(await repository.setParticipantConnected(code, "participant-1", false), true);
    const savedRoom = { ...room, status: "playing" as const, version: 1 };
    await repository.save(savedRoom);
    const presenceAfterStaleSnapshot = await repository.get(code);
    assert.equal(presenceAfterStaleSnapshot?.participants[0]?.connected, false);
    assert.equal(await repository.setParticipantConnected(code, "participant-1", true), true);
    await assert.rejects(
      repository.save({ ...savedRoom, version: 3 }),
      /version_conflict/,
    );

    const savedEvents = await db.pool.query<{ eventType: string; version: number }>(
      "SELECT event_type AS \"eventType\", (payload->>'version')::integer AS version FROM v2_room_events WHERE room_code = $1 ORDER BY id",
      [code],
    );
    assert.deepEqual(savedEvents.rows.map((event) => event.eventType), ["v2_room_created", "v2_snapshot_saved"]);
    assert.deepEqual(savedEvents.rows.map((event) => event.version), [0, 1]);

    const claimed = await db.claimV2RoomEvents(10, code);
    assert.equal(claimed.length, 2);
    assert.equal(await db.markV2RoomEventProcessed(claimed[0]!.id), true);
    assert.equal(await db.markV2RoomEventProcessed(claimed[0]!.id), false);
    assert.equal(await db.retryV2RoomEvent(claimed[1]!.id, "temporary", 1), true);
    for (let claimNumber = 2; claimNumber <= 10; claimNumber += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const reclaimed = await db.claimV2RoomEvents(10, code);
      assert.equal(reclaimed.some((event) => event.id === claimed[1]!.id), true);
      assert.equal(await db.retryV2RoomEvent(
        claimed[1]!.id,
        claimNumber === 10 ? "dead-letter" : `temporary-${claimNumber}`,
        1,
      ), true);
    }
    const deadLetter = await db.pool.query<{ attempts: number; deadAt: Date | null }>(
      `SELECT attempts, dead_at AS "deadAt" FROM v2_room_events WHERE id = $1`,
      [claimed[1]!.id],
    );
    assert.equal(deadLetter.rows[0]?.attempts, 10);
    assert.ok(deadLetter.rows[0]?.deadAt);
    assert.equal(await db.retryV2RoomEvent(claimed[1]!.id, "after-dead-letter"), false);

    await db.pool.query(
      "INSERT INTO rooms (id, code) VALUES ($1, $2)",
      [legacyRoomId, `LEGACY-${legacyRoomId.slice(0, 8)}`],
    );
    await db.pool.query(
      "INSERT INTO participants (id, room_id, name, role, connected) VALUES ($1, $2, 'Legacy host', 'host', false)",
      [legacyParticipantId, legacyRoomId],
    );
    await db.registerParticipantSocketConnection(legacyRoomId, legacyParticipantId, "socket-a");
    await db.registerParticipantSocketConnection(legacyRoomId, legacyParticipantId, "socket-b");
    await db.unregisterParticipantSocketConnection("socket-a");
    const stillConnected = await db.pool.query<{ connected: boolean }>(
      "SELECT connected FROM participants WHERE id = $1",
      [legacyParticipantId],
    );
    assert.equal(stillConnected.rows[0]?.connected, true);
    assert.deepEqual(
      await db.heartbeatParticipantSocketConnection("socket-b"),
      { participantId: legacyParticipantId },
    );
    await db.unregisterParticipantSocketConnection("socket-b");
    const disconnected = await db.pool.query<{ connected: boolean }>(
      "SELECT connected FROM participants WHERE id = $1",
      [legacyParticipantId],
    );
    assert.equal(disconnected.rows[0]?.connected, false);

    assert.equal(await db.writeDatabaseIdempotencyResult(context, { ok: true }), true);
    assert.equal(await db.writeDatabaseIdempotencyResult(context, { ok: false }), false);
    assert.deepEqual(await db.readDatabaseIdempotencyResult(context), { ok: true });
    const changedContext = createIdempotencyContext(code, context.commandId, context.actorId, { kind: "start", value: 2 });
    assert.ok(changedContext);
    await assert.rejects(db.readDatabaseIdempotencyResult(changedContext), /idempotency_conflict/);
    const dbTtl = await db.pool.query<{ expiresAt: Date }>(
      "SELECT expires_at AS \"expiresAt\" FROM v2_idempotency_records WHERE idempotency_key = $1",
      [context.key],
    );
    assert.equal(dbTtl.rowCount, 1);
    assert.ok(dbTtl.rows[0]!.expiresAt.getTime() > Date.now());

    assert.equal(await redisModule.writeRedisIdempotencyResult(context, { ok: true }), true);
    assert.deepEqual(await redisModule.readRedisIdempotencyResult(context), { ok: true });
    await assert.rejects(redisModule.readRedisIdempotencyResult(changedContext), /idempotency_conflict/);
    const redisTtl = await redisModule.redis.ttl(context.key);
    assert.ok(redisTtl > 0 && redisTtl <= 86_400);

    await redisModule.setV2ParticipantPresence(code, "participant-1", true, "socket-a");
    await redisModule.setV2ParticipantPresence(code, "participant-1", true, "socket-b");
    await redisModule.redis.hset(`v2:presence:${code}`, "participant-2|stale-socket", String(Date.now() - 180_000));
    const activePresence = await redisModule.readV2ActiveParticipantIds(code);
    assert.ok(activePresence?.has("participant-1"));
    assert.equal(activePresence?.has("participant-2"), false);
    await redisModule.setV2ParticipantPresence(code, "participant-1", false, "socket-a");
    const oneSocketPresence = await redisModule.readV2ActiveParticipantIds(code);
    assert.ok(oneSocketPresence?.has("participant-1"));
    await redisModule.setV2ParticipantPresence(code, "participant-1", false, "socket-b");
    const emptyPresence = await redisModule.readV2ActiveParticipantIds(code);
    assert.equal(emptyPresence?.size, 0);

    // Emulate a database created before the outbox columns and restrictive
    // room-event foreign key existed, then run the migration as a new process
    // would. This protects the upgrade path, not just a fresh empty database.
    schemaMutationStarted = true;
    await db.pool.query(`
      ALTER TABLE v2_room_events
        DROP COLUMN IF EXISTS processed_at,
        DROP COLUMN IF EXISTS available_at,
        DROP COLUMN IF EXISTS attempts,
        DROP COLUMN IF EXISTS last_error,
        DROP COLUMN IF EXISTS dead_at;
      ALTER TABLE v2_room_events DROP CONSTRAINT IF EXISTS v2_room_events_room_code_fkey;
      ALTER TABLE v2_room_events
        ADD CONSTRAINT v2_room_events_room_code_fkey
        FOREIGN KEY (room_code) REFERENCES v2_rooms(code) ON DELETE CASCADE;
    `);
    await db.runDatabaseMigrationsForIntegration();
    const upgradedColumns = await db.pool.query<{ columnName: string; nullable: string }>(
      `SELECT column_name AS "columnName", is_nullable AS nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'v2_room_events'
          AND column_name = ANY($1::text[])`,
      [["processed_at", "available_at", "attempts", "last_error", "dead_at"]],
    );
    assert.deepEqual(
      upgradedColumns.rows.map((column) => column.columnName).sort(),
      ["attempts", "available_at", "dead_at", "last_error", "processed_at"],
    );
    const upgradedForeignKey = await db.pool.query<{ deleteAction: string }>(
      `SELECT confdeltype AS "deleteAction"
         FROM pg_constraint
        WHERE conname = 'v2_room_events_room_code_fkey'`,
    );
    assert.equal(upgradedForeignKey.rows[0]?.deleteAction, "r");
  } finally {
    if (schemaMutationStarted) await db.runDatabaseMigrationsForIntegration();
    await db.pool.query("DELETE FROM v2_idempotency_records WHERE idempotency_key = $1", [context.key]);
    await db.pool.query("DELETE FROM v2_room_events WHERE room_code = $1", [code]);
    await db.pool.query("DELETE FROM v2_rooms WHERE code = $1", [code]);
    await db.pool.query("DELETE FROM rooms WHERE id = $1", [legacyRoomId]);
    await redisModule.redis.del(`v2:presence:${code}`);
    await redisModule.redis.del(context.key);
    await Promise.allSettled([redisModule.redis.quit(), db.pool.end()]);
  }
});
