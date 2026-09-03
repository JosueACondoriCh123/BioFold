import { useState, useMemo } from "react";
import { Activity, Bot, Download, UserRound } from "lucide-react";
import type { ActivityEntry, CommandOrigin } from "../../types/domain";
import "./audit.css";

export interface AuditHistoryViewProps {
  activities: ActivityEntry[];
  currentPdbId: string;
  projectId?: string;
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d);
}

export function AuditHistoryView({
  activities,
  currentPdbId,
  projectId = "active-workspace",
}: AuditHistoryViewProps) {
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredActivities = useMemo(() => {
    return activities.filter((entry) => {
      if (originFilter !== "all" && entry.origin !== originFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      return true;
    });
  }, [activities, originFilter, statusFilter]);

  const metrics = useMemo(() => {
    const total = activities.length;
    const success = activities.filter((a) => a.status === "success").length;
    const errors = activities.filter((a) => a.status === "error").length;
    const human = activities.filter((a) => a.origin === "human").length;
    const agent = activities.filter((a) => a.origin === "agent").length;
    return { total, success, errors, human, agent };
  }, [activities]);

  const handleExportJson = () => {
    const sessionData = {
      exportTimestamp: new Date().toISOString(),
      projectId,
      currentPdbId,
      metrics,
      activities,
    };
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `biofold-audit-${currentPdbId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bf-audit-container" role="region" aria-label="Session Audit and Project Activity">
      <header className="bf-audit-header">
        <div className="bf-audit-header-top">
          <h2>
            <Activity size={22} color="#5CCFB5" />
            Session Audit & Command History
          </h2>
          <button
            type="button"
            className="bf-export-json-btn"
            onClick={handleExportJson}
            title="Download complete session audit in JSON format"
          >
            <Download size={14} />
            <span>Export Audit JSON</span>
          </button>
        </div>
        <p>
          Complete immutable audit trail of scientific actions executed by human researchers, Assistant proposals, and WebMCP external agents.
        </p>
      </header>

      <div className="bf-audit-metrics-row">
        <div className="bf-audit-metric-card">
          <span className="bf-audit-metric-num">{metrics.total}</span>
          <span className="bf-audit-metric-label">Total Actions</span>
        </div>
        <div className="bf-audit-metric-card">
          <span className="bf-audit-metric-num" style={{ color: "#5ccfb5" }}>
            {metrics.success}
          </span>
          <span className="bf-audit-metric-label">Confirmed Success</span>
        </div>
        <div className="bf-audit-metric-card">
          <span className="bf-audit-metric-num" style={{ color: metrics.errors ? "#ff9e9e" : "#fff" }}>
            {metrics.errors}
          </span>
          <span className="bf-audit-metric-label">Failed Actions</span>
        </div>
        <div className="bf-audit-metric-card">
          <span className="bf-audit-metric-num" style={{ color: "#7b9fe0" }}>
            {metrics.human}
          </span>
          <span className="bf-audit-metric-label">Human Commands</span>
        </div>
        <div className="bf-audit-metric-card">
          <span className="bf-audit-metric-num" style={{ color: "#e0ba7b" }}>
            {metrics.agent}
          </span>
          <span className="bf-audit-metric-label">Agent Actions</span>
        </div>
      </div>

      <div className="bf-audit-filter-bar">
        <div className="bf-audit-filter-group">
          <label htmlFor="origin-filter">Origin:</label>
          <select
            id="origin-filter"
            className="bf-audit-select"
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value)}
          >
            <option value="all">All Origins</option>
            <option value="human">Human Researcher</option>
            <option value="agent">Agent (Assistant / WebMCP)</option>
          </select>
        </div>

        <div className="bf-audit-filter-group">
          <label htmlFor="status-filter">Status:</label>
          <select
            id="status-filter"
            className="bf-audit-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div className="bf-audit-table-wrapper">
        <table className="bf-audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Origin</th>
              <th>Command</th>
              <th>Message / Detail</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredActivities.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "30px", color: "#aab9b3" }}>
                  No activity records match the selected filters.
                </td>
              </tr>
            ) : (
              filteredActivities.map((entry) => {
                const originLabel =
                  entry.agentKind === "assistant" && entry.approvedByUser
                    ? "Assistant · confirmed"
                    : entry.agentKind === "webmcp"
                    ? "WebMCP agent"
                    : entry.origin === "human"
                    ? "Human"
                    : "Agent";

                return (
                  <tr key={entry.id}>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                      {formatTimestamp(entry.createdAt)}
                    </td>
                    <td>
                      <span className={`bf-origin-tag ${entry.agentKind || entry.origin}`}>
                        {entry.origin === "agent" ? <Bot size={12} /> : <UserRound size={12} />}
                        <span>{originLabel}</span>
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{entry.command}</td>
                    <td style={{ fontSize: "12px", color: "#aab9b3" }}>
                      {entry.message}
                    </td>
                    <td>
                      <span className={`bf-status-pill ${entry.status}`}>{entry.status}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
