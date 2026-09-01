export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailConfirmed: boolean;
  createdAt: string;
  lastSignInAt?: string;
  avatarUrl?: string;
  metadata: Record<string, unknown>;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: AuthUser;
}

export type AuthErrorCode =
  | "CONFIG_MISSING"
  | "INVALID_CREDENTIALS"
  | "USER_ALREADY_EXISTS"
  | "EMAIL_NOT_CONFIRMED"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "RECOVERY_TOKEN_INVALID"
  | "RECOVERY_REQUIRED"
  | "AUTH_CALLBACK_FAILED"
  | "SESSION_EXPIRED"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "OPERATION_CANCELLED"
  | "UNKNOWN_ERROR";

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
  originalError?: unknown;
}

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "recovery"
  | "unconfigured"
  | "error";

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

export interface SignInResult {
  session: AuthSession | null;
  user: AuthUser | null;
  error?: AuthError;
}

export interface SignUpResult {
  user: AuthUser | null;
  session: AuthSession | null;
  requiresEmailConfirmation: boolean;
  error?: AuthError;
}

export interface OAuthResult {
  url?: string;
  error?: AuthError;
}

export interface AuthActionResult {
  error?: AuthError;
}

export interface UpdateUserResult {
  user: AuthUser | null;
  error?: AuthError;
}

/** Distinguishes "no session" (anonymous) from a failed session verification. */
export interface GetSessionResult {
  session: AuthSession | null;
  error?: AuthError;
}

/**
 * Outcome of processing auth parameters found in the current URL.
 * `recovery` is only true when Supabase actually established a session from a
 * recovery link — never merely because the URL mentions `type=recovery`.
 */
export interface AuthRedirectOutcome {
  handled: boolean;
  session?: AuthSession | null;
  error?: AuthError;
  recovery?: boolean;
  /** Sanitized before URL credentials are removed. Never an external URL. */
  next?: string;
}

export interface AuthPort {
  isConfigured(): boolean;
  getSession(): Promise<GetSessionResult>;
  handleAuthRedirect(): Promise<AuthRedirectOutcome>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: AuthSession | null) => void,
  ): () => void;
  signInWithPassword(email: string, password: string): Promise<SignInResult>;
  signUpWithPassword(
    email: string,
    password: string,
    displayName?: string,
  ): Promise<SignUpResult>;
  signInWithGoogle(redirectTo?: string): Promise<OAuthResult>;
  signOut(): Promise<AuthActionResult>;
  requestPasswordRecovery(
    email: string,
    redirectTo?: string,
  ): Promise<AuthActionResult>;
  updatePassword(newPassword: string): Promise<AuthActionResult>;
  updateDisplayName(displayName: string): Promise<UpdateUserResult>;
  resendConfirmationEmail(email: string): Promise<AuthActionResult>;
}
