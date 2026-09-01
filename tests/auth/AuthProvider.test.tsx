import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/auth";
import type { AuthPort } from "../../src/auth/types";
import {
  createMockSession,
  createMockSupabaseAuth,
  createMockUser,
  currentTestUrl,
  setTestUrl,
} from "../helpers/auth/mockSupabase";
import { SupabaseAuthAdapter } from "../../src/auth/supabaseAuthAdapter";

afterEach(() => {
  cleanup();
  setTestUrl("/");
});

function TestConsumer() {
  const auth = useAuth();
  const [callbackResult, setCallbackResult] = useState("");

  return (
    <div>
      <div data-testid="status">{auth.status}</div>
      <div data-testid="integration-status">{auth.state.status}</div>
      <div data-testid="is-loading">{auth.isLoading ? "loading" : "ready"}</div>
      <div data-testid="is-authenticated">{auth.isAuthenticated ? "yes" : "no"}</div>
      <div data-testid="is-recovery">{auth.isRecoveryMode ? "yes" : "no"}</div>
      <div data-testid="user-email">{auth.user?.email ?? "none"}</div>
      <div data-testid="user-name">{auth.user?.displayName ?? "none"}</div>
      <button onClick={() => void auth.signIn("test@example.com", "secret123")}>
        Sign In
      </button>
      <button onClick={() => void auth.signOut()}>Sign Out</button>
      <button onClick={() => void auth.updatePassword("new-pass-123")}>
        Update Password
      </button>
      <button onClick={() => void auth.updateDisplayName("Jane Doe")}>
        Update Name
      </button>
      <button onClick={() => void auth.actions.retrySession()}>Retry Session</button>
      <button
        onClick={() => {
          void auth.actions
            .completeCallback()
            .then((path) => setCallbackResult(`ok:${path}`))
            .catch((err: unknown) => setCallbackResult(`error:${(err as Error).message}`));
        }}
      >
        Complete Callback
      </button>
      <div data-testid="callback-result">{callbackResult}</div>
    </div>
  );
}

function mountHook(adapter: AuthPort) {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider adapter={adapter}>{children}</AuthProvider>,
  });
}

describe("AuthProvider & useAuth", () => {
  it("throws a clear descriptive error when useAuth is used outside AuthProvider", () => {
    // Suppress React error boundary console output for this test
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an <AuthProvider>",
    );
    consoleError.mockRestore();
  });

  it("handles unconfigured adapter gracefully", async () => {
    const unconfiguredAdapter: AuthPort = {
      isConfigured: () => false,
      getSession: () => Promise.resolve({ session: null }),
      handleAuthRedirect: () => Promise.resolve({ handled: false }),
      onAuthStateChange: () => () => {},
      signInWithPassword: () => Promise.resolve({ session: null, user: null }),
      signUpWithPassword: () => Promise.resolve({ user: null, session: null, requiresEmailConfirmation: false }),
      signInWithGoogle: () => Promise.resolve({}),
      signOut: () => Promise.resolve({}),
      requestPasswordRecovery: () => Promise.resolve({}),
      updatePassword: () => Promise.resolve({}),
      updateDisplayName: () => Promise.resolve({ user: null }),
      resendConfirmationEmail: () => Promise.resolve({}),
    };

    render(
      <AuthProvider adapter={unconfiguredAdapter}>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unconfigured"));
    expect(screen.getByTestId("integration-status")).toHaveTextContent("unconfigured");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("no");
  });

  it("resolves the initial authenticated session before completing loading", async () => {
    const mockAuth = createMockSupabaseAuth();
    const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading")).toHaveTextContent("ready");
    });

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("yes");
    expect(screen.getByTestId("user-email")).toHaveTextContent("rosalind@crystallography.org");
    expect(screen.getByTestId("user-name")).toHaveTextContent("Rosalind Franklin");
  });

  it("resolves to unauthenticated when there is no initial session", async () => {
    const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
    const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading")).toHaveTextContent("ready");
    });

    expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("integration-status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("no");
    expect(screen.getByTestId("user-email")).toHaveTextContent("none");
  });

  it("distinguishes a failed session verification from an anonymous session and recovers on retry", async () => {
    const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
    mockAuth.mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Failed to fetch", status: 0 },
    });
    const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
    const { result } = mountHook(adapter);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.state.status).toBe("error");
    expect(result.current.error?.code).toBe("NETWORK_ERROR");
    expect(result.current.isAuthenticated).toBe(false);

    mockAuth.mockGetSession.mockResolvedValue({
      data: { session: createMockSession(createMockUser({ email: "retry@biofold.org" })) },
      error: null,
    });
    await act(async () => {
      mockAuth.mockGetUser.mockResolvedValueOnce({ data: { user: createMockUser({ email: "retry@biofold.org" }) }, error: null });
      await result.current.actions.retrySession();
    });

    expect(result.current.status).toBe("authenticated");
    expect(result.current.user?.email).toBe("retry@biofold.org");
    expect(result.current.error).toBeNull();
  });

  describe("recovery-mode authorization", () => {
    it("never enables recovery mode just because the URL mentions type=recovery", async () => {
      setTestUrl("/reset-password?type=recovery");
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.status).toBe("unauthenticated");
      expect(result.current.isRecoveryMode).toBe(false);
      expect(result.current.state.recoveryAllowed).toBe(false);
      expect(currentTestUrl()).toBe("/reset-password");

      let actionResult: { error?: { code: string } } | undefined;
      await act(async () => {
        actionResult = await result.current.updatePassword("new-pass-123");
      });
      expect(actionResult?.error?.code).toBe("RECOVERY_REQUIRED");
      expect(mockAuth.mockUpdateUser).not.toHaveBeenCalled();
    });

    it("does not enter recovery mode when a recovery code exchange fails", async () => {
      setTestUrl("/auth/callback?code=stale&type=recovery");
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      mockAuth.mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "invalid request: both auth code and code verifier should be non-empty" },
      });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.status).toBe("error");
      expect(result.current.state.status).toBe("error");
      expect(result.current.isRecoveryMode).toBe(false);
      expect(result.current.state.recoveryAllowed).toBe(false);
      expect(result.current.error?.code).toBe("RECOVERY_TOKEN_INVALID");
      expect(currentTestUrl()).toBe("/auth/callback");

      let actionResult: { error?: { code: string } } | undefined;
      await act(async () => {
        actionResult = await result.current.updatePassword("new-pass-123");
      });
      expect(actionResult?.error?.code).toBe("RECOVERY_REQUIRED");
      expect(mockAuth.mockUpdateUser).not.toHaveBeenCalled();
    });

    it("degrades invalid hash tokens to a verification error without crashing", async () => {
      setTestUrl("/#access_token=fake&type=recovery");
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      mockAuth.mockSetSession.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "Invalid JWT" },
      });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.status).toBe("error");
      expect(result.current.isRecoveryMode).toBe(false);
      expect(result.current.state.recoveryAllowed).toBe(false);
      expect(currentTestUrl()).toBe("/");
    });

    it("enters recovery mode after a verified recovery code exchange", async () => {
      setTestUrl("/auth/callback?code=valid&type=recovery");
      const recoveryUser = createMockUser({ email: "recovery@biofold.org" });
      const recoverySession = createMockSession(recoveryUser);
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      mockAuth.mockExchangeCodeForSession.mockResolvedValueOnce({
        data: { session: recoverySession, user: recoveryUser, redirectType: "recovery" },
        error: null,
      });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.status).toBe("recovery");
      });

      expect(result.current.isRecoveryMode).toBe(true);
      expect(result.current.state.recoveryAllowed).toBe(true);
      expect(result.current.user?.email).toBe("recovery@biofold.org");
      expect(currentTestUrl()).toBe("/auth/callback");

      let actionResult: { error?: { code: string } } | undefined;
      await act(async () => {
        actionResult = await result.current.updatePassword("new-pass-123");
      });
      expect(actionResult?.error).toBeUndefined();
      expect(mockAuth.mockUpdateUser).toHaveBeenCalledWith({
        password: "new-pass-123",
      });
    });

    it("transitions to recovery mode on PASSWORD_RECOVERY event and allows password update", async () => {
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

      render(
        <AuthProvider adapter={adapter}>
          <TestConsumer />
        </AuthProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("is-loading")).toHaveTextContent("ready");
      });

      const recoveryUser = createMockUser({ email: "recovery@biofold.org" });
      const recoverySession = createMockSession(recoveryUser);

      act(() => {
        mockAuth.triggerAuthChange("PASSWORD_RECOVERY", recoverySession);
      });

      await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("recovery"));
      expect(screen.getByTestId("is-recovery")).toHaveTextContent("yes");
      expect(screen.getByTestId("user-email")).toHaveTextContent("recovery@biofold.org");

      // Perform password update in recovery mode
      act(() => {
        screen.getByRole("button", { name: "Update Password" }).click();
      });

      await waitFor(() => {
        expect(mockAuth.mockUpdateUser).toHaveBeenCalledWith({
          password: "new-pass-123",
        });
      });
    });

    it("blocks password update when unauthenticated and not in recovery mode", async () => {
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let actionResult: any;
      await act(async () => {
        actionResult = await result.current.updatePassword("new-pass-123");
      });

      expect(actionResult.error?.code).toBe("RECOVERY_REQUIRED");
      expect(result.current.error?.code).toBe("RECOVERY_REQUIRED");
      expect(mockAuth.mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe("completeCallback", () => {
    it("returns the sanitized internal next destination", async () => {
      setTestUrl("/auth/callback?code=valid&next=/app/lab");
      const mockAuth = createMockSupabaseAuth();
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let path: string | undefined;
      await act(async () => {
        path = await result.current.actions.completeCallback();
      });

      expect(path).toBe("/app/lab");
      expect(result.current.status).toBe("authenticated");
    });

    it("falls back to /app when the next destination is external", async () => {
      setTestUrl("/auth/callback?code=valid&next=https://evil.com/phish");
      const mockAuth = createMockSupabaseAuth();
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let path: string | undefined;
      await act(async () => {
        path = await result.current.actions.completeCallback();
      });

      expect(path).toBe("/app");
    });

    it("rejects when no session could be established", async () => {
      setTestUrl("/auth/callback?next=/app");
      const mockAuth = createMockSupabaseAuth({ initialSession: null, initialUser: null });
      const adapter = new SupabaseAuthAdapter(() => mockAuth.client);
      const { result } = mountHook(adapter);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.actions.completeCallback();
        } catch (err) {
          thrown = err;
        }
      });

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain("Sign-in could not be completed");
    });
  });

  it("updates user metadata and session when updateDisplayName succeeds", async () => {
    const mockAuth = createMockSupabaseAuth();
    const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Rosalind Franklin");
    });

    act(() => {
      screen.getByRole("button", { name: "Update Name" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Jane Doe");
    });
  });

  it("transitions to unauthenticated on signOut", async () => {
    const mockAuth = createMockSupabaseAuth();
    const adapter = new SupabaseAuthAdapter(() => mockAuth.client);

    render(
      <AuthProvider adapter={adapter}>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    act(() => {
      screen.getByRole("button", { name: "Sign Out" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated");
      expect(screen.getByTestId("user-email")).toHaveTextContent("none");
    });
  });
});
