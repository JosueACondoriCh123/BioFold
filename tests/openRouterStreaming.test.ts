import { describe, expect, it, vi } from "vitest";
import { IncrementalAnswerJsonDecoder } from "../supabase/functions/_shared/incrementalAnswerJson";
import { streamOpenRouter } from "../supabase/functions/_shared/openRouter";

function fragmentedSse(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

function data(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\r\n\r\n`;
}

describe("IncrementalAnswerJsonDecoder", () => {
  it("decodes the answer byte by byte, including escapes and surrogate pairs", () => {
    const raw = '{"proposals":[],"answer":"A\\nB \\u00e9 \\ud83e\\uddec"}';
    const decoder = new IncrementalAnswerJsonDecoder();
    let emitted = "";
    for (const character of raw) emitted += decoder.push(character);
    const result = decoder.finish();
    expect(emitted).toBe("A\nB é 🧬");
    expect(result.streamedAnswer).toBe("A\nB é 🧬");
    expect(result.value).toEqual({ proposals: [], answer: "A\nB é 🧬" });
  });

  it("never emits proposal strings even when proposals precede answer", () => {
    const decoder = new IncrementalAnswerJsonDecoder();
    const emitted = decoder.push('{"proposals":[{"rationale":"do not leak"}],"answer":"safe"}');
    expect(emitted).toBe("safe");
  });

  it("rejects incomplete JSON and trailing garbage", () => {
    const incomplete = new IncrementalAnswerJsonDecoder();
    incomplete.push('{"answer":"partial');
    expect(() => incomplete.finish()).toThrow(/complete/);
    const trailing = new IncrementalAnswerJsonDecoder();
    trailing.push('{"answer":"ok","proposals":[]}garbage');
    expect(() => trailing.finish()).toThrow(/malformed/);
  });
});

describe("streamOpenRouter", () => {
  it("handles fragmented CRLF SSE and withholds proposals until final validation", async () => {
    const document = JSON.stringify({
      proposals: [{ id: "summary", command: "get_structure_summary", input: {}, rationale: "Summarize the loaded structure." }],
      answer: "Observed evidence: α helix 🧬",
    });
    const midpoint = Math.floor(document.length / 2);
    const wire = [
      data({ id: "generation-1", choices: [{ delta: { content: document.slice(0, midpoint) } }] }),
      ": heartbeat\r\n\r\n",
      data({ choices: [{ delta: { content: document.slice(midpoint) } }] }),
      data({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 } }),
      data("[DONE]"),
    ].join("");
    const parts = Array.from(wire);
    const fetchImpl = vi.fn(async () => fragmentedSse(parts));
    const events = [];
    for await (const event of streamOpenRouter({ apiKey: "key", model: "openai/gpt-5-mini", prompt: "question", fetchImpl: fetchImpl as typeof fetch })) events.push(event);
    const deltas = events.filter((event) => event.type === "answer_delta").map((event) => event.text).join("");
    expect(deltas).toBe("Observed evidence: α helix 🧬");
    expect(events.at(-1)).toMatchObject({ type: "result", result: { providerRequestId: "generation-1", proposals: [{ command: "get_structure_summary" }] } });
    expect(events.find((event) => event.type === "provider_meta")).toEqual({ type: "provider_meta", providerRequestId: "generation-1" });
    expect(events.filter((event) => event.type !== "provider_meta").slice(0, -1).every((event) => event.type === "answer_delta")).toBe(true);
  });

  it("allows absent usage but rejects provider errors and missing DONE", async () => {
    const valid = data({ choices: [{ delta: { content: '{"answer":"ok","proposals":[]}' } }] });
    const noUsage = vi.fn(async () => fragmentedSse([valid, data("[DONE]")]));
    const events = [];
    for await (const event of streamOpenRouter({ apiKey: "key", model: "model", prompt: "prompt", fetchImpl: noUsage as typeof fetch })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: "result", result: { answer: "ok" } });
    expect((events.at(-1) as { result: { usage?: unknown } }).result.usage).toBeUndefined();

    const providerError = vi.fn(async () => fragmentedSse([data({ error: { message: "unavailable" } }), data("[DONE]")]));
    await expect(async () => {
      for await (const event of streamOpenRouter({ apiKey: "key", model: "model", prompt: "prompt", fetchImpl: providerError as typeof fetch })) { void event; }
    }).rejects.toThrow(/reported an error/);

    const missingDone = vi.fn(async () => fragmentedSse([valid]));
    await expect(async () => {
      for await (const event of streamOpenRouter({ apiKey: "key", model: "model", prompt: "prompt", fetchImpl: missingDone as typeof fetch })) { void event; }
    }).rejects.toThrow(/without a \[DONE\]/);
  });

  it("surfaces non-successful HTTP responses and aborts an active provider stream", async () => {
    const unavailable = vi.fn(async () => new Response("unavailable", { status: 503 }));
    await expect(async () => {
      for await (const event of streamOpenRouter({ apiKey: "key", model: "model", prompt: "prompt", fetchImpl: unavailable as typeof fetch })) { void event; }
    }).rejects.toThrow(/HTTP 503/);

    const controller = new AbortController();
    const encoder = new TextEncoder();
    const abortingFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(encoder.encode(data({ choices: [{ delta: { content: '{"answer":"partial' } }] })));
        init?.signal?.addEventListener("abort", () => streamController.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    })));
    const events = streamOpenRouter({ apiKey: "key", model: "model", prompt: "prompt", signal: controller.signal, fetchImpl: abortingFetch as typeof fetch });
    await expect(events.next()).resolves.toMatchObject({ value: { type: "answer_delta", text: "partial" } });
    controller.abort();
    await expect(events.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});
