export interface CachePolicyEntry {
  statusCode: number;
  freshUntil: string;
  staleUntil: string;
}

function successful(entry: CachePolicyEntry | null): entry is CachePolicyEntry {
  return Boolean(entry && entry.statusCode >= 200 && entry.statusCode < 300);
}

export function freshCacheOutcome(entry: CachePolicyEntry | null, now: number): "hit" | null {
  return entry && new Date(entry.freshUntil).getTime() > now ? "hit" : null;
}

export function canUseStale(entry: CachePolicyEntry | null, now: number): boolean {
  return successful(entry) && new Date(entry.staleUntil).getTime() > now;
}

export function providerCacheOutcome(status: number, entry: CachePolicyEntry | null, now: number): "miss" | "revalidated" | "stale_fallback" | "unavailable" {
  if (status === 304 && successful(entry)) return "revalidated";
  if ((status >= 200 && status < 300) || status === 404) return "miss";
  if ((status === 408 || status === 429 || status >= 500) && canUseStale(entry, now)) return "stale_fallback";
  return "unavailable";
}
