import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Dna, FlaskConical, ShieldCheck } from "lucide-react";
import { Link, NavLink } from "react-router";

export function Brand({ to = "/" }: { to?: string }) {
  return <Link className="bf-brand" to={to} aria-label="BioFold 3D home"><span className="bf-brand-icon"><Dna size={23} strokeWidth={1.8} aria-hidden="true" /></span><span>BioFold<span className="bf-brand-suffix">3D</span></span></Link>;
}

export function WorkspaceNav() {
  return <header className="bf-workspace-header"><Brand to="/app" /><nav aria-label="Workspace navigation">
    <NavLink to="/app" end>Home</NavLink><NavLink to="/app/lab">Laboratory</NavLink><NavLink to="/app/account">Account</NavLink>
  </nav><span className="bf-header-note"><FlaskConical size={14} aria-hidden="true" /> Molecular workspace</span></header>;
}

export function PlatformPage({ name, title, children }: { name: string; title: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = `${title} · BioFold 3D`;
    const heading = root.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [title]);
  return <div ref={root} className={`platform-root bf-page bf-${name}`} data-page={name}>{children}</div>;
}

export function PublicHeader() {
  return <header className="bf-public-header"><Brand /><nav aria-label="Main navigation">
    <a className="bf-desktop-link" href="/#explore">Explore</a><a className="bf-desktop-link" href="/#collaborate">Human + agent</a>
    <Link to="/login">Sign in</Link><Link className="bf-button bf-button-small" to="/signup">Create account <ArrowUpRight size={15} aria-hidden="true" /></Link>
  </nav></header>;
}

export function Footer() {
  return <footer className="bf-footer"><Brand /><p>A clearer view of molecular structure.</p><span>Built for the open web <span aria-hidden="true">↗</span></span></footer>;
}

export function AuthLayout({ name, title, heading, intro, children, compact = false }: { name: string; title: string; heading: string; intro: string; children: ReactNode; compact?: boolean }) {
  return <PlatformPage name={name} title={title}><a className="bf-skip" href="#main-content">Skip to content</a>
    <header className="bf-auth-header"><Brand /><Link to="/">Back to overview <ArrowUpRight size={15} aria-hidden="true" /></Link></header>
    <main className={`bf-auth-grid${compact ? " bf-auth-compact" : ""}`} id="main-content">
      {!compact && <section className="bf-auth-story" aria-label="About BioFold"><span className="bf-eyebrow">A shared perspective</span><h2>A little closer.<br /><span>A lot clearer.</span></h2>
        <p>A focused workspace for exploring molecular structures, on your own or alongside an agent.</p>
        <figure><img src="/4hhb-preview.png" width="840" height="812" alt="Actual BioFold view of 4HHB, with its four protein chains in different colors" /><figcaption><span>4HHB / HEMOGLOBIN</span><span>Actual laboratory view</span></figcaption></figure>
      </section>}
      <section className="bf-auth-panel"><div className="bf-auth-content"><span className="bf-eyebrow">Your BioFold workspace</span><h1>{heading}</h1><p className="bf-intro">{intro}</p>{children}
        <p className="bf-auth-note"><ShieldCheck size={16} aria-hidden="true" /> Your account stores your profile, not your molecular analyses.</p>
      </div></section>
    </main>
  </PlatformPage>;
}
