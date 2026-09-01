import type { Citation, CommandProposal } from "../../../types/assistant";

export type InspectorTabId = "results" | "assistant";

export interface UiChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  proposals?: CommandProposal[];
  appliedProposals?: Set<string>;
  dismissedProposals?: Set<string>;
  isStreaming?: boolean;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
}
