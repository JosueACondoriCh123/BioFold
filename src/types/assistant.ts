import { COMMAND_NAMES, parseCommandInput } from "../core/commandContracts";
import type { CommandInputMap, CommandName } from "./domain";

export interface AssistantRequest {
  requestId: string;
  projectId: string;
  conversationId?: string;
  message: string;
}

export interface Citation {
  id: string;
  title: string;
  publisher: "BioFold" | "RCSB PDB" | "UniProt";
  url: string;
  locator?: string;
  retrievedAt: string;
}

export type CommandProposal = {
  [K in CommandName]: {
    id: string;
    command: K;
    input: CommandInputMap[K];
    rationale: string;
  }
}[CommandName];

export interface AssistantUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd?: number;
  durationMs?: number;
}

export type AssistantErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "STREAM_FAILED"
  | "CANCELLED"
  | "UNKNOWN_ERROR";

export type AssistantStreamEvent =
  | { type: "meta"; requestId: string; conversationId: string; assistantMessageId: string }
  | { type: "delta"; text: string }
  | { type: "citations"; citations: Citation[] }
  | { type: "proposals"; proposals: CommandProposal[] }
  | { type: "usage"; usage: AssistantUsage }
  | { type: "done"; interrupted: boolean }
  | { type: "error"; code: AssistantErrorCode; message: string; retryable: boolean };

export interface AssistantStreamOptions {
  signal?: AbortSignal;
}

/** Streaming boundary used by the UI; it deliberately exposes no provider SDK. */
export interface AssistantClient {
  stream(request: AssistantRequest, options?: AssistantStreamOptions): AsyncIterable<AssistantStreamEvent>;
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function parseAssistantRequest(input: unknown): AssistantRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Assistant request must be an object.");
  }
  const value = input as Record<string, unknown>;
  const allowed = ["requestId", "projectId", "conversationId", "message"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("Assistant request contains unsupported properties.");
  }
  return {
    requestId: requiredString(value.requestId, "requestId", 128),
    projectId: requiredString(value.projectId, "projectId", 128),
    ...(value.conversationId === undefined ? {} : {
      conversationId: requiredString(value.conversationId, "conversationId", 128),
    }),
    message: requiredString(value.message, "message", 4_000),
  };
}

export function parseCommandProposal(input: unknown): CommandProposal {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Command proposal must be an object.");
  }
  const value = input as Record<string, unknown>;
  const id = requiredString(value.id, "proposal id", 128);
  const rationale = requiredString(value.rationale, "proposal rationale", 1_000);
  const commandName = requiredString(value.command, "proposal command", 64);
  if (!(COMMAND_NAMES as readonly string[]).includes(commandName)) {
    throw new Error("Proposal command is not one of BioFold's audited tools.");
  }
  const command = commandName as CommandName;
  const parsed = parseCommandInput(command, value.input);
  return { id, command, input: parsed, rationale } as CommandProposal;
}
