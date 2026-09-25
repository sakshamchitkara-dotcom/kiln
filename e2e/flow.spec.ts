import { expect, test } from "@playwright/test";

test("prompt → preview → edit → diff → restore → export", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Offline scripted mode")).toBeVisible();

  await page.locator("#prompt-home").fill('A landing page called "Crumb" for a bakery, green accent');
  await page.getByRole("button", { name: "Build site" }).click();

  await expect(page.getByText("Build passed")).toBeVisible();
  await expect(page.getByRole("button", { name: "View v2" })).toBeVisible();
  const site = page.frameLocator('iframe[title^="Preview"]');
  await expect(site.getByRole("heading", { level: 1 })).toContainText("Crumb");

  await page.locator("#prompt-chat").fill('Set the headline to "Fresh every morning"');
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "View v3" })).toBeVisible();
  await expect(site.getByRole("heading", { level: 1 })).toHaveText("Fresh every morning");

  await page.getByRole("tab", { name: "Changes" }).click();
  await expect(page.getByText("Changes from v2 to v3: 1 file")).toBeVisible();
  await expect(page.locator(".ln-add")).toContainText("Fresh every morning");

  await page.getByRole("tab", { name: "Code" }).click();
  await page.getByRole("button", { name: "content.ts" }).click();
  await expect(page.locator(".cm-content")).toContainText("Fresh every morning");

  await page.getByRole("button", { name: /^Version 2:/ }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(site.getByRole("heading", { level: 1 })).not.toHaveText("Fresh every morning");
  await page.getByRole("button", { name: "Restore v2" }).click();
  await expect(page.getByRole("button", { name: /^Version 4: Restored v2 \(current\)/ })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download v4 as zip" }).click();
  expect((await download).suggestedFilename()).toBe("crumb-v4.zip");
});

test("build errors are fed back and fixed automatically", async ({ page }) => {
  await page.goto("/");
  await page.locator("#prompt-home").fill("A blog about birds, simulate a build error");
  await page.getByRole("button", { name: "Build site" }).click();
  await expect(page.getByText("Build failed", { exact: true })).toBeVisible();
  await expect(page.getByText("Build passed")).toBeVisible();
  await expect(page.frameLocator('iframe[title^="Preview"]').getByRole("heading", { level: 1 })).toBeVisible();
});

test("starter templates open with a built preview", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Dashboard/ }).click();
  await expect(page.frameLocator('iframe[title^="Preview"]').getByText("Recent orders")).toBeVisible();
});
