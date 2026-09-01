import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../auth/supabaseClient";
import { InMemoryProjectDataPort } from "../phase2/inMemoryProjectDataPort";
import type { Database } from "../types/database.types";
import type { ProjectDataPort } from "../types/projects";
import { SupabaseProjectDataAdapter } from "./supabaseProjectDataAdapter";

let remoteClient: SupabaseClient | null = null;
let remotePort: ProjectDataPort | null = null;
const developmentPorts = new Map<string, ProjectDataPort>();

/** Components consume only ProjectDataPort; Supabase stays at this composition root. */
export function getProjectDataPort(userId: string): ProjectDataPort {
  const client = getSupabaseClient();
  if (client) {
    if (client !== remoteClient || !remotePort) {
      remoteClient = client;
      remotePort = new SupabaseProjectDataAdapter(client as SupabaseClient<Database>);
    }
    return remotePort;
  }

  // Component and E2E harnesses intentionally run without VITE credentials.
  // Their deterministic stores remain isolated by authenticated test identity.
  let port = developmentPorts.get(userId);
  if (!port) {
    port = new InMemoryProjectDataPort(userId);
    developmentPorts.set(userId, port);
  }
  return port;
}
