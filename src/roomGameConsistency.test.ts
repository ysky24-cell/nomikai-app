import { describe, expect, it } from "vitest";
import { isWerewolfPlayerCountSupported } from "./App";
import { urlCandidateGameByKey } from "./data/urlCandidateGames";
import { getSyncGameDefinition } from "./syncGameDefinitions";
import { isNativeSyncRoomGameKey, isNewSyncRoomGameKey } from "./syncRoomCatalog";

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

  it("routes Johari through the dedicated native v2 catalog", () => {
    expect(isNewSyncRoomGameKey("johari-window")).toBe(true);
    expect(isNativeSyncRoomGameKey("johari-window")).toBe(true);
    expect(getSyncGameDefinition("johari-window").rule).toContain("提出内容は結果まで非公開");
  });

  it("routes the seven conversation/reflex games through dedicated native v2 contracts", () => {
    const nativeContracts = [
      ["ng-word", "自分の語だけ常に非表示"],
      ["turtle-soup", "truth はホストの公開操作まで非表示"],
      ["yamanote", "重複は拒否"],
      ["party-pack", "手番制・同時入力"],
      ["truth-lie-game", "結果公開まで非公開"],
      ["reverse-word-game", "サーバーが管理"],
      ["fast-typing-game", "クライアントの得点は採用しません"],
      ["memory-drawing-game", "画像を送らず"],
      ["value-meter-game", "平均・中央値"],
      ["acting-game", "演者だけに秘密"],
      ["loanword-ban-game", "ストライク"],
    ] as const;

    for (const key of ["song-association-quiz", "drawing-quiz", "funny-line-karuta", "emo-hint-game", "person-hint-quiz", "humming-intro-quiz"] as const) {
      expect(isNewSyncRoomGameKey(key)).toBe(true);
      expect(isNativeSyncRoomGameKey(key)).toBe(true);
      expect(getSyncGameDefinition(key).key).toBe(key);
      expect(getSyncGameDefinition(key).progression).toBe("simultaneous");
    }

    for (const [key, ruleText] of nativeContracts) {
      expect(isNewSyncRoomGameKey(key)).toBe(true);
      expect(isNativeSyncRoomGameKey(key)).toBe(true);
      expect(getSyncGameDefinition(key).rule).toContain(ruleText);
    }

    expect(isNativeSyncRoomGameKey("typing-speed-game")).toBe(false);
    expect(isNewSyncRoomGameKey("typing-speed-game")).toBe(false);
    expect(isNativeSyncRoomGameKey("memory-logo-drawing")).toBe(false);
    expect(isNewSyncRoomGameKey("memory-logo-drawing")).toBe(false);
    expect(isNativeSyncRoomGameKey("acting-phrase-game")).toBe(false);
    expect(isNewSyncRoomGameKey("acting-phrase-game")).toBe(false);
    expect(isNativeSyncRoomGameKey("weird-karuta-game")).toBe(false);
    expect(isNewSyncRoomGameKey("weird-karuta-game")).toBe(false);
  });
});
