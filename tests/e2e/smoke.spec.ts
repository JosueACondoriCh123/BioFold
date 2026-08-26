import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const registered: Array<{ name: string }> = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: { name: string }) => {
          registered.push(tool);
        },
      },
    });
    Object.defineProperty(window, "__biofoldRegisteredTools", { value: registered });
  });
});

test("loads the deterministic demo and exposes all WebMCP tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("8 agent tools")).toBeVisible();
  const toolNames = await page.evaluate(() =>
    (window as unknown as { __biofoldRegisteredTools: Array<{ name: string }> })
      .__biofoldRegisteredTools.map((tool) => tool.name),
  );
  expect(toolNames).toHaveLength(8);
  expect(toolNames).toContain("preview_mutation_context");
});

test("human controls update the same shared activity stream", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Stick" }).click();
  await expect(page.getByText("Representation set to stick.")).toBeVisible();
  await page.getByRole("button", { name: "Focus in 3D" }).click();
  await expect(page.getByText("1 residue selection focused.")).toBeVisible();
});

test("invalid PDB IDs fail without removing the current structure", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("PDB structure ID").fill("BAD");
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("alert")).toContainText("four-character PDB ID");
  await expect(page.getByText("1CRN", { exact: true }).first()).toBeVisible();
});
