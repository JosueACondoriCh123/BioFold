import type { ComponentType } from "react";

/** Structural contract shared with the independently implemented auth module. */
export interface AuthSnapshot {
  status: "loading" | "authenticated" | "anonymous" | "unconfigured" | "error";
  user: { id: string; email: string; displayName: string } | null;
  recoveryAllowed: boolean;
  error?: string;
}

export interface AuthActions {
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { displayName: string; email: string; password: string }): Promise<void>;
  signInWithGoogle(returnTo?: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  completeCallback(): Promise<string>;
  updatePassword(password: string): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;
  signOut(): Promise<void>;
  retrySession(): Promise<void>;
}

export interface AuthContextValue { state: AuthSnapshot; actions: AuthActions }

export const PAGE_NAMES = [
  "LandingPage", "LoginPage", "SignupPage", "VerifyEmailPage", "ForgotPasswordPage",
  "AuthCallbackPage", "ResetPasswordPage", "DashboardPage", "AccountPage", "NotFoundPage",
  "VisionStudioPage",
] as const;
export type PlatformPages = Partial<Record<typeof PAGE_NAMES[number], ComponentType>> &
  Record<"LandingPage" | "LoginPage" | "SignupPage" | "VerifyEmailPage" | "ForgotPasswordPage" | "AuthCallbackPage" | "ResetPasswordPage" | "DashboardPage" | "AccountPage" | "NotFoundPage", ComponentType>;
