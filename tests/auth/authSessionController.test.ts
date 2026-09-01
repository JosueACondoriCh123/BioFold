import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { AuthSessionController } from "../../src/auth/authSessionController";
import type { AuthChangeEvent, AuthPort, AuthSession, AuthRedirectOutcome, GetSessionResult, SignInResult, UpdateUserResult } from "../../src/auth/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function session(id = "researcher-a"): AuthSession {
  return { accessToken: `test-token-${id}`, user: { id, email: `${id}@example.test`, displayName: id,
    emailConfirmed: true, createdAt: "2026-08-01", metadata: {} } };
}
const stops: Array<() => void> = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); });

function harness(initial: AuthSession | null = session()) {
  let handler: (event: AuthChangeEvent, value: AuthSession | null) => void = () => {};
  const port = {
    isConfigured: () => true,
    getSession: vi.fn<AuthPort["getSession"]>().mockResolvedValue({ session: initial }),
    handleAuthRedirect: vi.fn<AuthPort["handleAuthRedirect"]>().mockResolvedValue({ handled: false }),
    onAuthStateChange: vi.fn<AuthPort["onAuthStateChange"]>().mockImplementation(callback => {
      handler = callback;
      return () => { handler = () => {}; };
    }),
    signInWithPassword: vi.fn<AuthPort["signInWithPassword"]>().mockResolvedValue({ session: session(), user: session().user }),
    signUpWithPassword: vi.fn<AuthPort["signUpWithPassword"]>().mockResolvedValue({ session: null, user: null, requiresEmailConfirmation: true }),
    signInWithGoogle: vi.fn<AuthPort["signInWithGoogle"]>().mockResolvedValue({ url: "https://accounts.google.com" }),
    signOut: vi.fn<AuthPort["signOut"]>().mockResolvedValue({}),
    requestPasswordRecovery: vi.fn<AuthPort["requestPasswordRecovery"]>().mockResolvedValue({}),
    updatePassword: vi.fn<AuthPort["updatePassword"]>().mockResolvedValue({}),
    updateDisplayName: vi.fn<AuthPort["updateDisplayName"]>().mockResolvedValue({ user: session().user }),
    resendConfirmationEmail: vi.fn<AuthPort["resendConfirmationEmail"]>().mockResolvedValue({}),
  } satisfies AuthPort;
  const controller = new AuthSessionController(port);
  return { port, controller, event: (event: AuthChangeEvent, value: AuthSession | null) => handler(event, value),
    start: () => { const stop = controller.start(); stops.push(stop); return stop; },
    ready: () => waitFor(() => expect(controller.getSnapshot().status).not.toBe("loading")),
  };
}

describe("auth session lifetime", () => {
  it("replays StrictMode effects but exchanges the code once and retains the recovery destination", async () => {
    const h = harness(null);
    const redirect = deferred<AuthRedirectOutcome>();
    h.port.handleAuthRedirect.mockReturnValue(redirect.promise);
    h.start()();
    h.start();
    redirect.resolve({ handled: true, session: session(), recovery: true, next: "/app/lab" });
    await h.ready();
    expect(h.port.handleAuthRedirect).toHaveBeenCalledTimes(1);
    await expect(h.controller.actions.completeCallback()).resolves.toBe("/reset-password");
    await expect(h.controller.actions.completeCallback()).resolves.toBe("/reset-password");
    expect(h.controller.getSnapshot().recovery).toBe(true);
    expect(h.port.getSession).not.toHaveBeenCalled();
  });

  it("does not accept an old session as evidence of a missing callback", async () => {
    const h = harness(); h.start(); await h.ready();
    await expect(h.controller.actions.completeCallback()).rejects.toThrow("Sign-in could not");
  });

  it("retains callback failure instead of falling back to an existing session", async () => {
    const h = harness();
    h.port.handleAuthRedirect.mockResolvedValue({ handled: true, error: { code: "AUTH_CALLBACK_FAILED", message: "Invalid link", retryable: false } });
    h.start(); await h.ready();
    expect(h.controller.getSnapshot().status).toBe("error");
    expect(h.controller.getSnapshot().session).toBeNull();
    expect(h.port.getSession).not.toHaveBeenCalled();
    await expect(h.controller.completeCallback()).rejects.toThrow();
  });

  it("ignores the SDK cached INITIAL_SESSION while server verification is pending", async () => {
    const h = harness(null); const check = deferred<GetSessionResult>();
    h.port.getSession.mockReturnValueOnce(check.promise);
    h.start(); await waitFor(() => expect(h.port.getSession).toHaveBeenCalled());
    h.event("INITIAL_SESSION", session());
    expect(h.controller.getSnapshot().status).toBe("loading");
    expect(h.controller.getSnapshot().session).toBeNull();
    check.resolve({ session: null }); await h.ready();
    expect(h.controller.getSnapshot().status).toBe("unauthenticated");
  });

  it("clears access immediately during logout and discards a late initial session", async () => {
    const h = harness(); const check = deferred<GetSessionResult>();
    h.port.getSession.mockReturnValueOnce(check.promise);
    h.start(); await waitFor(() => expect(h.port.getSession).toHaveBeenCalled());
    const logout = h.controller.actions.signOut();
    expect(h.controller.getSnapshot().session).toBeNull();
    check.resolve({ session: session() }); await logout;
    expect(h.controller.getSnapshot().status).toBe("unauthenticated");
    h.event("SIGNED_IN", session());
    h.event("PASSWORD_RECOVERY", session());
    expect(h.controller.getSnapshot().session).toBeNull();
    expect(h.controller.getSnapshot().recovery).toBe(false);
  });

  it("queues SDK logout after a pending login, never allowing its late event to restore access", async () => {
    const h = harness(null); h.start(); await h.ready();
    const login = deferred<SignInResult>();
    h.port.signInWithPassword.mockReturnValueOnce(login.promise);
    const signingIn = h.controller.signIn("researcher-a@example.test", "password-123");
    await waitFor(() => expect(h.port.signInWithPassword).toHaveBeenCalled());
    const logout = h.controller.signOut();
    expect(h.port.signOut).not.toHaveBeenCalled();
    h.event("SIGNED_IN", session());
    expect(h.controller.getSnapshot().session).toBeNull();
    login.resolve({ session: session(), user: session().user });
    expect((await signingIn).error?.code).toBe("OPERATION_CANCELLED");
    await logout;
    expect(h.port.signOut).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().session).toBeNull();
  });

  it("allows explicit login and password recovery requests after completed logout", async () => {
    const h = harness(); h.start(); await h.ready();
    await h.controller.actions.signOut();
    await expect(h.controller.actions.requestPasswordReset("a@example.test")).resolves.toBeUndefined();
    await h.controller.actions.signIn("a@example.test", "password-123");
    expect(h.controller.getSnapshot().session?.user.id).toBe("researcher-a");
  });

  it("handles a remote signout during a profile update without stale user data", async () => {
    const h = harness(); h.start(); await h.ready();
    const update = deferred<UpdateUserResult>(); h.port.updateDisplayName.mockReturnValueOnce(update.promise);
    const saving = h.controller.updateDisplayName("New name");
    await waitFor(() => expect(h.port.updateDisplayName).toHaveBeenCalled());
    h.event("SIGNED_OUT", null);
    expect(h.controller.getSnapshot().session).toBeNull();
    update.resolve({ user: { ...session().user, displayName: "New name" } });
    expect((await saving).error?.code).toBe("OPERATION_CANCELLED");
    await h.ready(); expect(h.controller.getSnapshot().session).toBeNull();
  });

  it("does not apply a profile result to a different user", async () => {
    const h = harness(); h.start(); await h.ready();
    const update = deferred<UpdateUserResult>(); h.port.updateDisplayName.mockReturnValueOnce(update.promise);
    const saving = h.controller.updateDisplayName("Old user's name");
    await waitFor(() => expect(h.port.updateDisplayName).toHaveBeenCalled());
    h.port.getSession.mockResolvedValue({ session: session("researcher-b") });
    h.event("SIGNED_IN", session("researcher-b"));
    expect(h.controller.getSnapshot().session).toBeNull();
    update.resolve({ user: { ...session().user, displayName: "Old user's name" } });
    expect((await saving).error?.code).toBe("OPERATION_CANCELLED");
    await h.ready();
    expect(h.controller.getSnapshot().session?.user.displayName).toBe("researcher-b");
  });

  it("invalidates an older verification when another user arrives", async () => {
    const h = harness(); h.start(); await h.ready();
    const first = deferred<GetSessionResult>(); h.port.getSession.mockReturnValueOnce(first.promise);
    h.event("SIGNED_IN", session("researcher-b"));
    await waitFor(() => expect(h.port.getSession).toHaveBeenCalledTimes(2));
    h.port.getSession.mockResolvedValue({ session: session("researcher-c") });
    h.event("SIGNED_IN", session("researcher-c"));
    first.resolve({ session: session("researcher-b") });
    await h.ready();
    expect(h.controller.getSnapshot().session?.user.id).toBe("researcher-c");
  });

  it("blocks password changes for ordinary authenticated sessions and null recovery events", async () => {
    const h = harness(); h.start(); await h.ready();
    await expect(h.controller.actions.updatePassword("password-123")).rejects.toThrow("verified password recovery");
    h.event("PASSWORD_RECOVERY", null);
    expect(h.controller.getSnapshot().recovery).toBe(false);
    expect(h.port.updatePassword).not.toHaveBeenCalled();
  });

  it("consumes recovery permission once and keeps it when the update fails", async () => {
    const h = harness();
    h.port.handleAuthRedirect.mockResolvedValue({ handled: true, session: session(), recovery: true });
    h.start(); await h.ready();
    h.port.updatePassword.mockResolvedValueOnce({ error: { code: "NETWORK_ERROR", message: "Offline", retryable: true } });
    await expect(h.controller.actions.updatePassword("password-123")).rejects.toThrow("Offline");
    expect(h.controller.getSnapshot().recovery).toBe(true);
    await h.controller.actions.updatePassword("password-123");
    expect(h.controller.getSnapshot().recovery).toBe(false);
    await expect(h.controller.actions.updatePassword("another-password")).rejects.toThrow();
    expect(h.port.updatePassword).toHaveBeenCalledTimes(2);
  });

  it("does not replay a cached successful callback when rechecking an expired session", async () => {
    const h = harness(null);
    h.port.handleAuthRedirect.mockResolvedValue({ handled: true, session: session() });
    h.start(); await h.ready();
    await h.controller.actions.retrySession();
    expect(h.controller.getSnapshot().session).toBeNull();
    expect(h.port.handleAuthRedirect).toHaveBeenCalledTimes(1);
    await expect(h.controller.completeCallback()).rejects.toThrow();
  });

  it("keeps the workspace closed when logout fails and retries logout instead of restoring storage", async () => {
    const h = harness(); h.start(); await h.ready();
    h.port.signOut.mockResolvedValueOnce({ error: { code: "NETWORK_ERROR", message: "Offline", retryable: true } });
    await expect(h.controller.actions.signOut()).rejects.toThrow("Offline");
    expect(h.controller.getSnapshot().status).toBe("error");
    expect(h.controller.getSnapshot().session).toBeNull();
    h.event("SIGNED_IN", session());
    await h.controller.actions.retrySession();
    expect(h.port.signOut).toHaveBeenCalledTimes(2);
    expect(h.controller.getSnapshot().session).toBeNull();
  });

  it("ignores a late result after unmount and rejects duplicate submissions", async () => {
    const h = harness(null); const stop = h.start(); await h.ready();
    const login = deferred<SignInResult>(); h.port.signInWithPassword.mockReturnValueOnce(login.promise);
    const first = h.controller.signIn("a@example.test", "password-123");
    await waitFor(() => expect(h.port.signInWithPassword).toHaveBeenCalled());
    expect((await h.controller.signIn("a@example.test", "password-123")).error?.code).toBe("OPERATION_CANCELLED");
    stop(); const before = h.controller.getSnapshot();
    login.resolve({ session: session(), user: session().user });
    expect((await first).error?.code).toBe("OPERATION_CANCELLED");
    expect(h.controller.getSnapshot()).toBe(before);
    expect(h.port.signInWithPassword).toHaveBeenCalledTimes(1);
  });
});
