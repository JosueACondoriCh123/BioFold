import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantChat } from "../src/features/assistant/ui/AssistantChat";
import { InMemoryAssistantConversationAdapter } from "../src/assistant/assistantConversation";
import type { AssistantClient, AssistantConversationPort, PersistedAssistantMessage } from "../src/types/assistant";

afterEach(cleanup);

function adapterWith(messages: PersistedAssistantMessage[], projectId = "project", conversationId = "conversation") {
  return new InMemoryAssistantConversationAdapter([{
    summary: {
      id: conversationId, projectId, title: "Saved conversation",
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    },
    messages,
  }]);
}

describe("persistent Assistant history", () => {
  it("hydrates the latest conversation and continues it on the next request", async () => {
    const projectId = "a0000000-0000-4000-8000-000000000001";
    const conversationId = "aa000000-0000-4000-8000-000000000001";
    const conversations = adapterWith([{
      id: "saved-answer", sender: "assistant", content: "Saved scientific answer.",
      citations: [], proposals: [], createdAt: "2026-09-01T00:00:00Z",
    }], projectId, conversationId);
    const stream = vi.fn(async function* (request) {
      expect(request.conversationId).toBe(conversationId);
      yield { type: "meta", requestId: request.requestId, conversationId, assistantMessageId: "next-answer" } as const;
      yield { type: "delta", text: "Continued answer." } as const;
      yield { type: "done", interrupted: false } as const;
    });
    render(<AssistantChat assistantClient={{ stream }} assistantConversations={conversations} projectId={projectId} />);
    expect(await screen.findByText("Saved scientific answer.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Assistant prompt message"), { target: { value: "Continue" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));
    expect(await screen.findByText("Continued answer.")).toBeInTheDocument();
    expect(stream).toHaveBeenCalledOnce();
  });

  it("disables remote assistance until a project is saved", () => {
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} projectId="unsaved-workspace" enabled={false} />);
    expect(screen.getByText("Save or open a project to use the persistent Assistant.")).toBeInTheDocument();
    expect(screen.getByLabelText("Assistant prompt message")).toBeDisabled();
  });

  it("does not erase a local answer while conversation history is loading", async () => {
    let resolve!: (value: null) => void;
    const conversations: AssistantConversationPort = {
      list: async () => [{ id: "conversation", projectId: "p", title: "Saved", createdAt: "2026-09-01", updatedAt: "2026-09-01" }],
      load: () => new Promise((done) => { resolve = done; }),
      rename: async () => { throw new Error("unused"); },
      delete: async () => undefined,
    };
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} assistantConversations={conversations} projectId="p"
      initialMessages={[{ id: "local", sender: "assistant", content: "Confirmed answer", createdAt: "2026-09-01" }]} />);
    expect(screen.getByText("Confirmed answer")).toBeInTheDocument();
    await waitFor(() => expect(typeof resolve).toBe("function"));
    resolve(null);
    await waitFor(() => expect(screen.queryByText("Loading saved conversation…")).not.toBeInTheDocument());
    expect(screen.getByText("Confirmed answer")).toBeInTheDocument();
  });

  it("restores Applied from a confirmed Assistant audit event", async () => {
    const conversations = adapterWith([{
      id: "assistant-message", sender: "assistant", content: "Review the calculated summary.", citations: [],
      proposals: [{ id: "summary-proposal", command: "get_structure_summary", input: {}, rationale: "Read the confirmed scene." }],
      createdAt: "2026-09-01T00:00:00Z",
    }]);
    const client: AssistantClient = { async *stream() { yield { type: "done", interrupted: false }; } };
    render(<AssistantChat assistantClient={client} assistantConversations={conversations} projectId="project" confirmedActivities={[{
      id: "activity", command: "get_structure_summary", origin: "agent", agentKind: "assistant", approvedByUser: true,
      sourceMessageId: "assistant-message", status: "success", message: "Summary calculated.", createdAt: "2026-09-01T00:00:01Z", durationMs: 4,
    }]} />);
    expect(await screen.findByText("Applied to scene")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply proposed command Get Structure Summary" })).not.toBeInTheDocument();
  });
});
