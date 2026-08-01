import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import { config, type IdempotencyContext } from "./config.js";
import type { ParticipantRow, ParticipantTransferCodeRow, RoomEventRow, RoomRow, RoomStatus } from "./types.js";

const { Pool } = pg;
const participantTransferCodeTtlMs = 10 * 60 * 1000;
const maxV2OutboxAttempts = 10;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

let migrationPromise: Promise<void> | null = null;

export type V2RoomOutboxEvent = {
  id: string;
  roomCode: string;
  eventType: string;
  correlationId: string | null;
  createdAt: Date;
  payload: unknown;
  attempts: number;
  availableAt: Date;
  deadAt?: Date | null;
};

type DatabaseIdempotencyRecord = {
  idempotencyKey: string;
  roomCode: string;
  commandId: string;
  bodyHash: string;
  actorId: string;
  result: unknown;
  expiresAt: Date | string;
};

function assertIdempotencyContextMatches(record: DatabaseIdempotencyRecord, context: IdempotencyContext) {
  if (
    record.idempotencyKey !== context.key ||
    record.roomCode !== context.roomCode ||
    record.commandId !== context.commandId ||
    record.actorId !== context.actorId ||
    record.bodyHash !== context.bodyHash
  ) {
    throw new Error("idempotency_conflict");
  }
}

export async function checkDatabase() {
  await ensureDatabaseMigrations();
  await pool.query("SELECT 1");
}

export async function ensureDatabaseMigrations() {
  migrationPromise ??= migrateDatabase().catch((error) => {
    migrationPromise = null;
    throw error;
  });
  await migrationPromise;
}

/** Used by the persistence regression suite to emulate a fresh API process. */
export async function runDatabaseMigrationsForIntegration() {
  await migrateDatabase();
}

export async function readDatabaseIdempotencyResult(context: IdempotencyContext | null) {
  if (!context?.actorId.trim()) return null;
  await ensureDatabaseMigrations();

  const result = await pool.query<DatabaseIdempotencyRecord>(
    `SELECT idempotency_key AS "idempotencyKey",
            room_code AS "roomCode",
            command_id AS "commandId",
            body_hash AS "bodyHash",
            actor_id AS "actorId",
            result,
            expires_at AS "expiresAt"
       FROM v2_idempotency_records
      WHERE idempotency_key = $1
        AND expires_at > now()`,
    [context.key],
  );
  const record = result.rows[0];
  if (!record) return null;
  assertIdempotencyContextMatches(record, context);
  return record.result;
}

export async function writeDatabaseIdempotencyResult(
  context: IdempotencyContext | null,
  result: unknown,
) {
  if (!context?.actorId.trim()) return false;
  await ensureDatabaseMigrations();

  await pool.query("DELETE FROM v2_idempotency_records WHERE expires_at <= now()");
  const insertResult = await pool.query(
    `INSERT INTO v2_idempotency_records
      (idempotency_key, room_code, command_id, body_hash, actor_id, result, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      context.key,
      context.roomCode,
      context.commandId,
      context.bodyHash,
      context.actorId,
      JSON.stringify(result) ?? "null",
      new Date(Date.now() + config.idempotencyTtlMs),
    ],
  );
  if (insertResult.rowCount === 1) return true;

  const existingResult = await pool.query<DatabaseIdempotencyRecord>(
    `SELECT idempotency_key AS "idempotencyKey",
            room_code AS "roomCode",
            command_id AS "commandId",
            body_hash AS "bodyHash",
            actor_id AS "actorId",
            result,
            expires_at AS "expiresAt"
       FROM v2_idempotency_records
      WHERE idempotency_key = $1`,
    [context.key],
  );
  const existing = existingResult.rows[0];
  if (existing) assertIdempotencyContextMatches(existing, context);
  return false;
}

export async function claimV2RoomEvents(limit = 50, roomCode?: string): Promise<V2RoomOutboxEvent[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("outbox_limit_invalid");
  await ensureDatabaseMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const filter = roomCode?.trim().toUpperCase();
    const result = await client.query<V2RoomOutboxEvent>(
      `WITH pending AS (
         SELECT id
           FROM v2_room_events
          WHERE processed_at IS NULL
            AND dead_at IS NULL
            AND available_at <= now()
            ${filter ? "AND room_code = $2" : ""}
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE v2_room_events event
          SET attempts = event.attempts + 1,
              available_at = now() + interval '30 seconds'
         FROM pending
        WHERE event.id = pending.id
       RETURNING event.id::text AS id,
                 event.room_code AS "roomCode",
                 event.event_type AS "eventType",
                 event.correlation_id AS "correlationId",
                 event.created_at AS "createdAt",
                 event.payload,
                 event.attempts,
                 event.available_at AS "availableAt"`,
      filter ? [limit, filter] : [limit],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markV2RoomEventProcessed(eventId: string) {
  await ensureDatabaseMigrations();
  const result = await pool.query(
    `UPDATE v2_room_events
        SET processed_at = now(), last_error = NULL
      WHERE id = $1 AND processed_at IS NULL AND dead_at IS NULL`,
    [eventId],
  );
  return result.rowCount === 1;
}

export async function retryV2RoomEvent(eventId: string, lastError: string, delayMs = 1_000) {
  if (!Number.isInteger(delayMs) || delayMs < 1 || delayMs > 3_600_000) throw new Error("outbox_delay_invalid");
  await ensureDatabaseMigrations();
  const result = await pool.query(
    `UPDATE v2_room_events
        SET dead_at = CASE WHEN attempts >= ${maxV2OutboxAttempts} THEN now() ELSE dead_at END,
            available_at = CASE
              WHEN attempts >= ${maxV2OutboxAttempts} THEN now()
              ELSE now() + ($2::integer * interval '1 millisecond')
            END,
            last_error = LEFT($3, 1000)
      WHERE id = $1 AND processed_at IS NULL AND dead_at IS NULL`,
    [eventId, delayMs, lastError],
  );
  return result.rowCount === 1;
}

export async function createRoom(hostName?: string) {
  await ensureDatabaseMigrations();

  const client = await pool.connect();
  const roomId = randomUUID();
  const code = await createUniqueRoomCode(client);

  try {
    await client.query("BEGIN");
    const roomResult = await client.query<RoomRow>(
      `INSERT INTO rooms (id, code)
       VALUES ($1, $2)
       RETURNING id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [roomId, code],
    );

    let host: ParticipantRow | null = null;
    let participantToken: string | null = null;
    if (hostName?.trim()) {
      participantToken = createParticipantToken();
      const hostResult = await client.query<ParticipantRow>(
        `INSERT INTO participants (id, room_id, name, role, auth_token_hash)
         VALUES ($1, $2, $3, 'host', $4)
         RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), roomId, hostName.trim(), hashParticipantToken(participantToken)],
      );
      host = hostResult.rows[0];
    }

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'room_created', $3::jsonb)`,
      [roomId, host?.id ?? null, JSON.stringify({ hostName: host?.name ?? null })],
    );

    await client.query("COMMIT");
    return { room: roomResult.rows[0], host, participantToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findRoomByCode(code: string) {
  const roomResult = await pool.query<RoomRow>(
    `SELECT id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM rooms
     WHERE code = $1`,
    [normalizeRoomCode(code)],
  );

  const room = roomResult.rows[0] ?? null;
  if (!room) {
    return null;
  }

  const participants = await listParticipants(room.id);
  return { room, participants };
}

export async function addParticipant(code: string, name: string) {
  await ensureDatabaseMigrations();

  const roomSnapshot = await findRoomByCode(code);
  if (!roomSnapshot) {
    return null;
  }
  if (roomSnapshot.room.status === "closed") {
    throw new Error("room_closed");
  }

  const participantToken = createParticipantToken();
  const participantResult = await pool.query<ParticipantRow>(
    `INSERT INTO participants (id, room_id, name, auth_token_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [randomUUID(), roomSnapshot.room.id, name.trim(), hashParticipantToken(participantToken)],
  );

  const participant = participantResult.rows[0];
  await pool.query(
    `INSERT INTO room_events (room_id, participant_id, event_type, payload)
     VALUES ($1, $2, 'participant_joined', $3::jsonb)`,
    [roomSnapshot.room.id, participant.id, JSON.stringify({ name: participant.name })],
  );

  return { participant, participantToken };
}

export async function verifyParticipantToken(code: string, participantId: string, token: string) {
  if (!token.trim() || !participantId.trim()) return false;
  const result = await pool.query(
    `SELECT 1
     FROM participants p
     INNER JOIN rooms r ON r.id = p.room_id
     WHERE r.code = $1 AND p.id = $2 AND p.auth_token_hash = $3`,
    [normalizeRoomCode(code), participantId, hashParticipantToken(token)],
  );
  return result.rowCount === 1;
}

export async function listParticipants(roomId: string) {
  const participantsResult = await pool.query<ParticipantRow>(
    `SELECT id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM participants
     WHERE room_id = $1
     ORDER BY created_at ASC`,
    [roomId],
  );
  return participantsResult.rows;
}

export async function setParticipantConnected(participantId: string, connected: boolean) {
  await ensureDatabaseMigrations();

  await pool.query(
    `UPDATE participants p
        SET connected = CASE
          WHEN $2::boolean THEN true
          ELSE EXISTS (
            SELECT 1
              FROM participant_socket_connections c
             WHERE c.participant_id = p.id
          )
        END,
        updated_at = now()
      WHERE p.id = $1`,
    [participantId, connected],
  );
}

export async function registerParticipantSocketConnection(roomId: string, participantId: string, socketId: string) {
  await ensureDatabaseMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const participantResult = await client.query(
      `SELECT 1
         FROM participants
        WHERE id = $1 AND room_id = $2
        FOR UPDATE`,
      [participantId, roomId],
    );
    if (participantResult.rowCount !== 1) throw new Error("participant_not_found");

    const previousConnection = await client.query<{ roomId: string; participantId: string }>(
      `SELECT room_id AS "roomId", participant_id AS "participantId"
       FROM participant_socket_connections
       WHERE socket_id = $1
       FOR UPDATE`,
      [socketId],
    );
    const previous = previousConnection.rows[0] ?? null;

    if (previous && (previous.roomId !== roomId || previous.participantId !== participantId)) {
      await client.query("DELETE FROM participant_socket_connections WHERE socket_id = $1", [socketId]);
      await updateParticipantConnectionFromSockets(client, previous.participantId);
    }

    await client.query(
      `INSERT INTO participant_socket_connections (socket_id, room_id, participant_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (socket_id)
       DO UPDATE SET room_id = EXCLUDED.room_id,
                     participant_id = EXCLUDED.participant_id,
                     updated_at = now()`,
      [socketId, roomId, participantId],
    );

    await updateParticipantConnectionFromSockets(client, participantId);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function unregisterParticipantSocketConnection(socketId: string) {
  await ensureDatabaseMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const deletedConnection = await client.query<{ roomId: string; participantId: string }>(
      `DELETE FROM participant_socket_connections
       WHERE socket_id = $1
       RETURNING room_id AS "roomId", participant_id AS "participantId"`,
      [socketId],
    );
    const deleted = deletedConnection.rows[0] ?? null;
    if (deleted) {
      await updateParticipantConnectionFromSockets(client, deleted.participantId);
    }

    await client.query("COMMIT");
    return deleted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatParticipantSocketConnection(socketId: string) {
  await ensureDatabaseMigrations();

  const result = await pool.query<{ participantId: string }>(
    `UPDATE participant_socket_connections
        SET updated_at = now()
      WHERE socket_id = $1
      RETURNING participant_id AS "participantId"`,
    [socketId],
  );
  const connection = result.rows[0] ?? null;
  if (connection) {
    await pool.query(
      `UPDATE participants
          SET connected = true, updated_at = now()
        WHERE id = $1`,
      [connection.participantId],
    );
  }
  return connection;
}

export async function pruneStaleParticipantSocketConnections(now = Date.now()) {
  await ensureDatabaseMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ participantId: string }>(
      `DELETE FROM participant_socket_connections
        WHERE updated_at <= to_timestamp(($1 - $2) / 1000.0)
        RETURNING participant_id AS "participantId"`,
      [now, config.legacyPresenceHeartbeatTtlMs],
    );
    const participantIds = new Set(result.rows.map((row) => row.participantId));
    for (const participantId of participantIds) {
      await updateParticipantConnectionFromSockets(client, participantId);
    }
    await client.query("COMMIT");
    return result.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createParticipantTransferCode(code: string, requesterParticipantId: string, targetParticipantId: string) {
  await ensureDatabaseMigrations();

  const normalizedCode = normalizeRoomCode(code);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const room = await findRoomForUpdate(client, normalizedCode);
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }
    if (room.status === "closed") {
      throw new Error("room_closed");
    }

    await assertRoomHost(client, room.id, requesterParticipantId);
    const target = await findParticipantInRoom(client, room.id, targetParticipantId);
    if (!target) {
      throw new Error("participant_not_found");
    }

    await client.query(
      `UPDATE participant_transfer_codes
       SET used_at = now()
       WHERE room_id = $1
         AND participant_id = $2
         AND used_at IS NULL`,
      [room.id, targetParticipantId],
    );

    const { transferCode, codeHash } = await createUniqueParticipantTransferCode(client, room.id);
    const expiresAt = new Date(Date.now() + participantTransferCodeTtlMs).toISOString();

    await client.query(
      `INSERT INTO participant_transfer_codes (id, room_id, participant_id, created_by_participant_id, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), room.id, targetParticipantId, requesterParticipantId, codeHash, expiresAt],
    );

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'participant_transfer_code_created', $3::jsonb)`,
      [room.id, requesterParticipantId, JSON.stringify({ targetParticipantId, targetName: target.name, expiresAt })],
    );

    await client.query("COMMIT");
    return { participant: target, transferCode, expiresAt };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimParticipantTransfer(code: string, transferCode: string) {
  await ensureDatabaseMigrations();

  const normalizedCode = normalizeRoomCode(code);
  const normalizedTransferCode = normalizeParticipantTransferCode(transferCode);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const room = await findRoomForUpdate(client, normalizedCode);
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }
    if (room.status === "closed") {
      throw new Error("room_closed");
    }

    const codeHash = hashParticipantTransferCode(room.id, normalizedTransferCode);
    const transferCodeResult = await client.query<Pick<ParticipantTransferCodeRow, "id" | "participantId">>(
      `SELECT tc.id,
              tc.participant_id AS "participantId"
       FROM participant_transfer_codes tc
       INNER JOIN participants p ON p.id = tc.participant_id AND p.room_id = tc.room_id
       WHERE tc.room_id = $1
         AND tc.code_hash = $2
         AND tc.used_at IS NULL
         AND tc.expires_at > now()
       FOR UPDATE OF tc`,
      [room.id, codeHash],
    );

    const activeTransferCode = transferCodeResult.rows[0] ?? null;
    if (!activeTransferCode) {
      throw new Error("transfer_code_invalid");
    }

    await client.query(
      `UPDATE participant_transfer_codes
       SET used_at = now()
       WHERE id = $1`,
      [activeTransferCode.id],
    );

    const participantToken = createParticipantToken();
    const participantResult = await client.query<ParticipantRow>(
      `SELECT id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM participants
       WHERE id = $1 AND room_id = $2`,
      [activeTransferCode.participantId, room.id],
    );
    const participant = participantResult.rows[0] ?? null;
    if (!participant) {
      throw new Error("participant_not_found");
    }

    await client.query(
      "UPDATE participants SET auth_token_hash = $2, updated_at = now() WHERE id = $1 AND room_id = $3",
      [participant.id, hashParticipantToken(participantToken), room.id],
    );

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'participant_transfer_claimed', $3::jsonb)`,
      [
        room.id,
        participant.id,
        JSON.stringify({
          targetParticipantId: participant.id,
          targetName: participant.name,
        }),
      ],
    );

    await client.query("COMMIT");
    const snapshot = await findRoomByCode(room.code);
    return snapshot ? { participant, snapshot, participantToken } : null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function transferRoomHost(code: string, requesterParticipantId: string, targetParticipantId: string) {
  const normalizedCode = normalizeRoomCode(code);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const room = await findRoomForUpdate(client, normalizedCode);
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }
    if (room.status === "closed") {
      throw new Error("room_closed");
    }

    await assertRoomHost(client, room.id, requesterParticipantId);
    const target = await findParticipantInRoom(client, room.id, targetParticipantId);
    if (!target) {
      throw new Error("participant_not_found");
    }

    await client.query(
      `UPDATE participants
       SET role = CASE WHEN id = $2 THEN 'host' ELSE 'player' END,
           updated_at = now()
       WHERE room_id = $1`,
      [room.id, targetParticipantId],
    );

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'host_transferred', $3::jsonb)`,
      [room.id, requesterParticipantId, JSON.stringify({ targetParticipantId, targetName: target.name })],
    );

    await client.query("COMMIT");
    return findRoomByCode(room.code);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function removeRoomParticipant(code: string, requesterParticipantId: string, targetParticipantId: string) {
  const normalizedCode = normalizeRoomCode(code);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const room = await findRoomForUpdate(client, normalizedCode);
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }
    if (room.status === "closed") {
      throw new Error("room_closed");
    }

    await assertRoomHost(client, room.id, requesterParticipantId);
    const target = await findParticipantInRoom(client, room.id, targetParticipantId);
    if (!target) {
      throw new Error("participant_not_found");
    }

    await client.query("DELETE FROM participants WHERE id = $1 AND room_id = $2", [targetParticipantId, room.id]);

    let promotedHost: ParticipantRow | null = null;
    if (target.role === "host") {
      const promotedResult = await client.query<ParticipantRow>(
        `UPDATE participants
         SET role = 'host', updated_at = now()
         WHERE id = (
           SELECT id
           FROM participants
           WHERE room_id = $1
           ORDER BY created_at ASC
           LIMIT 1
         )
         RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [room.id],
      );
      promotedHost = promotedResult.rows[0] ?? null;
    }

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'participant_removed', $3::jsonb)`,
      [
        room.id,
        requesterParticipantId === targetParticipantId ? null : requesterParticipantId,
        JSON.stringify({
          targetParticipantId,
          targetName: target.name,
          promotedHostId: promotedHost?.id ?? null,
          promotedHostName: promotedHost?.name ?? null,
        }),
      ],
    );

    await client.query("COMMIT");
    return findRoomByCode(room.code);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeRoom(code: string, requesterParticipantId: string, state: unknown) {
  await ensureDatabaseMigrations();

  const normalizedCode = normalizeRoomCode(code);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const room = await findRoomForUpdate(client, normalizedCode);
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    await assertRoomHost(client, room.id, requesterParticipantId);
    if (room.status === "closed") {
      throw new Error("room_closed");
    }

    const roomResult = await client.query<RoomRow>(
      `UPDATE rooms
       SET status = 'closed',
           current_game = NULL,
           state = $2::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [room.id, JSON.stringify(state)],
    );

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'room_closed', $3::jsonb)`,
      [room.id, requesterParticipantId, JSON.stringify({ status: "closed", currentGame: null, state })],
    );

    await client.query("COMMIT");
    return findRoomByCode(roomResult.rows[0].code);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoomState(
  code: string,
  state: unknown,
  currentGame?: string | null,
  status?: RoomStatus,
  expectedState?: unknown,
) {
  const result = await pool.query<RoomRow>(
    `UPDATE rooms
     SET state = $2::jsonb,
         current_game = COALESCE($3, current_game),
         status = COALESCE($4, status),
         updated_at = now()
     WHERE code = $1
       AND ($5::jsonb IS NULL OR state = $5::jsonb)
     RETURNING id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [normalizeRoomCode(code), JSON.stringify(state), currentGame ?? null, status ?? null, expectedState == null ? null : JSON.stringify(expectedState)],
  );
  if (!result.rows[0] && expectedState != null) throw new Error("version_conflict");
  return result.rows[0] ?? null;
}

export async function updateRoomProgress({
  code,
  status,
  currentGame,
  state,
  participantId,
  eventType,
}: {
  code: string;
  status: RoomStatus;
  currentGame: string | null;
  state: unknown;
  participantId?: string | null;
  eventType: "game_started" | "game_advanced" | "game_completed" | "game_reset";
}) {
  const normalizedCode = normalizeRoomCode(code);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<RoomRow>(
      `UPDATE rooms
       SET status = $2,
           current_game = $3,
           state = $4::jsonb,
           updated_at = now()
       WHERE code = $1
       RETURNING id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [normalizedCode, status, currentGame, JSON.stringify(state)],
    );

    const room = result.rows[0] ?? null;
    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [room.id, participantId ?? null, eventType, JSON.stringify({ status, currentGame, state })],
    );

    await client.query("COMMIT");
    return findRoomByCode(room.code);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listRoomEvents(code: string) {
  const eventsResult = await pool.query<RoomEventRow>(
    `SELECT e.id::text AS id,
            e.room_id AS "roomId",
            e.participant_id AS "participantId",
            p.name AS "participantName",
            e.event_type AS "eventType",
            e.payload,
            e.created_at AS "createdAt"
     FROM room_events e
     INNER JOIN rooms r ON r.id = e.room_id
     LEFT JOIN participants p ON p.id = e.participant_id
     WHERE r.code = $1
     ORDER BY e.created_at ASC, e.id ASC`,
    [normalizeRoomCode(code)],
  );

  return eventsResult.rows;
}

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
}

async function migrateDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nomikai:database:migrations'))");
    await client.query(`
    CREATE TABLE IF NOT EXISTS public.rooms (
      id uuid PRIMARY KEY,
      code text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'waiting',
      current_game text,
      state jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.participants (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
      name text NOT NULL,
      role text NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player')),
      auth_token_hash text,
      connected boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.room_events (
      id bigserial PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
      participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
      event_type text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.participant_socket_connections (
      socket_id text PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
      participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.participant_transfer_codes (
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
      participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
      created_by_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS participants_room_id_idx ON public.participants(room_id);
    CREATE INDEX IF NOT EXISTS room_events_room_id_idx ON public.room_events(room_id);
    CREATE INDEX IF NOT EXISTS participant_socket_connections_room_id_idx
      ON public.participant_socket_connections(room_id);
    CREATE INDEX IF NOT EXISTS participant_socket_connections_participant_id_idx
      ON public.participant_socket_connections(participant_id);
    CREATE INDEX IF NOT EXISTS participant_socket_connections_updated_at_idx
      ON public.participant_socket_connections(updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS participant_transfer_codes_room_hash_idx
      ON public.participant_transfer_codes(room_id, code_hash);
    CREATE INDEX IF NOT EXISTS participant_transfer_codes_participant_id_idx
      ON public.participant_transfer_codes(participant_id);
    CREATE INDEX IF NOT EXISTS participant_transfer_codes_active_idx
      ON public.participant_transfer_codes(room_id, expires_at)
      WHERE used_at IS NULL;
    `);

    await client.query(`
    DO $$
    DECLARE
      constraint_record record;
    BEGIN
      FOR constraint_record IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'public.rooms'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE public.rooms DROP CONSTRAINT %I', constraint_record.conname);
      END LOOP;

      ALTER TABLE public.rooms
        ADD CONSTRAINT rooms_status_check
        CHECK (status IN ('waiting', 'playing', 'complete', 'closed'));

      ALTER TABLE public.participants
        ADD COLUMN IF NOT EXISTS auth_token_hash text;

      CREATE INDEX IF NOT EXISTS participants_auth_token_hash_idx
        ON public.participants(auth_token_hash)
        WHERE auth_token_hash IS NOT NULL;
    END $$;
    `);

  // v2 uses an append-only snapshot boundary so rooms survive API restarts.
  // The snapshot contains private state in the database only; event payloads
  // intentionally contain metadata and never anonymous text, topics or roles.
    await client.query(`
    CREATE TABLE IF NOT EXISTS public.v2_rooms (
      code text PRIMARY KEY,
      id text NOT NULL,
      status text NOT NULL,
      version integer NOT NULL,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      host_token_hash text NOT NULL,
      participants jsonb NOT NULL,
      game jsonb
    );
    CREATE INDEX IF NOT EXISTS v2_rooms_expires_at_idx ON public.v2_rooms(expires_at);
    CREATE TABLE IF NOT EXISTS public.v2_participant_presence (
      room_code text NOT NULL REFERENCES public.v2_rooms(code) ON DELETE CASCADE,
      participant_id text NOT NULL,
      connected boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (room_code, participant_id)
    );
    CREATE INDEX IF NOT EXISTS v2_participant_presence_updated_at_idx
      ON public.v2_participant_presence(updated_at);
    INSERT INTO public.v2_participant_presence (room_code, participant_id, connected)
    SELECT room.code,
           participant->>'id',
           participant->>'connected' = 'true'
      FROM public.v2_rooms AS room
      CROSS JOIN LATERAL jsonb_array_elements(room.participants) AS participant
     WHERE participant->>'id' IS NOT NULL
    ON CONFLICT (room_code, participant_id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS public.v2_room_events (
      id bigserial PRIMARY KEY,
      room_code text NOT NULL REFERENCES public.v2_rooms(code) ON DELETE RESTRICT,
      event_type text NOT NULL,
      correlation_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz,
      available_at timestamptz NOT NULL DEFAULT now(),
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      dead_at timestamptz
    );
    ALTER TABLE public.v2_room_events
      ADD COLUMN IF NOT EXISTS processed_at timestamptz,
      ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_error text,
      ADD COLUMN IF NOT EXISTS dead_at timestamptz;
    DO $$
    DECLARE
      foreign_key_record record;
    BEGIN
      FOR foreign_key_record IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'public.v2_room_events'::regclass
           AND confrelid = 'public.v2_rooms'::regclass
           AND contype = 'f'
      LOOP
        EXECUTE format('ALTER TABLE public.v2_room_events DROP CONSTRAINT %I', foreign_key_record.conname);
      END LOOP;

      ALTER TABLE public.v2_room_events
        ADD CONSTRAINT v2_room_events_room_code_fkey
        FOREIGN KEY (room_code) REFERENCES public.v2_rooms(code) ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    UPDATE public.v2_room_events
       SET available_at = COALESCE(available_at, created_at, now()),
           attempts = GREATEST(COALESCE(attempts, 0), 0)
     WHERE available_at IS NULL OR attempts IS NULL OR attempts < 0;
    ALTER TABLE public.v2_room_events
      ALTER COLUMN available_at SET DEFAULT now(),
      ALTER COLUMN available_at SET NOT NULL,
      ALTER COLUMN attempts SET DEFAULT 0,
      ALTER COLUMN attempts SET NOT NULL;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.v2_room_events'::regclass
           AND conname = 'v2_room_events_attempts_nonnegative'
      ) THEN
        ALTER TABLE public.v2_room_events
          ADD CONSTRAINT v2_room_events_attempts_nonnegative CHECK (attempts >= 0);
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS v2_room_events_room_created_idx
      ON public.v2_room_events(room_code, created_at, id);
    CREATE INDEX IF NOT EXISTS v2_room_events_outbox_pending_idx
      ON public.v2_room_events(available_at, id)
      WHERE processed_at IS NULL AND dead_at IS NULL;
    CREATE TABLE IF NOT EXISTS public.v2_idempotency_records (
      idempotency_key text PRIMARY KEY,
      room_code text NOT NULL,
      command_id text NOT NULL,
      body_hash text NOT NULL,
      actor_id text NOT NULL,
      result jsonb NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS v2_idempotency_records_expires_at_idx
      ON public.v2_idempotency_records(expires_at);
    DROP INDEX IF EXISTS v2_idempotency_records_lookup_idx;
    CREATE INDEX IF NOT EXISTS v2_idempotency_records_lookup_idx
      ON public.v2_idempotency_records(actor_id, room_code, command_id, expires_at);
    CREATE OR REPLACE FUNCTION public.prevent_v2_room_delete_with_pending_events()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF OLD.expires_at <= now() AND EXISTS (
        SELECT 1
          FROM public.v2_room_events
         WHERE room_code = OLD.code
           AND processed_at IS NULL
      ) THEN
        RAISE EXCEPTION 'v2_room_pending_events';
      END IF;
      RETURN OLD;
    END;
    $function$;
    DROP TRIGGER IF EXISTS v2_rooms_preserve_pending_events ON public.v2_rooms;
    CREATE TRIGGER v2_rooms_preserve_pending_events
      BEFORE DELETE ON public.v2_rooms
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_v2_room_delete_with_pending_events();
    `);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function findRoomForUpdate(client: pg.PoolClient, code: string) {
  const roomResult = await client.query<RoomRow>(
    `SELECT id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM rooms
     WHERE code = $1
     FOR UPDATE`,
    [code],
  );
  return roomResult.rows[0] ?? null;
}

async function findParticipantInRoom(client: pg.PoolClient, roomId: string, participantId: string) {
  const participantResult = await client.query<ParticipantRow>(
    `SELECT id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM participants
     WHERE room_id = $1 AND id = $2`,
    [roomId, participantId],
  );
  return participantResult.rows[0] ?? null;
}

async function assertRoomHost(client: pg.PoolClient, roomId: string, participantId: string) {
  const requester = await findParticipantInRoom(client, roomId, participantId);
  if (!requester || requester.role !== "host") {
    throw new Error("host_required");
  }
}

async function updateParticipantConnectionFromSockets(client: pg.PoolClient, participantId: string) {
  await client.query(
    `UPDATE participants p
     SET connected = EXISTS (
           SELECT 1
           FROM participant_socket_connections c
           WHERE c.participant_id = p.id
         ),
         updated_at = now()
     WHERE p.id = $1`,
    [participantId],
  );
}

async function createUniqueRoomCode(client: pg.PoolClient) {
  for (let index = 0; index < 20; index += 1) {
    const code = randomCode();
    const existing = await client.query("SELECT 1 FROM rooms WHERE code = $1", [code]);
    if (existing.rowCount === 0) {
      return code;
    }
  }
  throw new Error("room_code_generation_failed");
}

async function createUniqueParticipantTransferCode(client: pg.PoolClient, roomId: string) {
  for (let index = 0; index < 20; index += 1) {
    const transferCode = randomParticipantTransferCode();
    const codeHash = hashParticipantTransferCode(roomId, transferCode);
    const existing = await client.query("SELECT 1 FROM participant_transfer_codes WHERE room_id = $1 AND code_hash = $2", [
      roomId,
      codeHash,
    ]);
    if (existing.rowCount === 0) {
      return { transferCode, codeHash };
    }
  }
  throw new Error("transfer_code_generation_failed");
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function randomParticipantTransferCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

function normalizeParticipantTransferCode(code: string) {
  return code.trim().toUpperCase();
}

function hashParticipantTransferCode(roomId: string, code: string) {
  return createHash("sha256").update(`${roomId}:${normalizeParticipantTransferCode(code)}`).digest("hex");
}

function createParticipantToken() {
  return randomBytes(32).toString("base64url");
}

function hashParticipantToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
