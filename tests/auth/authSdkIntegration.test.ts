import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { createClient } from "@supabase/supabase-js";
import { AuthSessionController } from "../../src/auth/authSessionController";
import { SupabaseAuthAdapter } from "../../src/auth/supabaseAuthAdapter";
import { createMockUser, setTestUrl } from "../helpers/auth/mockSupabase";

const disposals: Array<() => void | Promise<void>> = [];
let fixtureId = 0;
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose(); setTestUrl("/"); });

/** Uses the installed Supabase SDK; only HTTP and storage are test doubles. */
function fixture() {
  const memory = new Map<string, string>();
  const storageKey = `biofold-sdk-test-${++fixtureId}`;
  const user = createMockUser({ id: "sdk-user", email: "researcher@example.test", user_metadata: { full_name: "Test researcher" } });
  const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }))}.test-signature`;
  const sessionBody = { access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, user };
  const requests: string[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/token")) return Response.json(sessionBody);
    if (url.pathname.endsWith("/user")) return Response.json(user);
    if (url.pathname.endsWith("/logout")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected test auth request: ${url.pathname}`);
  });
  const client = createClient("https://auth.biofold.test", "sb_publishable_unit_test", {
    auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: false,
      storageKey, storage: {
        getItem: key => memory.get(key) ?? null,
        setItem: (key, value) => { memory.set(key, value); },
        removeItem: key => { memory.delete(key); },
      } },
    global: { fetch: fetcher },
  });
  const controller = new AuthSessionController(new SupabaseAuthAdapter(() => client));
  const start = () => {
    disposals.push(controller.start());
    disposals.push(() => client.auth.dispose());
  };
  return { memory, storageKey, user, sessionBody, requests, fetcher, controller, start,
    ready: () => waitFor(() => expect(controller.getSnapshot().status).not.toBe("loading")),
  };
}

describe("installed SDK integration", () => {
  it("identifies a real PKCE recovery exchange without type=recovery in the URL", async () => {
    const h = fixture();
    h.memory.set(`${h.storageKey}-code-verifier`, JSON.stringify("test-verifier/recovery"));
    setTestUrl("/auth/callback?code=test-code&next=/app/lab");
    h.start(); await h.ready();
    expect(h.controller.getSnapshot().status).toBe("recovery");
    await expect(h.controller.actions.completeCallback()).resolves.toBe("/reset-password");
    expect(h.requests.filter(request => request.includes("grant_type=pkce"))).toHaveLength(1);
    expect(h.memory.has(`${h.storageKey}-code-verifier`)).toBe(false);
    expect(window.location.search).not.toContain("code=");
    await h.controller.actions.updatePassword("new-test-password");
    expect(h.requests).toContain("PUT /auth/v1/user");
    expect(h.controller.getSnapshot().recovery).toBe(false);
    await expect(h.controller.actions.updatePassword("again-test-password")).rejects.toThrow();
  });

  it("does not misclassify a normal PKCE verifier as recovery because of URL text", async () => {
    const h = fixture();
    h.memory.set(`${h.storageKey}-code-verifier`, JSON.stringify("test-verifier"));
    setTestUrl("/auth/callback?code=test-code&type=recovery");
    h.start(); await h.ready();
    expect(h.controller.getSnapshot().status).toBe("authenticated");
    expect(h.controller.getSnapshot().recovery).toBe(false);
    await expect(h.controller.actions.updatePassword("new-test-password")).rejects.toThrow();
  });

  it("removes SDK-persisted tokens when logout overlaps a delayed login response", async () => {
    const h = fixture(); h.start(); await h.ready();
    let respond!: (response: Response) => void;
    const response = new Promise<Response>(resolve => { respond = resolve; });
    h.fetcher.mockImplementationOnce(() => response);
    const login = h.controller.signIn("researcher@example.test", "test-password");
    await waitFor(() => expect(h.fetcher).toHaveBeenCalled());
    const logout = h.controller.signOut();
    expect(h.controller.getSnapshot().session).toBeNull();
    respond(Response.json(h.sessionBody));
    expect((await login).error?.code).toBe("OPERATION_CANCELLED");
    await logout;
    expect(h.memory.has(h.storageKey)).toBe(false);
    expect(h.controller.getSnapshot().session).toBeNull();
    expect(h.requests).toContain("POST /auth/v1/logout?scope=local");
  });
});
