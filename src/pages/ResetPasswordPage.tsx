import { Link, useNavigate } from "react-router";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback, Field, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { authFormBlocked } from "../components/platform/authPresentation";
import { useFormAction } from "../components/platform/useFormAction";

export default function ResetPasswordPage() {
  const { state, actions } = useAuth();
  const navigate = useNavigate();
  const form = useFormAction();
  return <AuthLayout compact name="reset-password" title="Set new password" heading="Choose a new password." intro="Use a unique password that you don’t use for other accounts.">
    <AuthAvailability /><Feedback error={form.error} />
    {!state.recoveryAllowed ? <><Feedback error="A verified recovery link is required to change your password." /><Link to="/forgot-password">Request a new reset link</Link></> :
      <ValidatedForm name="Set new password" pending={form.pending} disabled={authFormBlocked(state)} validate={(data): Record<string, string> => data.get("password") !== data.get("confirmPassword") ? { confirmPassword: "Passwords do not match." } : {}} onValid={async data => {
        if (await form.run(() => actions.updatePassword(String(data.get("password"))))) navigate("/app", { replace: true, state: { passwordUpdated: true } });
      }}>
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Use at least 8 characters." />
        <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
        <SubmitButton pending={form.pending} busyLabel="Updating password…">Update password</SubmitButton>
      </ValidatedForm>}
  </AuthLayout>;
}
