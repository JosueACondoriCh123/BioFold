import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { AuthLayout } from "../components/platform/PlatformLayout";
import { AuthAvailability, Feedback } from "../components/platform/AuthForm";
import { authFormBlocked } from "../components/platform/authPresentation";
import { workspaceDestination } from "../components/platform/navigation";

export default function AuthCallbackPage() {
  const { state, actions } = useAuth();
  const navigate = useNavigate();
  const operation = useRef<Promise<string> | null>(null);
  const [error, setError] = useState("");
  const blocked = authFormBlocked(state);
  useEffect(() => {
    if (blocked) return;
    let current = true;
    // Reuse the same operation if React replays the effect; never exchange a code twice.
    operation.current ??= Promise.resolve().then(() => actions.completeCallback());
    void operation.current.then(destination => {
      if (current) navigate(destination === "/reset-password" ? destination : workspaceDestination(destination), { replace: true });
    }).catch(() => {
      if (current) setError("This link could not be verified. It may have expired or already been used. Please sign in or request a new link.");
    });
    return () => { current = false; };
  }, [actions, blocked, navigate]);
  return <AuthLayout compact name="auth-callback" title="Verify your link" heading="Verifying your link." intro="We’re checking your email confirmation or secure sign-in link.">
    <AuthAvailability /><Feedback error={error} />
    {!error && !blocked && <div className="bf-callback-status" role="status" aria-busy="true"><LoaderCircle className="bf-spin" size={26} aria-hidden="true" /><p>Verifying your account…</p></div>}
    {(error || blocked) && <div className="bf-recovery-links"><Link to="/login">Back to sign in</Link><Link to="/forgot-password">Request a password reset</Link><Link to="/verify-email">Request a confirmation email</Link></div>}
  </AuthLayout>;
}
