import type { AuthActions } from "./authContextDef";
import { sanitizeReturnPath } from "./authRedirect";
import { normalizeAuthError } from "./supabaseAuthAdapter";
import type { AuthActionResult, AuthError, AuthPort, AuthRedirectOutcome, AuthSession, AuthStatus } from "./types";

interface SessionState {
  status: AuthStatus;
  session: AuthSession | null;
  recovery: boolean;
  error: AuthError | null;
}

const cancelled = (): AuthError => ({
  code: "OPERATION_CANCELLED", message: "This action is no longer active. Please try again.", retryable: false,
});

/** Owns auth only. No molecular state or persisted recovery flags. */
export class AuthSessionController {
  private snapshot: SessionState = { status: "loading", session: null, recovery: false, error: null };
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private unsubscribe?: () => void;
  private redirectPromise?: Promise<AuthRedirectOutcome>;
  private callbackOutcome?: AuthRedirectOutcome;
  private initialization: Promise<void> = Promise.resolve();
  private checking = false;
  private verifyingUserId?: string;
  private pending?: "identity" | "profile" | "email";
  private logoutBlocked = false;
  private logoutPromise?: Promise<AuthActionResult>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly adapter: AuthPort) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(next: SessionState) {
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }
  private current(ticket: number) { return this.active && ticket === this.epoch; }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private accept(session: AuthSession | null, recovery = false, error: AuthError | null = null) {
    this.publish({ session: error ? null : session, recovery: !error && Boolean(session) && recovery,
      status: error ? "error" : session ? recovery ? "recovery" : "authenticated" : "unauthenticated", error });
  }

  start = () => {
    this.active = true;
    this.unsubscribe = this.adapter.onAuthStateChange((event, session) => {
      if (!this.active || event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        // Queue cleanup behind outstanding SDK calls: none may re-persist a late session.
        if (!this.logoutPromise) void this.signOut();
        return;
      }
      if (this.logoutBlocked || this.pending === "identity") return;
      if (this.checking && (!this.verifyingUserId || session?.user.id === this.verifyingUserId)) return;
      const changedUser = session?.user.id !== this.snapshot.session?.user.id;
      if (this.pending && !changedUser) return; // our SDK action owns its commit
      if (!session) {
        ++this.epoch;
        this.callbackOutcome = undefined;
        this.accept(null);
        return;
      }
      this.verifyEvent(session, event === "PASSWORD_RECOVERY" || (!changedUser && this.snapshot.recovery));
    });
    this.initialization = this.initialize();
    return () => {
      this.active = false;
      ++this.epoch;
      this.unsubscribe?.();
      this.unsubscribe = undefined;
    };
  };

  private async initialize(processRedirect = true) {
    const ticket = ++this.epoch;
    this.checking = true;
    this.verifyingUserId = undefined;
    this.publish({ status: "loading", session: null, recovery: false, error: null });
    try {
      // StrictMode replays effects; a PKCE code can only be exchanged once.
      if (processRedirect) this.redirectPromise ??= this.enqueue(() => this.adapter.handleAuthRedirect());
      const redirect = processRedirect ? await this.redirectPromise! : { handled: false };
      if (!this.current(ticket)) return;
      this.callbackOutcome = redirect;
      if (!this.adapter.isConfigured()) {
        this.publish({ status: "unconfigured", session: null, recovery: false, error: null });
        return;
      }
      if (redirect.error) { this.accept(null, false, redirect.error); return; }
      if (redirect.session) { this.accept(redirect.session, redirect.recovery === true); return; }
      const result = await this.enqueue(() => this.current(ticket) ? this.adapter.getSession() : Promise.resolve({ session: null }));
      if (this.current(ticket)) this.accept(result.session, false, result.error ?? null);
    } catch (error) {
      if (this.current(ticket)) this.accept(null, false, normalizeAuthError(error));
    } finally {
      if (this.current(ticket)) this.checking = false;
    }
  }

  private verifyEvent(candidate: AuthSession, recovery: boolean) {
    const ticket = ++this.epoch;
    const changedUser = candidate.user.id !== this.snapshot.session?.user.id;
    this.checking = true;
    this.verifyingUserId = candidate.user.id;
    this.pending = undefined;
    if (changedUser) {
      this.callbackOutcome = undefined;
      this.publish({ status: "loading", session: null, recovery: false, error: null });
    }
    // Never await another SDK method inside onAuthStateChange (SDK lock).
    void this.enqueue(async () => {
      if (!this.current(ticket)) return;
      try {
        const result = await this.adapter.getSession();
        if (!this.current(ticket)) return;
        if (result.error) this.accept(null, false, result.error);
        else if (result.session?.user.id === candidate.user.id) this.accept(result.session, recovery);
        else this.accept(null);
      } catch (error) {
        if (this.current(ticket)) this.accept(null, false, normalizeAuthError(error));
      } finally {
        if (this.current(ticket)) this.checking = false;
      }
    });
  }

  clearError = () => this.publish({ ...this.snapshot, error: null });

  private async perform<T extends AuthActionResult>(
    kind: "identity" | "profile" | "email", empty: T, work: () => Promise<T>, commit?: (result: T) => void,
  ): Promise<T> {
    if (!this.active || this.checking || this.pending || this.logoutPromise) return { ...empty, error: cancelled() };
    if (!this.adapter.isConfigured()) return { ...empty, error: { code: "CONFIG_MISSING", message: "Authentication is not configured.", retryable: false } };
    if (kind === "identity") {
      this.logoutBlocked = false;
      this.callbackOutcome = undefined;
      ++this.epoch;
      this.accept(null);
    }
    this.clearError();
    const ticket = this.epoch;
    this.pending = kind;
    try {
      const result = await this.enqueue(() => this.current(ticket) ? work() : Promise.resolve({ ...empty, error: cancelled() }));
      if (!this.current(ticket)) return { ...empty, error: cancelled() };
      if (result.error) this.publish({ ...this.snapshot, error: result.error });
      else commit?.(result);
      return result;
    } catch (error) {
      const normalized = this.current(ticket) ? normalizeAuthError(error) : cancelled();
      if (this.current(ticket)) this.publish({ ...this.snapshot, error: normalized });
      return { ...empty, error: normalized };
    } finally {
      if (this.current(ticket)) this.pending = undefined;
    }
  }

  signIn = (email: string, password: string) => this.perform(
    "identity", { session: null, user: null } as Awaited<ReturnType<AuthPort["signInWithPassword"]>>,
    () => this.adapter.signInWithPassword(email, password), result => this.accept(result.session),
  );
  signUp = (email: string, password: string, displayName?: string) => this.perform(
    "identity", { session: null, user: null, requiresEmailConfirmation: false } as Awaited<ReturnType<AuthPort["signUpWithPassword"]>>,
    () => this.adapter.signUpWithPassword(email, password, displayName), result => this.accept(result.session),
  );
  signInWithGoogle = (next?: string) => this.perform(
    "identity", {} as Awaited<ReturnType<AuthPort["signInWithGoogle"]>>, () => this.adapter.signInWithGoogle(next),
  );
  requestPasswordRecovery = (email: string, next?: string) => this.perform<AuthActionResult>(
    "email", {}, () => this.adapter.requestPasswordRecovery(email, next),
  );
  resendConfirmation = (email: string) => this.perform<AuthActionResult>("email", {}, () => this.adapter.resendConfirmationEmail(email));

  updateDisplayName = (name: string) => {
    const userId = this.snapshot.session?.user.id;
    if (!userId || this.snapshot.status !== "authenticated") return Promise.resolve({ user: null, error: cancelled() });
    return this.perform("profile", { user: null } as Awaited<ReturnType<AuthPort["updateDisplayName"]>>,
      () => this.adapter.updateDisplayName(name), result => {
        const session = this.snapshot.session;
        if (session && result.user?.id === userId) this.accept({ ...session, user: result.user });
      });
  };

  updatePassword = (password: string): Promise<AuthActionResult> => {
    if (!this.snapshot.session || !this.snapshot.recovery || this.snapshot.status !== "recovery") {
      const error: AuthError = { code: "RECOVERY_REQUIRED", message: "Open a verified password recovery link before setting a new password.", retryable: false };
      this.publish({ ...this.snapshot, error });
      return Promise.resolve({ error });
    }
    return this.perform<AuthActionResult>("profile", {}, () => this.adapter.updatePassword(password), () => {
      this.callbackOutcome = undefined;
      this.accept(this.snapshot.session);
    });
  };

  signOut = (): Promise<AuthActionResult> => {
    if (this.logoutPromise) return this.logoutPromise;
    const ticket = ++this.epoch;
    this.logoutBlocked = true;
    this.pending = undefined;
    this.checking = false;
    this.callbackOutcome = undefined;
    this.redirectPromise = Promise.resolve({ handled: false });
    // Revoke workspace access now; SDK cleanup follows queued mutations.
    this.publish({ status: "loading", session: null, recovery: false, error: null });
    const operation = this.enqueue(async () => {
      try { return await this.adapter.signOut(); }
      catch (error) { return { error: normalizeAuthError(error) }; }
    }).then(result => {
      if (this.current(ticket)) this.accept(null, false, result.error ?? null);
      return result;
    }).finally(() => { this.logoutPromise = undefined; });
    this.logoutPromise = operation;
    return operation;
  };

  completeCallback = async (): Promise<string> => {
    await this.initialization;
    const outcome = this.callbackOutcome;
    // React StrictMode can stop and restart the provider while the one-time PKCE
    // exchange is pending. Validate the active post-initialization state instead
    // of a ticket captured before that restart.
    if (!this.active || !outcome?.handled || outcome.error || !outcome.session
      || outcome.session.user.id !== this.snapshot.session?.user.id || this.snapshot.error) {
      throw new Error("Sign-in could not be completed. Request a new link and try again.");
    }
    return this.snapshot.recovery ? "/reset-password" : sanitizeReturnPath(outcome.next);
  };

  retrySession = async () => {
    if (this.logoutBlocked) { const result = await this.signOut(); if (result.error) throw new Error(result.error.message); return; }
    if (this.pending || this.checking) return;
    this.initialization = this.initialize(false);
    await this.initialization;
  };

  /** Stable, deliberately narrow interface consumed by pages. */
  actions: AuthActions = {
    signIn: async (email, password) => { this.throwError(await this.signIn(email, password)); },
    signUp: async input => { this.throwError(await this.signUp(input.email, input.password, input.displayName)); },
    signInWithGoogle: async next => {
      const operation = this.signInWithGoogle(next);
      const ticket = this.epoch;
      const result = await operation;
      this.throwError(result);
      if (!this.current(ticket) || this.logoutBlocked) throw new Error(cancelled().message);
      if (!result.url) throw new Error("Google sign-in could not be started. Please try again.");
      window.location.assign(result.url);
    },
    requestPasswordReset: async email => { this.throwError(await this.requestPasswordRecovery(email)); },
    resendVerification: async email => { this.throwError(await this.resendConfirmation(email)); },
    completeCallback: () => this.completeCallback(),
    updatePassword: async password => { this.throwError(await this.updatePassword(password)); },
    updateDisplayName: async name => { this.throwError(await this.updateDisplayName(name)); },
    signOut: async () => { this.throwError(await this.signOut()); },
    retrySession: () => this.retrySession(),
  };
  private throwError(result: AuthActionResult) { if (result.error) throw new Error(result.error.message); }
}
