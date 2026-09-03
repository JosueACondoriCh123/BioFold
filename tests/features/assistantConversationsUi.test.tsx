import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssistantChat } from "../../src/features/assistant/ui/AssistantChat";
import { InMemoryAssistantConversationAdapter } from "../../src/assistant/assistantConversation";
import { isValidUuid } from "../../src/assistant/uuid";
import type {
  AssistantClient,
  AssistantRequest,
  AssistantStreamEvent,
  AssistantStreamOptions,
  PersistedAssistantMessage,
} from "../../src/types/assistant";

afterEach(cleanup);

function createMockClient(eventsToEmit: AssistantStreamEvent[]): AssistantClient {
  return {
    async *stream(_request: AssistantRequest, options?: AssistantStreamOptions) {
      for (const event of eventsToEmit) {
        if (options?.signal?.aborted) return;
        yield event;
      }
    },
  };
}

describe("Assistant Conversations UI - Agente A Tarea 2", () => {
  it("renders conversation selector and switches between conversations loading their messages", async () => {
    const msg1: PersistedAssistantMessage = {
      id: "m-1",
      sender: "assistant",
      content: "AlphaFold summary conversation 1",
      citations: [],
      proposals: [],
      createdAt: "2026-09-01T10:00:00Z",
    };
    const msg2: PersistedAssistantMessage = {
      id: "m-2",
      sender: "assistant",
      content: "Crambin distance conversation 2",
      citations: [],
      proposals: [],
      createdAt: "2026-09-01T11:00:00Z",
    };

    const adapter = new InMemoryAssistantConversationAdapter([
      {
        summary: {
          id: "c-1",
          projectId: "p-test",
          title: "First Conversation",
          createdAt: "2026-09-01T10:00:00Z",
          updatedAt: "2026-09-01T10:00:00Z",
        },
        messages: [msg1],
      },
      {
        summary: {
          id: "c-2",
          projectId: "p-test",
          title: "Second Conversation",
          createdAt: "2026-09-01T11:00:00Z",
          updatedAt: "2026-09-01T11:00:00Z",
        },
        messages: [msg2],
      },
    ]);

    const client = createMockClient([]);
    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-test"
      />,
    );

    // Initial load selects the latest conversation (c-2)
    expect(await screen.findByText("Crambin distance conversation 2")).toBeInTheDocument();
    const select = screen.getByLabelText("Select conversation") as HTMLSelectElement;
    expect(select.value).toBe("c-2");

    // Switch to c-1
    fireEvent.change(select, { target: { value: "c-1" } });
    expect(await screen.findByText("AlphaFold summary conversation 1")).toBeInTheDocument();
    expect(select.value).toBe("c-1");
  });

  it("loads only the last 100 messages in chronological order", async () => {
    const messages: PersistedAssistantMessage[] = [];
    for (let i = 1; i <= 110; i++) {
      messages.push({
        id: "msg-" + i,
        sender: "assistant",
        content: "Message number " + i,
        citations: [],
        proposals: [],
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      });
    }

    const adapter = new InMemoryAssistantConversationAdapter([
      {
        summary: {
          id: "c-bulk",
          projectId: "p-bulk",
          title: "Bulk Conversation",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
        messages,
      },
    ]);

    const client = createMockClient([]);
    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-bulk"
      />,
    );

    // Should have message 110 (latest) and message 11 (first of last 100)
    expect(await screen.findByText("Message number 110")).toBeInTheDocument();
    expect(screen.getByText("Message number 11")).toBeInTheDocument();
    // Message 1 through 10 should not be rendered
    expect(screen.queryByText("Message number 10")).not.toBeInTheDocument();
    expect(screen.queryByText("Message number 1")).not.toBeInTheDocument();
  }, 15000);

  it("supports creating a new conversation", async () => {
    const adapter = new InMemoryAssistantConversationAdapter();
    const client = createMockClient([]);

    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-new"
      />,
    );

    // Initially no conversations
    const newBtn = await screen.findByRole("button", { name: "New conversation" });
    fireEvent.click(newBtn);

    // Dropdown now has "New conversation"
    await waitFor(() => {
      const select = screen.getByLabelText("Select conversation") as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(0);
      expect(select.value).toMatch(/^conv-/);
    });
  });

  it("supports renaming an active conversation", async () => {
    const adapter = new InMemoryAssistantConversationAdapter([
      {
        summary: {
          id: "c-rename",
          projectId: "p-rename",
          title: "Old Title",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
        messages: [],
      },
    ]);
    const client = createMockClient([]);

    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-rename"
      />,
    );

    // Wait for dropdown to show Old Title
    expect(await screen.findByText("Old Title")).toBeInTheDocument();

    // Click rename button
    const renameBtn = screen.getByRole("button", { name: "Rename conversation" });
    fireEvent.click(renameBtn);

    // Rename input appears
    const renameInput = screen.getByLabelText("Rename conversation title");
    fireEvent.change(renameInput, { target: { value: "Brand New Title" } });

    // Save rename
    const saveBtn = screen.getByRole("button", { name: "Save conversation title" });
    fireEvent.click(saveBtn);

    // New title is shown in the select
    await waitFor(() => {
      expect(screen.getByText("Brand New Title")).toBeInTheDocument();
    });
  });

  it("supports deleting an active conversation", async () => {
    const adapter = new InMemoryAssistantConversationAdapter([
      {
        summary: {
          id: "c-del-1",
          projectId: "p-del",
          title: "Delete Me",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
        messages: [{
          id: "m-del",
          sender: "assistant",
          content: "Will be deleted",
          citations: [],
          proposals: [],
          createdAt: "2026-09-01T00:00:00Z",
        }],
      },
      {
        summary: {
          id: "c-del-2",
          projectId: "p-del",
          title: "Keep Me",
          createdAt: "2026-09-01T01:00:00Z",
          updatedAt: "2026-09-01T01:00:00Z",
        },
        messages: [{
          id: "m-keep",
          sender: "assistant",
          content: "I survive",
          citations: [],
          proposals: [],
          createdAt: "2026-09-01T01:00:00Z",
        }],
      },
    ]);
    const client = createMockClient([]);

    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-del"
      />,
    );

    // Initial latest conversation is c-del-2 ("Keep Me")
    expect(await screen.findByText("I survive")).toBeInTheDocument();
    const select = screen.getByLabelText("Select conversation") as HTMLSelectElement;

    // Switch to "Delete Me"
    fireEvent.change(select, { target: { value: "c-del-1" } });
    expect(await screen.findByText("Will be deleted")).toBeInTheDocument();

    // Click delete
    const deleteBtn = screen.getByRole("button", { name: "Delete conversation" });
    fireEvent.click(deleteBtn);

    // Automatically switches back to remaining conversation "Keep Me"
    expect(await screen.findByText("I survive")).toBeInTheDocument();
    expect(screen.queryByText("Delete Me")).not.toBeInTheDocument();
  });

  it("locks all conversation controls during streaming", async () => {
    let unblockStream!: () => void;
    const streamPromise = new Promise<void>((resolve) => {
      unblockStream = resolve;
    });

    const client: AssistantClient = {
      async *stream(request, options) {
        yield { type: "meta", requestId: request.requestId, conversationId: "c-stream", assistantMessageId: "a-stream" };
        yield { type: "delta", text: "Generating complex protein analysis..." };
        await streamPromise;
        if (!options?.signal?.aborted) {
          yield { type: "done", interrupted: false };
        }
      },
    };

    const adapter = new InMemoryAssistantConversationAdapter([
      {
        summary: {
          id: "c-stream",
          projectId: "p-stream",
          title: "Stream Conv",
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
        messages: [],
      },
    ]);

    render(
      <AssistantChat
        assistantClient={client}
        assistantConversation={adapter}
        projectId="p-stream"
      />,
    );

    await screen.findByText("Stream Conv");

    // Send a message to start streaming
    const input = screen.getByLabelText("Assistant prompt message");
    fireEvent.change(input, { target: { value: "Analyze folding" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));

    // While streaming: verify that all controls are disabled
    await screen.findByText("Generating complex protein analysis...");

    const select = screen.getByLabelText("Select conversation");
    const newBtn = screen.getByRole("button", { name: "New conversation" });
    const renameBtn = screen.getByRole("button", { name: "Rename conversation" });
    const deleteBtn = screen.getByRole("button", { name: "Delete conversation" });

    expect(select).toBeDisabled();
    expect(newBtn).toBeDisabled();
    expect(renameBtn).toBeDisabled();
    expect(deleteBtn).toBeDisabled();

    // Release stream
    unblockStream();

    // Once finished, controls unlock
    await waitFor(() => {
      expect(select).not.toBeDisabled();
      expect(newBtn).not.toBeDisabled();
      expect(renameBtn).not.toBeDisabled();
      expect(deleteBtn).not.toBeDisabled();
    });
  });

  it("generates a valid UUID for requests and a fresh UUID on retry", async () => {
    const recordedRequestIds: string[] = [];

    const client: AssistantClient = {
      async *stream(request) {
        recordedRequestIds.push(request.requestId);
        if (recordedRequestIds.length === 1) {
          // First attempt yields error so retry button appears
          yield { type: "error", code: "RATE_LIMITED", message: "Rate limit reached", retryable: true };
        } else {
          yield { type: "meta", requestId: request.requestId, conversationId: "c-retry", assistantMessageId: "a-retry" };
          yield { type: "delta", text: "Success after retry" };
          yield { type: "done", interrupted: false };
        }
      },
    };

    render(<AssistantChat assistantClient={client} projectId="p-retry" />);

    // Send initial message
    const input = screen.getByLabelText("Assistant prompt message");
    fireEvent.change(input, { target: { value: "What is crambin?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message to assistant" }));

    // Verify first request ID was a valid UUID
    await screen.findByText("Rate limit reached");
    expect(recordedRequestIds).toHaveLength(1);
    expect(isValidUuid(recordedRequestIds[0])).toBe(true);

    // Click Retry
    const retryBtn = screen.getByRole("button", { name: "Retry generating response" });
    fireEvent.click(retryBtn);

    // Verify retry request ID is a brand new valid UUID distinct from the first
    await screen.findByText("Success after retry");
    expect(recordedRequestIds).toHaveLength(2);
    expect(isValidUuid(recordedRequestIds[1])).toBe(true);
    expect(recordedRequestIds[1]).not.toBe(recordedRequestIds[0]);
  });
});
