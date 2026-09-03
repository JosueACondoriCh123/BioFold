import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseEnvConfig } from "../auth/supabaseClient";
import { createDefaultAssistantMock } from "../phase2/mockAssistantClient";
import type { AssistantClient, AssistantConversationPort } from "../types/assistant";
import type { Database } from "../types/database.types";
import { createAssistantHttpClient } from "./assistantClient";
import { InMemoryAssistantConversationAdapter, SupabaseAssistantConversationAdapter } from "./assistantConversation";

export interface AssistantServices {
  client: AssistantClient;
  conversations: AssistantConversationPort;
  remote: boolean;
}

let cachedClient: SupabaseClient | null = null;
let cachedServices: AssistantServices | null = null;

/** Provider keys never cross this frontend composition root. */
export function getAssistantServices(): AssistantServices {
  const supabase = getSupabaseClient();
  const config = getSupabaseEnvConfig();
  if (supabase && config.url && config.publishableKey) {
    if (cachedClient !== supabase || !cachedServices) {
      cachedClient = supabase;
      const conversationAdapter = new SupabaseAssistantConversationAdapter(supabase as SupabaseClient<Database>);
      cachedServices = {
        client: createAssistantHttpClient({
          endpoint: `${config.url.replace(/\/$/, "")}/functions/v1/biofold-chat`,
          publishableKey: config.publishableKey,
          getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
        }),
        conversations: conversationAdapter,
        remote: true,
      };
    }
    return cachedServices;
  }
  const emptyAdapter = new InMemoryAssistantConversationAdapter();
  return {
    client: createDefaultAssistantMock(),
    conversations: emptyAdapter,
    remote: false,
  };
}
