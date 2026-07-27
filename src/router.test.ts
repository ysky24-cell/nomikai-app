import { describe, expect, it } from "vitest";
import { formatGameHash, formatHomeHash, parseHashRoute } from "./router";

const isGame = (key: string) => ["two-choice", "yamanote"].includes(key);

describe("hash router", () => {
  it("parses direct game links and preserves unknown routes as 404", () => {
    expect(parseHashRoute("#/games/two-choice", isGame)).toEqual({ kind: "game", gameKey: "two-choice" });
    expect(parseHashRoute("#/games/missing", isGame).kind).toBe("not-found");
    expect(parseHashRoute("#", isGame)).toEqual({ kind: "home" });
  });

  it("formats navigable hashes", () => {
    expect(formatGameHash("two-choice")).toBe("#/games/two-choice");
    expect(formatHomeHash()).toBe("#/");
  });
});
