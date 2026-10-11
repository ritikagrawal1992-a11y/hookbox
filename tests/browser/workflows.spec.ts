import { test, expect } from "@playwright/test";
test("Hookbox captures and inspects an explicitly labeled fixture", async ({
  page,
}) => {
  await page.goto("/#webhooks");
  await page.getByLabel("Inbox name", { exact: true }).fill("Order events");
  await page.getByRole("button", { name: "Create inbox" }).click();
  await expect(
    page.getByRole("button", { name: "Add fixture event" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add fixture event" }).click();
  await expect(page.locator(".event")).toHaveCount(1);
  await page.locator(".event summary").click();
  await expect(page.locator("pre")).toContainText("order.created");
  await page.screenshot({
    path: "docs/screenshots/hookbox.png",
    fullPage: true,
  });
});
