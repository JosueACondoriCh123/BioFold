import { createContext, useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useAuth } from "../../auth/useAuth";

const FieldErrors = createContext<Record<string, string>>({});

export function ValidatedForm({ name, pending, disabled = false, onValid, validate, children }: {
  name: string; pending: boolean; disabled?: boolean; children: ReactNode;
  onValid: (data: FormData) => Promise<void>;
  validate?: (data: FormData) => Record<string, string>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return <FieldErrors.Provider value={errors}><form aria-label={name} aria-busy={pending} noValidate onSubmit={event => {
    event.preventDefault();
    if (disabled || pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const next: Record<string, string> = {};
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly || !element.name) continue;
      if (element.required && !element.value.trim()) next[element.name] = "This field is required.";
      else if (element.type === "email" && element.validity.typeMismatch) next[element.name] = "Enter a valid email address.";
      else if (element.minLength > 0 && element.value.length < element.minLength) next[element.name] = `Use at least ${element.minLength} characters.`;
      else if (element.maxLength > 0 && element.value.length > element.maxLength) next[element.name] = `Use no more than ${element.maxLength} characters.`;
    }
    Object.assign(next, validate?.(data));
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) { (form.elements.namedItem(first) as HTMLInputElement | null)?.focus(); return; }
    void onValid(data);
  }}><fieldset disabled={disabled || pending}>{children}</fieldset></form></FieldErrors.Provider>;
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const password = props.type === "password";
  const error = useContext(FieldErrors)[props.name ?? ""];
  const describedBy = [props["aria-describedby"], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return <div className="bf-field"><label htmlFor={id}>{label}</label><div className={password ? "bf-password-field" : undefined}>
    <input {...props} id={id} type={password && visible ? "text" : props.type} aria-invalid={Boolean(error)} aria-describedby={describedBy || undefined} />
    {password && <button type="button" className="bf-password-toggle" onClick={() => setVisible(!visible)} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} disabled={props.disabled}>
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
    </div>{hint && <small id={`${id}-hint`}>{hint}</small>}{error && <small id={`${id}-error`} className="bf-field-error" role="alert">{error}</small>}</div>;
}

export function Feedback({ error, message }: { error?: string; message?: string }) {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  if (error) return <div className="bf-feedback bf-feedback-error" role="alert" tabIndex={-1} ref={alert}><AlertCircle size={18} aria-hidden="true" /><span>{error}</span></div>;
  if (message) return <div className="bf-feedback bf-feedback-success" role="status"><CheckCircle2 size={18} aria-hidden="true" /><span>{message}</span></div>;
  return null;
}

export function AuthAvailability() {
  const { state, actions } = useAuth();
  const [retryError, setRetryError] = useState("");
  if (state.status === "unconfigured") return <div className="bf-feedback bf-feedback-warning" role="status"><AlertCircle size={18} aria-hidden="true" /><span>Authentication is not configured. Connect the Supabase project to enable accounts. No guest access is available.</span></div>;
  if (state.status === "loading") return <div className="bf-feedback" role="status"><LoaderCircle className="bf-spin" size={18} aria-hidden="true" /> Checking your session…</div>;
  if (state.status === "error") return <div className="bf-feedback bf-feedback-error" role="alert"><span>{retryError || state.error || "Your session could not be verified."} <button className="bf-text-button" type="button" onClick={() => { void actions.retrySession().catch(() => setRetryError("Session check failed. Please try again.")); }}>Try again</button></span></div>;
  return null;
}

export function SubmitButton({ pending, children, busyLabel }: { pending: boolean; children: ReactNode; busyLabel: string }) {
  return <button className="bf-button bf-button-full" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="bf-spin" size={17} aria-hidden="true" />{busyLabel}</> : children}</button>;
}

export function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return <button className="bf-button bf-button-ghost bf-button-full" type="button" onClick={onClick} disabled={disabled}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.7 2.9-4.3 2.9-7.5ZM12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6a6.1 6.1 0 0 1-9.1-3H2.9v2.7A10 10 0 0 0 12 22ZM6.3 14a6 6 0 0 1 0-4V7.3H2.9a10 10 0 0 0 0 9.4L6.3 14ZM12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.3L6.3 10A6 6 0 0 1 12 6Z" /></svg>Continue with Google</button>;
}
