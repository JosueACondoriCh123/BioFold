import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  Atom,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Dna,
  Eye,
  Focus,
  Github,
  Info,
  LoaderCircle,
  Maximize2,
  Minus,
  Plus,
  RefreshCcw,
  RotateCw,
  Ruler,
  Search,
  Sparkles,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { registerBioFoldTools } from "./adapters/webmcp";
import { viewerPort } from "./adapters/viewerPort";
import { commandBus } from "./core/commandBus";
import { useAppStore } from "./store/appStore";
import type { ColorScheme, RepresentationStyle } from "./types/domain";

const REPRESENTATIONS: Array<{ value: RepresentationStyle; label: string }> = [
  { value: "cartoon", label: "Cartoon" },
  { value: "stick", label: "Stick" },
  { value: "sphere", label: "Sphere" },
  { value: "line", label: "Line" },
];

const COLOR_SCHEMES: Array<{ value: ColorScheme; label: string }> = [
  { value: "chain", label: "Chain" },
  { value: "spectrum", label: "Spectrum" },
  { value: "element", label: "Element" },
];

function MolecularViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setViewerReady = useAppStore((state) => state.setViewerReady);

  useEffect(() => {
    if (!containerRef.current) return;
    viewerPort.attach(containerRef.current);
    setViewerReady(true);
    const resizeObserver = new ResizeObserver(() => viewerPort.resize());
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [setViewerReady]);

  return <div ref={containerRef} className="molecular-canvas" aria-label="Interactive 3D molecular viewer" />;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PanelTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-icon">{icon}</div>
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function App() {
  const state = useAppStore();
  const [pdbId, setPdbId] = useState("1CRN");
  const [focusChain, setFocusChain] = useState("A");
  const [focusResidue, setFocusResidue] = useState("10");
  const [measureFrom, setMeasureFrom] = useState({ chain: "A", residue: "1", atom: "CA" });
  const [measureTo, setMeasureTo] = useState({ chain: "A", residue: "10", atom: "CA" });
  const [mutationChain, setMutationChain] = useState("A");
  const [mutationResidue, setMutationResidue] = useState("10");
  const [mutationTarget, setMutationTarget] = useState("W");
  const [surfaceOpacity, setSurfaceOpacity] = useState(0.72);
  const [spinning, setSpinning] = useState(false);
  const autoLoadStarted = useRef(false);

  useEffect(() => {
    void registerBioFoldTools();
  }, []);

  useEffect(() => {
    if (!state.viewerReady || state.structure || autoLoadStarted.current) return;
    autoLoadStarted.current = true;
    void commandBus.execute("load_structure", { pdbId: "1CRN" }, { origin: "human" });
  }, [state.viewerReady, state.structure]);

  const loadStructure = (id: string) => {
    const normalized = id.trim().toUpperCase();
    setPdbId(normalized);
    void commandBus.execute("load_structure", { pdbId: normalized }, { origin: "human" });
  };

  const onLoadSubmit = (event: FormEvent) => {
    event.preventDefault();
    loadStructure(pdbId);
  };

  const setRepresentation = (style: RepresentationStyle, colorScheme = state.colorScheme) =>
    void commandBus.execute(
      "set_representation",
      { style, colorScheme },
      { origin: "human" },
    );

  const setColorScheme = (colorScheme: ColorScheme) =>
    void commandBus.execute(
      "set_representation",
      { style: state.representation, colorScheme },
      { origin: "human" },
    );

  const toggleSurface = (visible: boolean, opacity = surfaceOpacity) =>
    void commandBus.execute("show_surface", { visible, opacity }, { origin: "human" });

  const focusSelection = () =>
    void commandBus.execute(
      "focus_residues",
      {
        residues: [{ chain: focusChain, residueNumber: Number(focusResidue) }],
        label: true,
      },
      { origin: "human" },
    );

  const measure = () =>
    void commandBus.execute(
      "measure_distance",
      {
        from: {
          chain: measureFrom.chain,
          residueNumber: Number(measureFrom.residue),
          atomName: measureFrom.atom,
        },
        to: {
          chain: measureTo.chain,
          residueNumber: Number(measureTo.residue),
          atomName: measureTo.atom,
        },
      },
      { origin: "human" },
    );

  const previewMutation = () =>
    void commandBus.execute(
      "preview_mutation_context",
      {
        residue: { chain: mutationChain, residueNumber: Number(mutationResidue) },
        toAminoAcid: mutationTarget,
      },
      { origin: "human" },
    );

  const toggleSpin = () => {
    const next = !spinning;
    setSpinning(next);
    viewerPort.spin(next);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="BioFold 3D home">
          <div className="brand-mark"><Dna size={23} strokeWidth={1.8} /></div>
          <div>
            <strong>BioFold <em>3D</em></strong>
            <span>Agentic molecular workspace</span>
          </div>
        </a>

        <form className="structure-search" onSubmit={onLoadSubmit}>
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="pdb-id">PDB structure ID</label>
          <input
            id="pdb-id"
            value={pdbId}
            maxLength={4}
            onChange={(event) => setPdbId(event.target.value.toUpperCase())}
            placeholder="Enter PDB ID"
            autoComplete="off"
          />
          <button type="submit" disabled={state.loading}>
            {state.loading ? <LoaderCircle className="spin" size={16} /> : <ChevronRight size={16} />}
            Explore
          </button>
        </form>

        <div className="header-actions">
          <button className="sample-chip" onClick={() => loadStructure("1CRN")}>1CRN</button>
          <button className="sample-chip" onClick={() => loadStructure("4HHB")}>4HHB</button>
          <div
            className={`agent-status ${state.webmcpSupported ? "is-ready" : ""}`}
            title={state.webmcpSupported ? "WebMCP tools registered" : "Human controls remain fully available"}
          >
            <span className="status-light" />
            <Bot size={16} />
            <div>
              <strong>{state.webmcpSupported ? `${state.registeredToolCount} agent tools` : "Human mode"}</strong>
              <span>{state.webmcpSupported ? "WebMCP ready" : "WebMCP unavailable"}</span>
            </div>
          </div>
          <a className="icon-button" href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub">
            <Github size={18} />
          </a>
        </div>
      </header>

      <main id="workspace" className="workspace">
        <aside className="control-panel panel">
          <PanelTitle icon={<Waves size={18} />} eyebrow="View controls" title="Representation" />

          <section className="control-section">
            <div className="section-label"><span>Render style</span><small>Global</small></div>
            <div className="segmented-grid">
              {REPRESENTATIONS.map((option) => (
                <button
                  key={option.value}
                  className={state.representation === option.value ? "active" : ""}
                  disabled={!state.structure}
                  onClick={() => setRepresentation(option.value)}
                  aria-pressed={state.representation === option.value}
                >
                  <span className={`style-glyph glyph-${option.value}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="control-section">
            <div className="section-label"><span>Color logic</span><small>Scientific</small></div>
            <div className="color-options">
              {COLOR_SCHEMES.map((option) => (
                <button
                  key={option.value}
                  className={state.colorScheme === option.value ? "active" : ""}
                  disabled={!state.structure}
                  onClick={() => setColorScheme(option.value)}
                  aria-pressed={state.colorScheme === option.value}
                >
                  <span className={`color-swatch swatch-${option.value}`} />
                  {option.label}
                  {state.colorScheme === option.value && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>

          <section className="control-section surface-control">
            <div className="section-label"><span>Molecular surface</span><small>VDW</small></div>
            <div className="toggle-row">
              <div><Eye size={17} /><span>{state.surfaceVisible ? "Surface visible" : "Surface hidden"}</span></div>
              <button
                role="switch"
                aria-checked={state.surfaceVisible}
                className={`switch ${state.surfaceVisible ? "on" : ""}`}
                disabled={!state.structure}
                onClick={() => toggleSurface(!state.surfaceVisible)}
              ><span /></button>
            </div>
            <label className="range-label">
              <span>Opacity</span><output>{Math.round(surfaceOpacity * 100)}%</output>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                value={surfaceOpacity}
                disabled={!state.structure}
                onChange={(event) => setSurfaceOpacity(Number(event.target.value))}
                onPointerUp={() => state.surfaceVisible && toggleSurface(true)}
                onKeyUp={() => state.surfaceVisible && toggleSurface(true)}
              />
            </label>
          </section>

          <section className="control-section compact-form">
            <div className="section-label"><span>Focus residue</span><small>Selection</small></div>
            <div className="input-pair">
              <label>Chain<input value={focusChain} onChange={(e) => setFocusChain(e.target.value.toUpperCase())} /></label>
              <label>Residue<input type="number" value={focusResidue} onChange={(e) => setFocusResidue(e.target.value)} /></label>
            </div>
            <button className="primary-action" onClick={focusSelection} disabled={!state.structure}>
              <Focus size={16} /> Focus in 3D
            </button>
          </section>

          <section className="control-section compact-form">
            <div className="section-label"><span>Measure atoms</span><small>Ångström</small></div>
            <div className="atom-row">
              <span>From</span>
              <input aria-label="From chain" value={measureFrom.chain} onChange={(e) => setMeasureFrom({ ...measureFrom, chain: e.target.value.toUpperCase() })} />
              <input aria-label="From residue" type="number" value={measureFrom.residue} onChange={(e) => setMeasureFrom({ ...measureFrom, residue: e.target.value })} />
              <input aria-label="From atom" value={measureFrom.atom} onChange={(e) => setMeasureFrom({ ...measureFrom, atom: e.target.value.toUpperCase() })} />
            </div>
            <div className="atom-row">
              <span>To</span>
              <input aria-label="To chain" value={measureTo.chain} onChange={(e) => setMeasureTo({ ...measureTo, chain: e.target.value.toUpperCase() })} />
              <input aria-label="To residue" type="number" value={measureTo.residue} onChange={(e) => setMeasureTo({ ...measureTo, residue: e.target.value })} />
              <input aria-label="To atom" value={measureTo.atom} onChange={(e) => setMeasureTo({ ...measureTo, atom: e.target.value.toUpperCase() })} />
            </div>
            <button className="secondary-action" onClick={measure} disabled={!state.structure}>
              <Ruler size={16} /> Measure distance
            </button>
          </section>
        </aside>

        <section className="viewer-stage panel" aria-busy={state.loading}>
          <div className="viewer-grid" />
          <MolecularViewer />
          <div className="viewer-hud viewer-hud-top">
            <div className="structure-pill">
              <span className="live-dot" />
              <div>
                <strong>{state.structure?.id ?? "No structure"}</strong>
                <span>{state.structure ? `${state.structure.source} · mmCIF` : "Ready for a PDB ID"}</span>
              </div>
            </div>
            {state.summary && (
              <div className="hud-stats">
                <span><b>{state.summary.chainCount}</b> chains</span>
                <span><b>{state.summary.residueCount}</b> residues</span>
                <span><b>{state.summary.atomCount.toLocaleString()}</b> atoms</span>
              </div>
            )}
          </div>

          <div className="viewer-tools" aria-label="Viewer camera controls">
            <button onClick={() => viewerPort.zoom(1.15)} aria-label="Zoom in"><Plus size={17} /></button>
            <button onClick={() => viewerPort.zoom(0.87)} aria-label="Zoom out"><Minus size={17} /></button>
            <button className={spinning ? "active" : ""} onClick={toggleSpin} aria-label="Toggle rotation"><RotateCw size={17} /></button>
            <button
              onClick={() => void commandBus.execute("reset_workspace", { scope: "view" }, { origin: "human" })}
              aria-label="Reset view"
            ><Maximize2 size={17} /></button>
          </div>

          <div className="viewer-legend">
            <span><i className="legend-selected" /> Selected</span>
            <span><i className="legend-measure" /> Measurement</span>
            <span><i className="legend-heuristic" /> Heuristic</span>
          </div>

          {state.loading && (
            <div className="loading-overlay">
              <div className="loading-orbit"><Atom size={27} /><i /><i /></div>
              <strong>Resolving molecular coordinates</strong>
              <span>Parsing mmCIF and preparing the shared 3D scene…</span>
            </div>
          )}

          {!state.loading && !state.structure && (
            <div className="empty-state">
              <div><Atom size={34} /></div>
              <h2>Start with a molecular structure</h2>
              <p>Load a PDB ID manually or ask an agent to prepare the workspace.</p>
              <button onClick={() => loadStructure("1CRN")}><Sparkles size={16} /> Load the 1CRN demo</button>
            </div>
          )}

          <div className="viewer-footer">
            <span><CircleDot size={13} /> Drag to rotate · scroll to zoom · right-drag to translate</span>
            <span className="render-badge"><Zap size={12} /> WebGL live</span>
          </div>
        </section>

        <aside className="inspector-panel panel">
          <PanelTitle icon={<Activity size={18} />} eyebrow="Live analysis" title="Structure inspector" />

          <section className="summary-card">
            <div className="card-heading">
              <div>
                <span>Current structure</span>
                <strong>{state.structure?.id ?? "—"}</strong>
              </div>
              <div className="source-badge">{state.structure?.source ?? "waiting"}</div>
            </div>
            <div className="metrics-grid">
              <Metric value={state.summary?.chainCount ?? "—"} label="Chains" />
              <Metric value={state.summary?.residueCount ?? "—"} label="Residues" />
              <Metric value={state.summary?.atomCount.toLocaleString() ?? "—"} label="Atoms" />
              <Metric value={state.summary?.ligandCount ?? "—"} label="Ligands" />
            </div>
            {state.summary && (
              <div className="chain-list"><span>Chains</span><strong>{state.summary.chains.join(" · ") || "Unassigned"}</strong></div>
            )}
          </section>

          <section className="mutation-card">
            <div className="card-kicker"><Sparkles size={15} /> Mutation context</div>
            <div className="mutation-inputs">
              <label>Chain<input value={mutationChain} onChange={(e) => setMutationChain(e.target.value.toUpperCase())} /></label>
              <label>Residue<input type="number" value={mutationResidue} onChange={(e) => setMutationResidue(e.target.value)} /></label>
              <label>To
                <select value={mutationTarget} onChange={(e) => setMutationTarget(e.target.value)}>
                  {"ARNDCQEGHILKMFPSTWYV".split("").map((code) => <option key={code}>{code}</option>)}
                </select>
              </label>
            </div>
            <button onClick={previewMutation} disabled={!state.structure}>
              Preview local context <ChevronRight size={15} />
            </button>
            <p><Info size={13} /> Visual context and physicochemical heuristic only.</p>
          </section>

          {(state.measurement || state.mutation) && (
            <section className={`result-card ${state.mutation ? "heuristic-result" : "measurement-result"}`}>
              {state.measurement && (
                <>
                  <div className="result-title"><Ruler size={16} /><span>Calculated distance</span><strong>{state.measurement.angstroms.toFixed(2)} Å</strong></div>
                  <p>{state.measurement.from.chain}:{state.measurement.from.residueNumber}:{state.measurement.from.atomName} → {state.measurement.to.chain}:{state.measurement.to.residueNumber}:{state.measurement.to.atomName}</p>
                </>
              )}
              {state.mutation && (
                <>
                  <div className="result-title"><Sparkles size={16} /><span>Heuristic preview</span><strong>{state.mutation.originalAminoAcid} → {state.mutation.targetAminoAcid}</strong></div>
                  <div className="heuristic-list">
                    {state.mutation.heuristics.map((item) => (
                      <div key={item.dimension}>
                        <span>{item.dimension}</span>
                        <strong>{item.from} → {item.to}</strong>
                        <i className={item.changed ? "changed" : "same"}>{item.changed ? "change" : "similar"}</i>
                      </div>
                    ))}
                  </div>
                  <p>{state.mutation.neighbors.length} nearby residues within 5 Å. No stability prediction.</p>
                </>
              )}
            </section>
          )}

          <section className="activity-section">
            <div className="section-label">
              <span>Shared activity</span>
              <small>{state.activity.length} events</small>
            </div>
            <div className="activity-list" aria-live="polite">
              {state.activity.length === 0 ? (
                <div className="activity-empty"><Bot size={18} /><span>Human and agent actions will appear here.</span></div>
              ) : state.activity.slice(0, 8).map((entry) => (
                <div className="activity-item" key={entry.id}>
                  <div className={`activity-icon ${entry.origin} ${entry.status}`}>
                    {entry.origin === "agent" ? <Bot size={14} /> : <CircleDot size={14} />}
                  </div>
                  <div>
                    <strong>{entry.message}</strong>
                    <span>{entry.origin} · {entry.durationMs} ms</span>
                  </div>
                  {entry.status === "success" ? <Check size={14} className="success-icon" /> : <X size={14} className="error-icon" />}
                </div>
              ))}
            </div>
          </section>

          <button
            className="reset-button"
            onClick={() => void commandBus.execute("reset_workspace", { scope: "all" }, { origin: "human" })}
          ><RefreshCcw size={15} /> Clear workspace</button>
        </aside>
      </main>

      {state.error && (
        <div className="error-toast" role="alert">
          <div><Info size={17} /><span>{state.error}</span></div>
          <button onClick={() => state.setError(undefined)} aria-label="Dismiss error"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

export default App;
