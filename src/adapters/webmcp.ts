import { commandBus } from "../core/commandBus";
import { COMMAND_CONTRACTS, COMMAND_NAMES } from "../core/commandContracts";
import { workspaceSession } from "../core/workspaceSession";
import { useAppStore } from "../store/appStore";
import type { CommandInput, CommandName } from "../types/domain";

function toToolDefinition(name: CommandName, generation?: number): WebMCPToolDefinition {
  const contract = COMMAND_CONTRACTS[name];
  return {
    name: contract.name, title: contract.title, description: contract.description,
    inputSchema: contract.inputSchema, annotations: contract.annotations,
    execute: (input, context) => commandBus.execute(name, input as CommandInput<typeof name>, {
      origin: "agent", signal: context?.signal,
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

export function unregisterBioFoldTools() {
  for (const registration of liveRegistrations) {
    registration.controller.abort("laboratory-inactive");
    registrations.delete(registration.context);
  }
  liveRegistrations.clear();
  useAppStore.getState().setWebMcpStatus("inactive");
}

workspaceSession.subscribe(() => unregisterBioFoldTools());

export function registerBioFoldTools(
  modelContext: WebMCPModelContext | undefined = document.modelContext,
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
      try {
        await current.context.registerTool(toToolDefinition(name, current.generation), { signal });
        if (signal.aborted) return false;
        current.names.add(name);
      } catch {
        if (signal.aborted) return false;
        failures.push(name);
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
