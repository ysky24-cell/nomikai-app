export type RoomRow = {
  id: string;
  code: string;
  status: string;
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
