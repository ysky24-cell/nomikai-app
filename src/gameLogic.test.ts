import { describe, expect, it } from "vitest";
import {
  createHazardIndex,
  createWerewolfAssignments,
  getWerewolfRoleDeck,
  normalizeYamanoteAnswer,
  resolveHazardDraw,
  shuffle,
  tallyVotes,
} from "./gameLogic";

describe("抽選ロジック", () => {
  it("同じ乱数で同じカード位置を生成する", () => {
    expect(createHazardIndex(() => 0)).toBe(1);
    expect(createHazardIndex(() => 0.999999)).toBe(8);
    expect(resolveHazardDraw(4, 4)).toBe("hazard");
    expect(resolveHazardDraw(3, 4)).toBe("safe");
  });

  it("シャッフルは入力を変更せず、乱数を注入できる", () => {
    const source = [1, 2, 3, 4];
    const shuffled = shuffle(source, () => 0);
    expect(source).toEqual([1, 2, 3, 4]);
    expect(shuffled).toEqual([2, 3, 4, 1]);
  });
});

describe("人狼ロジック", () => {
  it("人数に応じた役職数を生成する", () => {
    const roles = getWerewolfRoleDeck(8);
    expect(roles).toHaveLength(8);
    expect(roles.filter((role) => role === "werewolf")).toHaveLength(2);
    expect(roles).toContain("seer");
    expect(roles).toContain("knight");
  });

  it("4人用の既存役職プリセットを生成する", () => {
    expect(getWerewolfRoleDeck(4)).toEqual(["werewolf", "seer", "knight", "villager"]);
  });

  it("役職割当は参加者IDを一度ずつ保持する", () => {
    const assignments = createWerewolfAssignments(
      [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      () => 0.5,
    );
    expect(assignments.map((assignment) => assignment.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(new Set(assignments.map((assignment) => assignment.role)).size).toBeGreaterThan(1);
    expect(assignments.every((assignment) => assignment.alive)).toBe(true);
  });
});

describe("投票集計", () => {
  it("最多票と同票候補を返す", () => {
    const result = tallyVotes(
      { voterA: "p1", voterB: "p2", voterC: "p1" },
      [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    );
    expect(result.maxVotes).toBe(2);
    expect(result.topTargetIds).toEqual(["p1"]);
    expect(result.rows.map((row) => row.count)).toEqual([2, 1, 0]);
  });
});

describe("山手線の重複判定", () => {
  it("全半角・大小文字・空白・一般記号の差を吸収する", () => {
    expect(normalizeYamanoteAnswer("Ａｐｐｌｅ！")).toBe(normalizeYamanoteAnswer(" apple "));
  });
});
