import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Brand, PlatformPage } from "../components/platform/PlatformLayout";

export default function NotFoundPage() {
  return <PlatformPage name="not-found" title="Page not found"><header className="bf-auth-header"><Brand /></header><main className="bf-not-found"><span className="bf-eyebrow">404 / Page not found</span><h1>This page is uncharted.</h1><p>The address may have changed, or the page may not exist. Let’s return to familiar ground.</p><Link className="bf-button" to="/"><ArrowLeft size={18} aria-hidden="true" />Back to home</Link></main></PlatformPage>;
}
