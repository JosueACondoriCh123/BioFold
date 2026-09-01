import { expect, test } from "@playwright/test";
import { PLATFORM_URL, LAB_FIXTURE_URL } from "../config/e2eEnvironment";

test.use({ baseURL: LAB_FIXTURE_URL });

test("production landing stays public without loading molecular runtime", async ({ page }) => {
  const molecularRequests: string[] = [];
  const workers: string[] = [];
  page.on("request", request => { if (/Laboratory[-.]|geometry\.worker|3Dmol/i.test(request.url())) molecularRequests.push(request.url()); });
  page.on("worker", worker => workers.push(worker.url()));
  await page.addInitScript(() => {
    Object.assign(window, { __uiToolCount: 0 });
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool: () => { (window as unknown as { __uiToolCount: number }).__uiToolCount++; } } });
  });
  await page.goto(PLATFORM_URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Explore molecular structures.With clarity.");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(molecularRequests).toEqual([]);
  expect(workers).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __uiToolCount: number }).__uiToolCount)).toBe(0);
});
const screens = [
  ["landing", "/"], ["login", "/login"], ["signup", "/signup"],
  ["dashboard", "/app"], ["account", "/app/account"], ["laboratory", "/app/lab"],
] as const;

for (const width of [1440, 1000, 720, 390]) {
  test(`soft design: six screens at ${width}px (visual fixture, not real auth)`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", entry => { if (entry.type() === "error") errors.push(entry.text()); });
    for (const [name, path] of screens) {
      await page.goto(`/platform-visual.html?screen=${encodeURIComponent(path)}`);
      if (name === "laboratory") {
        await expect(page.locator(".structure-pill strong")).toHaveText("1CRN", { timeout: 20000 });
        await expect(page.locator("canvas")).toBeVisible();
        await expect(page.locator(".loading-overlay")).toHaveCount(0);
      } else {
        await expect(page.locator(`[data-page="${name}"]`)).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("canvas")).toHaveCount(0);
      }
      await page.evaluate(async () => { await Promise.all(Array.from(document.images).map(img => img.decode().catch(() => undefined))); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} horizontal overflow at ${width}`).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
      if (name === "laboratory") {
        await page.getByRole("button", { name: "Stick", exact: true }).click();
        await page.getByRole("button", { name: "Spectrum", exact: true }).click();
        await page.getByRole("button", { name: /Measure distance/i }).click();
        await expect(page.locator(".result-value")).toContainText("12.60");
        await expect(page.locator(".activity-item").first()).toContainText("Distance");
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: testInfo.outputPath(`laboratory-distance-${width}.png`), fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
}

test("visual form validation, keyboard and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/platform-visual.html?screen=%2Fsignup");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  const name = page.getByLabel("Full name", { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("UI Test");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
  await page.getByLabel("Email address", { exact: true }).fill("ui@example.test");
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("ui@example.test");
});
