import { expect, test } from "@playwright/test";

type Participant = { id: string; name: string; role: "host" | "player"; connected: boolean };

test("host QR and three phone contexts share a waiting room, and close rejects late joins", async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  let version = 0;
  let status: "waiting" | "closed" = "waiting";
  const participants: Participant[] = [{ id: "host-1", name: "Host", role: "host", connected: true }];
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  async function mockApi(page: (typeof pages)[number]) {
    await page.route("**/v2/**", async (route) => {
      const url = new URL(route.request().url());
      const body = route.request().postDataJSON?.() as Record<string, unknown> | undefined;
      const projection = (selfId?: string) => ({ code: "TEST23", status, version, participants, self: selfId ? { id: selfId, role: participants.find((item) => item.id === selfId)?.role ?? "player" } : null });
      if (route.request().method() === "POST" && url.pathname === "/v2/rooms") {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ room: projection("host-1"), hostToken: "host-secret", reconnectToken: "host-reconnect" }) });
        return;
      }
      const commandMatch = url.pathname.match(/^\/v2\/rooms\/([^/]+)\/commands$/);
      if (commandMatch && route.request().method() === "POST") {
        if (body?.kind === "join") {
          if (status !== "waiting") { await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "room_not_joinable" }) }); return; }
          const id = `p-${participants.length}`;
          participants.push({ id, name: String(body.name), role: "player", connected: true });
          version += 1;
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...projection(id), credentials: { participantId: id, reconnectToken: `token-${id}` } }) });
          return;
        }
        if (body?.kind === "close") { status = "closed"; version += 1; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projection("host-1")) }); return; }
      }
      if (route.request().method() === "GET" && url.pathname === "/v2/rooms/TEST23") {
        const selfId = url.searchParams.get("participantId") ?? undefined;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projection(selfId)) });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "room_not_found" }) });
    });
  }
  await Promise.all(pages.map(mockApi));
  try {
    await pages[0].goto(`${baseURL}/`);
    await pages[0].getByLabel("ホスト名").fill("Host");
    await pages[0].getByRole("button", { name: "ルームを作る", exact: true }).last().click();
    await expect(pages[0].getByText("TEST23")).toBeVisible();
    await expect(pages[0].getByLabel("参加用QRコード")).toBeVisible();
    await expect(pages[0].locator("body")).not.toContainText("host-secret");

    for (const [index, name] of ["Alice", "Bob", "Carol"].entries()) {
      await pages[index + 1].goto(`${baseURL}/?room=TEST23`);
      await pages[index + 1].getByLabel("ニックネーム").fill(name);
      await pages[index + 1].getByRole("button", { name: "参加する" }).click();
      await expect(pages[index + 1].getByText("参加できました")).toBeVisible();
    }
    await pages[0].getByRole("button", { name: "ルームを更新" }).click();
    await expect(pages[0].getByText("参加者 4人")).toBeVisible();
    await pages[0].getByRole("button", { name: "参加を締め切る" }).click();
    await expect(pages[0].getByText("参加受付終了")).toBeVisible();

    await pages[4].goto(`${baseURL}/?room=TEST23`);
    await pages[4].getByLabel("ニックネーム").fill("Late");
    await pages[4].getByRole("button", { name: "参加する" }).click();
    await expect(pages[4].getByRole("alert")).toContainText("参加受付を締め切っています");
  } finally {
    await Promise.all(contexts.map(async (context) => { try { await context.close(); } catch { /* timeout cleanup */ } }));
  }
});
