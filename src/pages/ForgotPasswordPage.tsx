import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback, Field, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { authFormBlocked } from "../components/platform/authPresentation";
import { useFormAction } from "../components/platform/useFormAction";

export default function ForgotPasswordPage() {
  const { state, actions } = useAuth();
  const form = useFormAction();
  const [sent, setSent] = useState(false);
  return <AuthLayout compact name="forgot-password" title="Password recovery" heading="Forgot your password?" intro="Enter the email address you use for BioFold. We’ll help you get back to your workspace.">
    <AuthAvailability /><Feedback error={form.error} message={sent ? "If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder." : undefined} />
    <ValidatedForm name="Password recovery" pending={form.pending} disabled={authFormBlocked(state)} onValid={async data => {
      setSent(false);
      if (await form.run(() => actions.requestPasswordReset(String(data.get("email")).trim()))) setSent(true);
    }}><Field label="Email address" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /><SubmitButton pending={form.pending} busyLabel="Sending reset link…">Send reset link</SubmitButton></ValidatedForm>
    <p className="bf-form-footer"><Link to="/login">Back to sign in</Link></p>
  </AuthLayout>;
}
