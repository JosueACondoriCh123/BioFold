import { createHash } from "node:crypto";
import { expect, type Page, type Route } from "@playwright/test";
import { PLATFORM_URL, SUPABASE_TEST_ORIGIN } from "../../config/e2eEnvironment";

export const TEST_EMAIL = "researcher@example.test";
export const TEST_PASSWORD = "Initial-test-password-123!";
export const TEST_NAME = "Test Researcher";
const STORAGE_KEY = "biofold-auth-token";
type Endpoint = "password" | "pkce" | "signup" | "user" | "update" | "recover" | "resend" | "oauth";
type Failure = { status: number; code: string; message: string };
type LinkKind = "signup" | "recovery" | "google";
export interface TestLink {
  kind: LinkKind;
  code: string;
  url: string;
  challenge: string;
  used: boolean;
  expired: boolean;
}

/** Real SDK + real pages; the server boundary alone is simulated. Never imported by src/. */
export async function setupMockSupabaseNetwork(page: Page) {
  let user = {
    id: "00000000-0000-4000-8000-000000000042",
    email: TEST_EMAIL,
    user_metadata: { full_name: TEST_NAME },
    app_metadata: { provider: "email", providers: ["email"] },
    aud: "authenticated", role: "authenticated",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    email_confirmed_at: "2026-08-01T00:00:00.000Z" as string | null,
  };
  let password = TEST_PASSWORD;
  let sequence = 0;
  const activeTokens = new Set<string>();
  const failures: Partial<Record<Endpoint, Failure>> = {};
  const holds = new Map<Endpoint, Promise<void>>();
  const requests: Array<{ method: string; url: URL; body: Record<string, unknown> }> = [];
  const links: TestLink[] = [];
  const unexpected: string[] = [];

  function issueSession() {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp, role: "authenticated", session_id: ++sequence })}.e2e-signature`;
    activeTokens.add(token);
    return { access_token: token, refresh_token: `e2e-refresh-${sequence}`, expires_in: 3600,
      expires_at: exp, token_type: "bearer", user: { ...user } };
  }
  function issueLink(kind: LinkKind, challenge: string, redirect: string) {
    const url = new URL(redirect);
    // Do not let a redirect regression leave the local test environment.
    if (url.origin !== PLATFORM_URL || url.pathname !== "/auth/callback") {
      throw new Error("Unexpected auth callback origin or path");
    }
    const code = `e2e-${kind}-${++sequence}`;
    url.searchParams.set("code", code);
    const link: TestLink = { kind, code, url: url.href, challenge, used: false, expired: false };
    links.push(link);
    return link;
  }
  const json = (route: Route, body: object, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const reject = (route: Route, code: string, message: string, status = 400) => json(route, { code, msg: message, message }, status);
  async function fault(route: Route, endpoint: Endpoint) {
    await holds.get(endpoint);
    const failure = failures[endpoint];
    if (!failure) return false;
    await reject(route, failure.code, failure.message, failure.status);
    return true;
  }

  // Catch *any* auth host, not just the expected one: accidental real configuration
  // is a failing test, never a request to a live account or mail provider.
  await page.route("**/auth/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
    requests.push({ method, url, body });
    if (url.origin !== SUPABASE_TEST_ORIGIN) {
      unexpected.push(`${method} unexpected auth host`);
      return route.abort("blockedbyclient");
    }
    const path = url.pathname;
    if (method === "POST" && path === "/auth/v1/token") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        if (await fault(route, "password")) return;
        if (body.email !== user.email || body.password !== password) return reject(route, "invalid_credentials", "Invalid login credentials");
        if (!user.email_confirmed_at) return reject(route, "email_not_confirmed", "Email not confirmed");
        return json(route, issueSession());
      }
      if (grant === "pkce") {
        if (await fault(route, "pkce")) return;
        const link = links.find(candidate => candidate.code === body.auth_code);
        const verifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (!link || link.used || link.expired) return reject(route, "flow_state_expired", "Link expired or already used");
        if (!verifier || link.challenge !== challenge) return reject(route, "bad_code_verifier", "Invalid code verifier");
        link.used = true;
        user = { ...user, email_confirmed_at: new Date().toISOString() };
        return json(route, issueSession());
      }
      if (grant === "refresh_token") return reject(route, "refresh_token_not_found", "Refresh token revoked");
    }
    if (method === "POST" && path === "/auth/v1/signup") {
      if (await fault(route, "signup")) return;
      const metadata = body.data as Record<string, unknown>;
      user = { ...user, email: String(body.email), email_confirmed_at: null,
        user_metadata: { full_name: String(metadata.full_name) } };
      password = String(body.password);
      if (body.code_challenge_method !== "s256") unexpected.push("Signup did not use S256 PKCE");
      issueLink("signup", String(body.code_challenge), url.searchParams.get("redirect_to") ?? "");
      return json(route, user);
    }
    if (method === "POST" && path === "/auth/v1/recover") {
      if (await fault(route, "recover")) return;
      if (body.code_challenge_method !== "s256") unexpected.push("Recovery did not use S256 PKCE");
      if (body.email === user.email) issueLink("recovery", String(body.code_challenge), url.searchParams.get("redirect_to") ?? "");
      return json(route, {});
    }
    if (method === "POST" && path === "/auth/v1/resend") {
      if (await fault(route, "resend")) return;
      if (body.type !== "signup") unexpected.push("Unexpected resend type");
      if (body.code_challenge_method !== "s256") unexpected.push("Resend did not use S256 PKCE");
      if (body.email === user.email) issueLink("signup", String(body.code_challenge), url.searchParams.get("redirect_to") ?? "");
      return json(route, {});
    }
    if (method === "GET" && path === "/auth/v1/authorize") {
      if (await fault(route, "oauth")) return;
      if (url.searchParams.get("provider") !== "google" || url.searchParams.get("code_challenge_method") !== "s256") unexpected.push("Invalid Google PKCE request");
      const link = issueLink("google", url.searchParams.get("code_challenge") ?? "", url.searchParams.get("redirect_to") ?? "");
      return route.fulfill({ status: 302, headers: { location: link.url }, body: "" });
    }
    const token = request.headers().authorization?.replace(/^Bearer /, "");
    if (path === "/auth/v1/user" && (method === "GET" || method === "PUT")) {
      if (await fault(route, method === "GET" ? "user" : "update")) return;
      if (!token || !activeTokens.has(token)) return reject(route, "session_not_found", "Session expired", 401);
      if (method === "PUT") {
        if (typeof body.password === "string") password = body.password;
        const metadata = body.data as Record<string, unknown> | undefined;
        if (typeof metadata?.full_name === "string") user = { ...user, user_metadata: { full_name: metadata.full_name } };
      }
      return json(route, user);
    }
    if (method === "POST" && path === "/auth/v1/logout") {
      if (token) activeTokens.delete(token);
      return route.fulfill({ status: 204 });
    }
    unexpected.push(`${method} ${path}`);
    return reject(route, "unexpected_test_request", "Unhandled test auth request", 501);
  });

  return {
    requests, links, unexpected, failures,
    count: (path: string, method = "POST") => requests.filter(request => request.url.pathname === `/auth/v1/${path}` && request.method === method).length,
    lastLink: (kind: LinkKind) => {
      const link = [...links].reverse().find(candidate => candidate.kind === kind);
      if (!link) throw new Error(`No ${kind} link was requested`);
      return link;
    },
    expireSessions: () => activeTokens.clear(),
    hold: (endpoint: Endpoint) => {
      let release!: () => void;
      holds.set(endpoint, new Promise<void>(resolve => { release = resolve; }));
      return () => { holds.delete(endpoint); release(); };
    },
    seedSession: async () => {
      const session = issueSession();
      // Seed only on the first same-origin document. Reload/logout must rely on
      // SDK persistence, never a fixture that silently restores revoked tokens.
      await page.addInitScript(({ session, storageKey, origin }) => {
        if (location.origin !== origin || sessionStorage.getItem("__biofold_seeded")) return;
        sessionStorage.setItem("__biofold_seeded", "true");
        localStorage.setItem(storageKey, JSON.stringify(session));
      }, { session, storageKey: STORAGE_KEY, origin: PLATFORM_URL });
    },
  };
}

export async function attachWebMcpInspector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools: Array<{ name: string }> = [];
    Object.defineProperty(window, "__biofoldRegisteredTools", { value: tools, configurable: true });
    Object.defineProperty(document, "modelContext", { configurable: true, value: {
      registerTool: async (tool: { name: string }, options?: { signal?: AbortSignal }) => {
        if (options?.signal?.aborted) return;
        tools.push(tool);
        options?.signal?.addEventListener("abort", () => {
          const index = tools.indexOf(tool);
          if (index !== -1) tools.splice(index, 1);
        }, { once: true });
      },
    } });
  });
}

export async function assertNoMolecularRuntime(page: Page): Promise<void> {
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __biofoldRegisteredTools: unknown[] }).__biofoldRegisteredTools.length)).toBe(0);
}
