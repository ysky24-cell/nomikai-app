CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'complete', 'closed')),
  current_game text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player')),
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_events (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participant_socket_connections (
  socket_id text PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participant_transfer_codes (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  created_by_participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS participants_room_id_idx ON participants(room_id);
CREATE INDEX IF NOT EXISTS room_events_room_id_idx ON room_events(room_id);
CREATE INDEX IF NOT EXISTS participant_socket_connections_room_id_idx ON participant_socket_connections(room_id);
CREATE INDEX IF NOT EXISTS participant_socket_connections_participant_id_idx ON participant_socket_connections(participant_id);
CREATE UNIQUE INDEX IF NOT EXISTS participant_transfer_codes_room_hash_idx ON participant_transfer_codes(room_id, code_hash);
CREATE INDEX IF NOT EXISTS participant_transfer_codes_participant_id_idx ON participant_transfer_codes(participant_id);
CREATE INDEX IF NOT EXISTS participant_transfer_codes_active_idx ON participant_transfer_codes(room_id, expires_at) WHERE used_at IS NULL;
