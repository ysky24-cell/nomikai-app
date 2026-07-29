export const NEW_SYNC_ROOM_GAME_KEYS = [
  "two-choice",
  "impression-ranking",
  "majority-game",
  "anonymous-box",
  "word-wolf",
  "werewolf-game",
] as const;

export function isNewSyncRoomGameKey(key: string) {
  return (NEW_SYNC_ROOM_GAME_KEYS as readonly string[]).includes(key);
}
