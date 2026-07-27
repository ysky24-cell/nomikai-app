export const STORAGE_SCHEMA_VERSION = 1;

type StorageEnvelope<T> = {
  version: number;
  savedAt: string;
  data: T;
};

type StorageReadOptions<T> = {
  initialState: T;
  validate?: (value: unknown) => value is T;
  maxAgeMs?: number;
};

export type StorageReadStatus =
  | "empty"
  | "ok"
  | "legacy"
  | "invalid"
  | "expired"
  | "future-version";

export type StorageReadResult<T> = {
  value: T;
  status: StorageReadStatus;
};

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; error: unknown };

const builtInStepValues: Record<string, readonly string[]> = {
  yamanote: ["setup", "play", "complete"],
  "two-choice": ["setup", "vote", "result", "complete"],
  "word-wolf": ["setup", "reveal", "discussion", "vote", "result"],
  "ng-word": ["setup", "reveal", "play", "result"],
  "impression-ranking": ["setup", "vote", "result", "complete"],
  "party-pack": ["setup", "prompt", "complete"],
  "johari-window": ["setup", "self", "peer", "result", "complete"],
  "turtle-soup": ["setup", "play", "complete"],
  "anonymous-box": ["setup", "question", "complete"],
};

const nullableStringValues: Record<string, readonly string[]> = {
  lastDrawResult: ["safe", "hazard"],
  winner: ["village", "werewolves"],
};

const exactStringValues: Record<string, readonly string[]> = {
  phase: ["setup", "reveal", "night", "day", "vote", "voteResult", "result"],
  nightStep: ["werewolf", "seer", "knight", "medium", "dawn"],
  difficulty: ["easy", "normal"],
  role: ["werewolf", "villager", "seer", "knight", "medium", "majority", "minority"],
  answer: ["はい", "いいえ", "関係ありません", "補足あり"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrictIsoDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function looksLikeStorageEnvelope(value: unknown) {
  return (
    isRecord(value) &&
    ("version" in value || "savedAt" in value) &&
    ("data" in value || "version" in value)
  );
}

function isCurrentStorageEnvelope(value: unknown): value is StorageEnvelope<unknown> {
  return (
    isRecord(value) &&
    value.version === STORAGE_SCHEMA_VERSION &&
    isStrictIsoDate(value.savedAt) &&
    Object.prototype.hasOwnProperty.call(value, "data")
  );
}

function getStoredStateKey(storageKey: string) {
  const separatorIndex = storageKey.lastIndexOf(":");
  return separatorIndex >= 0 ? storageKey.slice(separatorIndex + 1) : storageKey;
}

function broadKind(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function hasSafeObjectKey(key: string) {
  return key !== "__proto__" && key !== "prototype" && key !== "constructor";
}

function isValidId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

function isPlayer(value: unknown) {
  return (
    isRecord(value) &&
    isValidId(value.id) &&
    typeof value.name === "string" &&
    value.name.length <= 500
  );
}

function isValidStringForKey(
  value: string,
  key: string,
  storageKey: string,
) {
  if (value.length > 200_000) return false;
  if (/(?:^|_)(?:id)$/i.test(key) || /Id$/.test(key)) return isValidId(value);
  if (/(?:At|EndsAt)$/.test(key)) return isStrictIsoDate(value);

  const exactValues = exactStringValues[key];
  if (exactValues && !exactValues.includes(value)) return false;

  if (key === "step") {
    const stateKey = getStoredStateKey(storageKey);
    const allowed = builtInStepValues[stateKey] ?? ["setup", "play", "complete"];
    return allowed.includes(value);
  }
  return true;
}

function isValidArray(
  value: unknown[],
  key: string,
  storageKey: string,
  initialItem?: unknown,
) {
  if (key === "players") {
    if (!value.every(isPlayer)) return false;
    const ids = value.map((item) => (item as Record<string, unknown>).id as string);
    return new Set(ids).size === ids.length;
  }

  if (/Ids$/.test(key) || key === "actionLog") {
    return value.every((item) => isValidId(item));
  }

  if (
    ["assignments", "answerLog", "questionLog", "customQuestions"].includes(key) &&
    !value.every(isRecord)
  ) {
    return false;
  }

  const expectedKind = initialItem === undefined ? null : broadKind(initialItem);
  const populatedKinds = new Set(value.filter((item) => item !== null).map(broadKind));
  if (expectedKind && value.some((item) => broadKind(item) !== expectedKind)) return false;
  if (!expectedKind && populatedKinds.size > 1) return false;

  return value.every((item) => isValidJsonValue(item, key, storageKey));
}

function isValidJsonValue(value: unknown, key: string, storageKey: string): boolean {
  if (value === null) return true;
  if (typeof value === "string") return isValidStringForKey(value, key, storageKey);
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return isValidArray(value, key, storageKey);
  if (!isRecord(value)) return false;

  if (/(?:Counts|positions|resourceCounts)$/.test(key)) {
    return Object.entries(value).every(
      ([recordKey, item]) =>
        isValidId(recordKey) &&
        typeof item === "number" &&
        Number.isFinite(item) &&
        item >= 0,
    );
  }
  if (["territory", "votes", "guesses"].includes(key)) {
    return Object.entries(value).every(
      ([recordKey, item]) =>
        isValidId(recordKey) &&
        typeof item === "string" &&
        item.length <= 200_000,
    );
  }

  return Object.entries(value).every(
    ([childKey, item]) =>
      hasSafeObjectKey(childKey) && isValidJsonValue(item, childKey, storageKey),
  );
}

function isCompatibleValue(
  value: unknown,
  initialValue: unknown,
  key: string,
  storageKey: string,
): boolean {
  if (initialValue === null) {
    if (value === null) return true;
    const allowed = nullableStringValues[key];
    if (allowed) return typeof value === "string" && allowed.includes(value);
    if (/(?:At|EndsAt)$/.test(key)) return isStrictIsoDate(value);
    return typeof value === "string" && isValidStringForKey(value, key, storageKey);
  }

  if (Array.isArray(initialValue)) {
    return (
      Array.isArray(value) &&
      isValidArray(value, key, storageKey, initialValue[0])
    );
  }

  if (isRecord(initialValue)) {
    if (!isRecord(value)) return false;
    return Object.entries(value).every(([childKey, item]) => {
      if (!hasSafeObjectKey(childKey)) return false;
      if (Object.prototype.hasOwnProperty.call(initialValue, childKey)) {
        return isCompatibleValue(
          item,
          initialValue[childKey],
          childKey,
          storageKey,
        );
      }
      return isValidJsonValue(item, childKey, storageKey);
    });
  }

  if (typeof initialValue === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (typeof initialValue === "string") {
    return (
      typeof value === "string" &&
      isValidStringForKey(value, key, storageKey)
    );
  }
  return typeof value === typeof initialValue;
}

function isCompatibleState<T>(
  value: unknown,
  initialState: T,
  storageKey: string,
): value is T {
  if (!isRecord(initialState)) {
    return isCompatibleValue(value, initialState, "", storageKey);
  }
  if (!isRecord(value)) return false;

  return Object.entries(value).every(([key, item]) => {
    if (!hasSafeObjectKey(key)) return false;
    if (!Object.prototype.hasOwnProperty.call(initialState, key)) {
      return isValidJsonValue(item, key, storageKey);
    }
    return isCompatibleValue(item, initialState[key], key, storageKey);
  });
}

function mergeKnownStateKeys<T>(value: T, initialState: T): T {
  if (!isRecord(initialState) || !isRecord(value)) return value;
  const merged: Record<string, unknown> = { ...initialState };
  for (const key of Object.keys(initialState)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) merged[key] = value[key];
  }
  return merged as T;
}

export function readVersionedStorageResult<T>(
  storageKey: string,
  { initialState, validate, maxAgeMs }: StorageReadOptions<T>,
): StorageReadResult<T> {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return { value: initialState, status: "empty" };

    const parsed: unknown = JSON.parse(stored);
    if (looksLikeStorageEnvelope(parsed) && !isCurrentStorageEnvelope(parsed)) {
      if (
        isRecord(parsed) &&
        typeof parsed.version === "number" &&
        parsed.version > STORAGE_SCHEMA_VERSION
      ) {
        return { value: initialState, status: "future-version" };
      }
      return { value: initialState, status: "invalid" };
    }

    const envelope = isCurrentStorageEnvelope(parsed) ? parsed : null;
    if (
      envelope &&
      maxAgeMs &&
      Date.now() - Date.parse(envelope.savedAt) > maxAgeMs
    ) {
      return { value: initialState, status: "expired" };
    }

    const candidate = envelope?.data ?? parsed;
    const isValid = validate
      ? validate(candidate)
      : isCompatibleState(candidate, initialState, storageKey);
    if (!isValid) return { value: initialState, status: "invalid" };

    return {
      value: mergeKnownStateKeys(candidate as T, initialState),
      status: envelope ? "ok" : "legacy",
    };
  } catch {
    return { value: initialState, status: "invalid" };
  }
}

export function readVersionedStorage<T>(
  storageKey: string,
  options: StorageReadOptions<T>,
): T {
  return readVersionedStorageResult(storageKey, options).value;
}

export function writeVersionedStorage<T>(
  storageKey: string,
  data: T,
): StorageWriteResult {
  try {
    // Adult-topic consent is intentionally session-only. Do not keep it in
    // long-term browser storage where a later group could inherit the choice.
    const persistedData = stripSessionOnlyConsent(data);
    const envelope: StorageEnvelope<T> = {
      version: STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      data: persistedData as T,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function stripSessionOnlyConsent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSessionOnlyConsent);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "includeAdultTopics") continue;
    result[key] = stripSessionOnlyConsent(item);
  }
  return result;
}

export function removeStoredValue(storageKey: string): StorageWriteResult {
  try {
    window.localStorage.removeItem(storageKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
