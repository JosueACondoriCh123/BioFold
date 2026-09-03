import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  BrainCircuit,
  Check,
  CircleCheck,
  Database,
  Eye,
  EyeOff,
  GraduationCap,
  HardDrive,
  Key,
  Layers,
  LogOut,
  Palette,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { PlatformPage } from "../components/platform/PlatformLayout";
import { Feedback, Field, SubmitButton, ValidatedForm } from "../components/platform/AuthForm";
import { useFormAction } from "../components/platform/useFormAction";
import { clearStructureCache, getCachedStructureIds } from "../adapters/structureCache";
import { getCustomCatalogItems } from "../data/molecularCatalog";
import "../platform/account.css";

interface LabPreferences {
  defaultRepresentation: "cartoon" | "stick" | "sphere" | "line";
  defaultColorScheme: "chain" | "spectrum" | "element";
  defaultBackground: "dark" | "black" | "light";
  autoSpin: boolean;
  decimalPrecision: number;
}

const DEFAULT_PREFERENCES: LabPreferences = {
  defaultRepresentation: "cartoon",
  defaultColorScheme: "chain",
  defaultBackground: "dark",
  autoSpin: false,
  decimalPrecision: 2,
};

export default function AccountPage() {
  const { state, actions } = useAuth();
  const navigate = useNavigate();
  const form = useFormAction();
  const logout = useFormAction();
  const [saved, setSaved] = useState(false);

  // Active section tab
  const [activeTab, setActiveTab] = useState<"profile" | "preferences" | "ai" | "storage">("profile");

  // Academic / Scientific identity state
  const [institution, setInstitution] = useState<string>(() => {
    try {
      return typeof window !== "undefined" ? window.localStorage?.getItem("biofold_user_institution") || "" : "";
    } catch {
      return "";
    }
  });
  const [scientificRole, setScientificRole] = useState<string>(() => {
    try {
      return typeof window !== "undefined"
        ? window.localStorage?.getItem("biofold_user_role") || "Structural Biologist"
        : "Structural Biologist";
    } catch {
      return "Structural Biologist";
    }
  });

  // 3D Lab preferences state
  const [preferences, setPreferences] = useState<LabPreferences>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage?.getItem("biofold_lab_preferences") : null;
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });
  const [prefSavedMessage, setPrefSavedMessage] = useState<string | null>(null);

  // AI & OpenRouter BYOK key state
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    try {
      return typeof window !== "undefined" ? window.localStorage?.getItem("biofold_user_openrouter_key") || "" : "";
    } catch {
      return "";
    }
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedDefaultModel, setSelectedDefaultModel] = useState<string>(() => {
    try {
      return typeof window !== "undefined"
        ? window.localStorage?.getItem("biofold_default_ai_model") || "minimax/minimax-01"
        : "minimax/minimax-01";
    } catch {
      return "minimax/minimax-01";
    }
  });
  const [aiSavedMessage, setAiSavedMessage] = useState<string | null>(null);

  // Storage & cache stats state
  const [cachedStructureCount, setCachedStructureCount] = useState<number>(0);
  const [customCatalogCount, setCustomCatalogCount] = useState<number>(0);
  const [isPurgingCache, setIsPurgingCache] = useState(false);
  const [cachePurgedMessage, setCachePurgedMessage] = useState<string | null>(null);

  // Load cache metrics
  useEffect(() => {
    let cancelled = false;
    async function loadMetrics() {
      try {
        const ids = await getCachedStructureIds();
        if (!cancelled) setCachedStructureCount(ids.length);
        const customs = getCustomCatalogItems();
        if (!cancelled) setCustomCatalogCount(customs.length);
      } catch {
        /* fallback */
      }
    }
    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSavePreferences = () => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.setItem("biofold_lab_preferences", JSON.stringify(preferences));
        window.localStorage?.setItem("biofold_user_institution", institution);
        window.localStorage?.setItem("biofold_user_role", scientificRole);
      }
      setPrefSavedMessage("Laboratory preferences saved successfully.");
      setTimeout(() => setPrefSavedMessage(null), 3500);
    } catch {
      setPrefSavedMessage("Could not save preferences to local storage.");
    }
  };

  const handleSaveAiSettings = () => {
    try {
      if (typeof window !== "undefined") {
        if (userApiKey.trim()) {
          window.localStorage?.setItem("biofold_user_openrouter_key", userApiKey.trim());
        } else {
          window.localStorage?.removeItem("biofold_user_openrouter_key");
        }
        window.localStorage?.setItem("biofold_default_ai_model", selectedDefaultModel);
      }
      setAiSavedMessage(userApiKey.trim() ? "Personal OpenRouter API key saved." : "Using default managed AI gateway.");
      setTimeout(() => setAiSavedMessage(null), 3500);
    } catch {
      setAiSavedMessage("Could not update AI settings.");
    }
  };

  const handlePurgeCache = async () => {
    setIsPurgingCache(true);
    try {
      await clearStructureCache();
      setCachedStructureCount(0);
      setCachePurgedMessage("Local structure cache successfully purged.");
      setTimeout(() => setCachePurgedMessage(null), 4000);
    } catch {
      setCachePurgedMessage("Failed to purge structure cache.");
    } finally {
      setIsPurgingCache(false);
    }
  };

  const initials = (state.user?.displayName || state.user?.email || "U")
    .split(" ")
    .map((s) => s.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PlatformPage name="account" title="Your account">
      <a className="bf-skip" href="#main-content">
        Skip to content
      </a>
      <main className="bf-container bf-private-main bf-account-main" id="main-content">
        <header className="bf-page-heading">
          <span className="bf-eyebrow">Profile & Laboratory Settings</span>
          <h1>Your account.</h1>
          <p>Scientific identity, 3D laboratory defaults, AI models, and local storage management.</p>
        </header>

        {/* User Identity Header Card */}
        <div className="bf-account-header-profile">
          <div className="bf-account-avatar-group">
            <div className="bf-account-avatar-circle" aria-hidden="true">
              {initials}
            </div>
            <div className="bf-account-avatar-meta">
              <h2>{state.user?.displayName || "Research Scientist"}</h2>
              <p>{state.user?.email || "Authenticated Researcher"}</p>
              <span className="bf-account-role-tag">
                <GraduationCap size={13} aria-hidden="true" />
                <span>{scientificRole}</span>
              </span>
            </div>
          </div>
          {institution && (
            <div style={{ textAlign: "right", fontSize: "13px", color: "var(--bf-muted, #79918b)" }}>
              <span>Affiliation</span>
              <strong style={{ display: "block", color: "#fff", fontSize: "14px", marginTop: "2px" }}>
                {institution}
              </strong>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="bf-account-tabs" role="tablist" aria-label="Account Settings Sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "profile"}
            className={`bf-account-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <UserRound size={15} aria-hidden="true" />
            <span>Profile & Affiliation</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preferences"}
            className={`bf-account-tab-btn ${activeTab === "preferences" ? "is-active" : ""}`}
            onClick={() => setActiveTab("preferences")}
          >
            <Palette size={15} aria-hidden="true" />
            <span>3D Laboratory Preferences</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ai"}
            className={`bf-account-tab-btn ${activeTab === "ai" ? "is-active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>AI & BYOK Keys</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "storage"}
            className={`bf-account-tab-btn ${activeTab === "storage" ? "is-active" : ""}`}
            onClick={() => setActiveTab("storage")}
          >
            <Database size={15} aria-hidden="true" />
            <span>Storage & Cache</span>
          </button>
        </div>

        {/* Tab 1: Profile & Identity */}
        {activeTab === "profile" && (
          <div className="bf-account-grid">
            <section className="bf-account-card" aria-labelledby="profile-title">
              <div className="bf-card-title">
                <UserRound size={22} aria-hidden="true" />
                <div>
                  <h2 id="profile-title">Profile details</h2>
                  <p>How you appear in your workspace and project audit events.</p>
                </div>
              </div>

              <Feedback error={form.error} message={saved ? "Your profile has been updated." : undefined} />

              <ValidatedForm
                name="Profile details"
                pending={form.pending}
                disabled={logout.pending || state.status !== "authenticated"}
                onValid={async (data) => {
                  setSaved(false);
                  if (await form.run(() => actions.updateDisplayName(String(data.get("displayName")).trim()))) {
                    setSaved(true);
                    try {
                      if (typeof window !== "undefined") {
                        window.localStorage?.setItem("biofold_user_institution", institution);
                        window.localStorage?.setItem("biofold_user_role", scientificRole);
                      }
                    } catch {
                      /* ignore */
                    }
                  }
                }}
              >
                <Field
                  key={state.user?.displayName}
                  label="Full name"
                  name="displayName"
                  autoComplete="name"
                  defaultValue={state.user?.displayName ?? ""}
                  maxLength={80}
                  required
                  onChange={() => setSaved(false)}
                />
                <Field
                  label="Email address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={state.user?.email ?? ""}
                  readOnly
                  hint="Your sign-in email. Email changes are not available here."
                />

                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="user-role" style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                    Primary Scientific Role
                  </label>
                  <select
                    id="user-role"
                    className="bf-pref-select"
                    value={scientificRole}
                    onChange={(e) => setScientificRole(e.target.value)}
                  >
                    <option value="Structural Biologist">Structural Biologist</option>
                    <option value="Bioinformatician">Bioinformatician</option>
                    <option value="Computational Chemist">Computational Chemist</option>
                    <option value="Biochemistry Researcher">Biochemistry Researcher</option>
                    <option value="Postdoc / Academic">Postdoc / Academic</option>
                    <option value="Biotech Student">Biotech Student</option>
                  </select>
                </div>

                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="user-institution" style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                    Research Institution / Lab (Optional)
                  </label>
                  <input
                    id="user-institution"
                    type="text"
                    className="bf-pref-select"
                    placeholder="e.g. Max Planck Institute, Harvard Medical School, EMBL"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    maxLength={100}
                  />
                </div>

                <SubmitButton pending={form.pending} busyLabel="Saving changes…">
                  Save changes
                </SubmitButton>
              </ValidatedForm>
            </section>

            <aside className="bf-account-aside">
              <ShieldCheck size={24} aria-hidden="true" />
              <h2>Cloud sync & Privacy.</h2>
              <p>
                Your profile belongs to your account and authenticates access to your private projects.
              </p>
              <p>
                Molecular structures, coordinate modifications, and audit logs are encrypted and persisted
                safely in your Supabase workspace.
              </p>
            </aside>
          </div>
        )}

        {/* Tab 2: 3D Laboratory Preferences */}
        {activeTab === "preferences" && (
          <section className="bf-account-card" aria-label="3D Laboratory Preferences">
            <div className="bf-card-title">
              <Palette size={22} aria-hidden="true" />
              <div>
                <h2>Default Laboratory 3D Settings</h2>
                <p>Customize rendering styles, initial color schemes, and viewer behaviors.</p>
              </div>
            </div>

            {prefSavedMessage && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(92, 207, 181, 0.15)", color: "#5ccfb5", fontSize: "13px", marginBottom: "14px" }}>
                {prefSavedMessage}
              </div>
            )}

            <div className="bf-pref-grid">
              <div className="bf-pref-card">
                <label htmlFor="pref-rep">Default Representation</label>
                <p>Initial molecular visualization style applied when opening any PDB.</p>
                <select
                  id="pref-rep"
                  className="bf-pref-select"
                  value={preferences.defaultRepresentation}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      defaultRepresentation: e.target.value as LabPreferences["defaultRepresentation"],
                    }))
                  }
                >
                  <option value="cartoon">Cartoon (Ribbon)</option>
                  <option value="stick">Stick (Bonds & Atoms)</option>
                  <option value="sphere">Sphere (Space-filling CPK)</option>
                  <option value="line">Line (Wireframe)</option>
                </select>
              </div>

              <div className="bf-pref-card">
                <label htmlFor="pref-color">Default Color Scheme</label>
                <p>Primary coloring model for chains and residues.</p>
                <select
                  id="pref-color"
                  className="bf-pref-select"
                  value={preferences.defaultColorScheme}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      defaultColorScheme: e.target.value as LabPreferences["defaultColorScheme"],
                    }))
                  }
                >
                  <option value="chain">Chain (Distinct per polymer)</option>
                  <option value="spectrum">Spectrum (Sinebow N→C terminus)</option>
                  <option value="element">Element (Jmol CPK colors)</option>
                </select>
              </div>

              <div className="bf-pref-card">
                <label htmlFor="pref-bg">Viewer Background</label>
                <p>Canvas backdrop for interactive exploration and paper publication exports.</p>
                <select
                  id="pref-bg"
                  className="bf-pref-select"
                  value={preferences.defaultBackground}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      defaultBackground: e.target.value as LabPreferences["defaultBackground"],
                    }))
                  }
                >
                  <option value="dark">Deep Emerald (#060b09 - Default)</option>
                  <option value="black">Pitch Black (#000000)</option>
                  <option value="light">Paper Light (#ffffff for journal figures)</option>
                </select>
              </div>

              <div className="bf-pref-card">
                <label htmlFor="pref-dec">Distance Measurement Precision</label>
                <p>Decimal precision formatted on calculated atomic distances.</p>
                <select
                  id="pref-dec"
                  className="bf-pref-select"
                  value={preferences.decimalPrecision}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      decimalPrecision: Number(e.target.value),
                    }))
                  }
                >
                  <option value={2}>2 decimals (e.g. 3.45 Å)</option>
                  <option value={3}>3 decimals (e.g. 3.452 Å)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label className="bf-pref-toggle-row">
                <div>
                  <strong style={{ color: "#fff", fontSize: "14px" }}>Auto-spin on structure load</strong>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--bf-muted, #79918b)" }}>
                    Slowly rotate the camera around the Y-axis when a new molecular coordinate file is loaded.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.autoSpin}
                  onChange={(e) => setPreferences((prev) => ({ ...prev, autoSpin: e.target.checked }))}
                />
              </label>
            </div>

            <button
              type="button"
              className="bf-button"
              style={{ marginTop: "20px", display: "inline-flex", alignItems: "center", gap: "8px" }}
              onClick={handleSavePreferences}
            >
              <Save size={16} aria-hidden="true" />
              <span>Save 3D preferences</span>
            </button>
          </section>
        )}

        {/* Tab 3: AI Models & BYOK Keys */}
        {activeTab === "ai" && (
          <section className="bf-account-card" aria-label="AI & Multimodal Gateway Settings">
            <div className="bf-card-title">
              <Sparkles size={22} aria-hidden="true" />
              <div>
                <h2>AI Models & Bring Your Own Key (BYOK)</h2>
                <p>Configure default scientific models or supply your personal OpenRouter key for unlimited quota.</p>
              </div>
            </div>

            {aiSavedMessage && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(92, 207, 181, 0.15)", color: "#5ccfb5", fontSize: "13px", marginBottom: "14px" }}>
                {aiSavedMessage}
              </div>
            )}

            <div className="bf-key-box">
              <div>
                <label htmlFor="default-ai-model" style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                  Preferred Scientific Assistant Model
                </label>
                <p style={{ fontSize: "12px", color: "var(--bf-muted, #79918b)", margin: "4px 0 8px" }}>
                  Used across Research Copilot and the Multimodal Vision Studio.
                </p>
                <select
                  id="default-ai-model"
                  className="bf-pref-select"
                  value={selectedDefaultModel}
                  onChange={(e) => setSelectedDefaultModel(e.target.value)}
                >
                  <option value="minimax/minimax-01">MiniMax-01 (Multimodal Vision & Deep Context)</option>
                  <option value="z-ai/glm-5.2:free">GLM 5.2 (Free Tier - Fast Structural Reasoning)</option>
                  <option value="google/gemini-2.0-flash-lite:free">Gemini 2.0 Flash (Free & Sub-second)</option>
                  <option value="qwen/qwen-2.5-vl-72b-instruct:free">Qwen 2.5 VL 72B (Open Source Vision)</option>
                </select>
              </div>

              <div>
                <label htmlFor="openrouter-api-key" style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                  Personal OpenRouter API Key (Optional)
                </label>
                <p style={{ fontSize: "12px", color: "var(--bf-muted, #79918b)", margin: "4px 0 8px" }}>
                  By default, BioFold provides a managed free daily quota. Enter your own API key (starts with <code>sk-or-v1-</code>) to bypass daily rate limits and use premium model checkpoints.
                </p>
                <div className="bf-key-input-row">
                  <input
                    id="openrouter-api-key"
                    type={showApiKey ? "text" : "password"}
                    className="bf-key-input"
                    placeholder="sk-or-v1-..."
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="bf-key-btn-secondary"
                    onClick={() => setShowApiKey(!showApiKey)}
                    title={showApiKey ? "Hide key" : "Show key"}
                    aria-label={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  {userApiKey && (
                    <button
                      type="button"
                      className="bf-key-btn-secondary"
                      onClick={() => setUserApiKey("")}
                      title="Clear key"
                      aria-label="Clear key"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              <div className={`bf-key-status-indicator ${userApiKey.trim() ? "" : "is-default"}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>
                  {userApiKey.trim()
                    ? "Custom OpenRouter API key configured (Unlimited private quota active)"
                    : "Using BioFold Managed Gateway ($1.00 USD/day shared quota)"}
                </span>
              </div>

              <button
                type="button"
                className="bf-button"
                style={{ alignSelf: "flex-start", marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "8px" }}
                onClick={handleSaveAiSettings}
              >
                <Save size={16} aria-hidden="true" />
                <span>Save AI settings</span>
              </button>
            </div>
          </section>
        )}

        {/* Tab 4: Storage & Local Cache */}
        {activeTab === "storage" && (
          <section className="bf-account-card" aria-label="Storage and Cache Quotas">
            <div className="bf-card-title">
              <Database size={22} aria-hidden="true" />
              <div>
                <h2>Local Cache & Storage Management</h2>
                <p>Inspect cached coordinate files, custom molecular items, and local workspace storage.</p>
              </div>
            </div>

            {cachePurgedMessage && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "rgba(92, 207, 181, 0.15)", color: "#5ccfb5", fontSize: "13px", marginBottom: "14px" }}>
                {cachePurgedMessage}
              </div>
            )}

            <div className="bf-storage-stats-grid">
              <div className="bf-stat-metric-card">
                <strong>{cachedStructureCount}</strong>
                <span>Cached Structures</span>
                <small>IndexedDB coordinate files stored locally for instant 0ms laboratory startup.</small>
              </div>

              <div className="bf-stat-metric-card">
                <strong>{customCatalogCount}</strong>
                <span>Custom Uploads</span>
                <small>Locally imported PDB and mmCIF structures registered in Molecular Explorer.</small>
              </div>

              <div className="bf-stat-metric-card">
                <strong>Encrypted</strong>
                <span>Cloud Snapshot Status</span>
                <small>Workspace state and mutation histories synced with Supabase project storage.</small>
              </div>
            </div>

            <div className="bf-purge-cache-box">
              <div>
                <strong style={{ color: "#fff", fontSize: "14px" }}>Purge Offline Structure Cache</strong>
                <p>
                  Clears local IndexedDB binary caches (PDB and CIF coordinates). You will still be able to
                  re-download structures from RCSB on demand.
                </p>
              </div>
              <button
                type="button"
                className="bf-purge-cache-btn"
                disabled={isPurgingCache || cachedStructureCount === 0}
                onClick={handlePurgeCache}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>{isPurgingCache ? "Purging…" : "Purge local cache"}</span>
              </button>
            </div>
          </section>
        )}

        {/* Close this session card */}
        <section className="bf-signout-card" aria-labelledby="signout-title">
          <div>
            <h2 id="signout-title">Close this session</h2>
            <p>Signing out clears the molecular scene and activity in this tab.</p>
            <Feedback error={logout.error} />
          </div>
          <button
            className="bf-button bf-button-ghost"
            disabled={logout.pending || form.pending}
            onClick={() => {
              void logout.run(() => actions.signOut()).then((ok) => {
                if (ok) navigate("/login", { replace: true });
              });
            }}
          >
            <LogOut size={17} aria-hidden="true" />
            {logout.pending ? "Signing out…" : "Sign out"}
          </button>
        </section>
      </main>
    </PlatformPage>
  );
}
