import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type {
  AssistantClient,
  AssistantConversationPort,
  AssistantConversationSummary,
  AssistantRequest,
  CommandProposal,
  PersistedAssistantMessage,
} from "../../../types/assistant";
import { generateUuid } from "../../../assistant/uuid";
import type { ApplyProposalHandler, UiChatMessage } from "./types";
import type { ActivityEntry } from "../../../types/domain";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatInputArea } from "./ChatInputArea";

export interface AssistantChatProps {
  assistantClient: AssistantClient;
  assistantConversations?: AssistantConversationPort;
  enabled?: boolean;
  projectId: string;
  conversationId?: string;
  initialMessages?: UiChatMessage[];
  onApplyProposal?: ApplyProposalHandler;
  confirmedActivities?: ActivityEntry[];
}

const EMPTY_ACTIVITY: ActivityEntry[] = [];

export function AssistantChat({
  assistantClient,
  assistantConversations,
  enabled = true,
  projectId,
  conversationId,
  initialMessages = [],
  onApplyProposal,
  confirmedActivities = EMPTY_ACTIVITY,
}: AssistantChatProps) {
  const [messages, setMessages] = useState<UiChatMessage[]>(initialMessages);
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(conversationId);
  const [historyStatus, setHistoryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationLoadRef = useRef<AbortController | null>(null);
  const conversationGenerationRef = useRef(0);
  const activeConversationIdRef = useRef(activeConversationId);
  const initialMessagesRef = useRef(initialMessages);
  activeConversationIdRef.current = activeConversationId;
  const confirmedActivitiesRef = useRef(confirmedActivities);
  confirmedActivitiesRef.current = confirmedActivities;
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
      conversationLoadRef.current?.abort();
    };
  }, []);

  const hydrateStoredMessages = useCallback((stored: PersistedAssistantMessage[]): UiChatMessage[] => {
    return stored.map((message) => {
      const applied = new Set(
        message.proposals
          .filter((proposal) =>
            confirmedActivitiesRef.current.some(
              (entry) =>
                entry.agentKind === "assistant" &&
                entry.approvedByUser &&
                entry.sourceMessageId === message.id &&
                entry.command === proposal.command &&
                entry.status === "success",
            ),
          )
          .map((proposal) => proposal.id),
      );
      return {
        id: message.id,
        sender: message.sender,
        content: message.content,
        citations: message.citations,
        proposals: message.proposals,
        ...(applied.size ? { appliedProposals: applied } : {}),
        sourceMessageId: message.sender === "assistant" ? message.id : undefined,
        createdAt: message.createdAt,
      };
    });
  }, []);

  // Conversation hydration. Generation + AbortController prevent stale loads
  // from replacing a newer user selection.
  useEffect(() => {
    if (!assistantConversations || !enabled) return;
    conversationLoadRef.current?.abort();
    const controller = new AbortController();
    conversationLoadRef.current = controller;
    const generation = ++conversationGenerationRef.current;
    setHistoryStatus("loading");

    void (async () => {
      try {
        const list = await assistantConversations.list(projectId, { signal: controller.signal });
        if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
        setConversations(list);
        const selectedId = activeConversationIdRef.current;
        const targetId = selectedId && list.some((conversation) => conversation.id === selectedId)
          ? selectedId
          : list[0]?.id;
        if (targetId) {
          const detail = await assistantConversations.load(projectId, targetId, { signal: controller.signal });
          if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
          setActiveConversationId(targetId);
          if (detail) setMessages(hydrateStoredMessages(detail.messages));
        } else {
          setActiveConversationId(undefined);
          if (initialMessagesRef.current.length === 0) setMessages([]);
        }
        setHistoryStatus("idle");
      } catch (error) {
        if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
        setHistoryStatus("error");
        setMessages((previous) => [...previous, {
          id: `history-error-${Date.now()}`, sender: "system",
          content: error instanceof Error ? error.message : "Conversation history could not be loaded.",
          createdAt: new Date().toISOString(),
          error: { code: "STREAM_FAILED", message: "Conversation history could not be loaded.", retryable: true },
        }]);
      }
    })();

    return () => controller.abort();
  }, [assistantConversations, enabled, projectId, hydrateStoredMessages]);

  useEffect(() => {
    setMessages((previous) => {
      let changed = false;
      const next = previous.map((message) => {
        if (message.sender !== "assistant" || !message.proposals?.length) return message;
        const applied = new Set(message.appliedProposals ?? []);
        for (const proposal of message.proposals) {
          if (
            confirmedActivities.some(
              (entry) =>
                entry.agentKind === "assistant" &&
                entry.approvedByUser &&
                entry.sourceMessageId === message.id &&
                entry.command === proposal.command &&
                entry.status === "success",
            )
          ) {
            applied.add(proposal.id);
          }
        }
        if (applied.size === (message.appliedProposals?.size ?? 0)) return message;
        changed = true;
        return { ...message, appliedProposals: applied };
      });
      return changed ? next : previous;
    });
  }, [confirmedActivities]);

  const handleSwitchConversation = async (newId: string) => {
    if (isStreaming || isActionPending || newId === activeConversationId || !assistantConversations) return;
    conversationLoadRef.current?.abort();
    const controller = new AbortController();
    conversationLoadRef.current = controller;
    const generation = ++conversationGenerationRef.current;
    setIsActionPending(true);
    setIsRenaming(false);
    setActiveConversationId(newId);
    setHistoryStatus("loading");
    try {
      const detail = await assistantConversations.load(projectId, newId, { signal: controller.signal });
      if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
      if (detail) {
        setMessages(hydrateStoredMessages(detail.messages));
      } else {
        setMessages([]);
      }
      setHistoryStatus("idle");
    } catch (error) {
      if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
      setHistoryStatus("error");
      setMessages((previous) => [
        ...previous,
        {
          id: `conv-error-${Date.now()}`,
          sender: "system",
          content: error instanceof Error ? error.message : "Failed to load conversation.",
          createdAt: new Date().toISOString(),
          error: { code: "STREAM_FAILED", message: "Failed to load conversation.", retryable: true },
        },
      ]);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleNewConversation = async () => {
    if (isStreaming || isActionPending || !enabled) return;
    conversationLoadRef.current?.abort();
    ++conversationGenerationRef.current;
    setIsRenaming(false);
    setActiveConversationId(undefined);
    setMessages([]);
    setHistoryStatus("idle");
  };

  const handleStartRename = () => {
    if (isStreaming || isActionPending || !activeConversationId) return;
    const current = conversations.find((c) => c.id === activeConversationId);
    setRenameTitle(current?.title ?? "New conversation");
    setIsRenaming(true);
  };

  const handleSaveRename = async () => {
    if (isStreaming || isActionPending || !activeConversationId) return;
    const cleanTitle = renameTitle.trim().replace(/\s+/g, " ").slice(0, 120);
    if (!cleanTitle) return;
    setIsActionPending(true);
    try {
      if (assistantConversations) {
        const updated = await assistantConversations.rename(projectId, activeConversationId, cleanTitle);
        setConversations((prev) =>
          prev.map((c) => (c.id === updated.id ? { ...c, title: updated.title, updatedAt: updated.updatedAt } : c)),
        );
      } else {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, title: cleanTitle } : c)),
        );
      }
      setIsRenaming(false);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: `rename-error-${Date.now()}`,
          sender: "system",
          content: error instanceof Error ? error.message : "Failed to rename conversation.",
          createdAt: new Date().toISOString(),
          error: { code: "STREAM_FAILED", message: "Failed to rename conversation.", retryable: true },
        },
      ]);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameTitle("");
  };

  const handleDeleteConversation = async () => {
    if (isStreaming || isActionPending || !activeConversationId) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this conversation and all of its messages?")) return;
    setIsActionPending(true);
    setIsRenaming(false);
    const targetId = activeConversationId;
    try {
      if (assistantConversations) {
        await assistantConversations.delete(projectId, targetId);
      }
      const remaining = conversations.filter((c) => c.id !== targetId);
      setConversations(remaining);
      if (remaining.length > 0) {
        const nextId = remaining[0].id;
        setActiveConversationId(nextId);
        if (assistantConversations) {
          setHistoryStatus("loading");
          const detail = await assistantConversations.load(projectId, nextId);
          setMessages(detail ? hydrateStoredMessages(detail.messages) : []);
          setHistoryStatus("idle");
        }
      } else {
        setActiveConversationId(undefined);
        setMessages([]);
      }
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: `delete-error-${Date.now()}`,
          sender: "system",
          content: error instanceof Error ? error.message : "Failed to delete conversation.",
          createdAt: new Date().toISOString(),
          error: { code: "STREAM_FAILED", message: "Failed to delete conversation.", retryable: true },
        },
      ]);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSendMessage = async (userText: string, customRequestId?: string) => {
    const userMessageId = `user-msg-${Date.now()}-${messageCounterRef.current++}`;
    const assistantMessageId = `asst-msg-${Date.now()}-${messageCounterRef.current++}`;
    const now = new Date().toISOString();
    const wasDraft = !activeConversationId;
    const draftTitle = userText.trim().replace(/\s+/g, " ").slice(0, 80) || "Assistant conversation";

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
      retryPrompt: userText,
      createdAt: now,
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Retry with UUID or fresh UUID for each request
    const requestId = customRequestId ?? generateUuid();

    const request: AssistantRequest = {
      requestId,
      projectId,
      ...(activeConversationId ? { conversationId: activeConversationId } : {}),
      message: userText,
    };

    try {
      const stream = assistantClient.stream(request, { signal: controller.signal });
      let terminalEventReceived = false;

      for await (const event of stream) {
        if (controller.signal.aborted) break;
        if (event.type === "done" || event.type === "error") terminalEventReceived = true;
        if (event.type === "meta") {
          setActiveConversationId(event.conversationId);
          setConversations((prev) => {
            const existing = prev.find((conversation) => conversation.id === event.conversationId);
            if (existing) {
              return [{ ...existing, updatedAt: new Date().toISOString() }, ...prev.filter((conversation) => conversation.id !== existing.id)];
            }
            return [
              {
                id: event.conversationId,
                projectId,
                title: wasDraft ? draftTitle : "Assistant conversation",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              ...prev,
            ];
          });
        }

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
                return event.interrupted
                  ? { ...msg, isStreaming: false, unverified: Boolean(msg.content), citations: undefined, proposals: undefined }
                  : { ...msg, isStreaming: false, unverified: false };
              case "error":
                return {
                  ...msg,
                  isStreaming: false,
                  unverified: Boolean(msg.content),
                  citations: undefined,
                  proposals: undefined,
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
                  unverified: Boolean(msg.content),
                  citations: undefined,
                  proposals: undefined,
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
        unverified: Boolean(message.content),
        citations: undefined,
        proposals: undefined,
        error: { code: "CANCELLED", message: "Response cancelled. You can retry the request.", retryable: true },
      } : message));
    }
  };

  const handleRetryMessage = (message: UiChatMessage) => {
    if (!message.retryPrompt || isStreaming) return;
    void handleSendMessage(message.retryPrompt, generateUuid());
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

        <div className="bf-conversation-toolbar" role="toolbar" aria-label="Conversation controls">
          {isRenaming ? (
            <div className="bf-conversation-rename-box">
              <input
                type="text"
                className="bf-conversation-rename-input"
                value={renameTitle}
                onChange={(e) => setRenameTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveRename();
                  if (e.key === "Escape") handleCancelRename();
                }}
                disabled={isStreaming || isActionPending}
                maxLength={120}
                aria-label="Rename conversation title"
                autoFocus
              />
              <button
                type="button"
                className="bf-conversation-action-btn"
                onClick={handleSaveRename}
                disabled={isStreaming || isActionPending || !renameTitle.trim()}
                title="Save title"
                aria-label="Save conversation title"
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                className="bf-conversation-action-btn"
                onClick={handleCancelRename}
                disabled={isStreaming || isActionPending}
                title="Cancel"
                aria-label="Cancel renaming"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="bf-conversation-select-row">
              <select
                className="bf-conversation-select"
                value={activeConversationId ?? ""}
                onChange={(e) => void handleSwitchConversation(e.target.value)}
                disabled={isStreaming || isActionPending || !enabled || conversations.length === 0}
                aria-label="Select conversation"
              >
                {!activeConversationId && <option value="">New conversation draft</option>}
                {conversations.length === 0 && activeConversationId ? (
                  <option value="">No conversations</option>
                ) : (
                  conversations.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))
                )}
              </select>
              <div className="bf-conversation-btn-group">
                <button
                  type="button"
                  className="bf-conversation-action-btn"
                  onClick={handleNewConversation}
                  disabled={isStreaming || isActionPending || !enabled}
                  title="New conversation"
                  aria-label="New conversation"
                >
                  <Plus size={14} />
                  <span>New</span>
                </button>
                <button
                  type="button"
                  className="bf-conversation-action-btn"
                  onClick={handleStartRename}
                  disabled={isStreaming || isActionPending || !enabled || !activeConversationId}
                  title="Rename conversation"
                  aria-label="Rename conversation"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="bf-conversation-action-btn bf-btn-danger"
                  onClick={handleDeleteConversation}
                  disabled={isStreaming || isActionPending || !enabled || !activeConversationId}
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="bf-chat-messages-container" role="log" aria-live="polite">
        {historyStatus === "loading" && <div className="bf-assistant-history-status" role="status">Loading saved conversation…</div>}
        {!enabled && <div className="bf-assistant-history-status" role="status">Save or open a project to use the persistent Assistant.</div>}
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
              onRetry={() => handleRetryMessage(message)}
            />
          ))
        )}
        <div ref={scrollAnchorRef} aria-hidden="true" />
      </div>

      <footer className="bf-chat-footer">
        <ChatInputArea
          isStreaming={isStreaming}
          disabled={!enabled || historyStatus === "loading"}
          onSend={handleSendMessage}
          onCancel={handleCancel}
        />
      </footer>
    </div>
  );
}
