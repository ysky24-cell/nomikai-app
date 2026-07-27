import { beforeEach, describe, expect, it } from "vitest";
import { emptyPartySession, isPartySession, readPartySession, updatePartySessionGame, updatePartySessionParticipants } from "./partySession";

describe("PartySession", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps participants while moving between games and deduplicates recent games", () => {
    updatePartySessionParticipants([{ id: "p1", name: "あき" }, { id: "p2", name: "ゆう" }]);
    updatePartySessionGame("two-choice");
    updatePartySessionGame("yamanote");
    updatePartySessionGame("two-choice");
    const session = readPartySession();
    expect(session.participants.map((item) => item.name)).toEqual(["あき", "ゆう"]);
    expect(session.lastGameKey).toBe("two-choice");
    expect(session.recentGameKeys).toEqual(["two-choice", "yamanote"]);
    expect(isPartySession(session)).toBe(true);
  });

  it("falls back to a safe empty session", () => {
    window.localStorage.setItem("nomikai:party-session", "{broken");
    expect(readPartySession()).toEqual(emptyPartySession);
  });
});
