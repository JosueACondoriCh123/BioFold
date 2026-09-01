import { expect, test, type Page } from "@playwright/test";
import { LAB_FIXTURE_URL } from "../config/e2eEnvironment";

test.use({ baseURL: LAB_FIXTURE_URL, viewport: { width: 1440, height: 900 } });
async function inspect(page: Page) {
  return page.evaluate(() => (window as any).__biofoldInspect());
}
async function tool(page: Page, name: string, input: unknown) {
  return page.evaluate(({ name, input }) => (window as any).__tools.find((item: any) => item.name === name).execute(input), { name, input });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const tools: any[] = [];
    Object.assign(window, { __tools: tools });
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool(definition: any, options?: { signal?: AbortSignal }) {
        if (options?.signal?.aborted) return;
        if (tools.some(item => item.name === definition.name)) throw new Error("Duplicate tool");
        tools.push(definition);
        options?.signal?.addEventListener("abort", () => {
          const index = tools.indexOf(definition);
          if (index >= 0) tools.splice(index, 1);
        }, { once: true });
      },
    } });
  });
});

test("navigation preserves the actual scene and camera while deactivating tools", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("8 agent tools")).toBeVisible();
  await tool(page, "set_representation", { style: "stick", colorScheme: "spectrum" });
  await tool(page, "show_surface", { visible: true, opacity: 0.55 });
  await page.getByRole("button", { name: "Measure distance" }).click();
  await expect(page.locator(".result-value")).toContainText("12.60");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const before = await inspect(page);
  await page.evaluate(() => { (window as any).__stale = (window as any).__tools.find((t: any) => t.name === "set_representation"); });
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByText("Fixture account")).toBeVisible();
  await expect(page.locator("canvas")).toBeHidden();
  expect(await page.evaluate(() => (window as any).__tools.length)).toBe(0);
  await page.getByRole("link", { name: "Laboratory", exact: true }).click();
  await expect(page.getByText("8 agent tools")).toBeVisible();
  const after = await inspect(page);
  expect(after.camera).toEqual(before.camera);
  expect(after.state.structure).toEqual(before.state.structure);
  expect(after.state.measurement).toEqual(before.state.measurement);
  expect(after.state.surfaceOpacity).toBe(0.55);
  expect(after.state.activity).toEqual(before.state.activity);
  expect(await page.evaluate(() => (window as any).__stale.execute({ style: "line", colorScheme: "chain" }))).toMatchObject({ error: { code: "WORKSPACE_INACTIVE" } });
  expect((await inspect(page)).state.representation).toBe("stick");
  expect(errors).toEqual([]);
});

test("logout removes the canvas, tools, state and activity; another login starts clean", async ({ page }) => {
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Measure distance" }).click();
  await expect(page.locator(".result-value")).toContainText("12.60");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Fixture login")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  const cleared = await inspect(page);
  expect(cleared.camera).toBeNull();
  expect(cleared.state.structure).toBeUndefined();
  expect(cleared.state.activity).toEqual([]);
  expect(await page.evaluate(() => (window as any).__tools.length)).toBe(0);
  await page.getByRole("button", { name: "Sign in test user" }).click();
  await page.getByRole("link", { name: "Open laboratory" }).click();
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible();
  expect((await inspect(page)).state.measurement).toBeUndefined();
  expect((await inspect(page)).state.activity).toHaveLength(1);
});

test("a user change discards the previous scene and a dashboard example loads 4HHB", async ({ page }) => {
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sphere", exact: true }).click();
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Switch test user" }).click();
  expect((await inspect(page)).state.activity).toEqual([]);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Open hemoglobin" }).click();
  await expect(page.getByText("4HHB loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  const final = await inspect(page);
  expect(final.state.structure.id).toBe("4HHB");
  expect(final.state.representation).toBe("cartoon");
  expect(final.state.activity).toHaveLength(1);
  await page.locator(".viewer-stage").screenshot({ path: "test-results/4hhb-viewer.png" });
});

test("the public entry does not load 3Dmol or create a worker or tools", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  let workers = 0;
  page.on("worker", () => workers++);
  await page.goto("/");
  await expect(page.getByText("Fixture landing")).toBeVisible();
  expect(requests.some(url => /Laboratory-|geometry\.worker-|viewerPort-/.test(url))).toBe(false);
  expect(workers).toBe(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__tools.length)).toBe(0);
});
