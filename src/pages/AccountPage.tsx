import { useState } from "react";
import { useNavigate } from "react-router";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { PlatformPage } from "../components/platform/PlatformLayout";
import { Feedback, Field, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { useFormAction } from "../components/platform/useFormAction";

export default function AccountPage() {
  const { state, actions } = useAuth();
  const navigate = useNavigate();
  const form = useFormAction();
  const logout = useFormAction();
  const [saved, setSaved] = useState(false);
  return <PlatformPage name="account" title="Your account"><a className="bf-skip" href="#main-content">Skip to content</a><main className="bf-container bf-private-main bf-account-main" id="main-content">
    <header className="bf-page-heading"><span className="bf-eyebrow">Profile & access</span><h1>Your account.</h1><p>A few essentials, all in one place.</p></header>
    <div className="bf-account-grid"><section className="bf-account-card" aria-labelledby="profile-title"><div className="bf-card-title"><UserRound size={22} aria-hidden="true" /><div><h2 id="profile-title">Profile details</h2><p>How you appear in your workspace.</p></div></div>
      <Feedback error={form.error} message={saved ? "Your profile has been updated." : undefined} />
      <ValidatedForm name="Profile details" pending={form.pending} disabled={logout.pending || state.status !== "authenticated"} onValid={async data => {
        setSaved(false);
        if (await form.run(() => actions.updateDisplayName(String(data.get("displayName")).trim()))) setSaved(true);
      }}>
        <Field key={state.user?.displayName} label="Full name" name="displayName" autoComplete="name" defaultValue={state.user?.displayName ?? ""} maxLength={80} required onChange={() => setSaved(false)} />
        <Field label="Email address" name="email" type="email" autoComplete="email" value={state.user?.email ?? ""} readOnly hint="Your sign-in email. Email changes are not available here." />
        <SubmitButton pending={form.pending} busyLabel="Saving changes…">Save changes</SubmitButton>
      </ValidatedForm></section>
      <aside className="bf-account-aside"><ShieldCheck size={24} aria-hidden="true" /><h2>A profile, not a storage space.</h2><p>Your name and email belong to your account. Structures, measurements and activity remain in the current browser tab.</p><p>They are not saved to your account.</p></aside>
    </div>
    <section className="bf-signout-card" aria-labelledby="signout-title"><div><h2 id="signout-title">Close this session</h2><p>Signing out clears the molecular scene and activity in this tab.</p><Feedback error={logout.error} /></div><button className="bf-button bf-button-ghost" disabled={logout.pending || form.pending} onClick={() => { void logout.run(() => actions.signOut()).then(ok => { if (ok) navigate("/login", { replace: true }); }); }}><LogOut size={17} aria-hidden="true" />{logout.pending ? "Signing out…" : "Sign out"}</button></section>
  </main></PlatformPage>;
}
