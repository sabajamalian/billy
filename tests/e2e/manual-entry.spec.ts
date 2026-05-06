import { expect, type Page, test } from "@playwright/test";

async function fillLineItem(page: Page, index: number, name: string, price: string) {
  await page.getByPlaceholder("Item name").nth(index).fill(name);
  const priceInput = page.getByLabel("Unit price").nth(index);
  await priceInput.fill(price);
  await priceInput.blur();
}

async function chooseItem(page: Page, name: string) {
  await page
    .locator('section[aria-label="Bill items"] [role="button"]')
    .filter({ hasText: name })
    .first()
    .click();
}

test("manual entry to selection export happy path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /split the bill/i })).toBeVisible();
  const manualCta = page.getByRole("link", { name: /enter items manually/i });
  await expect(manualCta).toBeVisible();

  await manualCta.click();
  await expect(page).toHaveURL(/\/scan\/manual/);
  await expect(page.getByRole("heading", { name: /review your bill/i })).toBeVisible();

  await page.getByRole("button", { name: /add item/i }).click();
  await fillLineItem(page, 0, "Pasta", "14.50");
  await page.getByRole("button", { name: /add item/i }).click();
  await fillLineItem(page, 1, "Salad", "9.00");

  const taxInput = page.getByLabel("Tax amount");
  await taxInput.fill("1.40");
  await taxInput.blur();
  await page.getByRole("tab", { name: /percent/i }).click();
  await page.getByRole("button", { name: "18%" }).click();

  await page.getByRole("button", { name: /share with friends/i }).click();
  await expect(page).toHaveURL(/\/b\/[A-Za-z0-9_-]+$/);
  await expect(page.getByRole("heading", { name: /pick what you had/i })).toBeVisible();

  await chooseItem(page, "Pasta");
  await expect(page.getByText(/Subtotal \$14\.50/i)).toBeVisible();
  await expect(page.getByText(/\$\d+\.\d{2}/).first()).not.toHaveText("$0.00");

  await page.getByRole("button", { name: /^Share$/i }).click();
  await expect(page.getByRole("dialog", { name: /your share/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /card/i })).toBeVisible();
  await page.getByRole("tab", { name: /card/i }).click();
  await expect(page.locator('[data-screenshot-target="true"]').getByText("Pasta")).toBeVisible();
  await expect(page.getByText(/Total/).last()).toBeVisible();
  await expect(page.getByText(/\$\d+\.\d{2}/).last()).toBeVisible();
});
