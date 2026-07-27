import { removeStoredValue, readVersionedStorageResult, writeVersionedStorage } from "./storage";

export const PARTY_SESSION_KEY = "nomikai:party-session";

export type PartyParticipant = {
  id: string;
  name: string;
};

export type PartySession = {
  sessionId: string;
  participants: PartyParticipant[];
  lastGameKey: string | null;
  recentGameKeys: string[];
  updatedAt: string;
};

export const emptyPartySession: PartySession = {
  sessionId: "",
  participants: [],
  lastGameKey: null,
  recentGameKeys: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function isPartyParticipant(value: unknown): value is PartyParticipant {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<PartyParticipant>;
  return typeof item.id === "string" && item.id.length > 0 && typeof item.name === "string" && item.name.trim().length > 0;
}

export function isPartySession(value: unknown): value is PartySession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<PartySession>;
  return (
    typeof session.sessionId === "string" &&
    Array.isArray(session.participants) &&
    session.participants.every(isPartyParticipant) &&
    new Set(session.participants.map((item) => item.id)).size === session.participants.length &&
    (session.lastGameKey === null || typeof session.lastGameKey === "string") &&
    Array.isArray(session.recentGameKeys) &&
    session.recentGameKeys.every((item) => typeof item === "string") &&
    typeof session.updatedAt === "string"
  );
}

function createSessionId() {
  return `party-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readPartySession(): PartySession {
  const result = readVersionedStorageResult(PARTY_SESSION_KEY, {
    initialState: emptyPartySession,
    validate: isPartySession,
  });
  if (result.status === "invalid") {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("nomikai-storage-issue", { detail: { message: "参加者セッションの保存データが壊れていたため、空の参加者一覧で開始しました。" } }));
    }, 0);
  }
  if (result.status === "legacy") writeVersionedStorage(PARTY_SESSION_KEY, result.value);
  return result.value;
}

export function writePartySession(session: PartySession) {
  const result = writeVersionedStorage(PARTY_SESSION_KEY, {
    ...session,
    sessionId: session.sessionId || createSessionId(),
    updatedAt: new Date().toISOString(),
  });
  if (result.ok) window.dispatchEvent(new Event("nomikai-party-session"));
  return result;
}

export function updatePartySessionGame(gameKey: string, participants?: readonly PartyParticipant[]) {
  const current = readPartySession();
  const recent = [gameKey, ...current.recentGameKeys.filter((item) => item !== gameKey)].slice(0, 5);
  return writePartySession({
    ...current,
    sessionId: current.sessionId || createSessionId(),
    participants: participants ? [...participants] : current.participants,
    lastGameKey: gameKey,
    recentGameKeys: recent,
    updatedAt: new Date().toISOString(),
  });
}

export function updatePartySessionParticipants(participants: readonly PartyParticipant[]) {
  const unique = participants.filter(
    (participant, index, all) => participant.name.trim().length > 0 && all.findIndex((item) => item.id === participant.id) === index,
  );
  const current = readPartySession();
  return writePartySession({ ...current, participants: [...unique] });
}

export function removePartySessionGame(gameKey: string) {
  const current = readPartySession();
  const recentGameKeys = current.recentGameKeys.filter((item) => item !== gameKey);
  return writePartySession({
    ...current,
    lastGameKey: current.lastGameKey === gameKey ? recentGameKeys[0] ?? null : current.lastGameKey,
    recentGameKeys,
  });
}

export function clearPartySession() {
  return removeStoredValue(PARTY_SESSION_KEY);
}
