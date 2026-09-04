import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--disable-features=WebMCPTesting", "--disable-blink-features=WebMCP"] } });

test("Chrome without WebMCP keeps human controls available and explains how to connect", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/app/lab");
  expect(await page.evaluate(() => typeof document.modelContext)).toBe("undefined");
  const indicator = page.getByLabel("WebMCP: WebMCP unavailable", { exact: true });
  await expect(indicator).toBeVisible();
  await indicator.click();
  const panel = page.locator(".webmcp-status-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("chrome://flags/#enable-webmcp-testing");
  await panel.getByRole("button", { name: "Retry connection" }).click();
  await expect(indicator).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("webmcp-setup-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(indicator).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("webmcp-setup-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await indicator.click();
  await page.getByRole("button", { name: "Load the 1CRN demo" }).click();
  await expect(page.locator(".hud-stats")).toContainText("327 atoms");
  expect(errors).toEqual([]);
});
