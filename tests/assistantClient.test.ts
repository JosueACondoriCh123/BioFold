import { describe, expect, it, vi } from "vitest";
import {
  AssistantTransportError,
  createAssistantHttpClient,
  decodeAssistantSse,
} from "../src/assistant/assistantClient";
import { createDefaultAssistantMock } from "../src/phase2/mockAssistantClient";

function sseResponse(blocks: string[], init?: ResponseInit) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      blocks.forEach((block) => controller.enqueue(encoder.encode(block)));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" }, ...init });
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const values: T[] = [];
  for await (const value of iterable) values.push(value);
  return values;
}

describe("Assistant SSE client", () => {
  it("decodes fragmented CRLF streams and validates proposals", async () => {
    const response = sseResponse([
      "event: meta\r\ndata: {\"type\":\"meta\",\"requestId\":\"r1\",",
      "\"conversationId\":\"c1\",\"assistantMessageId\":\"m1\"}\r\n\r\n",
      "event: proposals\ndata: {\"type\":\"proposals\",\"proposals\":[{\"id\":\"p1\",\"command\":\"show_surface\",\"input\":{\"visible\":true,\"opacity\":0.55},\"rationale\":\"Inspect the molecular envelope.\"}]}\n\n",
      "event: done\ndata: {\"type\":\"done\",\"interrupted\":false}\n\n",
    ]);
    await expect(collect(decodeAssistantSse(response))).resolves.toMatchObject([
      { type: "meta", requestId: "r1" },
      { type: "proposals", proposals: [{ command: "show_surface", input: { visible: true, opacity: 0.55 } }] },
      { type: "done", interrupted: false },
    ]);
  });

  it("preserves a CRLF event boundary split between byte chunks", async () => {
    const response = sseResponse([
      "event: delta\r\ndata: {\"type\":\"delta\",\"text\":\"A\"}\r",
      "\n\r",
      "\nevent: done\r\ndata: {\"type\":\"done\",\"interrupted\":false}\r\n\r\n",
    ]);
    await expect(collect(decodeAssistantSse(response))).resolves.toEqual([
      { type: "delta", text: "A" },
      { type: "done", interrupted: false },
    ]);
  });

  it("sends only the public application key and current user token", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        apikey: "sb_publishable_test",
        Authorization: "Bearer user-session-token",
      });
      return sseResponse(["event: done\ndata: {\"type\":\"done\",\"interrupted\":false}\n\n"]);
    });
    const client = createAssistantHttpClient({
      endpoint: "https://project.supabase.co/functions/v1/biofold-chat",
      publishableKey: "sb_publishable_test",
      getAccessToken: () => "user-session-token",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(collect(client.stream({ requestId: "r1", projectId: "p1", message: "Explain 4HHB." })))
      .resolves.toEqual([{ type: "done", interrupted: false }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails closed without an authenticated user", async () => {
    const client = createAssistantHttpClient({
      endpoint: "https://project.supabase.co/functions/v1/biofold-chat",
      publishableKey: "sb_publishable_test",
      getAccessToken: () => null,
      fetchImpl: vi.fn() as typeof fetch,
    });
    await expect(collect(client.stream({ requestId: "r1", projectId: "p1", message: "Hello" })))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED", retryable: false });
  });

  it("normalizes non-success responses and mock cancellation", async () => {
    const response = Response.json({ error: { message: "Daily assistant limit reached." } }, { status: 429 });
    await expect(collect(decodeAssistantSse(response))).rejects.toEqual(expect.objectContaining<Partial<AssistantTransportError>>({
      code: "RATE_LIMITED",
      retryable: true,
    }));

    const controller = new AbortController();
    controller.abort();
    const events = await collect(createDefaultAssistantMock().stream(
      { requestId: "r1", projectId: "p1", message: "Hello" },
      { signal: controller.signal },
    ));
    expect(events).toEqual([{ type: "error", code: "CANCELLED", message: "The response was cancelled.", retryable: true }]);
  });

  it("preserves the server-only daily budget error without upselling", async () => {
    const response = Response.json({ error: {
      code: "BUDGET_EXCEEDED",
      message: "The free daily Assistant limit has been reached. It resets at 00:00 UTC tomorrow.",
      retryable: false,
    } }, { status: 402 });
    await expect(collect(decodeAssistantSse(response))).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
      retryable: false,
      message: expect.stringContaining("00:00 UTC"),
    });
  });
});
