import { createHash, randomInt, randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "./config.js";
import type { ParticipantRow, ParticipantTransferCodeRow, RoomEventRow, RoomRow, RoomStatus } from "./types.js";

const { Pool } = pg;
const participantTransferCodeTtlMs = 10 * 60 * 1000;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

let migrationPromise: Promise<void> | null = null;

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

export async function createRoom(hostName?: string) {
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
    if (hostName?.trim()) {
      const hostResult = await client.query<ParticipantRow>(
        `INSERT INTO participants (id, room_id, name, role, connected)
         VALUES ($1, $2, $3, 'host', true)
         RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), roomId, hostName.trim()],
      );
      host = hostResult.rows[0];
    }

    await client.query(
      `INSERT INTO room_events (room_id, participant_id, event_type, payload)
       VALUES ($1, $2, 'room_created', $3::jsonb)`,
      [roomId, host?.id ?? null, JSON.stringify({ hostName: host?.name ?? null })],
    );

    await client.query("COMMIT");
    return { room: roomResult.rows[0], host };
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
  const roomSnapshot = await findRoomByCode(code);
  if (!roomSnapshot) {
    return null;
  }
  if (roomSnapshot.room.status === "closed") {
    throw new Error("room_closed");
  }

  const participantResult = await pool.query<ParticipantRow>(
    `INSERT INTO participants (id, room_id, name, connected)
     VALUES ($1, $2, $3, true)
     RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [randomUUID(), roomSnapshot.room.id, name.trim()],
  );

  const participant = participantResult.rows[0];
  await pool.query(
    `INSERT INTO room_events (room_id, participant_id, event_type, payload)
     VALUES ($1, $2, 'participant_joined', $3::jsonb)`,
    [roomSnapshot.room.id, participant.id, JSON.stringify({ name: participant.name })],
  );

  return participant;
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
  await pool.query(
    `UPDATE participants
     SET connected = $2, updated_at = now()
     WHERE id = $1`,
    [participantId, connected],
  );
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

    const participantResult = await client.query<ParticipantRow>(
      `UPDATE participants
       SET connected = true,
           updated_at = now()
       WHERE id = $1 AND room_id = $2
       RETURNING id, room_id AS "roomId", name, role, connected, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [activeTransferCode.participantId, room.id],
    );
    const participant = participantResult.rows[0] ?? null;
    if (!participant) {
      throw new Error("participant_not_found");
    }

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
    return snapshot ? { participant, snapshot } : null;
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

export async function updateRoomState(code: string, state: unknown, currentGame?: string | null, status?: RoomStatus) {
  const result = await pool.query<RoomRow>(
    `UPDATE rooms
     SET state = $2::jsonb,
         current_game = COALESCE($3, current_game),
         status = COALESCE($4, status),
         updated_at = now()
     WHERE code = $1
     RETURNING id, code, status, current_game AS "currentGame", state, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [normalizeRoomCode(code), JSON.stringify(state), currentGame ?? null, status ?? null],
  );
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
  await pool.query(`
    DO $$
    DECLARE
      constraint_record record;
    BEGIN
      IF to_regclass('public.rooms') IS NULL THEN
        RETURN;
      END IF;

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

      IF to_regclass('public.participants') IS NULL THEN
        RETURN;
      END IF;

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

      CREATE UNIQUE INDEX IF NOT EXISTS participant_transfer_codes_room_hash_idx
        ON public.participant_transfer_codes(room_id, code_hash);

      CREATE INDEX IF NOT EXISTS participant_transfer_codes_participant_id_idx
        ON public.participant_transfer_codes(participant_id);

      CREATE INDEX IF NOT EXISTS participant_transfer_codes_active_idx
        ON public.participant_transfer_codes(room_id, expires_at)
        WHERE used_at IS NULL;
    END $$;
  `);
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
