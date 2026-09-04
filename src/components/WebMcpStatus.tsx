import { Bot } from "lucide-react";
import { COMMAND_NAMES } from "../core/commandContracts";
import { registerBioFoldTools } from "../adapters/webmcp";
import { useAppStore } from "../store/appStore";
import "./webmcpStatus.css";

export function WebMcpStatus() {
  const status = useAppStore((state) => state.webmcpStatus);
  const count = useAppStore((state) => state.registeredToolCount);
  const error = useAppStore((state) => state.webmcpError);
  const label = status === "ready" ? `${count} agent tools`
    : status === "partial" ? `${count}/${COMMAND_NAMES.length} agent tools`
    : status === "registering" ? "Connecting WebMCP"
    : status === "error" ? "WebMCP registration failed"
    : status === "inactive" ? "WebMCP waiting"
    : "WebMCP unavailable";

  return <details className={`webmcp-status is-${status}`}>
    <summary className="bf-topbar-btn" aria-label={`WebMCP: ${label}`} title={label}>
      <Bot size={16} aria-hidden="true" />
      <span role="status" aria-live="polite">{label}</span>
    </summary>
    <div className="webmcp-status-panel">
      <strong>Chrome WebMCP</strong>
      {status === "ready" ? <p>{count} tools are available to your browser agent while this laboratory is open. Calls update this workspace and its session audit.</p>
        : status === "inactive" ? <p>Tools connect after you sign in and the laboratory viewer is ready.</p>
        : status === "registering" ? <p>Registering the laboratory tools with your browser…</p>
        : <>
          <p>Use a current Chrome version on HTTPS or localhost. Enable <code>chrome://flags/#enable-webmcp-testing</code>, then relaunch Chrome.</p>
          {error && <p className="webmcp-status-error">{error}</p>}
          <button className="bf-topbar-btn" type="button" onClick={() => { void registerBioFoldTools(); }}>Retry connection</button>
        </>}
      <p>Test calls from DevTools → Application → WebMCP, or use Chrome’s Model Context Tool Inspector for agent chat.</p>
      <a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">Chrome setup guide ↗</a>
    </div>
  </details>;
}
