import { expect, test } from "@playwright/test";

test("ホームから正式版ゲームの設定へ進める", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "飲み会アプリ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "おすすめ" })).toBeVisible();
  const twoChoiceCard = page.locator("article.game-card").filter({ hasText: "二択トーク" });
  await twoChoiceCard.getByRole("button", { name: "遊ぶ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "二択トーク" })).toBeVisible();
});

test("ゲームURLを直接開いて更新・戻るができる", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article.game-card").filter({ hasText: "二択トーク" });
  await card.getByRole("button", { name: "遊ぶ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "二択トーク" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "飲み会アプリ" })).toBeVisible();
  await page.goto("#/games/two-choice");
  await expect(page.getByRole("heading", { name: "二択トーク" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "二択トーク" })).toBeVisible();
});

test("未知のゲームURLは404画面になる", async ({ page }) => {
  await page.goto("#/games/not-a-game");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await page.getByRole("button", { name: "トップへ戻る" }).click();
  await expect(page.getByRole("heading", { name: "飲み会アプリ" })).toBeVisible();
});

test("参加者を次のゲームへ引き継ぎ、現在のゲームだけをリセットできる", async ({ page }) => {
  await page.goto("/");
  const card = page.locator("article.game-card").filter({ hasText: "二択トーク" });
  await card.getByRole("button", { name: "遊ぶ", exact: true }).click();
  const nameInput = page.getByLabel("追加する参加者の名前");
  await nameInput.fill("あき");
  await nameInput.press("Enter");
  await nameInput.fill("ゆう");
  await nameInput.press("Enter");
  await page.getByRole("button", { name: "トップ" }).click();
  await expect(page.getByRole("heading", { name: "続きから" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "続きから" })).toBeVisible();
  await page.getByRole("button", { name: "続きから" }).click();
  await expect(page.getByRole("heading", { name: "二択トーク" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "現在のゲームをリセット" }).click();
  await expect(page.getByRole("heading", { name: "飲み会アプリ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "続きから" })).toHaveCount(0);
});

test("ホームでゲーム検索と人数別おすすめを使える", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "ゲームを検索" });
  await search.fill("二択");
  await expect(page.locator("article.game-card").filter({ hasText: "二択トーク" })).toHaveCount(1);
  await expect(page.locator("article.game-card").filter({ hasText: "山手線ゲーム" })).toHaveCount(0);
  await page.getByRole("button", { name: "2〜4人" }).click();
  await expect(page.getByRole("button", { name: "2〜4人" })).toHaveAttribute("aria-pressed", "true");
});

test("legacy同期ルームはトークンなしのQR招待を表示し、読み取り先をlegacyに固定する", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const snapshot = {
    room: { id: "legacy-room", code: "LEGACY1", status: "waiting", currentGame: null, state: {}, createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" },
    participants: [{ id: "host-1", roomId: "legacy-room", name: "Host", role: "host", connected: true, createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z" }],
  };
  await page.route("**/health", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/rooms**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname === "/rooms") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ room: snapshot.room, host: snapshot.participants[0], participantToken: "legacy-token" }) });
      return;
    }
    if (route.request().method() === "GET" && url.pathname === "/rooms/LEGACY1") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
      return;
    }
    if (route.request().method() === "GET" && url.pathname === "/rooms/LEGACY1/events") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "room_not_found" }) });
  });

  await page.goto("/?sync=legacy&token=should-not-leak&participantId=private-id");
  await page.getByRole("button", { name: "作成" }).click();
  await page.getByLabel("ホスト名").fill("Host");
  await page.getByRole("button", { name: "ルーム作成" }).click();
  const qr = page.locator("[data-invite-url]");
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("data-invite-url", /sync=legacy.*room=LEGACY1/);
  await expect(qr).not.toHaveAttribute("data-invite-url", /should-not-leak|private-id/);

  await page.evaluate(() => localStorage.clear());
  await page.goto("/?sync=legacy&room=LEGACY1");
  await expect(page.getByRole("heading", { name: "コードで参加" })).toBeVisible();
  await expect(page.getByLabel("参加するルームコード")).toHaveValue("LEGACY1");
  await expect(page.getByRole("heading", { name: "みんなのスマホで遊ぶ" })).toHaveCount(0);
});
