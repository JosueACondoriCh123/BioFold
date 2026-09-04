import { useState, useRef, useEffect, useContext } from "react";
import { Link, useNavigate } from "react-router";
import {
  User,
  LogOut,
  Settings,
  LayoutDashboard,
  Microscope,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { AuthContext } from "../../auth/AuthContext";
import "./navigationComponents.css";

export function UserMenuDropdown() {
  const auth = useContext(AuthContext);
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const user = auth?.state?.user ?? null;
  const isAuthenticated = auth?.state?.status === "authenticated";

  // Check if avatar photo URL is available (Google OAuth or profile metadata)
  const avatarUrl =
    (user as any)?.avatarUrl ||
    (user as any)?.user_metadata?.avatar_url ||
    (user as any)?.photoURL ||
    (auth?.user as any)?.user_metadata?.avatar_url ||
    null;

  // Compute display initials or fallback
  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSignOut = async () => {
    if (!auth) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      if (auth.actions?.signOut) {
        await auth.actions.signOut();
      } else if (auth.signOut) {
        await auth.signOut();
      }
      setIsOpen(false);
      navigate("/login");
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : "Failed to sign out");
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!isAuthenticated && !user) {
    return (
      <Link to="/login" className="bf-user-menu-signin" aria-label="Sign in to your account">
        <User size={14} aria-hidden="true" />
        <span>Sign in</span>
      </Link>
    );
  }

  return (
    <div className="bf-user-menu-container" ref={menuRef}>
      <button
        type="button"
        className={`bf-user-avatar-btn ${isOpen ? "is-active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`User menu for ${displayName}`}
        title={`${displayName} (${user?.email ?? ""})`}
      >
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="bf-avatar-image"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="bf-avatar-initials">{initials}</span>
        )}
        <span className="bf-avatar-status-dot" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="bf-user-menu-popover" role="menu" aria-label="User account actions">
          <div className="bf-user-menu-header">
            <div className="bf-user-menu-avatar-large">
              {avatarUrl && !imgError ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="bf-avatar-image-large"
                  onError={() => setImgError(true)}
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="bf-user-menu-info">
              <span className="bf-user-menu-name" title={displayName}>
                {displayName}
              </span>
              <span className="bf-user-menu-email" title={user?.email ?? ""}>
                {user?.email ?? "authenticated"}
              </span>
              <span className="bf-user-menu-badge" title="Supabase Database & Auth Connected">
                <CheckCircle2 size={12} /> Supabase Conectado
              </span>
            </div>
          </div>

          <div className="bf-user-menu-divider" />

          <div className="bf-user-menu-links">
            <Link
              to="/app"
              className="bf-user-menu-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <LayoutDashboard size={14} />
              <span>Dashboard & Proyectos</span>
            </Link>
            <Link
              to="/app/lab"
              className="bf-user-menu-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <Microscope size={14} />
              <span>Laboratorio 3D</span>
            </Link>
            <Link
              to="/app/vision"
              className="bf-user-menu-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <Sparkles size={14} />
              <span>Multimodal Vision</span>
            </Link>
            <Link
              to="/app/account"
              className="bf-user-menu-item"
              role="menuitem"
              onClick={() => setIsOpen(false)}
            >
              <Settings size={14} />
              <span>Configuración de Cuenta</span>
            </Link>
          </div>

          <div className="bf-user-menu-divider" />

          {signOutError && (
            <div className="bf-user-menu-error" role="alert">
              {signOutError}
            </div>
          )}

          <button
            type="button"
            className="bf-user-menu-item bf-user-menu-signout"
            role="menuitem"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            <LogOut size={14} />
            <span>{isSigningOut ? "Cerrando sesión..." : "Cerrar Sesión"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
