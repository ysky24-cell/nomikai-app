export type RoomStatus = "waiting" | "playing" | "complete" | "closed";

export type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  currentGame: string | null;
  state: unknown;
  createdAt: string;
  updatedAt: string;
};

export type ParticipantRow = {
  id: string;
  roomId: string;
  name: string;
  role: "host" | "player";
  connected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ParticipantTransferCodeRow = {
  id: string;
  roomId: string;
  participantId: string;
  createdByParticipantId: string | null;
  codeHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export type RoomEventRow = {
  id: string;
  roomId: string;
  participantId: string | null;
  participantName: string | null;
  eventType: string;
  payload: unknown;
  createdAt: string;
};
