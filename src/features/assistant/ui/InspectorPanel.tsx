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
  projectId?: string;
  defaultTab?: InspectorTabId;
  summary?: StructureSummary | null;
  measurement?: DistanceMeasurement | null;
  mutation?: MutationPreview | null;
  activityEntries?: ActivityEntry[];
  onApplyProposal?: ApplyProposalHandler;
  resultsContent?: ReactNode;
  className?: string;
}

export function InspectorPanel({
  assistantClient,
  assistantConversations,
  assistantEnabled = true,
  projectId = "default-project",
  defaultTab = "results",
  summary,
  measurement,
  mutation,
  activityEntries = [],
  onApplyProposal,
  resultsContent,
  className = "",
}: InspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTabId>(defaultTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const tabResultsRef = useRef<HTMLButtonElement>(null);
  const tabAssistantRef = useRef<HTMLButtonElement>(null);

  // Keyboard navigation for tabs
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: InspectorTabId) {
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
        <div
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
        </div>

        <button
          type="button"
          className="bf-collapse-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
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
                summary={summary}
                measurement={measurement}
                mutation={mutation}
                activityEntries={activityEntries}
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
