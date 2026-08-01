import { ensureDatabaseMigrations, pool } from "../db.js";
import type { RoomPresenceChange, RoomRecord, RoomRepository } from "./room.js";

type RoomRow = {
  id: string;
  code: string;
  status: RoomRecord["status"];
  version: number;
  createdAt: Date | string;
  expiresAt: Date | string;
  hostTokenHash: string;
  participants: RoomRecord["participants"];
  game: RoomRecord["game"] | null;
};

function asMillis(value: Date | string) {
  return new Date(value).getTime();
}

function fromRow(row: RoomRow): RoomRecord {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    version: row.version,
    createdAt: asMillis(row.createdAt),
    expiresAt: asMillis(row.expiresAt),
    hostTokenHash: row.hostTokenHash,
    participants: row.participants,
    ...(row.game ? { game: row.game } : {}),
  };
}

/** PostgreSQL snapshot repository used by the v2 API in production. */
export class PostgresRoomRepository implements RoomRepository {
  async create(room: RoomRecord) {
    await ensureDatabaseMigrations();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO v2_rooms
          (code, id, status, version, created_at, expires_at, host_token_hash, participants, game)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7, $8::jsonb, $9::jsonb)`,
        [room.code, room.id, room.status, room.version, room.createdAt, room.expiresAt, room.hostTokenHash,
          JSON.stringify(room.participants), JSON.stringify(room.game ?? null)],
      );
      await this.applyPresenceChanges(client, room.code, room.participants.map((participant) => ({
        participantId: participant.id,
        connected: participant.connected,
      })));
      await this.appendMetadata(client, room, "v2_room_created");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(code: string) {
    await ensureDatabaseMigrations();
    const result = await pool.query<RoomRow>(
      `SELECT id, code, status, version,
              created_at AS "createdAt", expires_at AS "expiresAt",
              host_token_hash AS "hostTokenHash", participants, game
         FROM v2_rooms WHERE code = $1`,
      [code.trim().toUpperCase()],
    );
    const row = result.rows[0];
    if (!row) return null;
    const presenceResult = await pool.query<{ participantId: string; connected: boolean }>(
      `SELECT participant_id AS "participantId", connected
         FROM v2_participant_presence
        WHERE room_code = $1`,
      [code.trim().toUpperCase()],
    );
    const connectedByParticipantId = new Map(presenceResult.rows.map((presence) => [presence.participantId, presence.connected]));
    const room = fromRow(row);
    room.participants = room.participants.map((participant) => connectedByParticipantId.has(participant.id)
      ? { ...participant, connected: connectedByParticipantId.get(participant.id)! }
      : participant);
    return room;
  }

  async save(room: RoomRecord, presenceChanges: readonly RoomPresenceChange[] = []) {
    await ensureDatabaseMigrations();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE v2_rooms
            SET status = $2, version = $3, expires_at = to_timestamp($4 / 1000.0),
                host_token_hash = $5, participants = $6::jsonb, game = $7::jsonb
          WHERE code = $1 AND version = $3 - 1 AND expires_at > now()`,
        [room.code, room.status, room.version, room.expiresAt, room.hostTokenHash,
          JSON.stringify(room.participants), JSON.stringify(room.game ?? null)],
      );
      if (result.rowCount !== 1) throw new Error("version_conflict");
      await this.applyPresenceChanges(client, room.code, presenceChanges);
      await this.appendMetadata(client, room, "v2_snapshot_saved");
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listActiveCodes(now = Date.now()) {
    await ensureDatabaseMigrations();
    const result = await pool.query<{ code: string }>(
      `SELECT code
         FROM v2_rooms
        WHERE expires_at > to_timestamp($1 / 1000.0)
          AND game IS NOT NULL
          AND status IN ('locked', 'playing', 'finished')
        ORDER BY code`,
      [now],
    );
    return result.rows.map((row) => row.code);
  }

  async setParticipantConnected(roomCode: string, participantId: string, connected: boolean) {
    await ensureDatabaseMigrations();
    const result = await pool.query(
      `WITH existing_participant AS (
        SELECT 1
          FROM v2_rooms
         WHERE code = $1
           AND EXISTS (
             SELECT 1
               FROM jsonb_array_elements(participants) AS participant
              WHERE participant->>'id' = $2
           )
      )
      INSERT INTO v2_participant_presence (room_code, participant_id, connected)
      SELECT $1, $2, $3
        FROM existing_participant
      ON CONFLICT (room_code, participant_id)
      DO UPDATE SET connected = EXCLUDED.connected, updated_at = now()`,
      [roomCode.trim().toUpperCase(), participantId, connected],
    );
    return result.rowCount === 1;
  }

  private async applyPresenceChanges(
    client: { query: (text: string, values?: unknown[]) => Promise<{ rowCount?: number | null }> },
    roomCode: string,
    presenceChanges: readonly RoomPresenceChange[],
  ) {
    for (const change of presenceChanges) {
      if (change.connected) {
        await client.query(
          `INSERT INTO v2_participant_presence (room_code, participant_id, connected)
           SELECT $1, $2, TRUE
             WHERE EXISTS (
               SELECT 1
                 FROM v2_rooms
                WHERE code = $1
                  AND EXISTS (
                    SELECT 1
                      FROM jsonb_array_elements(participants) AS participant
                     WHERE participant->>'id' = $2
                  )
             )
           ON CONFLICT (room_code, participant_id)
           DO UPDATE SET connected = TRUE, updated_at = now()`,
          [roomCode.trim().toUpperCase(), change.participantId],
        );
      } else {
        await client.query(
          `DELETE FROM v2_participant_presence
            WHERE room_code = $1 AND participant_id = $2`,
          [roomCode.trim().toUpperCase(), change.participantId],
        );
      }
    }
  }

  async cleanupExpired(now = Date.now()) {
    await ensureDatabaseMigrations();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Keep the whole event history for an expired room until every outbox
      // event is processed. This makes expiry cleanup unable to discard work
      // that a worker has not claimed or acknowledged yet.
      await client.query(
        `DELETE FROM v2_room_events event
           USING v2_rooms room
          WHERE event.room_code = room.code
            AND room.expires_at <= to_timestamp($1 / 1000.0)
            AND NOT EXISTS (
              SELECT 1
                FROM v2_room_events pending
               WHERE pending.room_code = room.code
                 AND pending.processed_at IS NULL
                 AND pending.dead_at IS NULL
            )`,
        [now],
      );

      const result = await client.query(
        `DELETE FROM v2_rooms room
          WHERE room.expires_at <= to_timestamp($1 / 1000.0)
            AND NOT EXISTS (
              SELECT 1
                FROM v2_room_events event
               WHERE event.room_code = room.code
            )`,
        [now],
      );
      await client.query("COMMIT");
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async appendMetadata(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }, room: RoomRecord, eventType: string) {
    await client.query(
      `INSERT INTO v2_room_events (room_code, event_type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [room.code, eventType, JSON.stringify({ version: room.version, participantCount: room.participants.length, status: room.status })],
    );
  }
}
