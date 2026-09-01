import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;

export interface SupabaseEnvConfig {
  url: string | undefined;
  publishableKey: string | undefined;
}

export function getSupabaseEnvConfig(): SupabaseEnvConfig {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return {
    url: url && url.length > 0 ? url : undefined,
    publishableKey: publishableKey && publishableKey.length > 0 ? publishableKey : undefined,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, publishableKey } = getSupabaseEnvConfig();
  return isPublicSupabaseConfig(url, publishableKey);
}

/** Fail closed on placeholders, malformed URLs and accidentally supplied secrets. */
export function isPublicSupabaseConfig(url?: string, key?: string): boolean {
  if (!url || !key) return false;
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))
      || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/"
      || parsed.hostname === "your-project-id.supabase.co") return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
    // Compatibility only: a legacy anon JWT is public, service_role never is.
    const parts = key.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
    return payload.role === "anon";
  } catch { return false; }
}

export function createSupabaseClient(
  url?: string,
  publishableKey?: string,
): SupabaseClient | null {
  const targetUrl = url ?? getSupabaseEnvConfig().url;
  const targetKey = publishableKey ?? getSupabaseEnvConfig().publishableKey;

  if (!isPublicSupabaseConfig(targetUrl, targetKey) || !targetUrl || !targetKey) {
    return null;
  }

  return createClient(targetUrl, targetKey, {
    auth: {
      flowType: "pkce",
      // Auth URL parameters (PKCE codes, tokens, errors) are processed
      // explicitly by the auth adapter so the exchange is verified, surfaced
      // and cleaned deterministically instead of auto-detected on init.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "biofold-auth-token",
    },
  });
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!clientInstance && isSupabaseConfigured()) {
    clientInstance = createSupabaseClient();
  }
  return clientInstance;
}
