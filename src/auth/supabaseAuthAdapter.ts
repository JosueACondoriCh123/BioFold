import type { SupabaseClient, User, Session, AuthChangeEvent as SupabaseAuthChangeEvent } from "@supabase/supabase-js";
import { buildCallbackRedirect, parseAuthRedirect, sanitizeReturnPath, stripAuthParams } from "./authRedirect";
import { getSupabaseClient } from "./supabaseClient";
import type {
  AuthActionResult,
  AuthChangeEvent,
  AuthError,
  AuthPort,
  AuthRedirectOutcome,
  AuthSession,
  AuthUser,
  GetSessionResult,
  OAuthResult,
  SignInResult,
  SignUpResult,
  UpdateUserResult,
} from "./types";

export function mapSupabaseUser(user: User): AuthUser {
  const metadata = user.user_metadata || {};
  const metaName =
    typeof metadata.full_name === "string" && metadata.full_name.trim()
      ? metadata.full_name.trim()
      : typeof metadata.name === "string" && metadata.name.trim()
        ? metadata.name.trim()
        : typeof metadata.display_name === "string" && metadata.display_name.trim()
          ? metadata.display_name.trim()
          : undefined;

  const email = user.email || "";
  const displayName = metaName || (email ? email.split("@")[0] : "User");

  return {
    id: user.id,
    email,
    displayName,
    emailConfirmed: Boolean(user.email_confirmed_at || (user as unknown as { confirmed_at?: string }).confirmed_at),
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at,
    avatarUrl:
      typeof metadata.avatar_url === "string"
        ? metadata.avatar_url
        : typeof metadata.picture === "string"
          ? metadata.picture
          : undefined,
    metadata,
  };
}

export function mapSupabaseSession(session: Session | null): AuthSession | null {
  if (!session || !session.user) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: mapSupabaseUser(session.user),
  };
}

export function normalizeAuthError(error: unknown): AuthError {
  if (!error) {
    return {
      code: "UNKNOWN_ERROR",
      message: "An unexpected authentication error occurred.",
      retryable: false,
    };
  }

  const err = error as {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
  };
  const message = String(err.message || "Authentication failed.").trim();
  const lowerMsg = message.toLowerCase();
  const rawCode = String(err.code || "").toLowerCase();

  if (
    lowerMsg.includes("failed to fetch") ||
    lowerMsg.includes("networkerror") ||
    lowerMsg.includes("network error") ||
    err.name === "FetchError" ||
    err.status === 0
  ) {
    return {
      code: "NETWORK_ERROR",
      message: "Unable to connect to the authentication server. Check your internet connection.",
      retryable: true,
      originalError: error,
    };
  }

  if (
    rawCode === "invalid_credentials" ||
    rawCode === "invalid_grant" ||
    lowerMsg.includes("invalid login credentials") ||
    lowerMsg.includes("invalid email or password")
  ) {
    return {
      code: "INVALID_CREDENTIALS",
      message: "Incorrect email or password.",
      retryable: false,
      originalError: error,
    };
  }

  if (
    rawCode === "user_already_exists" ||
    lowerMsg.includes("user already registered") ||
    lowerMsg.includes("already registered")
  ) {
    return {
      code: "USER_ALREADY_EXISTS",
      message: "An account with this email already exists.",
      retryable: false,
      originalError: error,
    };
  }

  if (
    rawCode === "email_not_confirmed" ||
    lowerMsg.includes("email not confirmed") ||
    lowerMsg.includes("email link is invalid or has expired")
  ) {
    return {
      code: "EMAIL_NOT_CONFIRMED",
      message: "Email address is not confirmed. Please check your inbox for the confirmation link.",
      retryable: false,
      originalError: error,
    };
  }

  if (
    rawCode === "weak_password" ||
    lowerMsg.includes("password should be at least") ||
    lowerMsg.includes("password is too short")
  ) {
    return {
      code: "WEAK_PASSWORD",
      message: "Choose a stronger password with at least 8 characters.",
      retryable: false,
      originalError: error,
    };
  }

  if (
    rawCode === "otp_expired" ||
    rawCode === "bad_jwt" ||
    lowerMsg.includes("token has expired") ||
    lowerMsg.includes("invalid token") ||
    lowerMsg.includes("token is expired or invalid")
  ) {
    return {
      code: "RECOVERY_TOKEN_INVALID",
      message: "The recovery token is invalid or has expired. Please request a new recovery link.",
      retryable: false,
      originalError: error,
    };
  }

  if (
    rawCode === "invalid_email" ||
    lowerMsg.includes("invalid email") ||
    lowerMsg.includes("unable to validate email")
  ) {
    return {
      code: "INVALID_EMAIL",
      message: "Please provide a valid email address.",
      retryable: false,
      originalError: error,
    };
  }

  if (err.status === 429 || rawCode.includes("rate_limit")) {
    return { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes and try again.", retryable: true };
  }
  if (err.status === 401 || err.status === 403 || rawCode === "session_not_found") {
    return { code: "SESSION_EXPIRED", message: "Your session is no longer valid. Please sign in again.", retryable: false };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "Authentication could not be completed. Please try again.",
    retryable: err.status ? err.status >= 500 : false,
    originalError: error,
  };
}

function unconfiguredError(): AuthError {
  return {
    code: "CONFIG_MISSING",
    message: "Authentication backend is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your environment.",
    retryable: false,
  };
}

function redirectError(error: unknown, type?: string): AuthError {
  if (type === "recovery") {
    return {
      code: "RECOVERY_TOKEN_INVALID",
      message: "The recovery link is invalid or has expired. Please request a new recovery link.",
      retryable: false,
      originalError: error,
    };
  }
  return {
    code: "AUTH_CALLBACK_FAILED",
    message: "This sign-in link is invalid, expired or already used. Please request a new link.",
    retryable: false,
  };
}

export class SupabaseAuthAdapter implements AuthPort {
  constructor(private readonly clientGetter: () => SupabaseClient | null = getSupabaseClient) {}

  private getClient(): SupabaseClient | null {
    return this.clientGetter();
  }

  isConfigured(): boolean {
    return this.getClient() !== null;
  }

  async getSession(): Promise<GetSessionResult> {
    const client = this.getClient();
    if (!client) return { session: null, error: unconfiguredError() };

    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        return { session: null, error: normalizeAuthError(error) };
      }
      if (!data.session) return { session: null };
      // Storage is only a candidate session. Verify the identity with Auth before
      // allowing the workspace to mount; never authorize from editable metadata.
      const verified = await client.auth.getUser(data.session.access_token);
      if (verified.error) return { session: null, error: normalizeAuthError(verified.error) };
      if (!verified.data.user || verified.data.user.id !== data.session.user.id) {
        return { session: null, error: { code: "SESSION_EXPIRED", message: "Your session is no longer valid. Please sign in again.", retryable: false } };
      }
      const latest = await client.auth.getSession();
      if (latest.error || latest.data.session?.access_token !== data.session.access_token) {
        return { session: null, error: { code: "SESSION_EXPIRED", message: "Your session changed while it was being checked. Please retry.", retryable: true } };
      }
      return { session: mapSupabaseSession({ ...data.session, user: verified.data.user }) };
    } catch (err) {
      return { session: null, error: normalizeAuthError(err) };
    }
  }

  async handleAuthRedirect(): Promise<AuthRedirectOutcome> {
    if (typeof window === "undefined") return { handled: false };

    const href = window.location.href;
    const info = parseAuthRedirect(href);
    if (!info.hasAuthParams && !info.needsCleaning) return { handled: false };

    const cleanUrl = () => {
      try {
        const cleaned = stripAuthParams(href);
        if (cleaned !== href) {
          window.history.replaceState(window.history.state, "", cleaned);
        }
      } catch {
        // history is unavailable — the outcome still reports the exchange result
      }
    };

    // Remove credentials immediately, including on a slow exchange or failure.
    cleanUrl();
    const client = this.getClient();
    if (!client) {
      return { handled: true, error: unconfiguredError() };
    }

    if (info.error || info.errorDescription) {
      return {
        handled: true,
        error: {
          code: "AUTH_CALLBACK_FAILED",
          message: "Sign-in was not completed. Please try again or request a new link.",
          retryable: false,
        },
      };
    }

    try {
      const hasImplicitTokens = Boolean(info.accessToken || info.refreshToken || info.providerToken);
      // This app initiates PKCE only. A bearer token plus an editable type marker
      // is not evidence of recovery. Reject old implicit/mixed callbacks safely.
      if (hasImplicitTokens || (info.code && info.tokenHash)) {
        return { handled: true, error: redirectError(undefined, info.type) };
      }
      if (info.code) {
        const { data, error } = info.flowId
          ? await client.auth.exchangeCodeForSession(info.code, { flowId: info.flowId })
          : await client.auth.exchangeCodeForSession(info.code);
        if (error || !data?.session) {
          return { handled: true, error: redirectError(error, info.type) };
        }
        return {
          handled: true,
          session: mapSupabaseSession(data.session),
          // auth-js 2.112 returns redirectType at runtime but its public
          // AuthTokenResponse omits that field. Narrow it without a type assertion.
          recovery: "redirectType" in data && data.redirectType === "recovery",
          next: sanitizeReturnPath(info.next),
        };
      }

      if (info.tokenHash) {
        const type = info.type;
        if (type !== "email" && type !== "signup" && type !== "recovery") {
          return { handled: true, error: redirectError(undefined) };
        }
        const { data, error } = await client.auth.verifyOtp({ token_hash: info.tokenHash, type });
        if (error || !data?.session) {
          return { handled: true, error: redirectError(error, info.type) };
        }
        return {
          handled: true,
          session: mapSupabaseSession(data.session),
          recovery: info.type === "recovery",
          next: sanitizeReturnPath(info.next),
        };
      }

      // Auth parameters are present but nothing can be exchanged (e.g. a bare
      // `type=recovery` marker): clean the URL and resolve the session normally.
      return { handled: true };
    } catch (err) {
      return { handled: true, error: redirectError(err, info.type) };
    }
  }

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: AuthSession | null) => void,
  ): () => void {
    const client = this.getClient();
    if (!client) {
      return () => undefined;
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((sbEvent: SupabaseAuthChangeEvent, sbSession: Session | null) => {
      let mappedEvent: AuthChangeEvent = "SIGNED_IN";
      switch (sbEvent) {
        case "SIGNED_IN":
          mappedEvent = "SIGNED_IN";
          break;
        case "SIGNED_OUT":
          mappedEvent = "SIGNED_OUT";
          break;
        case "TOKEN_REFRESHED":
          mappedEvent = "TOKEN_REFRESHED";
          break;
        case "USER_UPDATED":
          mappedEvent = "USER_UPDATED";
          break;
        case "PASSWORD_RECOVERY":
          mappedEvent = "PASSWORD_RECOVERY";
          break;
        case "INITIAL_SESSION":
          mappedEvent = "INITIAL_SESSION";
          break;
        default:
          mappedEvent = "SIGNED_IN";
      }

      callback(mappedEvent, mapSupabaseSession(sbSession));
    });

    return () => {
      subscription.unsubscribe();
    };
  }

  async signInWithPassword(email: string, password: string): Promise<SignInResult> {
    const client = this.getClient();
    if (!client) return { session: null, user: null, error: unconfiguredError() };

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return {
        session: null,
        user: null,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email and password are required.",
          retryable: false,
        },
      };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        return { session: null, user: null, error: normalizeAuthError(error) };
      }

      return {
        session: mapSupabaseSession(data.session),
        user: data.user ? mapSupabaseUser(data.user) : null,
      };
    } catch (err) {
      return { session: null, user: null, error: normalizeAuthError(err) };
    }
  }

  async signUpWithPassword(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<SignUpResult> {
    const client = this.getClient();
    if (!client) {
      return {
        user: null,
        session: null,
        requiresEmailConfirmation: false,
        error: unconfiguredError(),
      };
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return {
        user: null,
        session: null,
        requiresEmailConfirmation: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Email and password are required.",
          retryable: false,
        },
      };
    }

    if (password.length < 8) {
      return {
        user: null,
        session: null,
        requiresEmailConfirmation: false,
        error: {
          code: "WEAK_PASSWORD",
          message: "Password must be at least 8 characters long.",
          retryable: false,
        },
      };
    }

    try {
      const trimmedName = displayName?.trim();
      const { data, error } = await client.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: trimmedName ? { full_name: trimmedName } : undefined,
          emailRedirectTo: typeof window === "undefined" ? undefined : buildCallbackRedirect(window.location.origin),
        },
      });

      if (error) {
        return {
          user: null,
          session: null,
          requiresEmailConfirmation: false,
          error: normalizeAuthError(error),
        };
      }

      const session = mapSupabaseSession(data.session);
      const user = data.user ? mapSupabaseUser(data.user) : null;
      const requiresEmailConfirmation = Boolean(user && !session);

      return {
        user,
        session,
        requiresEmailConfirmation,
      };
    } catch (err) {
      return {
        user: null,
        session: null,
        requiresEmailConfirmation: false,
        error: normalizeAuthError(err),
      };
    }
  }

  async signInWithGoogle(returnTo?: string): Promise<OAuthResult> {
    const client = this.getClient();
    if (!client) return { error: unconfiguredError() };
    if (typeof window === "undefined") {
      return {
        error: {
          code: "UNKNOWN_ERROR",
          message: "Google sign-in requires a browser environment.",
          retryable: false,
        },
      };
    }

    try {
      // The OAuth return URL is always this origin's callback; `returnTo` is
      // restricted to an internal app path instead of a raw redirect target.
      const redirectTo = buildCallbackRedirect(window.location.origin, returnTo);

      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          // The provider owns navigation after the guarded request completes.
          skipBrowserRedirect: true,
          scopes: "openid email profile",
        },
      });

      if (error) {
        return { error: normalizeAuthError(error) };
      }

      return { url: data.url };
    } catch (err) {
      return { error: normalizeAuthError(err) };
    }
  }

  async signOut(): Promise<AuthActionResult> {
    const client = this.getClient();
    if (!client) return { error: unconfiguredError() };

    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) {
        return { error: normalizeAuthError(error) };
      }
      return {};
    } catch (err) {
      return { error: normalizeAuthError(err) };
    }
  }

  async requestPasswordRecovery(email: string, redirectTo?: string): Promise<AuthActionResult> {
    const client = this.getClient();
    if (!client) return { error: unconfiguredError() };

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return {
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address.",
          retryable: false,
        },
      };
    }

    try {
      // All email links use the same verified callback. Only the verified
      // recovery outcome may navigate to /reset-password, never a URL flag.
      const targetRedirect =
        typeof window !== "undefined" ? buildCallbackRedirect(window.location.origin, redirectTo) : undefined;

      const { error } = await client.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: targetRedirect,
      });

      if (error) {
        return { error: normalizeAuthError(error) };
      }

      return {};
    } catch (err) {
      return { error: normalizeAuthError(err) };
    }
  }

  async updatePassword(newPassword: string): Promise<AuthActionResult> {
    const client = this.getClient();
    if (!client) return { error: unconfiguredError() };

    if (!newPassword || newPassword.length < 8) {
      return {
        error: {
          code: "WEAK_PASSWORD",
          message: "Password must be at least 8 characters long.",
          retryable: false,
        },
      };
    }

    try {
      const { error } = await client.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { error: normalizeAuthError(error) };
      }

      return {};
    } catch (err) {
      return { error: normalizeAuthError(err) };
    }
  }

  async updateDisplayName(displayName: string): Promise<UpdateUserResult> {
    const client = this.getClient();
    if (!client) return { user: null, error: unconfiguredError() };

    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length > 80) {
      return {
        user: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: "Display name must contain between 1 and 80 characters.",
          retryable: false,
        },
      };
    }

    try {
      const { data, error } = await client.auth.updateUser({
        data: { full_name: trimmedName },
      });

      if (error) {
        return { user: null, error: normalizeAuthError(error) };
      }

      return {
        user: data.user ? mapSupabaseUser(data.user) : null,
      };
    } catch (err) {
      return { user: null, error: normalizeAuthError(err) };
    }
  }

  async resendConfirmationEmail(email: string): Promise<AuthActionResult> {
    const client = this.getClient();
    if (!client) return { error: unconfiguredError() };

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return {
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address.",
          retryable: false,
        },
      };
    }

    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: { emailRedirectTo: typeof window === "undefined" ? undefined : buildCallbackRedirect(window.location.origin) },
      });

      if (error) {
        return { error: normalizeAuthError(error) };
      }

      return {};
    } catch (err) {
      return { error: normalizeAuthError(err) };
    }
  }
}

export const supabaseAuthAdapter = new SupabaseAuthAdapter();
