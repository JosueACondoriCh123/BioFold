import { parseModelAnswer, type ModelAnswer } from "./assistantProtocol.ts";
import { IncrementalAnswerJsonDecoder } from "./incrementalAnswerJson.ts";

interface OpenRouterOptions {
  apiKey: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
  onProviderCalled?: () => Promise<void>;
}

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
}

export interface OpenRouterResult extends ModelAnswer {
  usage?: OpenRouterUsage;
  providerRequestId?: string;
}

export type OpenRouterStreamEvent =
  | { type: "provider_meta"; providerRequestId: string }
  | { type: "answer_delta"; text: string }
  | { type: "result"; result: OpenRouterResult };

const residueProperties = {
  chain: { type: "string", minLength: 1, maxLength: 4 },
  residueNumber: { type: "integer" },
  insertionCode: { type: "string", minLength: 1, maxLength: 2 },
};
const atomProperties = { ...residueProperties, atomName: { type: "string", minLength: 1, maxLength: 4 } };

function objectSchema(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { type: "object", additionalProperties: false, required, properties };
}
const proposalBase = {
  id: { type: "string", minLength: 1, maxLength: 128 },
  rationale: { type: "string", minLength: 1, maxLength: 1000 },
};
const residueSchema = {
  anyOf: [
    objectSchema({ chain: residueProperties.chain, residueNumber: residueProperties.residueNumber }),
    objectSchema(residueProperties),
  ],
};
const atomSchema = {
  anyOf: [
    objectSchema({ chain: atomProperties.chain, residueNumber: atomProperties.residueNumber, atomName: atomProperties.atomName }),
    objectSchema(atomProperties),
  ],
};

function proposal(command: string, input: unknown) {
  return objectSchema({ ...proposalBase, command: { const: command }, input }, ["id", "command", "input", "rationale"]);
}

const proposalSchema = {
  anyOf: [
    proposal("load_structure", objectSchema({ pdbId: { type: "string", pattern: "^[A-Za-z0-9]{4}$" } })),
    proposal("get_structure_summary", objectSchema({})),
    proposal("focus_residues", { anyOf: [
      objectSchema({ residues: { type: "array", minItems: 1, maxItems: 20, items: residueSchema } }),
      objectSchema({ residues: { type: "array", minItems: 1, maxItems: 20, items: residueSchema }, label: { type: "boolean" } }),
    ] }),
    proposal("set_representation", objectSchema({
      style: { enum: ["cartoon", "stick", "sphere", "line"] },
      colorScheme: { enum: ["chain", "spectrum", "element"] },
    })),
    proposal("show_surface", objectSchema({
      visible: { type: "boolean" }, opacity: { type: "number", minimum: 0.1, maximum: 1 },
    })),
    proposal("measure_distance", objectSchema({
      from: atomSchema,
      to: atomSchema,
    })),
    proposal("preview_mutation_context", objectSchema({
      residue: residueSchema,
      toAminoAcid: { type: "string", pattern: "^[ARNDCQEGHILKMFPSTWYVarn dcqeghilkmfpstwyv]$".replaceAll(" ", "") },
    })),
    proposal("reset_workspace", objectSchema({ scope: { enum: ["view", "all"] } })),
  ],
};

export const OPENROUTER_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "biofold_assistant_response",
    strict: true,
    schema: objectSchema({
      answer: { type: "string", minLength: 1, maxLength: 8000 },
      proposals: { type: "array", maxItems: 3, items: proposalSchema },
    }),
  },
} as const;

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseUsage(value: unknown): OpenRouterUsage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const usage = value as Record<string, unknown>;
  const promptTokens = finiteNonNegative(usage.prompt_tokens);
  const completionTokens = finiteNonNegative(usage.completion_tokens);
  const totalTokens = finiteNonNegative(usage.total_tokens);
  if (promptTokens === undefined || completionTokens === undefined || totalTokens === undefined) return undefined;
  const cost = finiteNonNegative(usage.cost);
  return { promptTokens, completionTokens, totalTokens, ...(cost === undefined ? {} : { costUsd: cost }) };
}

function eventPayloads(buffer: string): { payloads: string[]; remainder: string } {
  const payloads: string[] = [];
  let remainder = buffer;
  while (true) {
    const separator = /\r\n\r\n|\n\n|\r\r/.exec(remainder);
    if (!separator || separator.index === undefined) break;
    const block = remainder.slice(0, separator.index).replace(/\r\n|\r/g, "\n");
    remainder = remainder.slice(separator.index + separator[0].length);
    const data = block.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (data.length) payloads.push(data.join("\n"));
  }
  return { payloads, remainder };
}

export async function* streamOpenRouter(options: OpenRouterOptions): AsyncGenerator<OpenRouterStreamEvent> {
  await options.onProviderCalled?.();
  const response = await (options.fetchImpl ?? fetch)("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.siteUrl ? { "HTTP-Referer": options.siteUrl } : {}),
      "X-OpenRouter-Title": "BioFold 3D",
    },
    body: JSON.stringify({
      model: options.model,
      ...(options.model.endsWith(":free")
        ? { models: [options.model, options.model.replace(/:free$/, "")] }
        : {}),
      stream: true,
      usage: { include: true },
      max_completion_tokens: 1200,
      max_tokens: 1200,
      ...(options.model.startsWith("z-ai/") || options.model.endsWith(":free")
        ? {}
        : { provider: { require_parameters: true } }),
      messages: [{ role: "user", content: options.prompt }],
      response_format: OPENROUTER_RESPONSE_FORMAT,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`OpenRouter returned HTTP ${response.status}: ${errorText}`);
    throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("OpenRouter returned no response stream.");

  const answerDecoder = new IncrementalAnswerJsonDecoder();
  const textDecoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let usage: OpenRouterUsage | undefined;
  let providerRequestId: string | undefined;
  let emittedProviderRequestId: string | undefined;
  let receivedDone = false;

  const consumePayload = (payloadText: string) => {
    if (payloadText === "[DONE]") {
      receivedDone = true;
      return "";
    }
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(payloadText) as Record<string, unknown>; }
    catch { throw new Error("OpenRouter returned malformed SSE data."); }
    if (payload.error) throw new Error("OpenRouter reported an error while streaming.");
    if (typeof payload.id === "string") providerRequestId = payload.id;
    const parsedUsage = parseUsage(payload.usage);
    if (parsedUsage) usage = parsedUsage;
    const choices = payload.choices as Array<{ delta?: { content?: unknown } }> | undefined;
    const content = choices?.[0]?.delta?.content;
    return typeof content === "string" ? answerDecoder.push(content) : "";
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += textDecoder.decode(value, { stream: !done });
    const parsed = eventPayloads(buffer);
    buffer = parsed.remainder;
    for (const payload of parsed.payloads) {
      const text = consumePayload(payload);
      if (providerRequestId && providerRequestId !== emittedProviderRequestId) {
        emittedProviderRequestId = providerRequestId;
        yield { type: "provider_meta", providerRequestId };
      }
      if (text) yield { type: "answer_delta", text };
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const parsed = eventPayloads(`${buffer}\n\n`);
    for (const payload of parsed.payloads) {
      const text = consumePayload(payload);
      if (providerRequestId && providerRequestId !== emittedProviderRequestId) {
        emittedProviderRequestId = providerRequestId;
        yield { type: "provider_meta", providerRequestId };
      }
      if (text) yield { type: "answer_delta", text };
    }
  }
  if (!receivedDone) throw new Error("OpenRouter ended without a [DONE] event.");

  const decoded = answerDecoder.finish();
  const answer = parseModelAnswer(decoded.value);
  if (decoded.streamedAnswer !== answer.answer) throw new Error("Streamed answer did not match the validated response.");
  yield {
    type: "result",
    result: { ...answer, ...(usage ? { usage } : {}), ...(providerRequestId ? { providerRequestId } : {}) },
  };
}

/** Compatibility helper for callers that need the final validated result. */
export async function requestOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResult> {
  let result: OpenRouterResult | undefined;
  for await (const event of streamOpenRouter(options)) if (event.type === "result") result = event.result;
  if (!result) throw new Error("OpenRouter did not produce a validated result.");
  return result;
}
