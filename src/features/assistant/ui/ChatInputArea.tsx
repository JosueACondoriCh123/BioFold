import { useState, useRef, useEffect, type KeyboardEvent, type FormEvent } from "react";
import { Send, Square, Sparkles } from "lucide-react";

export interface ChatInputAreaProps {
  isStreaming: boolean;
  disabled?: boolean;
  onSend: (message: string) => void;
  onCancel: () => void;
}

export function ChatInputArea({
  isStreaming,
  disabled = false,
  onSend,
  onCancel,
}: ChatInputAreaProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [text]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit(event?: FormEvent) {
    if (event) event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  return (
    <form className="bf-chat-input-area" onSubmit={handleSubmit}>
      <div className="bf-chat-input-wrapper">
        <label htmlFor="assistant-prompt-input" className="sr-only">
          Ask BioFold Assistant a question or propose a molecular action
        </label>
        <textarea
          id="assistant-prompt-input"
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a scientific question or explore the structure…"
          rows={1}
          maxLength={4000}
          disabled={disabled || isStreaming}
          aria-label="Assistant prompt message"
        />

        <div className="bf-chat-controls">
          <span className="bf-chat-char-count">{text.length}/4000</span>

          {isStreaming ? (
            <button
              type="button"
              className="bf-chat-stop-btn"
              onClick={onCancel}
              aria-label="Stop generating response"
            >
              <Square size={14} fill="currentColor" aria-hidden="true" /> Stop
            </button>
          ) : (
            <button
              type="submit"
              className="bf-chat-send-btn"
              disabled={disabled || !text.trim()}
              aria-label="Send message to assistant"
            >
              <Send size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="bf-chat-hint">
        <Sparkles size={12} aria-hidden="true" />
        <span>Proposals require your explicit confirmation before applying.</span>
      </div>
    </form>
  );
}
