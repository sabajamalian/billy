import { expect, test } from "@playwright/test";

test("invalid bill link shows a friendly not found state", async ({ page }) => {
  await page.goto("/b/INVALIDTOKEN0000000000000");

  await expect(page.getByRole("heading", { name: /bill not found/i })).toBeVisible();
  await expect(page.getByText(/invalid|deleted/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
});
