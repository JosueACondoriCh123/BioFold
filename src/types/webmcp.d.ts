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
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
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
  getTools?: () => Promise<unknown[]>;
}

interface Document {
  modelContext?: WebMCPModelContext;
}
