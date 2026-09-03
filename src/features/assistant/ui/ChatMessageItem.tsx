import { Bot, User, AlertCircle, RefreshCw } from "lucide-react";
import type { CommandProposal } from "../../../types/assistant";
import type { UiChatMessage } from "./types";
import type { ApplyProposalHandler } from "./types";
import { CitationsList } from "./CitationsList";
import { CommandProposalCard } from "./CommandProposalCard";

export interface ChatMessageItemProps {
  message: UiChatMessage;
  onApplyProposal?: ApplyProposalHandler;
  onDismissProposal?: (proposal: CommandProposal) => void;
  onRetry?: () => void;
}

export function ChatMessageItem({
  message,
  onApplyProposal,
  onDismissProposal,
  onRetry,
}: ChatMessageItemProps) {
  const isUser = message.sender === "user";
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      className={`bf-chat-message is-${message.sender} ${message.isStreaming ? "is-streaming" : ""}`}
      aria-label={`${isUser ? "You" : "Assistant"} message at ${time}`}
    >
      <div className="bf-message-avatar" aria-hidden="true">
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div className="bf-message-content-wrapper">
        <header className="bf-message-header">
          <strong className="bf-message-author">{isUser ? "You" : "BioFold Assistant"}</strong>
          <time className="bf-message-time" dateTime={message.createdAt}>
            {time}
          </time>
        </header>

        <div className="bf-message-body">
          <p className="bf-message-text">
            {message.content}
            {message.isStreaming && <span className="bf-typing-cursor" aria-hidden="true" />}
          </p>
          {message.unverified && <p className="bf-message-unverified">Interrupted / unverified</p>}
        </div>

        {/* Citations List */}
        {message.citations && message.citations.length > 0 && (
          <CitationsList citations={message.citations} />
        )}

        {/* Command Proposals */}
        {message.proposals && message.proposals.length > 0 && (
          <div className="bf-message-proposals" role="region" aria-label="Action proposals">
            {message.proposals.map((proposal) => (
              <CommandProposalCard
                key={proposal.id}
                proposal={proposal}
                isApplied={message.appliedProposals?.has(proposal.id)}
                isDismissed={message.dismissedProposals?.has(proposal.id)}
                isApplying={message.applyingProposals?.has(proposal.id)}
                error={message.proposalErrors?.[proposal.id]}
                onApply={(p) => { void onApplyProposal?.(p, message.sourceMessageId ?? message.id); }}
                onDismiss={(p) => onDismissProposal?.(p)}
              />
            ))}
          </div>
        )}

        {/* Error Feedback with Retry */}
        {message.error && (
          <div className="bf-message-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <div className="bf-message-error-text">
              <span>{message.error.message}</span>
            </div>
            {message.error.retryable && onRetry && (
              <button
                type="button"
                className="bf-message-retry-btn"
                onClick={onRetry}
                aria-label="Retry generating response"
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
