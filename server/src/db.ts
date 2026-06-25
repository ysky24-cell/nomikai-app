import { randomUUID } from "node:crypto";
import pg from "pg";
import { config } from "./config.js";
import type { ParticipantRow, RoomRow, RoomStatus } from "./types.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

export async function checkDatabase() {
  await pool.query("SELECT 1");
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

function normalizeRoomCode(code: string) {
  return code.trim().toUpperCase();
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

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
