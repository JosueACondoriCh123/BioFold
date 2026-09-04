import { useState, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Layers3, Bot, ChevronRight, ChevronLeft } from "lucide-react";
import type { AssistantClient, AssistantConversationPort } from "../../../types/assistant";
import type {
  ActivityEntry,
  DistanceMeasurement,
  MutationPreview,
  StructureSummary,
} from "../../../types/domain";
import type { ApplyProposalHandler, InspectorTabId } from "./types";
import { ResultsTab } from "./ResultsTab";
import { AssistantChat } from "./AssistantChat";
import "./assistant.css";

export interface InspectorPanelProps {
  assistantClient: AssistantClient;
  assistantConversations?: AssistantConversationPort;
  assistantEnabled?: boolean;
  hideAssistantTab?: boolean;
  projectId?: string;
  defaultTab?: InspectorTabId;
  pdbId?: string;
  summary?: StructureSummary | null;
  measurement?: DistanceMeasurement | null;
  mutation?: MutationPreview | null;
  activityEntries?: ActivityEntry[];
  selectedResidue?: { chain: string; residueNumber: number } | null;
  onApplyProposal?: ApplyProposalHandler;
  onHighlightResidues?: (residues: { chain: string; residueNumber: number }[]) => void;
  onInspectMutation?: (position: number, wildType: string, mutant: string) => void;
  onFlyToResidue?: (chain: string, residueNumber: number, color?: string) => void;
  resultsContent?: ReactNode;
  className?: string;
  /** Lets the workspace shrink the grid column, not just the panel inside it. */
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function InspectorPanel({
  assistantClient,
  assistantConversations,
  assistantEnabled = true,
  hideAssistantTab = false,
  projectId = "default-project",
  defaultTab = "results",
  pdbId,
  summary,
  measurement,
  mutation,
  activityEntries = [],
  selectedResidue,
  onApplyProposal,
  onHighlightResidues,
  onInspectMutation,
  onFlyToResidue,
  resultsContent,
  onCollapsedChange,
  className = "",
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTabId>(defaultTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabResultsRef = useRef<HTMLButtonElement>(null);
  const tabAssistantRef = useRef<HTMLButtonElement>(null);

  // Keyboard navigation for tabs
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: InspectorTabId) {
    if (hideAssistantTab) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nextTab: InspectorTabId = current === "results" ? "assistant" : "results";
      setActiveTab(nextTab);
      if (nextTab === "results") tabResultsRef.current?.focus();
      else tabAssistantRef.current?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveTab("results");
      tabResultsRef.current?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveTab("assistant");
      tabAssistantRef.current?.focus();
    }
  }

  return (
    <aside
      className={`bf-inspector-panel ${isCollapsed ? "is-collapsed" : ""} ${className}`}
      aria-label="Workspace Inspector and Assistant"
    >
      <div className="bf-inspector-topbar">
        {!isCollapsed && <div
          role="tablist"
          aria-label="Inspector Views"
          className="bf-inspector-tabs"
        >
          <button
            ref={tabResultsRef}
            type="button"
            role="tab"
            id="tab-results"
            aria-selected={activeTab === "results"}
            aria-controls="panel-results"
            tabIndex={activeTab === "results" ? 0 : -1}
            className={`bf-inspector-tab ${activeTab === "results" ? "is-active" : ""}`}
            onClick={() => { setActiveTab("results"); if (isCollapsed) setIsCollapsed(false); }}
            onKeyDown={(e) => handleTabKeyDown(e, "results")}
          >
            <Layers3 size={15} aria-hidden="true" />
            <span>Results</span>
            {(measurement || mutation) && <span className="bf-tab-pulse-dot" aria-hidden="true" />}
          </button>

          {!hideAssistantTab && (
            <button
              ref={tabAssistantRef}
              type="button"
              role="tab"
              id="tab-assistant"
              aria-selected={activeTab === "assistant"}
              aria-controls="panel-assistant"
              tabIndex={activeTab === "assistant" ? 0 : -1}
              className={`bf-inspector-tab ${activeTab === "assistant" ? "is-active" : ""}`}
              onClick={() => { setActiveTab("assistant"); if (isCollapsed) setIsCollapsed(false); }}
              onKeyDown={(e) => handleTabKeyDown(e, "assistant")}
            >
              <Bot size={15} aria-hidden="true" />
              <span>Assistant</span>
              <span className="bf-tab-ai-badge">AI</span>
            </button>
          )}
        </div>}

        <button
          type="button"
          className="bf-collapse-toggle-btn"
          onClick={() => {
            const next = !isCollapsed;
            setIsCollapsed(next);
            onCollapsedChange?.(next);
          }}
          aria-label={isCollapsed ? "Expand inspector panel" : "Collapse inspector panel"}
          title={isCollapsed ? "Expand panel" : "Collapse panel"}
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="bf-inspector-content">
          <div
            id="panel-results"
            role="tabpanel"
            aria-labelledby="tab-results"
            hidden={activeTab !== "results"}
            className="bf-tab-content"
          >
            {resultsContent ?? (
              <ResultsTab
                pdbId={pdbId}
                projectId={projectId}
                summary={summary}
                measurement={measurement}
                mutation={mutation}
                activityEntries={activityEntries}
                selectedResidue={selectedResidue}
                onHighlightResidues={onHighlightResidues}
                onInspectMutation={onInspectMutation}
                onFlyToResidue={onFlyToResidue}
              />
            )}
          </div>

          <div
            id="panel-assistant"
            role="tabpanel"
            aria-labelledby="tab-assistant"
            hidden={activeTab !== "assistant"}
            className="bf-tab-content is-chat-tab"
          >
            <AssistantChat
              assistantClient={assistantClient}
              assistantConversations={assistantConversations}
              enabled={assistantEnabled}
              confirmedActivities={activityEntries}
              projectId={projectId}
              onApplyProposal={onApplyProposal}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
