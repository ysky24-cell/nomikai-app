import { beforeEach, describe, expect, it, vi } from "vitest";
import { readVersionedStorageResult, writeVersionedStorage } from "./storage";

describe("versioned storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("migrates a v1 envelope and writes the v2 envelope", () => {
    window.localStorage.setItem(
      "sample",
      JSON.stringify({ version: 1, savedAt: "2026-01-01T00:00:00.000Z", data: { count: 2 } }),
    );
    const result = readVersionedStorageResult("sample", { initialState: { count: 0 } });
    expect(result).toEqual({ value: { count: 2 }, status: "legacy" });
    expect(writeVersionedStorage("sample", result.value)).toMatchObject({ ok: true });
    expect(JSON.parse(window.localStorage.getItem("sample") ?? "{}").version).toBe(2);
  });

  it("rejects corrupt JSON and reports unavailable storage writes", () => {
    window.localStorage.setItem("sample", "not-json");
    expect(readVersionedStorageResult("sample", { initialState: { count: 0 } }).status).toBe("invalid");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeVersionedStorage("sample", { count: 1 }).ok).toBe(false);
    setItem.mockRestore();
  });
});
