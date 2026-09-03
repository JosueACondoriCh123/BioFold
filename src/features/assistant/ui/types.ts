import type { Citation, CommandProposal } from "../../../types/assistant";

export type InspectorTabId = "results" | "assistant";

export type ProposalApplyResult = void | {
  ok: boolean;
  error?: { message: string };
};

export type ApplyProposalHandler = (
  proposal: CommandProposal,
  sourceMessageId: string,
) => ProposalApplyResult | Promise<ProposalApplyResult>;

export interface UiChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  proposals?: CommandProposal[];
  appliedProposals?: Set<string>;
  dismissedProposals?: Set<string>;
  applyingProposals?: Set<string>;
  proposalErrors?: Record<string, string>;
  sourceMessageId?: string;
  retryPrompt?: string;
  unverified?: boolean;
  isStreaming?: boolean;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
}
