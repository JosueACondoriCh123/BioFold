import { parseAssistantRequest } from "../types/assistant";
import type {
  AssistantClient,
  AssistantRequest,
  AssistantStreamEvent,
  AssistantStreamOptions,
} from "../types/assistant";

export class MockAssistantClient implements AssistantClient {
  constructor(private readonly events: AssistantStreamEvent[]) {}

  async *stream(request: AssistantRequest, options?: AssistantStreamOptions) {
    parseAssistantRequest(request);
    for (const event of this.events) {
      if (options?.signal?.aborted) {
        yield { type: "error", code: "CANCELLED", message: "The response was cancelled.", retryable: true } as const;
        return;
      }
      await Promise.resolve();
      yield structuredClone(event);
    }
  }
}
export function createDefaultAssistantMock(requestId = "phase2-request") {
  return new MockAssistantClient([
    {
      type: "meta",
      requestId,
      conversationId: "phase2-conversation",
      assistantMessageId: "phase2-message",
    },
    { type: "delta", text: "I can summarize the structure currently confirmed in this project." },
    {
      type: "citations",
      citations: [{
        id: "biofold-evidence",
        title: "BioFold scientific evidence levels",
        publisher: "BioFold",
        url: "https://example.invalid/biofold/evidence",
        retrievedAt: "2026-09-01T00:00:00.000Z",
      }],
    },
    {
      type: "proposals",
      proposals: [{
        id: "phase2-proposal",
        command: "get_structure_summary",
        input: {},
        rationale: "Read the calculated summary without changing the molecular scene.",
      }],
    },
    { type: "done", interrupted: false },
  ]);
}
