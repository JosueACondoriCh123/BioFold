import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback, Field, GoogleButton, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { authFormBlocked } from "../components/platform/authPresentation";
import { workspaceDestination } from "../components/platform/navigation";
import { useFormAction } from "../components/platform/useFormAction";

export default function LoginPage() {
  const { state, actions } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const form = useFormAction();
  const google = useFormAction();
  const next = workspaceDestination(new URLSearchParams(location.search).get("next"));
  const blocked = authFormBlocked(state);
  if (state.recoveryAllowed) return <Navigate to="/reset-password" replace />;
  if (state.status === "authenticated" && state.user && !form.pending) return <Navigate to={next} replace />;
  return <AuthLayout name="login" title="Sign in" heading="Welcome back." intro="Sign in to return to your molecular workspace.">
    <AuthAvailability /><Feedback error={form.error || google.error} />
    <GoogleButton disabled={blocked || form.pending || google.pending} onClick={() => { void google.run(() => actions.signInWithGoogle(next)); }} />
    {google.pending && <p className="bf-status" role="status">Connecting to Google…</p>}
    <div className="bf-divider"><span>or with email</span></div>
    <ValidatedForm name="Sign in" pending={form.pending} disabled={blocked || google.pending} onValid={async data => {
      if (await form.run(() => actions.signIn(String(data.get("email")).trim(), String(data.get("password"))))) navigate(next, { replace: true });
    }}>
      <Field label="Email address" name="email" type="email" autoComplete="username" maxLength={254} required placeholder="you@example.com" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <div className="bf-form-link"><Link to="/forgot-password">Forgot password?</Link></div>
      <SubmitButton pending={form.pending} busyLabel="Signing in…">Sign in</SubmitButton>
    </ValidatedForm>
    <p className="bf-form-footer">New to BioFold? <Link to={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link></p>
    <p className="bf-form-secondary"><Link to="/verify-email">Need a new confirmation email?</Link></p>
  </AuthLayout>;
}
