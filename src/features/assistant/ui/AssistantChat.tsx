import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Sparkles } from "lucide-react";
import type {
  AssistantClient,
  AssistantRequest,
  CommandProposal,
} from "../../../types/assistant";
import type { ApplyProposalHandler, UiChatMessage } from "./types";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatInputArea } from "./ChatInputArea";

export interface AssistantChatProps {
  assistantClient: AssistantClient;
  projectId: string;
  conversationId?: string;
  initialMessages?: UiChatMessage[];
  onApplyProposal?: ApplyProposalHandler;
}

export function AssistantChat({
  assistantClient,
  projectId,
  conversationId = "default-conv",
  initialMessages = [],
  onApplyProposal,
}: AssistantChatProps) {
  const [messages, setMessages] = useState<UiChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const messageCounterRef = useRef(1);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (typeof scrollAnchorRef.current?.scrollIntoView === "function") {
      scrollAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Clean up ongoing stream on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSendMessage = async (userText: string) => {
    const userMessageId = `user-msg-${Date.now()}-${messageCounterRef.current++}`;
    const assistantMessageId = `asst-msg-${Date.now()}-${messageCounterRef.current++}`;
    const now = new Date().toISOString();

    const userMessage: UiChatMessage = {
      id: userMessageId,
      sender: "user",
      content: userText,
      createdAt: now,
    };

    const initialAssistantMessage: UiChatMessage = {
      id: assistantMessageId,
      sender: "assistant",
      content: "",
      isStreaming: true,
      createdAt: now,
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const request: AssistantRequest = {
      requestId: `req-${Date.now()}`,
      projectId,
      conversationId,
      message: userText,
    };

    try {
      const stream = assistantClient.stream(request, { signal: controller.signal });
      let terminalEventReceived = false;

      for await (const event of stream) {
        if (controller.signal.aborted) break;
        if (event.type === "done" || event.type === "error") terminalEventReceived = true;

        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id !== assistantMessageId) return msg;

            switch (event.type) {
              case "meta":
                return { ...msg, sourceMessageId: event.assistantMessageId };
              case "delta":
                return { ...msg, content: msg.content + event.text };
              case "citations":
                return { ...msg, citations: event.citations };
              case "proposals":
                return { ...msg, proposals: event.proposals };
              case "done":
                return { ...msg, isStreaming: false };
              case "error":
                return {
                  ...msg,
                  isStreaming: false,
                  error: { code: event.code, message: event.message, retryable: event.retryable },
                };
              default:
                return msg;
            }
          });
        });
      }
      if (!controller.signal.aborted && !terminalEventReceived) {
        throw new Error("The assistant stream ended before a completion event was received.");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const errorMsg = error instanceof Error ? error.message : "Assistant request failed.";
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  isStreaming: false,
                  content: msg.content || "Sorry, I encountered an error answering your request.",
                  error: { code: "STREAM_FAILED", message: errorMsg, retryable: true },
                }
              : msg,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg)),
      );
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setMessages((prev) => prev.map((message) => message.isStreaming ? {
        ...message,
        isStreaming: false,
        error: { code: "CANCELLED", message: "Response cancelled. You can retry the request.", retryable: true },
      } : message));
    }
  };

  const handleRetryLastMessage = () => {
    // Find last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.sender === "user");
    if (lastUserMsg) {
      void handleSendMessage(lastUserMsg.content);
    }
  };

  const handleApplyProposal = async (msgId: string, proposal: CommandProposal, sourceMessageId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const applying = new Set(m.applyingProposals ?? []);
        applying.add(proposal.id);
        const proposalErrors = { ...m.proposalErrors };
        delete proposalErrors[proposal.id];
        return { ...m, applyingProposals: applying, proposalErrors };
      }),
    );
    try {
      if (!onApplyProposal) throw new Error("The molecular scene is not ready to apply proposals.");
      const result = await onApplyProposal(proposal, sourceMessageId);
      if (result && !result.ok) {
        throw new Error(result.error?.message ?? "The proposed command could not be applied.");
      }
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const applying = new Set(m.applyingProposals ?? []);
        applying.delete(proposal.id);
        const applied = new Set(m.appliedProposals ?? []);
        applied.add(proposal.id);
        return { ...m, applyingProposals: applying, appliedProposals: applied };
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "The proposed command could not be applied.";
      setMessages((prev) => prev.map((m) => {
        if (m.id !== msgId) return m;
        const applying = new Set(m.applyingProposals ?? []);
        applying.delete(proposal.id);
        return {
          ...m,
          applyingProposals: applying,
          proposalErrors: { ...m.proposalErrors, [proposal.id]: message },
        };
      }));
    }
  };

  const handleDismissProposal = (msgId: string, proposal: CommandProposal) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const dismissed = new Set(m.dismissedProposals ?? []);
        dismissed.add(proposal.id);
        return { ...m, dismissedProposals: dismissed };
      }),
    );
  };

  return (
    <div className="bf-assistant-chat-pane" role="region" aria-label="BioFold Scientific Assistant">
      <header className="bf-assistant-header">
        <div className="bf-assistant-title-group">
          <span className="bf-assistant-badge-icon" aria-hidden="true">
            <Bot size={18} />
          </span>
          <div>
            <h3>BioFold Assistant</h3>
            <span className="bf-assistant-status-text">
              <Sparkles size={11} aria-hidden="true" />
              Scientific reasoning & live scene proposals
            </span>
          </div>
        </div>
      </header>

      <div className="bf-chat-messages-container" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="bf-chat-empty-state">
            <div className="bf-empty-bot-icon" aria-hidden="true">
              <Bot size={32} />
            </div>
            <h4>Ask anything about the structure</h4>
            <p>
              The Assistant can summarize protein domains, measure atomic distances, preview mutations, and propose 3D visual changes.
            </p>
            <div className="bf-suggested-prompts">
              <button
                type="button"
                className="bf-prompt-chip"
                onClick={() => handleSendMessage("Summarize this structure and focus chain A residue 10.")}
              >
                “Summarize this structure and focus residue 10”
              </button>
              <button
                type="button"
                className="bf-prompt-chip"
                onClick={() => handleSendMessage("What are the key hydrophobic residues in this protein?")}
              >
                “What are the key hydrophobic residues?”
              </button>
              <button
                type="button"
                className="bf-prompt-chip"
                onClick={() => handleSendMessage("Measure distance between A:1:CA and A:10:CA.")}
              >
                “Measure distance from A:1:CA to A:10:CA”
              </button>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              onApplyProposal={(proposal, sourceMessageId) => handleApplyProposal(message.id, proposal, sourceMessageId)}
              onDismissProposal={(p) => handleDismissProposal(message.id, p)}
              onRetry={handleRetryLastMessage}
            />
          ))
        )}
        <div ref={scrollAnchorRef} aria-hidden="true" />
      </div>

      <footer className="bf-chat-footer">
        <ChatInputArea
          isStreaming={isStreaming}
          onSend={handleSendMessage}
          onCancel={handleCancel}
        />
      </footer>
    </div>
  );
}
