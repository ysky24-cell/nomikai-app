import { ensureDatabaseMigrations, pool } from "../db.js";
import type { RoomRecord, RoomRepository } from "./room.js";

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
    await pool.query(
      `INSERT INTO v2_rooms
        (code, id, status, version, created_at, expires_at, host_token_hash, participants, game)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0), $7, $8::jsonb, $9::jsonb)`,
      [room.code, room.id, room.status, room.version, room.createdAt, room.expiresAt, room.hostTokenHash,
        JSON.stringify(room.participants), JSON.stringify(room.game ?? null)],
    );
    await this.appendMetadata(room, "v2_room_created");
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
    if (asMillis(row.expiresAt) <= Date.now()) {
      await pool.query(`DELETE FROM v2_rooms WHERE code = $1`, [row.code]);
      return null;
    }
    return fromRow(row);
  }

  async save(room: RoomRecord) {
    await ensureDatabaseMigrations();
    const result = await pool.query(
      `UPDATE v2_rooms
          SET status = $2, version = $3, expires_at = to_timestamp($4 / 1000.0),
              host_token_hash = $5, participants = $6::jsonb, game = $7::jsonb
        WHERE code = $1 AND version = $3 - 1 AND expires_at > now()`,
      [room.code, room.status, room.version, room.expiresAt, room.hostTokenHash,
        JSON.stringify(room.participants), JSON.stringify(room.game ?? null)],
    );
    if (result.rowCount !== 1) throw new Error("version_conflict");
    await this.appendMetadata(room, "v2_snapshot_saved");
  }

  async cleanupExpired(now = Date.now()) {
    await ensureDatabaseMigrations();
    const result = await pool.query(
      `DELETE FROM v2_rooms WHERE expires_at <= to_timestamp($1 / 1000.0)`,
      [now],
    );
    return result.rowCount ?? 0;
  }

  private async appendMetadata(room: RoomRecord, eventType: string) {
    await pool.query(
      `INSERT INTO v2_room_events (room_code, event_type, payload)
       VALUES ($1, $2, $3::jsonb)`,
      [room.code, eventType, JSON.stringify({ version: room.version, participantCount: room.participants.length, status: room.status })],
    );
  }
}

