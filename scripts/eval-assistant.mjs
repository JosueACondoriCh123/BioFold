import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suite = JSON.parse(await readFile(resolve(root, "evals/assistant/golden.json"), "utf8"));
const endpoint = process.env.BIOFOLD_ASSISTANT_URL;
const token = process.env.BIOFOLD_EVAL_ACCESS_TOKEN;
const projectId = process.env.BIOFOLD_EVAL_PROJECT_ID;
if (!endpoint || !token || !projectId) throw new Error("Set BIOFOLD_ASSISTANT_URL, BIOFOLD_EVAL_ACCESS_TOKEN, and BIOFOLD_EVAL_PROJECT_ID.");

const commands = new Set(["load_structure", "get_structure_summary", "focus_residues", "set_representation", "show_surface", "measure_distance", "preview_mutation_context", "reset_workspace"]);
const transientStatus = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
let lastRequestStart = 0;

async function waitForRequestSlot() {
  const wait = 10_500 - (Date.now() - lastRequestStart);
  if (wait > 0) await sleep(wait);
  lastRequestStart = Date.now();
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

function parseBlock(block) {
  const lines = block.replace(/\r\n?/g, "\n").split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  return event && data ? { event, payload: JSON.parse(data) } : null;
}

async function runAttempt(testCase) {
  await waitForRequestSlot();
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      projectId: testCase.projectFixture ? process.env[`BIOFOLD_EVAL_PROJECT_${testCase.projectFixture}_ID`] ?? projectId : projectId,
      message: testCase.prompt,
    }),
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw new Error("Assistant returned no stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let citations = [];
  let proposals = [];
  let ttftMs = null;
  let done = false;
  let autoApplied = false;
  while (true) {
    const { value, done: streamDone } = await reader.read();
    buffer += decoder.decode(value, { stream: !streamDone });
    const blocks = [];
    while (true) {
      const boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
      if (!boundary || boundary.index === undefined) break;
      blocks.push(buffer.slice(0, boundary.index));
      buffer = buffer.slice(boundary.index + boundary[0].length);
    }
    for (const block of blocks) {
      const parsed = parseBlock(block);
      if (!parsed) continue;
      if (parsed.event === "delta") {
        if (ttftMs === null) ttftMs = performance.now() - started;
        answer += parsed.payload.text ?? "";
      } else if (parsed.event === "citations") citations = parsed.payload.citations ?? [];
      else if (parsed.event === "proposals") proposals = parsed.payload.proposals ?? [];
      else if (parsed.event === "done") done = parsed.payload.interrupted === false;
      else if (["applied", "command", "command_result"].includes(parsed.event)) autoApplied = true;
      else if (parsed.event === "error") {
        const error = new Error(parsed.payload.message ?? "Assistant stream error.");
        error.transient = parsed.payload.retryable === true;
        throw error;
      }
    }
    if (streamDone) break;
  }
  if (!done) throw new Error("Assistant stream did not complete successfully.");
  return { answer, citations, proposals, autoApplied, ttftMs: ttftMs ?? performance.now() - started, totalMs: performance.now() - started };
}

async function runCase(testCase) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await runAttempt(testCase); }
    catch (error) {
      const retryable = attempt === 0 && (transientStatus.has(error.status) || error.transient === true || error instanceof TypeError);
      if (!retryable) throw error;
      await sleep(10_500);
    }
  }
}

function citationAllowed(citation) {
  const prefixes = suite.allowedCitations[citation.publisher];
  return Array.isArray(prefixes) && typeof citation.url === "string" && prefixes.some((prefix) => citation.url.startsWith(prefix));
}

function abstained(answer) {
  const normalized = answer.toLowerCase();
  return ["cannot", "can't", "no puedo", "unavailable", "not available", "fuera del alcance", "not supported"].some((phrase) => normalized.includes(phrase));
}

function validProposal(proposal) {
  if (!proposal || typeof proposal !== "object" || typeof proposal.id !== "string" || !proposal.id
    || typeof proposal.rationale !== "string" || !proposal.rationale || !commands.has(proposal.command)
    || !proposal.input || typeof proposal.input !== "object" || Array.isArray(proposal.input)) return false;
  const input = proposal.input;
  switch (proposal.command) {
    case "load_structure": return typeof input.pdbId === "string" && /^[A-Z0-9]{4}$/i.test(input.pdbId);
    case "get_structure_summary": return Object.keys(input).length === 0;
    case "focus_residues": return Array.isArray(input.residues) && input.residues.length >= 1 && input.residues.length <= 20;
    case "set_representation": return ["cartoon", "stick", "sphere", "line"].includes(input.style) && ["chain", "spectrum", "element"].includes(input.colorScheme);
    case "show_surface": return typeof input.visible === "boolean" && typeof input.opacity === "number" && input.opacity >= 0.1 && input.opacity <= 1;
    case "measure_distance": return input.from && input.to && Number.isInteger(input.from.residueNumber) && Number.isInteger(input.to.residueNumber);
    case "preview_mutation_context": return input.residue && Number.isInteger(input.residue.residueNumber) && /^[ARNDCQEGHILKMFPSTWYV]$/i.test(input.toAminoAcid);
    case "reset_workspace": return input.scope === "view" || input.scope === "all";
    default: return false;
  }
}

const results = [];
for (const testCase of suite.cases) {
  const output = await runCase(testCase);
  const publishers = new Set(output.citations.map((citation) => citation.publisher));
  const invalidProposals = output.proposals.filter((proposal) => !validProposal(proposal));
  results.push({
    id: testCase.id,
    citationValid: output.citations.every(citationAllowed),
    expectedSources: testCase.expectedPublishers ?? [],
    recalledSources: (testCase.expectedPublishers ?? []).filter((publisher) => publishers.has(publisher)),
    abstained: !testCase.mustAbstain || abstained(output.answer),
    proposalsValid: invalidProposals.length === 0,
    autoApplied: output.autoApplied,
    ttftMs: Math.round(output.ttftMs), totalMs: Math.round(output.totalMs),
  });
  console.log(JSON.stringify(results.at(-1)));
}

const expected = results.reduce((sum, result) => sum + result.expectedSources.length, 0);
const recalled = results.reduce((sum, result) => sum + result.recalledSources.length, 0);
const summary = {
  citationValidity: results.filter((result) => result.citationValid).length / results.length,
  sourceRecall: expected ? recalled / expected : 1,
  abstention: results.filter((result) => result.abstained).length / results.length,
  proposalValidity: results.filter((result) => result.proposalsValid).length / results.length,
  autoApplied: results.filter((result) => result.autoApplied).length,
  ttftP95Ms: percentile(results.map((result) => result.ttftMs), 0.95),
  totalP95Ms: percentile(results.map((result) => result.totalMs), 0.95),
};
console.log(JSON.stringify({ summary }, null, 2));
const passed = summary.citationValidity === 1 && summary.sourceRecall >= 0.9 && summary.abstention === 1 &&
  summary.proposalValidity === 1 && summary.autoApplied === 0 && summary.ttftP95Ms < 8_000 && summary.totalP95Ms < 30_000;
if (!passed) process.exitCode = 1;
