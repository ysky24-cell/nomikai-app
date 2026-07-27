export type AppRoute =
  | { kind: "home" }
  | { kind: "game"; gameKey: string }
  | { kind: "not-found"; path: string };

export function parseHashRoute(hash: string, isGameKey: (value: string) => boolean): AppRoute {
  const normalized = hash.replace(/^#/, "").replace(/^\/+/, "");
  if (!normalized || normalized === "home") return { kind: "home" };
  const match = normalized.match(/^games\/([^/?#]+)$/);
  if (!match) return { kind: "not-found", path: normalized };
  let gameKey: string;
  try {
    gameKey = decodeURIComponent(match[1]);
  } catch {
    return { kind: "not-found", path: normalized };
  }
  return isGameKey(gameKey) ? { kind: "game", gameKey } : { kind: "not-found", path: normalized };
}

export function formatGameHash(gameKey: string): string {
  return `#/games/${encodeURIComponent(gameKey)}`;
}

export function formatHomeHash(): string {
  return "#/";
}
