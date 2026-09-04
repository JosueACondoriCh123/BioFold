interface WebMCPExecutionContext {
  signal?: AbortSignal;
}

interface WebMCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
  };
  execute: (
    input: unknown,
    context?: WebMCPExecutionContext,
  ) => Promise<unknown> | unknown;
}

interface WebMCPModelContext {
  registerTool: (
    definition: WebMCPToolDefinition,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ) => Promise<void> | void;
  /** Early Chrome API; current Chrome removes registrations through AbortSignal. */
  unregisterTool?: (name: string) => void;
  getTools?: () => Promise<WebMCPRegisteredTool[]>;
  executeTool?: (
    tool: WebMCPRegisteredTool,
    input: string,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null>;
}

interface WebMCPRegisteredTool extends Omit<WebMCPToolDefinition, "execute"> {
  origin: string;
  window: Window;
}

interface Document {
  modelContext?: WebMCPModelContext;
}

interface Navigator {
  /** Compatibility with Chrome previews before document.modelContext. */
  modelContext?: WebMCPModelContext;
}
