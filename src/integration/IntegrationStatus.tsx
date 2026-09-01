import { Link } from "react-router";
import { AuthLayout } from "../components/platform/PlatformLayout";

export function IntegrationStatus({ title, message, retry, recovery = false }: {
  title: string; message: string; retry?: () => void; recovery?: boolean;
}) {
  return <AuthLayout compact name="integration-status" title={title} heading={title} intro="">
    <p className="bf-body-note" role="status">{message}</p>
    <div className="bf-recovery-links">{retry && <button className="bf-button bf-button-ghost" onClick={retry}>Try again</button>}{recovery && <Link to="/forgot-password">Request a new reset link</Link>}<Link to="/">Back to home</Link></div>
  </AuthLayout>;
}
