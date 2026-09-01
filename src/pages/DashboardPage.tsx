import { ArrowUpRight, ArrowRight, FlaskConical, Layers3, MousePointer2, ClipboardList, Info } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useAuth } from "../auth/useAuth";
import { Footer, PlatformPage } from "../components/platform/PlatformLayout";
import { Feedback } from "../components/platform/AuthForm";

export default function DashboardPage() {
  const { state } = useAuth();
  const location = useLocation();
  const name = state.user?.displayName?.trim();
  return <PlatformPage name="dashboard" title="Your workspace"><a className="bf-skip" href="#main-content">Skip to content</a><main className="bf-container bf-private-main" id="main-content">
    <header className="bf-page-heading"><span className="bf-eyebrow">{name ? `Welcome, ${name}` : "Welcome to BioFold"}</span><h1>Your laboratory,<br /><span>ready when you are.</span></h1><p>Pick up your exploration or start with a structure below.</p></header>
    {location.state?.passwordUpdated === true && <Feedback message="Your password has been updated." />}
    <section className="bf-launch-card" aria-labelledby="launch-title"><div><span className="bf-feature-icon"><FlaskConical size={24} aria-hidden="true" /></span><h2 id="launch-title">A focused space for a closer look.</h2><p>Represent, select and measure in one shared molecular scene.</p><Link className="bf-button" to="/app/lab">Open laboratory <ArrowUpRight size={18} aria-hidden="true" /></Link><p className="bf-card-note">Your scene stays with you as you navigate within this tab.</p></div><figure><img src="/4hhb-preview.png" width="840" height="812" alt="Actual BioFold view of 4HHB, an example structure available in the laboratory" /><figcaption>4HHB · Example preview, not your current scene</figcaption></figure></section>
    <section className="bf-dashboard-section" aria-labelledby="examples-title"><div className="bf-section-heading"><div><span className="bf-eyebrow">Start with an example</span><h2 id="examples-title">Two structures. Plenty to explore.</h2></div><p>Bundled examples work without a structure download.</p></div>
      <div className="bf-example-grid"><article><span className="bf-example-id">1CRN</span><h3>Crambin</h3><p>A compact starting point for representations, residue selection and distance measurements.</p><Link className="bf-link-action" to="/app/lab?pdb=1CRN">Explore 1CRN <ArrowRight size={17} aria-hidden="true" /></Link></article><article><span className="bf-example-id bf-example-rose">4HHB</span><h3>Hemoglobin</h3><p>A four-chain structure for exploring chain colors, molecular surfaces and spatial relationships.</p><Link className="bf-link-action" to="/app/lab?pdb=4HHB">Explore 4HHB <ArrowRight size={17} aria-hidden="true" /></Link></article></div>
      <p className="bf-inline-note"><Info size={16} aria-hidden="true" /> Choosing an example replaces the structure currently in your workspace.</p>
    </section>
    <section className="bf-dashboard-section" aria-labelledby="guide-title"><h2 id="guide-title">Get oriented in three steps.</h2><ol className="bf-quick-guide"><li><Layers3 aria-hidden="true" /><div><h3>01 / Set your view</h3><p>Choose a representation and color scheme.</p></div></li><li><MousePointer2 aria-hidden="true" /><div><h3>02 / Inspect a detail</h3><p>Focus on residues or measure between atoms.</p></div></li><li><ClipboardList aria-hidden="true" /><div><h3>03 / Review the evidence</h3><p>Read the result and its human or agent activity entry.</p></div></li></ol></section>
    <p className="bf-session-note">Workspace contents are kept in this tab only. Reloading or signing out clears the scene and activity.</p>
  </main><Footer /></PlatformPage>;
}
