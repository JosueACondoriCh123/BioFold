import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantChat } from "../src/features/assistant/ui/AssistantChat";
import type { AssistantClient, AssistantHistoryPort } from "../src/types/assistant";

afterEach(cleanup);

describe("persistent Assistant history", () => {
  it("hydrates the latest conversation and continues it on the next request", async () => {
    const history: AssistantHistoryPort = {
      loadLatest: vi.fn(async () => ({
        conversationId: "aa000000-0000-4000-8000-000000000001",
        messages: [{
          id: "saved-answer", sender: "assistant" as const, content: "Saved scientific answer.", citations: [], proposals: [], createdAt: "2026-09-01T00:00:00Z",
        }],
      })),
    };
    const stream = vi.fn(async function* (request) {
      expect(request.conversationId).toBe("aa000000-0000-4000-8000-000000000001");
      yield { type: "meta", requestId: request.requestId, conversationId: request.conversationId!, assistantMessageId: "next-answer" } as const;
      yield { type: "delta", text: "Continued answer." } as const;
      yield { type: "done", interrupted: false } as const;
    });
    const client: AssistantClient = { stream };
    render(<AssistantChat assistantClient={client} assistantHistory={history} projectId="a0000000-0000-4000-8000-000000000001" />);

    expect(await screen.findByText("Saved scientific answer.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assistant prompt message"), { target: { value: "Continue" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));
    expect(await screen.findByText("Continued answer.")).toBeInTheDocument();
    expect(stream).toHaveBeenCalledOnce();
  }, 15000);

  it("disables remote assistance until a project is saved", () => {
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} projectId="unsaved-workspace" enabled={false} />);
    expect(screen.getByText("Save or open a project to use the persistent Assistant.")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant prompt message")).toBeDisabled();
  });

  it("does not erase a saved answer while history is loading", async () => {
    let resolve!: (value: null) => void;
    const history: AssistantHistoryPort = { loadLatest: () => new Promise((done) => { resolve = done; }) };
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} assistantHistory={history} projectId="p" initialMessages={[{ id: "local", sender: "assistant", content: "Confirmed answer", createdAt: "2026-09-01" }]} />);
    expect(screen.getByText("Confirmed answer")).toBeInTheDocument();
    resolve(null);
    await waitFor(() => expect(screen.queryByText("Loading saved conversation…")).not.toBeInTheDocument());
  });

  it("restores the applied state from confirmed Assistant activity", async () => {
    const history: AssistantHistoryPort = { loadLatest: async () => ({
      conversationId: "conversation",
      messages: [{
        id: "assistant-message", sender: "assistant", content: "Review the calculated summary.", citations: [],
        proposals: [{ id: "summary-proposal", command: "get_structure_summary", input: {}, rationale: "Read the confirmed scene." }],
        createdAt: "2026-09-01T00:00:00Z",
      }],
    }) };
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} assistantHistory={history} projectId="project" confirmedActivities={[{
      id: "activity", command: "get_structure_summary", origin: "agent", agentKind: "assistant", approvedByUser: true,
      sourceMessageId: "assistant-message", status: "success", message: "Summary calculated.", createdAt: "2026-09-01T00:00:01Z", durationMs: 4,
    }]} />);
    expect(await screen.findByText("Applied to scene")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply proposed command Get Structure Summary" })).not.toBeInTheDocument();
  });
});
