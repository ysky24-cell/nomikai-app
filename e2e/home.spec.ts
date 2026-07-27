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
