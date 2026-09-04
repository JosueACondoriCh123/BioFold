import { expect, test, type Page } from "@playwright/test";
import { COMMAND_NAMES } from "../../src/core/commandContracts";
import type { CommandResult } from "../../src/types/domain";

async function toolNames(page: Page) {
  return page.evaluate(async () => (await document.modelContext!.getTools!()).map(tool => tool.name).sort());
}

async function execute(page: Page, name: string, input: unknown = {}): Promise<CommandResult> {
  const raw = await page.evaluate(async ({ name, input }) => {
    const context = document.modelContext!;
    const tool = (await context.getTools!()).find(tool => tool.name === name);
    if (!tool) throw new Error(`Native WebMCP tool not found: ${name}`);
    return context.executeTool!(tool, JSON.stringify(input));
  }, { name, input });
  expect(typeof raw).toBe("string");
  return JSON.parse(raw!);
}

async function openLab(page: Page) {
  // Keep scientific fixtures deterministic; do not replace any WebMCP API.
  await page.route("https://files.rcsb.org/**", route => route.abort());
  await page.route("https://rest.uniprot.org/**", route => route.abort());
  await page.route("https://www.ebi.ac.uk/**", route => route.abort());
  await page.goto("/app/lab");
  expect(await page.evaluate(() => typeof document.modelContext?.getTools),
    "Install current Chrome; native WebMCP must be exposed with the test flags.").toBe("function");
  await expect.poll(() => toolNames(page)).toEqual([...COMMAND_NAMES].sort());
  await expect(page.getByLabel("WebMCP: 13 agent tools", { exact: true })).toBeVisible();
  // The agent can start from an empty saved workspace; registration must not
  // depend on the user loading a structure first.
  expect(await execute(page, "load_structure", { pdbId: "1CRN" })).toMatchObject({ ok: true });
}

test("Chrome discovers and executes all thirteen tools with structured results and audit", async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openLab(page);

  const results: Array<[string, unknown]> = [
    ["load_structure", { pdbId: "1CRN" }],
    ["get_structure_summary", {}],
    ["set_representation", { style: "stick", colorScheme: "spectrum" }],
    ["focus_residues", { residues: [{ chain: "A", residueNumber: 10 }] }],
    ["measure_distance", { from: { chain: "A", residueNumber: 1, atomName: "CA" }, to: { chain: "A", residueNumber: 10, atomName: "CA" } }],
    ["preview_mutation_context", { residue: { chain: "A", residueNumber: 10 }, toAminoAcid: "W" }],
    ["show_surface", { visible: true, opacity: 0.5 }],
    ["annotate_active_site", { chain: "A", residueNumber: 10, note: "Native Chrome test" }],
    ["query_uniprot_annotations", { pdbId: "1CRN", highlightInViewer: true }],
    ["compare_structures_rmsd", { referencePdbId: "1CRN", mobilePdbId: "1CRN" }],
    ["save_project_snapshot", { title: "Native WebMCP test" }],
    ["export_publication_figure", { resolution: "1x", background: "white", format: "png" }],
    ["reset_workspace", { scope: "view" }],
  ];
  for (const [name, input] of results) {
    const result = await execute(page, name, input);
    expect(result, name).toMatchObject({ ok: true, activityId: expect.any(String), evidence: expect.any(String) });
    if (name === "measure_distance") expect(result.data).toMatchObject({ angstroms: expect.any(Number), units: "angstrom" });
    if (name === "export_publication_figure") expect(result.data).toMatchObject({ dataUrl: expect.stringMatching(/^data:image\/png;base64,/) });
  }
  const activity = await page.evaluate(async () => {
    const inspect = (window as unknown as { __biofoldInspect: () => Promise<{ state: { activity: Array<{ command: string; agentKind?: string; status: string }> } }> }).__biofoldInspect;
    return (await inspect()).state.activity;
  });
  expect([...new Set(activity.filter(entry => entry.agentKind === "webmcp" && entry.status === "success").map(entry => entry.command))].sort()).toEqual([...COMMAND_NAMES].sort());
  const annotations = await page.evaluate(async () => (await document.modelContext!.getTools!()).find(tool => tool.name === "query_uniprot_annotations")!.annotations);
  expect(annotations).toMatchObject({ readOnlyHint: false, untrustedContentHint: true });
  expect(errors).toEqual([]);
});

test("Chrome removes tools on navigation and logout and restores them on return", async ({ page }) => {
  await openLab(page);
  await execute(page, "set_representation", { style: "stick", colorScheme: "spectrum" });
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture account" })).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([]);
  await page.getByRole("link", { name: "Laboratory", exact: true }).click();
  await expect.poll(() => toolNames(page)).toEqual([...COMMAND_NAMES].sort());
  await expect(page.locator(".scene-state-hud")).toContainText("Stick");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fixture login" })).toBeVisible();
  await expect.poll(() => toolNames(page)).toEqual([]);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("native execution returns application selection errors intact", async ({ page }) => {
  await openLab(page);
  // Meets the browser's schema; the requested residue is absent from 1CRN.
  expect(await execute(page, "focus_residues", { residues: [{ chain: "Z", residueNumber: 99999 }] })).toMatchObject({
    ok: false, error: { code: "SELECTION_NOT_FOUND" }, activityId: expect.any(String),
  });
  expect((await execute(page, "get_structure_summary")).ok).toBe(true);
});
