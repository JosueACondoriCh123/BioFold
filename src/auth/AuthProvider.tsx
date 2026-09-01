import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AuthContext, type AuthContextValue } from "./authContextDef";
import { AuthSessionController } from "./authSessionController";
import { supabaseAuthAdapter } from "./supabaseAuthAdapter";
import type { AuthPort } from "./types";

export type { AuthContextValue, AuthSnapshot, AuthActions } from "./authContextDef";
export { AuthContext };

export interface AuthProviderProps { children: ReactNode; adapter?: AuthPort }

export function AuthProvider({ children, adapter = supabaseAuthAdapter }: AuthProviderProps) {
  const controller = useMemo(() => new AuthSessionController(adapter), [adapter]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => controller.start(), [controller]);
  const { status, session, recovery, error } = snapshot;
  const user = session?.user ?? null;
  const value: AuthContextValue = {
    state: {
      status: status === "recovery" ? "authenticated" : status === "unauthenticated" ? "anonymous" : status,
      user: user ? { id: user.id, email: user.email, displayName: user.displayName } : null,
      recoveryAllowed: recovery && Boolean(session), error: error?.message,
    },
    actions: controller.actions,
    user, session, status, error,
    isLoading: status === "loading", isAuthenticated: Boolean(session),
    isRecoveryMode: recovery && Boolean(session), isConfigured: adapter.isConfigured(),
    clearError: controller.clearError, signIn: controller.signIn, signUp: controller.signUp,
    signInWithGoogle: controller.signInWithGoogle, signOut: controller.signOut,
    requestPasswordRecovery: controller.requestPasswordRecovery, updatePassword: controller.updatePassword,
    updateDisplayName: controller.updateDisplayName, resendConfirmation: controller.resendConfirmation,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
