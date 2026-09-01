import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback, Field, GoogleButton, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { authFormBlocked } from "../components/platform/authPresentation";
import { workspaceDestination } from "../components/platform/navigation";
import { useFormAction } from "../components/platform/useFormAction";

export default function SignupPage() {
  const { state, actions } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const form = useFormAction();
  const google = useFormAction();
  const next = workspaceDestination(new URLSearchParams(location.search).get("next"));
  if (state.recoveryAllowed) return <Navigate to="/reset-password" replace />;
  if (state.status === "authenticated" && state.user && !form.pending) return <Navigate to={next} replace />;
  return <AuthLayout name="signup" title="Create account" heading="A new perspective starts here." intro="Create your account and make room for a closer look.">
    <AuthAvailability /><Feedback error={form.error || google.error} />
    <GoogleButton disabled={authFormBlocked(state) || form.pending || google.pending} onClick={() => { void google.run(() => actions.signInWithGoogle(next)); }} />
    {google.pending && <p className="bf-status" role="status">Connecting to Google…</p>}
    <div className="bf-divider"><span>or with email</span></div>
    <ValidatedForm name="Create account" pending={form.pending} disabled={authFormBlocked(state) || google.pending} onValid={async data => {
      const email = String(data.get("email")).trim();
      if (await form.run(() => actions.signUp({ displayName: String(data.get("displayName")).trim(), email, password: String(data.get("password")) }))) navigate("/verify-email", { state: { email, returnTo: next } });
    }}>
      <Field label="Full name" name="displayName" autoComplete="name" maxLength={80} required placeholder="Your name" />
      <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Use at least 8 characters. A longer, unique password is best." />
      <SubmitButton pending={form.pending} busyLabel="Creating account…">Create account</SubmitButton>
    </ValidatedForm>
    <p className="bf-form-footer">Already have an account? <Link to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
  </AuthLayout>;
}
