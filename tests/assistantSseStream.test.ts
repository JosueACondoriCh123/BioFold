import { describe, expect, it, vi } from "vitest";
import { createValidatedAssistantSseStream } from "../supabase/functions/_shared/assistantSseStream";
import type { OpenRouterStreamEvent } from "../supabase/functions/_shared/openRouter";

async function read(stream: ReadableStream<Uint8Array>) {
  return new Response(stream).text();
}

describe("validated BioFold SSE stream", () => {
  it("persists after deltas and emits proposals only after persistence", async () => {
    const order: string[] = [];
    async function* provider(): AsyncGenerator<OpenRouterStreamEvent> {
      order.push("provider");
      yield { type: "answer_delta", text: "validated answer" };
      order.push("result");
      yield { type: "result", result: { answer: "validated answer", proposals: [{ id: "summary", command: "get_structure_summary", input: {}, rationale: "Summarize." }] } };
    }
    const persist = vi.fn(async () => { order.push("persist"); });
    const body = await read(createValidatedAssistantSseStream({
      requestId: "request", conversationId: "conversation", assistantMessageId: "message", model: "openai/gpt-5-mini", apiKey: "key", prompt: "prompt", citations: [],
      onProviderCalled: async () => { order.push("called"); }, persist, interrupt: vi.fn(), providerStream: provider,
    }));
    expect(order).toEqual(["called", "provider", "result", "persist"]);
    expect(body.indexOf("event: delta")).toBeLessThan(body.indexOf("event: proposals"));
    expect(body.indexOf("event: proposals")).toBeGreaterThan(-1);
    expect(body).toContain('event: done\ndata: {"type":"done","interrupted":false}');
    expect(persist).toHaveBeenCalledOnce();
  });

  it("does not emit proposals or usage for an interrupted partial response", async () => {
    async function* provider(): AsyncGenerator<OpenRouterStreamEvent> {
      yield { type: "answer_delta", text: "partial" };
      throw new Error("incomplete JSON");
    }
    const interrupt = vi.fn(async () => undefined);
    const body = await read(createValidatedAssistantSseStream({
      requestId: "request", conversationId: "conversation", assistantMessageId: "message", model: "openai/gpt-5-mini", apiKey: "key", prompt: "prompt", citations: [],
      onProviderCalled: async () => undefined, persist: vi.fn(), interrupt, providerStream: provider,
    }));
    expect(body).toContain('data: {"type":"delta","text":"partial"}');
    expect(body).not.toContain("event: proposals");
    expect(body).not.toContain("event: usage");
    expect(body).toContain('event: done\ndata: {"type":"done","interrupted":true}');
    expect(interrupt).toHaveBeenCalledWith(expect.objectContaining({ providerCalled: true, cancelled: false }));
  });

  it("releases admission without marking provider usage when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const onProviderCalled = vi.fn(async () => undefined);
    const interrupt = vi.fn(async () => undefined);
    const body = await read(createValidatedAssistantSseStream({
      requestId: "cancelled", conversationId: "conversation", assistantMessageId: "message",
      model: "openai/gpt-5-mini", apiKey: "key", prompt: "prompt", citations: [],
      signal: controller.signal, onProviderCalled, persist: vi.fn(), interrupt,
      providerStream: async function* () { yield { type: "answer_delta", text: "never" }; },
    }));
    expect(onProviderCalled).not.toHaveBeenCalled();
    expect(interrupt).toHaveBeenCalledWith(expect.objectContaining({ providerCalled: false, cancelled: true }));
    expect(body).not.toContain("event: delta");
  });
});
