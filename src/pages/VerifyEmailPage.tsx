import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { MailCheck } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback, Field, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { authFormBlocked, emailFromNavigation } from "../components/platform/authPresentation";
import { workspaceDestination } from "../components/platform/navigation";
import { useFormAction } from "../components/platform/useFormAction";

export default function VerifyEmailPage() {
  const { state, actions } = useAuth();
  const location = useLocation();
  const form = useFormAction();
  const [sent, setSent] = useState(false);
  const next = workspaceDestination(location.state?.returnTo);
  if (state.status === "authenticated" && state.user && !state.recoveryAllowed) return <Navigate to={next} replace />;
  return <AuthLayout compact name="verify-email" title="Confirm your email" heading="Check your inbox." intro="Open the confirmation link in your email to finish creating your account.">
    <div className="bf-message-icon"><MailCheck size={26} aria-hidden="true" /></div>
    <p className="bf-body-note">Keep this browser available while you confirm. If the message hasn’t arrived, check your spam folder or request another below.</p>
    <AuthAvailability /><Feedback error={form.error} message={sent ? "Confirmation requested. If your account needs verification, check your inbox." : undefined} />
    <ValidatedForm name="Resend confirmation" pending={form.pending} disabled={authFormBlocked(state)} onValid={async data => {
      setSent(false);
      if (await form.run(() => actions.resendVerification(String(data.get("email")).trim()))) setSent(true);
    }}>
      <Field label="Email address" name="email" type="email" autoComplete="email" maxLength={254} required defaultValue={emailFromNavigation(location.state)} />
      <SubmitButton pending={form.pending} busyLabel="Requesting confirmation…">Resend confirmation</SubmitButton>
    </ValidatedForm><p className="bf-form-footer"><Link to={`/login?next=${encodeURIComponent(next)}`}>Back to sign in</Link></p>
  </AuthLayout>;
}
