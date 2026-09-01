import { Component, type ReactNode } from "react";
import { IntegrationStatus } from "./IntegrationStatus";
import { workspaceSession } from "../core/workspaceSession";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { workspaceSession.setContext(null, false); }
  render() {
    if (this.state.failed) return <IntegrationStatus title="This screen could not be loaded"
      message="The laboratory has been locked. Reload to reconnect safely."
      retry={() => window.location.reload()} />;
    return this.props.children;
  }
}
