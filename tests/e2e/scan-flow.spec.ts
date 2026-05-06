import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function seedReadyBill(request: APIRequestContext) {
  const created = await request.post("/api/bills", { data: {} });
  expect(created.ok()).toBeTruthy();
  const createdJson = await created.json();
  const shareToken = createdJson.bill.shareToken as string;

  const patched = await request.patch(`/api/bills/${shareToken}`, {
    data: {
      items: [
        { name: "Burger", unitPriceCents: 1600, quantity: 1, position: 0, confidence: 1, flagged: false },
        { name: "Fries", unitPriceCents: 500, quantity: 1, position: 1, confidence: 1, flagged: false },
      ],
      taxCents: 210,
      tip: { type: "FLAT", value: 378 },
      currency: "USD",
      status: "READY",
    },
  });
  expect(patched.ok()).toBeTruthy();
  return shareToken;
}

async function chooseItem(page: Page, name: string) {
  await page
    .locator('section[aria-label="Bill items"] [role="button"]')
    .filter({ hasText: name })
    .first()
    .click();
}

test("mocked scan to selection export happy path", async ({ page, request }) => {
  const shareToken = await seedReadyBill(request);

  await page.route("**/api/bills/scan", async (route) => {
    const events = [
      `event: scan.started\ndata: ${JSON.stringify({ type: "scan.started", modelCount: 2 })}\n\n`,
      `event: provider.done\ndata: ${JSON.stringify({ type: "provider.done", provider: "openai", model: "gpt-4o", cached: false })}\n\n`,
      `event: provider.done\ndata: ${JSON.stringify({ type: "provider.done", provider: "anthropic", model: "claude-3-5-sonnet-20241022", cached: false })}\n\n`,
      `event: voting.done\ndata: ${JSON.stringify({ type: "voting.done", itemsCount: 2, subtotalMismatch: false })}\n\n`,
      `event: scan.complete\ndata: ${JSON.stringify({ type: "scan.complete", billShareToken: shareToken, billId: "e2e-bill-1" })}\n\n`,
    ];

    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: { "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
      body: events.join(""),
    });
  });

  await page.goto("/");
  await page.getByRole("link", { name: /scan a receipt/i }).click();
  await expect(page).toHaveURL(/\/scan$/);
  await expect(page.getByRole("heading", { name: /scan a bill/i })).toBeVisible();

  await page.getByLabel("Upload receipt from gallery").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText(/receipt ready/i)).toBeVisible();
  await page.getByRole("button", { name: /^Scan$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/b/${shareToken}$`));
  await expect(page.getByRole("heading", { name: /pick what you had/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Burger", exact: true })).toBeVisible();
  await expect(page.getByText("Fries")).toBeVisible();

  await chooseItem(page, "Burger");
  await expect(page.getByText(/Subtotal \$16\.00/i)).toBeVisible();

  await page.getByRole("button", { name: /^Share$/i }).click();
  await expect(page.getByRole("dialog", { name: /your share/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /card/i })).toBeVisible();
  await expect(page.locator('[data-screenshot-target="true"]').getByText("Burger")).toBeVisible();
  await expect(page.getByText(/\$\d+\.\d{2}/).last()).toBeVisible();
});
