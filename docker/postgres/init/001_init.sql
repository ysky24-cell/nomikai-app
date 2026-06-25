CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'waiting',
  current_game text,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rooms_code_idx ON rooms (code);

CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'player',
  connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS participants_room_id_idx ON participants (room_id);

CREATE TABLE IF NOT EXISTS room_events (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_events_room_id_idx ON room_events (room_id, created_at DESC);
