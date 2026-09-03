import { sse, type EdgeCommandProposal } from "./assistantProtocol.ts";
import { streamOpenRouter, type OpenRouterResult, type OpenRouterStreamEvent } from "./openRouter.ts";

export interface ValidatedAssistantStreamOptions {
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  model: string;
  apiKey: string;
  prompt: string;
  citations: unknown[];
  signal?: AbortSignal;
  siteUrl?: string;
  now?: () => number;
  onProviderCalled: () => Promise<void>;
  persist: (result: OpenRouterResult, durationMs: number) => Promise<void>;
  interrupt: (input: { cancelled: boolean; providerCalled: boolean; providerRequestId?: string; durationMs: number }) => Promise<void>;
  providerStream?: (signal: AbortSignal) => AsyncGenerator<OpenRouterStreamEvent>;
}

export function createValidatedAssistantSseStream(options: ValidatedAssistantStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const startedAt = (options.now ?? Date.now)();
  let controllerAbort: AbortController | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerAbort = new AbortController();
      const signal = options.signal ? AbortSignal.any([options.signal, controllerAbort.signal]) : controllerAbort.signal;
      let closed = false;
      let providerCalled = false;
      let providerRequestId: string | undefined;
      let firstTokenAt: number | undefined;
      const emit = (event: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(event)); }
        catch { closed = true; controllerAbort?.abort(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* The browser disconnected. */ }
      };
      emit(sse("meta", { requestId: options.requestId, conversationId: options.conversationId, assistantMessageId: options.assistantMessageId }));
      void (async () => {
        try {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          let provider: AsyncGenerator<OpenRouterStreamEvent>;
          if (options.providerStream) {
            await options.onProviderCalled();
            providerCalled = true;
            provider = options.providerStream(signal);
          } else {
            provider = streamOpenRouter({
              apiKey: options.apiKey, model: options.model, prompt: options.prompt,
              signal, siteUrl: options.siteUrl,
              onProviderCalled: async () => {
                await options.onProviderCalled();
                providerCalled = true;
              },
            });
          }
          let result: OpenRouterResult | undefined;
          for await (const event of provider) {
            if (event.type === "provider_meta") providerRequestId = event.providerRequestId;
            else if (event.type === "answer_delta") {
              firstTokenAt ??= (options.now ?? Date.now)();
              emit(sse("delta", { text: event.text }));
            } else { result = event.result; providerRequestId = event.result.providerRequestId ?? providerRequestId; }
          }
          if (!result) throw new Error("OpenRouter produced no validated result.");
          const durationMs = (options.now ?? Date.now)() - startedAt;
          await options.persist(result, durationMs);
          emit(sse("citations", { citations: options.citations }));
          emit(sse("proposals", { proposals: result.proposals as EdgeCommandProposal[] }));
          if (result.usage) emit(sse("usage", { usage: { model: options.model, ...result.usage, durationMs } }));
          emit(sse("done", { interrupted: false }));
          console.info(JSON.stringify({
            event: "assistant_request_completed", requestId: options.requestId,
            model: options.model, providerRequestId: providerRequestId ?? null,
            promptTokens: result.usage?.promptTokens ?? null,
            completionTokens: result.usage?.completionTokens ?? null,
            totalTokens: result.usage?.totalTokens ?? null,
            costUsd: result.usage?.costUsd ?? null,
            ttftMs: firstTokenAt === undefined ? null : firstTokenAt - startedAt,
            durationMs,
          }));
        } catch (error) {
          const cancelled = signal.aborted || (error instanceof DOMException && error.name === "AbortError");
          const durationMs = (options.now ?? Date.now)() - startedAt;
          await options.interrupt({ cancelled, providerCalled, ...(providerRequestId ? { providerRequestId } : {}), durationMs }).catch(() => undefined);
          emit(sse("error", {
            code: cancelled ? "CANCELLED" : "MODEL_UNAVAILABLE",
            message: cancelled ? "The assistant request was cancelled." : "The scientific assistant was interrupted before validation. Retry with a new requestId.",
            retryable: !cancelled,
          }));
          emit(sse("done", { interrupted: true }));
          console.warn(JSON.stringify({
            event: "assistant_request_interrupted", requestId: options.requestId,
            model: options.model, providerRequestId: providerRequestId ?? null,
            status: cancelled ? "cancelled" : "failed",
            ttftMs: firstTokenAt === undefined ? null : firstTokenAt - startedAt,
            durationMs,
          }));
        } finally { close(); }
      })();
    },
    cancel() { controllerAbort?.abort(); },
  });
}
