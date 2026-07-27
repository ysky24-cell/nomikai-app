import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { writePartySession } from "./partySession";

vi.mock("socket.io-client", () => ({
  io: () => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

describe("ホームからゲーム開始", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "#/";
  });

  it("正式版ゲームが表示され、二択トークを開始できる", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "飲み会アプリ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "おすすめ" })).toBeInTheDocument();

    const twoChoiceCard = screen.getByRole("heading", { name: "二択トーク" }).closest("article");
    expect(twoChoiceCard).not.toBeNull();
    fireEvent.click(within(twoChoiceCard as HTMLElement).getByRole("button", { name: /^遊ぶ$/ }));
    expect(await screen.findByRole("heading", { name: "二択トーク" })).toBeInTheDocument();
  });

  it("PartySessionの参加者を直接開いたゲームへ引き継ぐ", async () => {
    writePartySession({
      sessionId: "party-test",
      participants: [{ id: "p1", name: "Alice" }, { id: "p2", name: "Bob" }],
      lastGameKey: "two-choice",
      recentGameKeys: ["two-choice"],
      updatedAt: new Date().toISOString(),
    });
    window.location.hash = "#/games/two-choice";
    render(<App />);
    expect(await screen.findByDisplayValue("Alice")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
  });

  it("破損した保存データを初期化し、復旧メッセージを表示する", async () => {
    window.localStorage.setItem("nomikai-app:v1:two-choice", "{broken");
    window.location.hash = "#/games/two-choice";
    render(<App />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("保存データが壊れていたため");
  });

  it("保存できない場合もユーザー向けに通知する", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    window.location.hash = "#/games/two-choice";
    render(<App />);
    expect(await screen.findByText("進行状況を保存できませんでした。ブラウザの保存領域を確認してください。")).toBeInTheDocument();
    setItem.mockRestore();
  });
});
