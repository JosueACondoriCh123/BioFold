import { createContext } from "react";
import type {
  AuthActionResult,
  AuthError,
  AuthSession,
  AuthStatus,
  AuthUser,
  OAuthResult,
  SignInResult,
  SignUpResult,
  UpdateUserResult,
} from "./types";

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

export interface AuthContextValue {
  state: AuthSnapshot;
  actions: AuthActions;
  user: AuthUser | null;
  session: AuthSession | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isRecoveryMode: boolean;
  isConfigured: boolean;
  error: AuthError | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<SignUpResult>;
  signInWithGoogle: (returnTo?: string) => Promise<OAuthResult>;
  signOut: () => Promise<AuthActionResult>;
  requestPasswordRecovery: (
    email: string,
    redirectTo?: string,
  ) => Promise<AuthActionResult>;
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
  updateDisplayName: (displayName: string) => Promise<UpdateUserResult>;
  resendConfirmation: (email: string) => Promise<AuthActionResult>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
