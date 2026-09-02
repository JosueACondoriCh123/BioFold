import { parseModelAnswer, type ModelAnswer } from "./assistantProtocol.ts";

interface OpenRouterOptions {
  apiKey: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  siteUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface OpenRouterResult extends ModelAnswer {
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; costUsd?: number };
}

export async function requestOpenRouter(options: OpenRouterOptions): Promise<OpenRouterResult> {
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
      stream: false,
      temperature: 0.2,
      messages: [{ role: "user", content: options.prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "biofold_assistant_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["answer", "proposals"],
            properties: {
              answer: { type: "string", minLength: 1, maxLength: 8000 },
              proposals: {
                type: "array", maxItems: 3,
                items: {
                  type: "object", additionalProperties: false,
                  required: ["id", "command", "input", "rationale"],
                  properties: {
                    id: { type: "string", minLength: 1, maxLength: 128 },
                    command: { type: "string" },
                    input: { type: "object" },
                    rationale: { type: "string", minLength: 1, maxLength: 1000 },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}.`);
  const payload = await response.json() as Record<string, unknown>;
  const choices = payload.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter returned no structured content.");
  let decoded: unknown;
  try { decoded = JSON.parse(content); } catch { throw new Error("OpenRouter returned malformed structured content."); }
  const answer = parseModelAnswer(decoded);
  const rawUsage = (payload.usage ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
  const cost = number(rawUsage.cost);
  return {
    ...answer,
    usage: {
      promptTokens: number(rawUsage.prompt_tokens),
      completionTokens: number(rawUsage.completion_tokens),
      totalTokens: number(rawUsage.total_tokens),
      ...(cost > 0 ? { costUsd: cost } : {}),
    },
  };
}
