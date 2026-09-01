import {
  parseAssistantRequest,
  parseCommandProposal,
} from "../types/assistant";
import type {
  AssistantClient,
  AssistantErrorCode,
  AssistantRequest,
  AssistantStreamEvent,
  AssistantStreamOptions,
  AssistantUsage,
  Citation,
} from "../types/assistant";

export class AssistantTransportError extends Error {
  constructor(
    public readonly code: AssistantErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AssistantTransportError";
  }
}

function recordOf(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AssistantTransportError("STREAM_FAILED", `${label} must be an object.`, false);
  }
  return input as Record<string, unknown>;
}

function text(input: unknown, label: string) {
  if (typeof input !== "string" || !input) {
    throw new AssistantTransportError("STREAM_FAILED", `${label} must be a non-empty string.`, false);
  }
  return input;
}

function finiteNonNegative(input: unknown, label: string) {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    throw new AssistantTransportError("STREAM_FAILED", `${label} must be a non-negative number.`, false);
  }
  return input;
}

function parseCitation(input: unknown): Citation {
  const value = recordOf(input, "Citation");
  const publisher = text(value.publisher, "Citation publisher");
  if (publisher !== "BioFold" && publisher !== "RCSB PDB" && publisher !== "UniProt") {
    throw new AssistantTransportError("STREAM_FAILED", "Citation publisher is unsupported.", false);
  }
  const url = text(value.url, "Citation URL");
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new AssistantTransportError("STREAM_FAILED", "Citation URL must use HTTPS.", false);
  }
  return {
    id: text(value.id, "Citation id"),
    title: text(value.title, "Citation title"),
    publisher,
    url,
    ...(value.locator === undefined ? {} : { locator: text(value.locator, "Citation locator") }),
    retrievedAt: text(value.retrievedAt, "Citation retrieval time"),
  };
}

function parseUsage(input: unknown): AssistantUsage {
  const value = recordOf(input, "Assistant usage");
  return {
    model: text(value.model, "Usage model"),
    promptTokens: finiteNonNegative(value.promptTokens, "promptTokens"),
    completionTokens: finiteNonNegative(value.completionTokens, "completionTokens"),
    totalTokens: finiteNonNegative(value.totalTokens, "totalTokens"),
    ...(value.costUsd === undefined ? {} : { costUsd: finiteNonNegative(value.costUsd, "costUsd") }),
    ...(value.durationMs === undefined ? {} : { durationMs: finiteNonNegative(value.durationMs, "durationMs") }),
  };
}

export function parseAssistantStreamEvent(input: unknown): AssistantStreamEvent {
  const value = recordOf(input, "Assistant stream event");
  switch (value.type) {
    case "meta":
      return {
        type: "meta",
        requestId: text(value.requestId, "requestId"),
        conversationId: text(value.conversationId, "conversationId"),
        assistantMessageId: text(value.assistantMessageId, "assistantMessageId"),
      };
    case "delta":
      return { type: "delta", text: text(value.text, "Delta text") };
    case "citations":
      if (!Array.isArray(value.citations)) throw new AssistantTransportError("STREAM_FAILED", "citations must be an array.", false);
      return { type: "citations", citations: value.citations.map(parseCitation) };
    case "proposals":
      if (!Array.isArray(value.proposals) || value.proposals.length > 3) {
        throw new AssistantTransportError("STREAM_FAILED", "A response may propose at most three commands.", false);
      }
      return { type: "proposals", proposals: value.proposals.map(parseCommandProposal) };
    case "usage":
      return { type: "usage", usage: parseUsage(value.usage) };
    case "done":
      if (typeof value.interrupted !== "boolean") throw new AssistantTransportError("STREAM_FAILED", "done.interrupted must be boolean.", false);
      return { type: "done", interrupted: value.interrupted };
    case "error":
      if (!["AUTH_REQUIRED", "INVALID_INPUT", "PROJECT_NOT_FOUND", "CONFLICT",
        "RATE_LIMITED", "MODEL_UNAVAILABLE", "STREAM_FAILED", "CANCELLED",
        "UNKNOWN_ERROR"].includes(String(value.code))) {
        throw new AssistantTransportError("STREAM_FAILED", "Assistant error code is unsupported.", false);
      }
      return {
        type: "error",
        code: text(value.code, "Assistant error code") as AssistantErrorCode,
        message: text(value.message, "Assistant error message"),
        retryable: Boolean(value.retryable),
      };
    default:
      throw new AssistantTransportError("STREAM_FAILED", "Assistant stream event type is unsupported.", false);
  }
}

function parseSseBlock(block: string): AssistantStreamEvent | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(data.join("\n")); }
  catch { throw new AssistantTransportError("STREAM_FAILED", "Assistant returned malformed SSE data.", true); }
  const event = parseAssistantStreamEvent(parsed);
  if (eventName !== "message" && eventName !== event.type) {
    throw new AssistantTransportError("STREAM_FAILED", "Assistant SSE event name does not match its payload.", false);
  }
  return event;
}

export async function* decodeAssistantSse(response: Response): AsyncIterable<AssistantStreamEvent> {
  if (!response.ok) {
    let message = `Assistant request failed with HTTP ${response.status}.`;
    try {
      const payload = await response.json() as { error?: { message?: unknown } };
      if (typeof payload.error?.message === "string") message = payload.error.message;
    } catch { /* The status remains the authoritative fallback. */ }
    throw new AssistantTransportError(
      response.status === 401 ? "AUTH_REQUIRED" : response.status === 429 ? "RATE_LIMITED" : "MODEL_UNAVAILABLE",
      message,
      response.status === 429 || response.status >= 500,
    );
  }
  if (!response.body) throw new AssistantTransportError("STREAM_FAILED", "Assistant response has no stream body.", true);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseBlock(block);
        if (event) yield event;
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = parseSseBlock(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

export interface AssistantHttpClientOptions {
  endpoint: string;
  publishableKey: string;
  getAccessToken: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createAssistantHttpClient(options: AssistantHttpClientOptions): AssistantClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async *stream(request: AssistantRequest, streamOptions?: AssistantStreamOptions) {
      const input = parseAssistantRequest(request);
      if (streamOptions?.signal?.aborted) {
        throw new AssistantTransportError("CANCELLED", "The request was cancelled.", true);
      }
      const token = await options.getAccessToken();
      if (!token) throw new AssistantTransportError("AUTH_REQUIRED", "Sign in before using the assistant.", false);
      let response: Response;
      try {
        response = await fetchImpl(options.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            apikey: options.publishableKey,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(input),
          signal: streamOptions?.signal,
        });
      } catch (error) {
        if (streamOptions?.signal?.aborted) {
          throw new AssistantTransportError("CANCELLED", "The request was cancelled.", true);
        }
        throw new AssistantTransportError(
          "STREAM_FAILED",
          error instanceof Error ? error.message : "The assistant could not be reached.",
          true,
        );
      }
      yield* decodeAssistantSse(response);
    },
  };
}
