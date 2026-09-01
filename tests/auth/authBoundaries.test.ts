import { afterEach, describe, expect, it } from "vitest";
import { isPublicSupabaseConfig } from "../../src/auth/supabaseClient";
import { parseAuthRedirect, sanitizeReturnPath, stripAuthParams } from "../../src/auth/authRedirect";
import { SupabaseAuthAdapter } from "../../src/auth/supabaseAuthAdapter";
import { createMockSession, createMockSupabaseAuth, createMockUser, currentTestUrl, setTestUrl } from "../helpers/auth/mockSupabase";

afterEach(() => setTestUrl("/"));

describe("public auth configuration", () => {
  it("accepts publishable keys and rejects secret or service_role keys", () => {
    const url = "https://biofold-test.supabase.co";
    expect(isPublicSupabaseConfig(url, "sb_publishable_public_test")).toBe(true);
    expect(isPublicSupabaseConfig(url, "sb_secret_private_test")).toBe(false);
    const legacy = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
    expect(isPublicSupabaseConfig(url, legacy("anon"))).toBe(true);
    expect(isPublicSupabaseConfig(url, legacy("service_role"))).toBe(false);
    expect(isPublicSupabaseConfig(url, "placeholder")).toBe(false);
  });
  it.each([undefined, "not-a-url", "http://remote.example.test", "https://user:pass@example.test", "https://example.test?token=x", "https://your-project-id.supabase.co"])("rejects invalid or placeholder URL %s", url => {
    expect(isPublicSupabaseConfig(url, "sb_publishable_test")).toBe(false);
  });
  it("permits HTTP for a loopback Supabase development instance only", () => {
    expect(isPublicSupabaseConfig("http://127.0.0.1:54321", "sb_publishable_test")).toBe(true);
  });
});

describe("callback trust boundary", () => {
  it("does not restore the callback URL after navigation during a slow exchange", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    setTestUrl("/auth/callback?code=slow");
    let finish!: (value: unknown) => void;
    mock.mockExchangeCodeForSession.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = adapter.handleAuthRedirect();
    expect(currentTestUrl()).toBe("/auth/callback");
    setTestUrl("/login");
    finish({ data: { session: createMockSession(), user: createMockUser(), redirectType: null }, error: null });
    await pending;
    expect(currentTestUrl()).toBe("/login");
  });
  it("a query recovery marker cannot elevate a normal valid PKCE sign-in", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    setTestUrl("/auth/callback?code=normal&type=recovery&next=/reset-password");
    expect(await adapter.handleAuthRedirect()).toMatchObject({ handled: true, recovery: false, next: "/app" });
  });
  it("passes the flow id explicitly after cleaning URL credentials, preserving router history state", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    const callbackState = { idx: 3, key: "callback", usr: { returnTo: "/app/account" } };
    window.history.replaceState(callbackState, "", "/auth/callback?code=test&sb_flow_id=test-flow&next=/app/account");
    mock.mockExchangeCodeForSession.mockImplementationOnce(async () => {
      expect(currentTestUrl()).toBe("/auth/callback?next=%2Fapp%2Faccount");
      return { data: { session: createMockSession(), user: createMockUser(), redirectType: null }, error: null };
    });
    expect(await adapter.handleAuthRedirect()).toMatchObject({ next: "/app/account", recovery: false });
    expect(mock.mockExchangeCodeForSession).toHaveBeenCalledWith("test", { flowId: "test-flow" });
    expect(window.history.state).toEqual(callbackState);
  });
  it.each(["recovery", "email", "signup"])("verifies token_hash using the exact supported type %s", async type => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    setTestUrl(`/auth/callback?token_hash=hash-token&type=${type}`);
    expect(await adapter.handleAuthRedirect()).toMatchObject({ handled: true, recovery: type === "recovery" });
    expect(mock.mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "hash-token", type });
    expect(currentTestUrl()).toBe("/auth/callback");
  });
  it("does not authorize a failed token_hash verification", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    mock.mockVerifyOtp.mockResolvedValueOnce({ data: { session: null }, error: { code: "otp_expired" } });
    setTestUrl("/auth/callback?token_hash=expired&type=recovery");
    const outcome = await adapter.handleAuthRedirect();
    expect(outcome.session).toBeUndefined();
    expect(outcome.recovery).toBeUndefined();
    expect(outcome.error?.code).toBe("RECOVERY_TOKEN_INVALID");
  });
  it.each(["?code=a&token_hash=b&type=recovery", "?token_hash=a&type=invite", "#access_token=b&refresh_token=c&type=recovery"])("rejects mixed or unsupported credentials %s", async query => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    setTestUrl(`/auth/callback${query}`);
    expect((await adapter.handleAuthRedirect()).error).toBeDefined();
    expect(mock.mockVerifyOtp).not.toHaveBeenCalled();
    expect(mock.mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mock.mockSetSession).not.toHaveBeenCalled();
    expect(currentTestUrl()).toBe("/auth/callback");
  });
  it("never displays attacker-controlled OAuth error text", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    setTestUrl("/auth/callback?error_description=secret-access-token");
    const outcome = await adapter.handleAuthRedirect();
    expect(outcome.error?.message).not.toContain("secret-access-token");
    expect(outcome.error?.code).toBe("AUTH_CALLBACK_FAILED");
    expect(currentTestUrl()).toBe("/auth/callback");
  });
});

describe("session server verification", () => {
  it("returns trusted user data instead of the cached profile", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    mock.mockGetUser.mockResolvedValueOnce({ data: { user: createMockUser({ user_metadata: { full_name: "Verified name" } }) }, error: null });
    expect((await adapter.getSession()).session?.user.displayName).toBe("Verified name");
    expect(mock.mockGetUser).toHaveBeenCalledWith("mock-jwt-access-token");
  });
  it("rejects a cached session when the Auth server rejects its user", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    mock.mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "session_not_found", status: 403 } });
    expect(await adapter.getSession()).toMatchObject({ session: null, error: { code: "SESSION_EXPIRED" } });
  });
  it("rejects a cached user-id mismatch and a session change during verification", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    mock.mockGetUser.mockResolvedValueOnce({ data: { user: createMockUser({ id: "other-user" }) }, error: null });
    expect((await adapter.getSession()).session).toBeNull();
    mock.mockGetSession.mockResolvedValueOnce({ data: { session: createMockSession() }, error: null });
    mock.mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect((await adapter.getSession()).session).toBeNull();
  });
  it("preserves a network error as an explicit verification failure", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    mock.mockGetUser.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await adapter.getSession()).toMatchObject({ session: null, error: { code: "NETWORK_ERROR", retryable: true } });
  });
});

describe("URL and password boundaries", () => {
  it.each(["/login", "/reset-password", "/app/unknown", "/app\\evil", "/app\n/evil", "/app/../login", "%252F%252Fevil.test"])("rejects unsafe or unsupported next %s", next => {
    expect(sanitizeReturnPath(next)).toBe("/app");
  });
  it("allows only the valid PDB query on laboratory destinations", () => {
    expect(sanitizeReturnPath("/app/lab?pdb=4hhb&token=private")).toBe("/app/lab?pdb=4HHB");
    expect(sanitizeReturnPath("/app/account?secret=private")).toBe("/app/account");
  });
  it("cleans every auth parameter without rewriting normal page anchors", () => {
    expect(stripAuthParams("https://biofold.test/auth/callback?token_hash=a&sb_flow_id=b&expires_at=1#provider_refresh_token=c")).toBe("https://biofold.test/auth/callback");
    expect(stripAuthParams("https://biofold.test/#capabilities")).toBe("https://biofold.test/#capabilities");
    expect(parseAuthRedirect("https://biofold.test/?sb_flow_id=x").needsCleaning).toBe(true);
  });
  it("requires eight characters for new passwords without rejecting legacy login passwords", async () => {
    const mock = createMockSupabaseAuth(); const adapter = new SupabaseAuthAdapter(() => mock.client);
    expect((await adapter.signUpWithPassword("a@example.test", "1234567")).error?.code).toBe("WEAK_PASSWORD");
    expect((await adapter.updatePassword("1234567")).error?.code).toBe("WEAK_PASSWORD");
    expect(mock.mockSignUp).not.toHaveBeenCalled();
    expect(mock.mockUpdateUser).not.toHaveBeenCalled();
    await adapter.signInWithPassword("a@example.test", "123456");
    expect(mock.mockSignInWithPassword).toHaveBeenCalled();
  });
});
