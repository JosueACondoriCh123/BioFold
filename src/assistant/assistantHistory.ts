import { parseAssistantStreamEvent } from "./assistantClient";
import { parseCommandProposal } from "../types/assistant";
import type { PersistedAssistantMessage } from "../types/assistant";
import type { Database } from "../types/database.types";

export function parseStoredMessage(row: Database["public"]["Tables"]["messages"]["Row"]): PersistedAssistantMessage {
  if (row.sender !== "user" && row.sender !== "assistant" && row.sender !== "system") {
    throw new Error("Stored assistant history contains an unsupported sender.");
  }
  const citations = row.citations == null
    ? []
    : (parseAssistantStreamEvent({ type: "citations", citations: row.citations }) as { type: "citations"; citations: PersistedAssistantMessage["citations"] }).citations;
  if (row.proposals != null && !Array.isArray(row.proposals)) throw new Error("Stored proposals must be an array.");
  return {
    id: row.id,
    sender: row.sender,
    content: row.content,
    citations,
    proposals: (row.proposals ?? []).map(parseCommandProposal),
    createdAt: row.created_at,
  };
}
