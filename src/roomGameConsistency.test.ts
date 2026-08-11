import { describe, expect, it } from "vitest";
import { isWerewolfPlayerCountSupported } from "./App";
import { urlCandidateGameByKey } from "./data/urlCandidateGames";
import { getSyncGameDefinition } from "./syncGameDefinitions";

describe("room game contracts", () => {
  it("keeps reverse-word-game turn progression across the room definition", () => {
    const definition = getSyncGameDefinition("reverse-word-game");

    expect(definition.progression).toBe("turn");
    expect(definition.rule).toContain("順番");
  });

  it("advertises the supported four-or-six-plus werewolf roster rule", () => {
    const definition = urlCandidateGameByKey["werewolf-game"];

    expect(isWerewolfPlayerCountSupported(4)).toBe(true);
    expect(isWerewolfPlayerCountSupported(5)).toBe(false);
    expect(isWerewolfPlayerCountSupported(6)).toBe(true);
    expect(definition.minPlayers).toBe(4);
    expect(definition.maxPlayers).toBe(12);
    expect(definition.people).toContain("4人");
    expect(definition.setupSteps[0]).toContain("5人構成は対象外");
  });
});
