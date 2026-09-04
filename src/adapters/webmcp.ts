import { commandBus } from "../core/commandBus";
import { COMMAND_CONTRACTS, COMMAND_NAMES } from "../core/commandContracts";
import { workspaceSession } from "../core/workspaceSession";
import { useAppStore } from "../store/appStore";
import type { CommandInput, CommandName } from "../types/domain";

function toToolDefinition(name: CommandName, generation?: number): WebMCPToolDefinition {
  const contract = COMMAND_CONTRACTS[name];
  return {
    name: contract.name, title: contract.title, description: contract.description,
    inputSchema: contract.inputSchema,
    // Browser annotations differ from the shared MCP command contracts.
    annotations: {
      readOnlyHint: contract.annotations.readOnlyHint === true && name !== "query_uniprot_annotations",
      untrustedContentHint: ["load_structure", "query_uniprot_annotations", "annotate_active_site", "save_project_snapshot"].includes(name),
      consequentialHint: contract.annotations.destructiveHint === true,
    },
    // Chrome JSON-serializes this result, preserving data, errors and provenance.
    execute: (input, context) => commandBus.execute(name, input as CommandInput<typeof name>, {
      origin: "agent", agentKind: "webmcp", signal: context?.signal,
      ...(generation === undefined ? {} : { workspaceGeneration: generation }),
    }),
  };
}

/** Contract templates; actual registrations bind a fresh workspace generation. */
export const BIOFOLD_TOOLS = COMMAND_NAMES.map((name) => toToolDefinition(name));

interface Registration {
  context: WebMCPModelContext;
  controller: AbortController;
  generation: number;
  names: Set<string>;
  inFlight?: Promise<boolean>;
}
const registrations = new WeakMap<WebMCPModelContext, Registration>();
const liveRegistrations = new Set<Registration>();

export function getWebMcpContext(): WebMCPModelContext | undefined {
  // Prefer the current API, with feature detection for early Chrome previews.
  if (typeof document !== "undefined" && typeof document.modelContext?.registerTool === "function") {
    return document.modelContext;
  }
  if (typeof navigator !== "undefined" && typeof navigator.modelContext?.registerTool === "function") {
    return navigator.modelContext;
  }
  return undefined;
}

export function unregisterBioFoldTools() {
  for (const registration of liveRegistrations) {
    registration.controller.abort("laboratory-inactive");
    // Older Chrome builds ignore registerTool's signal option.
    for (const name of registration.names) {
      try { registration.context.unregisterTool?.(name); } catch { /* Already removed by abort. */ }
    }
    registrations.delete(registration.context);
  }
  liveRegistrations.clear();
  useAppStore.getState().setWebMcpStatus("inactive");
}

const unsubscribeSession = workspaceSession.subscribe(() => unregisterBioFoldTools());
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeSession();
    unregisterBioFoldTools();
  });
}

export function registerBioFoldTools(
  modelContext: WebMCPModelContext | undefined = getWebMcpContext(),
): Promise<boolean> {
  const scope = workspaceSession.getSnapshot();
  if (!scope.userId || !scope.active || !useAppStore.getState().viewerReady) {
    useAppStore.getState().setWebMcpStatus("inactive");
    return Promise.resolve(false);
  }
  if (typeof modelContext?.registerTool !== "function") {
    useAppStore.getState().setWebMcpStatus("unavailable");
    return Promise.resolve(false);
  }
  let registration = registrations.get(modelContext);
  if (!registration) {
    registration = {
      context: modelContext, controller: new AbortController(),
      generation: scope.generation, names: new Set(),
    };
    registrations.set(modelContext, registration);
    liveRegistrations.add(registration);
  }
  if (registration.inFlight) return registration.inFlight;
  const current = registration;
  const { signal } = current.controller;
  if (current.names.size === COMMAND_NAMES.length) {
    useAppStore.getState().setWebMcpStatus("ready", current.names.size);
    return Promise.resolve(true);
  }
  useAppStore.getState().setWebMcpStatus("registering", current.names.size);
  current.inFlight = (async () => {
    const failures: string[] = [];
    for (const name of COMMAND_NAMES) {
      if (signal.aborted) return false;
      if (current.names.has(name)) continue;
      // Track even synchronous legacy registrations before yielding to await:
      // a route change in that microtask must remove the tool too.
      current.names.add(name);
      try {
        await current.context.registerTool(toToolDefinition(name, current.generation), { signal });
        if (signal.aborted) return false;
      } catch (error) {
        current.names.delete(name);
        if (signal.aborted) return false;
        failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (signal.aborted) return false;
    const ready = current.names.size === COMMAND_NAMES.length;
    useAppStore.getState().setWebMcpStatus(
      ready ? "ready" : current.names.size ? "partial" : "error",
      current.names.size,
      ready ? undefined : `WebMCP could not register: ${failures.join(", ")}.`,
    );
    return ready;
  })().finally(() => { current.inFlight = undefined; });
  return current.inFlight;
}
