import { expect, test, type Page } from "@playwright/test";
import { LAB_FIXTURE_URL } from "../config/e2eEnvironment";

test.use({ baseURL: LAB_FIXTURE_URL });

interface RegisteredTool {
  name: string;
  execute: (input: unknown, context?: { signal?: AbortSignal }) => Promise<unknown>;
}

async function executeAgentTool(page: Page, name: string, input: unknown) {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tools = (window as unknown as { __biofoldRegisteredTools: RegisteredTool[] })
        .__biofoldRegisteredTools;
      const tool = tools.find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Tool ${toolName} was not registered.`);
      return tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const registered: RegisteredTool[] = [];
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool: async (tool: RegisteredTool, options?: { signal?: AbortSignal }) => {
          if (options?.signal?.aborted) return;
          registered.push(tool);
          options?.signal?.addEventListener("abort", () => {
            const index = registered.indexOf(tool);
            if (index !== -1) registered.splice(index, 1);
          }, { once: true });
        },
      },
    });
    Object.defineProperty(window, "__biofoldRegisteredTools", { value: registered });
  });
});

test("loads the deterministic demo and exposes all WebMCP tools", async ({ page }) => {
  await page.goto("/app/lab");
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

test("an agent executes all eight tools against the shared visible workspace", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://files.rcsb.org/**", (route) => route.abort("blockedbyclient"));

  await page.goto("/app/lab");
  await expect(page.getByText("8 agent tools")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });

  expect(await executeAgentTool(page, "load_structure", { pdbId: "4HHB" })).toMatchObject({
    ok: true,
    data: { structureId: "4HHB", source: "fixture" },
  });
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB");
  await expect(page.locator(".activity-item").first()).toContainText("agent");

  expect(await executeAgentTool(page, "get_structure_summary", {})).toMatchObject({
    ok: true,
    data: { chainCount: 4 },
  });
  await expect(page.locator(".activity-item").first()).toContainText("Structure summary inspected.");

  expect(await executeAgentTool(page, "set_representation", {
    style: "stick",
    colorScheme: "spectrum",
  })).toMatchObject({ ok: true, data: { style: "stick", colorScheme: "spectrum" } });
  await expect(page.getByRole("button", { name: "Stick" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Spectrum" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".scene-state-hud")).toContainText("Stick");
  await expect(page.locator(".scene-state-hud")).toContainText("Spectrum");
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-command", "set_representation");
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-origin", "agent");

  expect(await executeAgentTool(page, "focus_residues", {
    residues: [{ chain: "A", residueNumber: 10 }],
    label: true,
  })).toMatchObject({ ok: true, data: { changedView: true } });
  await expect(page.locator(".activity-item").first()).toContainText("1 residue selection focused.");

  expect(await executeAgentTool(page, "measure_distance", {
    from: { chain: "A", residueNumber: 1, atomName: "CA" },
    to: { chain: "A", residueNumber: 10, atomName: "CA" },
  })).toMatchObject({ ok: true, data: { units: "angstrom", changedView: true } });
  await expect(page.getByText("Calculated distance")).toBeVisible();
  await expect(page.locator(".scene-state-hud .measurement-chip")).toBeVisible();

  expect(await executeAgentTool(page, "preview_mutation_context", {
    residue: { chain: "A", residueNumber: 10 },
    toAminoAcid: "W",
  })).toMatchObject({ ok: true, evidence: "heuristic" });
  await expect(page.getByText("Heuristic preview")).toBeVisible();
  await expect(page.getByText("No stability prediction.", { exact: false })).toBeVisible();

  expect(await executeAgentTool(page, "show_surface", {
    visible: true,
    opacity: 0.5,
  })).toMatchObject({ ok: true, data: { visible: true, opacity: 0.5 } });
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await expect(page.getByRole("slider", { name: "Surface opacity" })).toHaveValue("0.5");
  await expect(page.locator(".scene-state-hud")).toContainText("Surface · 50%");
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-command", "show_surface");

  expect(await executeAgentTool(page, "reset_workspace", { scope: "view" })).toMatchObject({
    ok: true,
    data: { scope: "view" },
  });
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB");
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".activity-item").first()).toContainText("agent");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("loads 4HHB from the UI through the local vertical slice", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://files.rcsb.org/**", (route) => route.abort("blockedbyclient"));

  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "4HHB", exact: true }).click();

  await expect(page.getByText("4HHB loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".structure-pill strong")).toHaveText("4HHB");
  await expect(page.locator(".structure-pill")).toContainText("fixture · mmCIF");
  await expect(page.locator(".hud-stats")).toContainText("4 chains");
  await expect(page.locator(".summary-card .card-heading strong")).toHaveText("4HHB");
  await expect(page.locator(".activity-item").first()).toContainText("human");
  await expect(page.locator(".activity-item").first()).toContainText("4HHB loaded and rendered.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("human controls update the same shared activity stream", async ({ page }) => {
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Stick" }).click();
  await expect(page.getByText("Representation set to stick.")).toBeVisible();
  await page.getByRole("button", { name: "Focus in 3D" }).click();
  await expect(page.getByText("1 residue selection focused.")).toBeVisible();
});

test("viewer-first slice exposes representation, surface progress, distance, and audit metadata", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });

  await executeAgentTool(page, "set_representation", {
    style: "stick",
    colorScheme: "spectrum",
  });
  await expect(page.locator(".scene-state-hud")).toContainText("Stick");
  await expect(page.locator(".scene-state-hud")).toContainText("Spectrum");

  await page.getByRole("slider", { name: "Surface opacity" }).fill("0.55");
  await page.getByRole("switch", { name: "Molecular surface" }).click();
  await expect(page.getByText("Computing surface…").first()).toBeVisible();
  await expect(page.locator(".scene-state-hud")).toContainText("Surface · 55%", { timeout: 30_000 });
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-command", "show_surface");
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-origin", "human");

  await page.getByRole("button", { name: "Measure distance" }).click();
  await expect(page.locator(".result-value")).toContainText("12.60");
  await expect(page.locator(".distance-points")).toContainText("A:1:CA");
  await expect(page.locator(".distance-points")).toContainText("A:10:CA");
  await expect(page.locator(".scene-state-hud .measurement-chip")).toContainText("12.60 Å");
  await expect(page.locator(".activity-item").first()).toHaveAttribute("data-command", "measure_distance");
});

test("invalid PDB IDs fail without removing the current structure", async ({ page }) => {
  await page.goto("/app/lab");
  await expect(page.getByText("1CRN loaded and rendered.")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("PDB structure ID").fill("BAD");
  await page.getByRole("button", { name: "Explore" }).click();
  await expect(page.getByRole("alert")).toContainText("four-character PDB ID");
  await expect(page.getByText("1CRN", { exact: true }).first()).toBeVisible();
});
