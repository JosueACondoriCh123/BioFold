/**
 * Pure URL handling for Supabase auth redirects (PKCE codes, implicit tokens,
 * error parameters) plus return-destination validation. No side effects here —
 * the adapter applies these helpers to window.location/history.
 */

export interface AuthRedirectInfo {
  /** True when the URL carries something exchangeable or reportable (code, tokens, error). */
  hasAuthParams: boolean;
  /** True when any auth-related parameter is present and should be removed from the URL. */
  needsCleaning: boolean;
  code?: string;
  type?: string;
  error?: string;
  errorDescription?: string;
  next?: string;
  accessToken?: string;
  refreshToken?: string;
  providerToken?: string;
  tokenHash?: string;
  flowId?: string;
}

/** Parameters that Supabase may append during an auth flow and must be removed after processing. */
const AUTH_PARAMS = new Set([
  "code",
  "state",
  "type",
  "verification_type",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "expires_in",
  "token_type",
  "token_hash",
  "expires_at",
  "sb_flow_id",
]);

function readParams(source: URLSearchParams): Pick<
  AuthRedirectInfo,
  "code" | "type" | "error" | "errorDescription" | "next" | "accessToken" | "refreshToken" | "providerToken" | "tokenHash" | "flowId"
> {
  const get = (key: string): string | undefined => {
    const value = source.get(key);
    return value !== null && value !== "" ? value : undefined;
  };
  return {
    code: get("code"),
    type: get("type") ?? get("verification_type"),
    error: get("error") ?? get("error_code"),
    errorDescription: get("error_description"),
    next: get("next"),
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    providerToken: get("provider_token"),
    tokenHash: get("token_hash"),
    flowId: get("sb_flow_id"),
  };
}

/** Reads auth parameters from both the query string and the hash fragment. */
export function parseAuthRedirect(url: string): AuthRedirectInfo {
  const parsed = new URL(url);
  const fromSearch = readParams(parsed.searchParams);
  const fromHash = readParams(new URLSearchParams(parsed.hash.replace(/^#/, "")));

  const code = fromSearch.code ?? fromHash.code;
  const type = fromSearch.type ?? fromHash.type;
  const error = fromSearch.error ?? fromHash.error;
  const errorDescription = fromSearch.errorDescription ?? fromHash.errorDescription;
  const next = fromSearch.next ?? fromHash.next;
  const accessToken = fromHash.accessToken ?? fromSearch.accessToken;
  const refreshToken = fromHash.refreshToken ?? fromSearch.refreshToken;
  const providerToken = fromHash.providerToken ?? fromSearch.providerToken;
  const tokenHash = fromSearch.tokenHash ?? fromHash.tokenHash;
  const flowId = fromSearch.flowId ?? fromHash.flowId;
  const hasAuthParams = Boolean(code || tokenHash || error || errorDescription || accessToken || refreshToken || providerToken);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const needsCleaning = [...parsed.searchParams.keys(), ...hashParams.keys()].some(key => AUTH_PARAMS.has(key));

  return {
    hasAuthParams,
    needsCleaning,
    code,
    type,
    error,
    errorDescription,
    next,
    accessToken,
    refreshToken,
    providerToken,
    tokenHash,
    flowId,
  };
}

function filterParams(params: URLSearchParams): URLSearchParams {
  const kept = new URLSearchParams();
  params.forEach((value, key) => {
    if (!AUTH_PARAMS.has(key)) kept.append(key, value);
  });
  return kept;
}

/** Removes auth parameters (codes, tokens, errors) while preserving everything else. */
export function stripAuthParams(url: string): string {
  const parsed = new URL(url);

  const keptSearch = filterParams(parsed.searchParams);
  const search = keptSearch.toString();

  let hash = "";
  if (parsed.hash) {
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const keptHash = filterParams(hashParams);
    hash = [...hashParams.keys()].some(key => AUTH_PARAMS.has(key))
      ? keptHash.toString() ? `#${keptHash.toString()}` : ""
      : parsed.hash;
  }

  return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}${hash}`;
}

/**
 * Accepts only same-app paths ("/app/lab"). Absolute URLs, protocol-relative
 * values, schemes such as `javascript:` and relative fragments fall back to the
 * provided default, so auth flows can never bounce the user to another origin.
 */
export function sanitizeReturnPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string" || !/^\/app(?:\/lab|\/account)?\/?(?:\?|$)/.test(value)
    || value.includes("\\") || Array.from(value).some(char => char.charCodeAt(0) <= 32)) return fallback;
  try {
    const url = new URL(value, "https://biofold.invalid");
    const path = url.pathname.replace(/\/$/, "");
    if (!["/app", "/app/lab", "/app/account"].includes(path)) return fallback;
    const pdb = url.searchParams.get("pdb");
    return path === "/app/lab" && pdb && /^[a-z0-9]{4}$/i.test(pdb)
      ? `${path}?pdb=${pdb.toUpperCase()}` : path;
  } catch { return fallback; }
}

/** Builds the OAuth return URL: always this origin's callback, with a sanitized internal `next`. */
export function buildCallbackRedirect(origin: string, returnTo?: string): string {
  const next = sanitizeReturnPath(returnTo);
  return `${origin.replace(/\/+$/, "")}/auth/callback?next=${encodeURIComponent(next)}`;
}
