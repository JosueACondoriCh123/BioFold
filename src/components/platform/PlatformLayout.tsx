import { useState, useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Link, NavLink } from "react-router";
import { UserMenuDropdown } from "../navigation/UserMenuDropdown";
import { NotificationsDropdown } from "../navigation/NotificationsDropdown";
import { CommandPaletteModal, CommandPaletteTrigger } from "../navigation/CommandPaletteModal";

export function Brand({ to = "/" }: { to?: string }) {
  return (
    <Link className="bf-brand" to={to} aria-label="BioFold 3D home">
      <span className="bf-brand-icon">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="bf-brand-img"
          width="38"
          height="38"
        />
      </span>
      <span>
        BioFold<span className="bf-brand-suffix">3D</span>
      </span>
    </Link>
  );
}

export function WorkspaceNav() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (
          document.activeElement?.tagName !== "INPUT" &&
          document.activeElement?.tagName !== "TEXTAREA"
        ) {
          e.preventDefault();
          setIsCommandPaletteOpen((prev) => !prev);
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  return (
    <header className="bf-workspace-header">
      <Brand to="/app" />
      <nav aria-label="Workspace navigation">
        <NavLink to="/app" end>Home</NavLink>
        <NavLink to="/app/lab">Laboratory</NavLink>
        <NavLink to="/app/vision">Multimodal Vision</NavLink>
        <NavLink to="/app/account">Account</NavLink>
      </nav>
      <div className="bf-workspace-header-actions">
        <CommandPaletteTrigger onOpen={() => setIsCommandPaletteOpen(true)} />
        <NotificationsDropdown />
        <UserMenuDropdown />
      </div>
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </header>
  );
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

export function PublicHeader({ overlay = false }: { overlay?: boolean } = {}) {
  return <header className={`bf-public-header${overlay ? " bf-public-header-overlay" : ""}`}><Brand /><nav aria-label="Main navigation">
    <a className="bf-desktop-link" href="/#explore">Explore</a><a className="bf-desktop-link" href="/#architecture">Architecture</a><a className="bf-desktop-link" href="/#tools">Tools</a>
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
