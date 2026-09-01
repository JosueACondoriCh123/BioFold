import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseAuthAdapter, normalizeAuthError } from "../../src/auth/supabaseAuthAdapter";
import {
  createMockSession,
  createMockSupabaseAuth,
  createMockUser,
  currentTestUrl,
  setTestUrl,
} from "../helpers/auth/mockSupabase";

describe("SupabaseAuthAdapter", () => {
  let mockAuth: ReturnType<typeof createMockSupabaseAuth>;
  let adapter: SupabaseAuthAdapter;

  beforeEach(() => {
    mockAuth = createMockSupabaseAuth();
    adapter = new SupabaseAuthAdapter(() => mockAuth.client);
  });

  afterEach(() => {
    setTestUrl("/");
    vi.unstubAllEnvs();
  });

  describe("Configuration & getSession", () => {
    it("reports configured when client is provided", () => {
      vi.stubEnv("VITE_SUPABASE_URL", "https://mock.supabase.co");
      vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "mock-publishable-key");
      expect(adapter.isConfigured()).toBe(true);
    });

    it("resolves the initial session and maps user metadata accurately", async () => {
      const { session } = await adapter.getSession();
      expect(session).not.toBeNull();
      expect(session?.user.email).toBe("rosalind@crystallography.org");
      expect(session?.user.displayName).toBe("Rosalind Franklin");
      expect(session?.user.emailConfirmed).toBe(true);
      expect(session?.accessToken).toBe("mock-jwt-access-token");
    });

    it("reports an anonymous session without error when none is stored", async () => {
      mockAuth.mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
      const result = await adapter.getSession();
      expect(result.session).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it("surfaces session verification failures instead of masking them as anonymous", async () => {
      mockAuth.mockGetSession.mockResolvedValueOnce({
        data: { session: null },
        error: { message: "Failed to fetch", status: 0 },
      });
      const result = await adapter.getSession();
      expect(result.session).toBeNull();
      expect(result.error).toMatchObject({ code: "NETWORK_ERROR", retryable: true });
    });

    it("maps getSession exceptions to a retryable error", async () => {
      mockAuth.mockGetSession.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const result = await adapter.getSession();
      expect(result.session).toBeNull();
      expect(result.error?.code).toBe("NETWORK_ERROR");
    });
  });

  describe("onAuthStateChange", () => {
    it("subscribes and maps auth events to domain events", () => {
      const receivedEvents: Array<{ event: string; email?: string }> = [];
      const unsubscribe = adapter.onAuthStateChange((event, session) => {
        receivedEvents.push({ event, email: session?.user.email });
      });

      const newUser = createMockUser({ email: "marie.curie@radium.org" });
      const newSession = createMockSession(newUser);

      mockAuth.triggerAuthChange("SIGNED_IN", newSession);
      mockAuth.triggerAuthChange("PASSWORD_RECOVERY", newSession);
      mockAuth.triggerAuthChange("SIGNED_OUT", null);

      expect(receivedEvents).toEqual([
        { event: "SIGNED_IN", email: "marie.curie@radium.org" },
        { event: "PASSWORD_RECOVERY", email: "marie.curie@radium.org" },
        { event: "SIGNED_OUT", email: undefined },
      ]);

      unsubscribe();
      mockAuth.triggerAuthChange("SIGNED_IN", newSession);
      expect(receivedEvents).toHaveLength(3);
    });
  });

  describe("signInWithPassword", () => {
    it("successfully signs in with valid credentials", async () => {
      const result = await adapter.signInWithPassword(
        "rosalind@crystallography.org",
        "secret-pass-123",
      );
      expect(result.error).toBeUndefined();
      expect(result.session).not.toBeNull();
      expect(result.user?.displayName).toBe("Rosalind Franklin");
      expect(mockAuth.mockSignInWithPassword).toHaveBeenCalledWith({
        email: "rosalind@crystallography.org",
        password: "secret-pass-123",
      });
    });

    it("validates empty email or password before calling API", async () => {
      const result = await adapter.signInWithPassword("", "");
      expect(result.error).toMatchObject({
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
      expect(mockAuth.mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("maps invalid_credentials error correctly", async () => {
      mockAuth.mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", code: "invalid_grant" },
      });

      const result = await adapter.signInWithPassword("test@example.com", "wrong-pass");
      expect(result.error).toMatchObject({
        code: "INVALID_CREDENTIALS",
        retryable: false,
      });
    });

    it("maps email_not_confirmed error correctly", async () => {
      mockAuth.mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: "Email not confirmed", code: "email_not_confirmed" },
      });

      const result = await adapter.signInWithPassword("unconfirmed@example.com", "pass12345");
      expect(result.error).toMatchObject({
        code: "EMAIL_NOT_CONFIRMED",
        retryable: false,
      });
    });
  });

  describe("signUpWithPassword", () => {
    it("signs up and passes display name in metadata", async () => {
      const result = await adapter.signUpWithPassword(
        "dorothy@hodgkin.org",
        "insulin-structure-3d",
        "Dorothy Hodgkin",
      );

      expect(result.error).toBeUndefined();
      expect(mockAuth.mockSignUp).toHaveBeenCalledWith({
        email: "dorothy@hodgkin.org",
        password: "insulin-structure-3d",
        options: {
          data: { full_name: "Dorothy Hodgkin" },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fapp`,
        },
      });
    });

    it("detects when email confirmation is required", async () => {
      mockAuth.mockSignUp.mockResolvedValueOnce({
        data: {
          user: createMockUser({ email_confirmed_at: undefined }),
          session: null,
        },
        error: null,
      });

      const result = await adapter.signUpWithPassword(
        "pending@example.com",
        "valid-password-123",
      );
      expect(result.requiresEmailConfirmation).toBe(true);
      expect(result.session).toBeNull();
      expect(result.user).not.toBeNull();
    });

    it("rejects weak passwords (< 8 characters)", async () => {
      const result = await adapter.signUpWithPassword("user@example.com", "123");
      expect(result.error).toMatchObject({
        code: "WEAK_PASSWORD",
        retryable: false,
      });
      expect(mockAuth.mockSignUp).not.toHaveBeenCalled();
    });

    it("maps user_already_exists error cleanly", async () => {
      mockAuth.mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: "User already registered", code: "user_already_exists" },
      });

      const result = await adapter.signUpWithPassword("existing@example.com", "valid-password-123");
      expect(result.error).toMatchObject({
        code: "USER_ALREADY_EXISTS",
      });
    });
  });

  describe("signInWithGoogle", () => {
    it("builds a same-origin callback redirect with an internal next", async () => {
      const result = await adapter.signInWithGoogle("/app/lab");
      expect(result.error).toBeUndefined();
      expect(result.url).toBeDefined();
      expect(mockAuth.mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp%2Flab`,
          skipBrowserRedirect: true,
          scopes: "openid email profile",
        },
      });
    });

    it("defaults the return destination to /app when none is provided", async () => {
      await adapter.signInWithGoogle();
      expect(mockAuth.mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp`,
          skipBrowserRedirect: true,
          scopes: "openid email profile",
        },
      });
    });

    it("never sends an external return destination to the OAuth provider", async () => {
      await adapter.signInWithGoogle("https://evil.com/callback");
      expect(mockAuth.mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp`,
          skipBrowserRedirect: true,
          scopes: "openid email profile",
        },
      });
    });
  });

  describe("requestPasswordRecovery & updatePassword", () => {
    it("targets the verified callback on the current origin", async () => {
      const result = await adapter.requestPasswordRecovery("rosalind@crystallography.org");
      expect(result.error).toBeUndefined();
      expect(mockAuth.mockResetPasswordForEmail).toHaveBeenCalledWith(
        "rosalind@crystallography.org",
        { redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp` },
      );
    });

    it("rejects arbitrary internal and external destinations", async () => {
      await adapter.requestPasswordRecovery("rosalind@crystallography.org", "/custom-reset");
      expect(mockAuth.mockResetPasswordForEmail).toHaveBeenLastCalledWith(
        "rosalind@crystallography.org",
        { redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp` },
      );

      await adapter.requestPasswordRecovery(
        "rosalind@crystallography.org",
        "https://evil.com/reset",
      );
      expect(mockAuth.mockResetPasswordForEmail).toHaveBeenLastCalledWith(
        "rosalind@crystallography.org",
        { redirectTo: `${window.location.origin}/auth/callback?next=%2Fapp` },
      );
    });

    it("validates empty email for password recovery", async () => {
      const result = await adapter.requestPasswordRecovery("   ");
      expect(result.error).toMatchObject({
        code: "INVALID_EMAIL",
      });
      expect(mockAuth.mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("updates password when valid", async () => {
      const result = await adapter.updatePassword("new-secure-password-2026");
      expect(result.error).toBeUndefined();
      expect(mockAuth.mockUpdateUser).toHaveBeenCalledWith({
        password: "new-secure-password-2026",
      });
    });

    it("rejects password update with less than 8 characters", async () => {
      const result = await adapter.updatePassword("123");
      expect(result.error).toMatchObject({
        code: "WEAK_PASSWORD",
      });
      expect(mockAuth.mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("updateDisplayName", () => {
    it("updates full_name in user_metadata without needing database tables", async () => {
      const result = await adapter.updateDisplayName("Dr. Rosalind Franklin");
      expect(result.error).toBeUndefined();
      expect(result.user?.displayName).toBe("Dr. Rosalind Franklin");
      expect(mockAuth.mockUpdateUser).toHaveBeenCalledWith({
        data: { full_name: "Dr. Rosalind Franklin" },
      });
    });

    it("rejects empty display name update", async () => {
      const result = await adapter.updateDisplayName("   ");
      expect(result.error).toBeDefined();
      expect(mockAuth.mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("signOut & resendConfirmationEmail", () => {
    it("signs out cleanly", async () => {
      const result = await adapter.signOut();
      expect(result.error).toBeUndefined();
      expect(mockAuth.mockSignOut).toHaveBeenCalled();
    });

    it("resends confirmation email", async () => {
      const result = await adapter.resendConfirmationEmail("user@example.com");
      expect(result.error).toBeUndefined();
      expect(mockAuth.mockResend).toHaveBeenCalledWith({
        type: "signup",
        email: "user@example.com",
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fapp` },
      });
    });
  });

  describe("handleAuthRedirect", () => {
    it("ignores URLs without auth parameters and leaves them untouched", async () => {
      setTestUrl("/app/lab?pdb=4HHB");
      const outcome = await adapter.handleAuthRedirect();
      expect(outcome.handled).toBe(false);
      expect(currentTestUrl()).toBe("/app/lab?pdb=4HHB");
      expect(mockAuth.mockExchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("exchanges a PKCE code, marks recovery and cleans the URL", async () => {
      setTestUrl("/auth/callback?code=pkce-123&next=/app");
      mockAuth.mockExchangeCodeForSession.mockResolvedValueOnce({ data: { session: createMockSession(), user: createMockUser(), redirectType: "recovery" }, error: null });
      const outcome = await adapter.handleAuthRedirect();

      expect(mockAuth.mockExchangeCodeForSession).toHaveBeenCalledWith("pkce-123");
      expect(outcome.handled).toBe(true);
      expect(outcome.recovery).toBe(true);
      expect(outcome.error).toBeUndefined();
      expect(outcome.session?.user.email).toBe("rosalind@crystallography.org");
      expect(currentTestUrl()).toBe("/auth/callback?next=%2Fapp");
    });

    it("completes a signup confirmation code without recovery mode", async () => {
      setTestUrl("/auth/callback?code=signup-code&type=signup");
      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.recovery).toBe(false);
      expect(outcome.session).not.toBeNull();
      expect(currentTestUrl()).toBe("/auth/callback");
    });

    it("maps a failed recovery exchange to RECOVERY_TOKEN_INVALID and cleans the URL", async () => {
      setTestUrl("/auth/callback?code=stale-code&type=recovery");
      mockAuth.mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "invalid request: both auth code and code verifier should be non-empty" },
      });

      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.session).toBeUndefined();
      expect(outcome.recovery).toBeUndefined();
      expect(outcome.error).toMatchObject({ code: "RECOVERY_TOKEN_INVALID", retryable: false });
      expect(currentTestUrl()).toBe("/auth/callback");
    });

    it("maps a failed signup exchange to an error and cleans the URL", async () => {
      setTestUrl("/auth/callback?code=bad-code&type=signup");
      mockAuth.mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "Email link is invalid or has expired" },
      });

      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.error).toBeDefined();
      expect(currentTestUrl()).toBe("/auth/callback");
    });

    it("reports OAuth error parameters as AUTH_CALLBACK_FAILED and cleans the URL", async () => {
      setTestUrl("/#error=access_denied&error_code=403&error_description=User+cancelled+authorization");

      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.error).toMatchObject({
        code: "AUTH_CALLBACK_FAILED",
        message: "Sign-in was not completed. Please try again or request a new link.",
      });
      expect(currentTestUrl()).toBe("/");
    });

    it("rejects legacy implicit recovery tokens without installing their session", async () => {
      setTestUrl("/#access_token=hash-token&refresh_token=hash-refresh&type=recovery");
      const outcome = await adapter.handleAuthRedirect();

      expect(mockAuth.mockSetSession).not.toHaveBeenCalled();
      expect(outcome.handled).toBe(true);
      expect(outcome.recovery).toBeUndefined();
      expect(outcome.session).toBeUndefined();
      expect(outcome.error?.code).toBe("RECOVERY_TOKEN_INVALID");
      expect(currentTestUrl()).toBe("/");
    });

    it("never throws when implicit tokens are invalid", async () => {
      setTestUrl("/#access_token=fake-token&type=recovery");
      mockAuth.mockSetSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "Invalid JWT" },
      });

      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.error).toBeDefined();
      expect(outcome.recovery).toBeUndefined();
      expect(currentTestUrl()).toBe("/");
    });

    it("cleans a bare type=recovery marker without authorizing anything", async () => {
      setTestUrl("/reset-password?type=recovery");
      const outcome = await adapter.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.session).toBeUndefined();
      expect(outcome.recovery).toBeUndefined();
      expect(outcome.error).toBeUndefined();
      expect(currentTestUrl()).toBe("/reset-password");
    });

    it("returns CONFIG_MISSING when the client is not configured", async () => {
      setTestUrl("/auth/callback?code=pkce-123");
      const unconfigured = new SupabaseAuthAdapter(() => null);

      const outcome = await unconfigured.handleAuthRedirect();

      expect(outcome.handled).toBe(true);
      expect(outcome.error).toMatchObject({ code: "CONFIG_MISSING" });
      expect(currentTestUrl()).toBe("/auth/callback");
    });
  });

  describe("Unconfigured and Network error scenarios", () => {
    it("returns CONFIG_MISSING error when client is null", async () => {
      const unconfiguredAdapter = new SupabaseAuthAdapter(() => null);
      expect(unconfiguredAdapter.isConfigured()).toBe(false);

      const signInRes = await unconfiguredAdapter.signInWithPassword("a@b.com", "pass1234");
      expect(signInRes.error?.code).toBe("CONFIG_MISSING");

      const signUpRes = await unconfiguredAdapter.signUpWithPassword("a@b.com", "pass1234");
      expect(signUpRes.error?.code).toBe("CONFIG_MISSING");

      const signOutRes = await unconfiguredAdapter.signOut();
      expect(signOutRes.error?.code).toBe("CONFIG_MISSING");
    });

    it("maps network failures to retryable NETWORK_ERROR", () => {
      const error = new TypeError("Failed to fetch");
      const normalized = normalizeAuthError(error);
      expect(normalized).toMatchObject({
        code: "NETWORK_ERROR",
        retryable: true,
      });
    });
  });
});
