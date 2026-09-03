import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  Activity,
  AlertTriangle,
  Atom,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Dna,
  Eye,
  Focus,
  UserRound,
  Info,
  Layers3,
  LoaderCircle,
  Maximize2,
  Minus,
  Palette,
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
import { registerBioFoldTools, unregisterBioFoldTools } from "./adapters/webmcp";
import { viewerPort } from "./adapters/viewerPort";
import { geometryClient } from "./adapters/geometryClient";
import { commandBus } from "./core/commandBus";
import {
  executionToProjectEvent,
  projectEventToActivity,
  restoreWorkspaceSnapshot,
} from "./core/projectWorkspace";
import { captureWorkspaceSnapshot } from "./core/workspaceSnapshot";
import { workspaceSession } from "./core/workspaceSession";
import { getAssistantServices } from "./assistant/assistantService";
import { InspectorPanel } from "./features/assistant/ui";
import { PersistenceIndicator } from "./features/projects/PersistenceIndicator";
import type { PersistenceState } from "./features/projects/types";
import { useAppStore } from "./store/appStore";
import "./styles.css";
import type { CommandProposal } from "./types/assistant";
import type { ProjectDataPort, ProjectEventDraft, WorkspaceSnapshotV1 } from "./types/projects";
import type {
  ActivityEntry,
  ColorScheme,
  CommandName,
  RepresentationStyle,
} from "./types/domain";

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

const COMMAND_LABELS: Record<CommandName, string> = {
  load_structure: "Structure",
  get_structure_summary: "Summary",
  focus_residues: "Focus",
  set_representation: "Representation",
  show_surface: "Surface",
  measure_distance: "Distance",
  preview_mutation_context: "Mutation context",
  reset_workspace: "Workspace",
};

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function formatActivityTime(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
}

function MolecularViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const setViewerReady = useAppStore((state) => state.setViewerReady);
  const setError = useAppStore((state) => state.setError);

  useEffect(() => {
    if (!containerRef.current) return;
    try {
      viewerPort.attach(containerRef.current);
      setViewerReady(true);
    } catch (error) {
      setViewerReady(false);
      setError(error instanceof Error ? error.message : "WebGL initialization failed.");
      return;
    }
    const resizeObserver = new ResizeObserver(() => viewerPort.resize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      viewerPort.dispose();
      setViewerReady(false);
    };
  }, [setError, setViewerReady]);

  return <div ref={containerRef} className="molecular-canvas" aria-label="Interactive 3D molecular viewer" />;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function PanelTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-icon">{icon}</div>
      <div><span>{eyebrow}</span><h2>{title}</h2></div>
    </div>
  );
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const originLabel = entry.agentKind === "assistant" && entry.approvedByUser
    ? "Assistant · confirmed"
    : entry.agentKind === "webmcp" ? "WebMCP agent" : entry.origin;
  return (
    <article
      className={`activity-item ${entry.status}`}
      data-activity-id={entry.id}
      data-command={entry.command}
      data-origin={entry.origin}
      data-status={entry.status}
    >
      <div className={`activity-icon ${entry.origin} ${entry.status}`}>
        {entry.origin === "agent" ? <Bot size={15} /> : <CircleDot size={15} />}
      </div>
      <div className="activity-copy">
        <div className="activity-meta">
          <span className="activity-command">{COMMAND_LABELS[entry.command]}</span>
          <span className={`activity-origin ${entry.origin}`}>{originLabel}</span>
        </div>
        <strong>{entry.message}</strong>
        <span className="activity-timing"><Clock3 size={11} /> {formatActivityTime(entry.createdAt)} · {entry.durationMs} ms</span>
      </div>
      {entry.status === "success"
        ? <Check size={15} className="success-icon" aria-label="Success" />
        : <X size={15} className="error-icon" aria-label="Error" />}
    </article>
  );
}

function executeAssistantProposal(proposal: CommandProposal, sourceMessageId: string) {
  const context = {
    origin: "agent" as const,
    agentKind: "assistant" as const,
    approvedByUser: true,
    sourceMessageId,
  };
  switch (proposal.command) {
    case "load_structure": return commandBus.execute("load_structure", proposal.input, context);
    case "get_structure_summary": return commandBus.execute("get_structure_summary", proposal.input, context);
    case "focus_residues": return commandBus.execute("focus_residues", proposal.input, context);
    case "set_representation": return commandBus.execute("set_representation", proposal.input, context);
    case "show_surface": return commandBus.execute("show_surface", proposal.input, context);
    case "measure_distance": return commandBus.execute("measure_distance", proposal.input, context);
    case "preview_mutation_context": return commandBus.execute("preview_mutation_context", proposal.input, context);
    case "reset_workspace": return commandBus.execute("reset_workspace", proposal.input, context);
  }
}

function Laboratory({ active = true, initialPdbId = "1CRN", requestKey = "initial", projectId, projectDataPort }: {
  active?: boolean;
  initialPdbId?: string;
  requestKey?: string;
  projectId?: string;
  projectDataPort?: ProjectDataPort;
}) {
  const state = useAppStore();
  const [pdbId, setPdbId] = useState("1CRN");
  const [focusChain, setFocusChain] = useState("A");
  const [focusResidue, setFocusResidue] = useState("10");
  const [measureFrom, setMeasureFrom] = useState({ chain: "A", residue: "1", atom: "CA" });
  const [measureTo, setMeasureTo] = useState({ chain: "A", residue: "10", atom: "CA" });
  const [mutationChain, setMutationChain] = useState("A");
  const [mutationResidue, setMutationResidue] = useState("10");
  const [mutationTarget, setMutationTarget] = useState("W");
  const [surfaceOpacity, setSurfaceOpacity] = useState(state.surfaceOpacity);
  const [spinning, setSpinning] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceState>("idle");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectReloadToken, setProjectReloadToken] = useState(0);
  const lastRequest = useRef<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const assistantServices = useMemo(() => getAssistantServices(), []);
  const projectRevisionRef = useRef<number | null>(null);
  const projectBlockedRef = useRef(false);
  const projectSuppressRef = useRef(false);
  const hydratedProjectRef = useRef<string | null>(null);
  const persistenceControllerRef = useRef<AbortController | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cameraTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (active) document.title = `${state.structure?.id ? `${state.structure.id} · ` : ""}Laboratory · BioFold 3D`;
  }, [active, state.structure?.id]);
  useEffect(() => {
    if (active) workspaceRef.current?.focus({ preventScroll: true });
  }, [active]);

  const surfaceBusy = state.surfaceOperation.status === "loading";
  const surfaceFailed = state.surfaceOperation.status === "error";
  const surfaceStatusLabel = surfaceBusy
    ? "Computing surface…"
    : surfaceFailed
      ? "Surface failed"
      : state.surfaceVisible
        ? `Surface · ${Math.round(state.surfaceOpacity * 100)}%`
        : "Surface off";

  const enqueuePersistence = useCallback((
    snapshot?: WorkspaceSnapshotV1,
    event?: ProjectEventDraft,
  ) => {
    if (!projectId || !projectDataPort || projectBlockedRef.current) return;
    const controller = persistenceControllerRef.current;
    if (!controller || controller.signal.aborted) return;

    persistenceQueueRef.current = persistenceQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (controller.signal.aborted || projectBlockedRef.current) return;
        setPersistenceStatus("saving");
        setProjectError(null);

        if (snapshot) {
          const expectedRevision = projectRevisionRef.current;
          if (expectedRevision === null) return;
          const saved = await projectDataPort.saveSnapshot({
            projectId,
            expectedRevision,
            snapshot,
          }, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!saved.ok) {
            projectBlockedRef.current = saved.error.code === "CONFLICT";
            setPersistenceStatus(saved.error.code === "CONFLICT"
              ? "conflict"
              : typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
            setProjectError(saved.error.message);
            return;
          }
          projectRevisionRef.current = saved.data.revision;
        }

        if (event) {
          const appended = await projectDataPort.appendEvent(projectId, event, { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (!appended.ok) {
            setPersistenceStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
            setProjectError(appended.error.message);
            return;
          }
        }

        setPersistenceStatus("saved");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistenceStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        setProjectError(error instanceof Error ? error.message : "The project could not be saved.");
      });
  }, [projectDataPort, projectId]);

  useEffect(() => {
    if (!active || !state.viewerReady || !projectId || !projectDataPort) return;
    const identity = workspaceSession.getSnapshot().identity;
    const attemptKey = `${identity}:${projectId}:${projectReloadToken}`;
    if (hydratedProjectRef.current === attemptKey && projectRevisionRef.current !== null) return;
    hydratedProjectRef.current = attemptKey;
    const controller = new AbortController();
    projectSuppressRef.current = true;
    projectBlockedRef.current = false;
    setPersistenceStatus("saving");
    setProjectError(null);

    void (async () => {
      const loaded = await projectDataPort.getProject(projectId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!loaded.ok) throw new Error(loaded.error.message);
      projectRevisionRef.current = loaded.data.revision;
      setPdbId(loaded.data.activePdbId ?? initialPdbId);
      await restoreWorkspaceSnapshot(loaded.data.snapshot, controller.signal);
      const events = await projectDataPort.listEvents(projectId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!events.ok) throw new Error(events.error.message);
      useAppStore.getState().replaceActivity(events.data.map(projectEventToActivity));
      setPersistenceStatus("saved");
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      projectRevisionRef.current = null;
      setPersistenceStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
      setProjectError(error instanceof Error ? error.message : "The saved project could not be opened.");
    }).finally(() => {
      if (!controller.signal.aborted) projectSuppressRef.current = false;
    });

    return () => {
      controller.abort();
      projectSuppressRef.current = false;
    };
  }, [active, initialPdbId, projectDataPort, projectId, projectReloadToken, state.viewerReady]);

  useEffect(() => {
    if (!active || !state.viewerReady || !projectId || !projectDataPort) return;
    persistenceControllerRef.current?.abort();
    const controller = new AbortController();
    persistenceControllerRef.current = controller;
    persistenceQueueRef.current = Promise.resolve();

    const unsubscribeCommands = commandBus.subscribe((execution) => {
      if (projectSuppressRef.current || controller.signal.aborted) return;
      const snapshot = execution.result.ok && execution.command !== "get_structure_summary"
        ? captureWorkspaceSnapshot()
        : undefined;
      enqueuePersistence(snapshot, executionToProjectEvent(execution));
    });
    const unsubscribeCamera = viewerPort.subscribeViewChanges((camera) => {
      if (projectSuppressRef.current || controller.signal.aborted || projectRevisionRef.current === null) return;
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = window.setTimeout(() => {
        if (!controller.signal.aborted && !projectSuppressRef.current) {
          enqueuePersistence(captureWorkspaceSnapshot(camera));
        }
      }, 700);
    });

    return () => {
      controller.abort();
      unsubscribeCommands();
      unsubscribeCamera();
      if (cameraTimerRef.current) window.clearTimeout(cameraTimerRef.current);
      cameraTimerRef.current = null;
    };
  }, [active, enqueuePersistence, projectDataPort, projectId, state.viewerReady]);

  useLayoutEffect(() => {
    const unsubscribe = workspaceSession.subscribe((next, previous) => {
      if (!next.active) viewerPort.setSuspended(true);
      if (next.identity !== previous.identity) {
        geometryClient.dispose();
        viewerPort.dispose();
      }
    });
    return () => {
      unsubscribe();
      unregisterBioFoldTools();
      geometryClient.dispose();
      viewerPort.dispose();
    };
  }, []);

  useEffect(() => {
    viewerPort.setSuspended(!active);
    if (!active) setSpinning(false);
    if (!active || !state.viewerReady) return;
    const register = () => { void registerBioFoldTools(); };
    register();
    const retry = window.setInterval(() => {
      if (useAppStore.getState().webmcpStatus !== "ready") register();
    }, 2000);
    window.addEventListener("focus", register);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener("focus", register);
      unregisterBioFoldTools();
    };
  }, [active, state.viewerReady]);

  useEffect(() => {
    if (!active || !state.viewerReady || projectId || lastRequest.current === requestKey) return;
    // A plain return to the lab preserves its current model. Explicit example links load anew.
    if (lastRequest.current !== null && requestKey === "initial") return;
    lastRequest.current = requestKey;
    setPdbId(initialPdbId);
    void commandBus.execute("load_structure", { pdbId: initialPdbId }, { origin: "human" });
  }, [active, state.viewerReady, initialPdbId, projectId, requestKey]);

  useEffect(() => setSurfaceOpacity(state.surfaceOpacity), [state.surfaceOpacity]);

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
    void commandBus.execute("set_representation", { style, colorScheme }, { origin: "human" });

  const setColorScheme = (colorScheme: ColorScheme) =>
    void commandBus.execute(
      "set_representation",
      { style: state.representation, colorScheme },
      { origin: "human" },
    );

  const toggleSurface = (visible: boolean, opacity = surfaceOpacity) =>
    void commandBus.execute("show_surface", { visible, opacity }, { origin: "human" });

  const retrySurface = () => {
    if (state.surfaceOperation.status !== "error") return;
    const request = state.surfaceOperation.request;
    setSurfaceOpacity(request.opacity);
    toggleSurface(request.visible, request.opacity);
  };

  const focusSelection = () =>
    void commandBus.execute(
      "focus_residues",
      { residues: [{ chain: focusChain, residueNumber: Number(focusResidue) }], label: true },
      { origin: "human" },
    );

  const measure = () =>
    void commandBus.execute(
      "measure_distance",
      {
        from: { chain: measureFrom.chain, residueNumber: Number(measureFrom.residue), atomName: measureFrom.atom },
        to: { chain: measureTo.chain, residueNumber: Number(measureTo.residue), atomName: measureTo.atom },
      },
      { origin: "human" },
    );

  const previewMutation = () =>
    void commandBus.execute(
      "preview_mutation_context",
      { residue: { chain: mutationChain, residueNumber: Number(mutationResidue) }, toAminoAcid: mutationTarget },
      { origin: "human" },
    );

  const toggleSpin = () => {
    const next = !spinning;
    setSpinning(next);
    viewerPort.spin(next);
  };

  return (
    <div className="app-shell laboratory-root">
      <header className="topbar">
        <Link className="brand" to="/app" aria-label="BioFold 3D home">
          <div className="brand-mark"><Dna size={22} strokeWidth={1.8} /></div>
          <div><strong>BioFold <em>3D</em></strong><span>Agentic molecular workspace</span></div>
        </Link>

        <form className="structure-search" onSubmit={onLoadSubmit}>
          <Search size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="pdb-id">PDB structure ID</label>
          <input id="pdb-id" value={pdbId} maxLength={4} onChange={(event) => setPdbId(event.target.value.toUpperCase())} placeholder="Enter PDB ID" autoComplete="off" />
          <button type="submit" disabled={state.loading}>
            {state.loading ? <LoaderCircle className="spin" size={16} /> : <ChevronRight size={16} />} Explore
          </button>
        </form>

        <div className="header-actions">
          <button className="sample-chip" onClick={() => loadStructure("1CRN")}>1CRN</button>
          <button className="sample-chip" onClick={() => loadStructure("4HHB")}>4HHB</button>
          {projectId && <PersistenceIndicator
            status={persistenceStatus}
            revision={projectRevisionRef.current ?? undefined}
            onResolveConflict={() => setProjectReloadToken((value) => value + 1)}
            onRetry={() => setProjectReloadToken((value) => value + 1)}
            className="lab-persistence-indicator"
          />}
          <div
            className={`agent-status ${state.webmcpStatus === "ready" ? "is-ready" : ""} ${state.webmcpStatus === "partial" ? "is-partial" : ""}`}
            title={state.webmcpError ?? (state.webmcpSupported ? "WebMCP tools registered" : "Human controls remain fully available")}
          >
            <span className="status-light" /><Bot size={16} />
            <div>
              <strong>{state.webmcpStatus === "registering" ? "Connecting agent" : state.webmcpSupported ? `${state.registeredToolCount} agent tools` : "Human mode"}</strong>
              <span>{state.webmcpStatus === "ready" ? "WebMCP ready" : state.webmcpStatus === "partial" ? "WebMCP partial" : state.webmcpStatus === "error" ? "WebMCP error" : state.webmcpStatus === "registering" ? "Registering tools" : "WebMCP unavailable"}</span>
            </div>
          </div>
          <Link className="icon-button account-link" to="/app/account" aria-label="Account"><UserRound size={18} aria-hidden="true" /><span>Account</span></Link>
        </div>
      </header>

      <main ref={workspaceRef} id="workspace" className="workspace" tabIndex={-1} aria-label="Molecular laboratory">
        <aside className="control-panel panel">
          <PanelTitle icon={<Waves size={18} />} eyebrow="Scene controls" title="Molecular view" />

          <section className="control-section">
            <div className="section-label"><span>Representation</span><small>Global</small></div>
            <div className="segmented-grid">
              {REPRESENTATIONS.map((option) => (
                <button key={option.value} className={state.representation === option.value ? "active" : ""} disabled={!state.structure} onClick={() => setRepresentation(option.value)} aria-pressed={state.representation === option.value}>
                  <span className={`style-glyph glyph-${option.value}`} />{option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="control-section">
            <div className="section-label"><span>Color</span><small>Scientific</small></div>
            <div className="color-options">
              {COLOR_SCHEMES.map((option) => (
                <button key={option.value} className={state.colorScheme === option.value ? "active" : ""} disabled={!state.structure} onClick={() => setColorScheme(option.value)} aria-pressed={state.colorScheme === option.value}>
                  <span className={`color-swatch swatch-${option.value}`} />{option.label}{state.colorScheme === option.value && <Check size={15} />}
                </button>
              ))}
            </div>
          </section>

          <section className="control-section surface-control" aria-busy={surfaceBusy}>
            <div className="section-label"><span>Surface</span><small>VDW</small></div>
            <div className={`surface-state ${surfaceBusy ? "loading" : ""} ${surfaceFailed ? "error" : ""}`}>
              <div role="status" aria-live="polite">
                {surfaceBusy ? <LoaderCircle className="spin" size={17} /> : surfaceFailed ? <AlertTriangle size={17} /> : <Eye size={17} />}
                <span>{surfaceBusy ? "Computing surface…" : surfaceFailed ? "Surface failed" : state.surfaceVisible ? "Surface visible" : "Surface hidden"}</span>
              </div>
              <button role="switch" aria-label="Molecular surface" aria-checked={state.surfaceVisible} className={`switch ${state.surfaceVisible ? "on" : ""}`} disabled={!state.structure || surfaceBusy} onClick={() => toggleSurface(!state.surfaceVisible)}><span /></button>
            </div>
            <label className="range-label">
              <span>Opacity</span><output aria-live="polite">{Math.round(surfaceOpacity * 100)}%</output>
              <input type="range" min="0.1" max="1" step="0.01" value={surfaceOpacity} aria-label="Surface opacity" aria-valuetext={`${Math.round(surfaceOpacity * 100)} percent`} disabled={!state.structure || surfaceBusy} onChange={(event) => setSurfaceOpacity(Number(event.target.value))} onPointerUp={() => state.surfaceVisible && toggleSurface(true)} onKeyUp={(event) => { if (state.surfaceVisible && event.key.startsWith("Arrow")) toggleSurface(true); }} />
            </label>
            {state.surfaceOperation.status === "error" && (
              <div className="surface-error" role="alert">
                <AlertTriangle size={15} />
                <div>
                  <strong>Surface render failed</strong><span>{state.surfaceOperation.message}</span>
                  <div className="surface-error-actions"><button onClick={retrySurface}>Retry</button><button onClick={state.clearSurfaceError}>Dismiss</button></div>
                </div>
              </div>
            )}
          </section>

          <section className="control-section compact-form">
            <div className="section-label"><span>Focus</span><small>Selection</small></div>
            <div className="input-pair">
              <label>Chain<input value={focusChain} onChange={(event) => setFocusChain(event.target.value.toUpperCase())} /></label>
              <label>Residue<input type="number" value={focusResidue} onChange={(event) => setFocusResidue(event.target.value)} /></label>
            </div>
            <button className="primary-action" onClick={focusSelection} disabled={!state.structure}><Focus size={16} /> Focus in 3D</button>
          </section>

          <section className="control-section compact-form distance-control">
            <div className="section-label"><span>Distance</span><small>Ångström</small></div>
            <div className="measure-grid measure-head" aria-hidden="true"><span /><span>Chain</span><span>Residue</span><span>Atom</span></div>
            <div className="measure-grid">
              <span className="endpoint-label">From</span>
              <input aria-label="From chain" value={measureFrom.chain} onChange={(event) => setMeasureFrom({ ...measureFrom, chain: event.target.value.toUpperCase() })} />
              <input aria-label="From residue" type="number" value={measureFrom.residue} onChange={(event) => setMeasureFrom({ ...measureFrom, residue: event.target.value })} />
              <input aria-label="From atom" value={measureFrom.atom} onChange={(event) => setMeasureFrom({ ...measureFrom, atom: event.target.value.toUpperCase() })} />
            </div>
            <div className="measure-grid">
              <span className="endpoint-label">To</span>
              <input aria-label="To chain" value={measureTo.chain} onChange={(event) => setMeasureTo({ ...measureTo, chain: event.target.value.toUpperCase() })} />
              <input aria-label="To residue" type="number" value={measureTo.residue} onChange={(event) => setMeasureTo({ ...measureTo, residue: event.target.value })} />
              <input aria-label="To atom" value={measureTo.atom} onChange={(event) => setMeasureTo({ ...measureTo, atom: event.target.value.toUpperCase() })} />
            </div>
            <button className="secondary-action distance-action" onClick={measure} disabled={!state.structure}><Ruler size={16} /> Measure distance</button>
          </section>
        </aside>

        <section className="viewer-stage panel" aria-busy={state.loading}>
          <div className="viewer-grid" /><MolecularViewer />
          <div className="viewer-hud viewer-hud-top">
            <div className="structure-pill"><span className="live-dot" /><div><strong>{state.structure?.id ?? "No structure"}</strong><span>{state.structure ? `${state.structure.source} · mmCIF` : "Ready for a PDB ID"}</span></div></div>
            {state.summary && <div className="hud-stats"><span><b>{state.summary.chainCount}</b> chains</span><span><b>{state.summary.residueCount}</b> residues</span><span><b>{state.summary.atomCount.toLocaleString()}</b> atoms</span></div>}
          </div>

          <div className="scene-state-hud" aria-label="Current scene state">
            <span className="scene-chip"><Layers3 size={13} /> {titleCase(state.representation)}</span>
            <span className="scene-chip"><Palette size={13} /> {titleCase(state.colorScheme)}</span>
            <span className={`scene-chip surface-chip ${surfaceBusy ? "loading" : ""} ${surfaceFailed ? "error" : ""}`} role="status" aria-live="polite">
              {surfaceBusy ? <LoaderCircle className="spin" size={13} /> : surfaceFailed ? <AlertTriangle size={13} /> : <Eye size={13} />}{surfaceStatusLabel}
            </span>
            {state.measurement && <span className="scene-chip measurement-chip"><Ruler size={13} /> {state.measurement.angstroms.toFixed(2)} Å</span>}
          </div>

          <div className="viewer-tools" aria-label="Viewer camera controls">
            <button onClick={() => viewerPort.zoom(1.15)} aria-label="Zoom in"><Plus size={17} /></button>
            <button onClick={() => viewerPort.zoom(0.87)} aria-label="Zoom out"><Minus size={17} /></button>
            <button className={spinning ? "active" : ""} onClick={toggleSpin} aria-label="Toggle rotation"><RotateCw size={17} /></button>
            <button onClick={() => void commandBus.execute("reset_workspace", { scope: "view" }, { origin: "human" })} aria-label="Reset view"><Maximize2 size={17} /></button>
          </div>
          <div className="viewer-legend"><span><i className="legend-selected" /> Selected</span><span><i className="legend-measure" /> Measurement</span><span><i className="legend-heuristic" /> Heuristic</span></div>

          {state.loading && <div className="loading-overlay"><div className="loading-orbit"><Atom size={27} /><i /><i /></div><strong>Resolving molecular coordinates</strong><span>Parsing mmCIF and preparing the shared 3D scene…</span></div>}
          {!state.loading && !state.structure && <div className="empty-state"><div><Atom size={34} /></div><h2>Start with a molecular structure</h2><p>Load a PDB ID manually or ask an agent to prepare the workspace.</p><button onClick={() => loadStructure("1CRN")}><Sparkles size={16} /> Load the 1CRN demo</button></div>}
          <div className="viewer-footer"><span><CircleDot size={13} /> Drag to rotate · scroll to zoom · right-drag to translate</span><span className="render-badge"><Zap size={12} /> WebGL live</span></div>
        </section>

        <InspectorPanel
          assistantClient={assistantServices.client}
          assistantConversations={assistantServices.conversations}
          assistantEnabled={!assistantServices.remote || Boolean(projectId)}
          projectId={projectId ?? "unsaved-workspace"}
          summary={state.summary}
          measurement={state.measurement}
          mutation={state.mutation}
          activityEntries={state.activity}
          onApplyProposal={executeAssistantProposal}
          className="panel inspector-panel integrated-inspector"
          resultsContent={<div className="legacy-inspector-content">
          <PanelTitle icon={<Activity size={18} />} eyebrow="Live analysis" title="Structure inspector" />
          <section className="summary-card">
            <div className="card-heading"><div><span>Current structure</span><strong>{state.structure?.id ?? "—"}</strong></div><div className="source-badge">{state.structure?.source ?? "waiting"}</div></div>
            <div className="metrics-grid"><Metric value={state.summary?.chainCount ?? "—"} label="Chains" /><Metric value={state.summary?.residueCount ?? "—"} label="Residues" /><Metric value={state.summary?.atomCount.toLocaleString() ?? "—"} label="Atoms" /><Metric value={state.summary?.ligandCount ?? "—"} label="Ligands" /></div>
            {state.summary && <div className="chain-list"><span>Chains</span><strong>{state.summary.chains.join(" · ") || "Unassigned"}</strong></div>}
          </section>

          {(state.measurement || state.mutation) && (
            <section className={`result-card ${state.mutation ? "heuristic-result" : "measurement-result"}`}>
              {state.measurement && <><div className="result-kicker"><Ruler size={15} /> Calculated distance</div><strong className="result-value">{state.measurement.angstroms.toFixed(2)} <small>Å</small></strong><div className="distance-points"><span>{state.measurement.from.chain}:{state.measurement.from.residueNumber}:{state.measurement.from.atomName}</span><ChevronRight size={14} /><span>{state.measurement.to.chain}:{state.measurement.to.residueNumber}:{state.measurement.to.atomName}</span></div></>}
              {state.mutation && <><div className="result-title"><Sparkles size={16} /><span>Heuristic preview</span><strong>{state.mutation.originalAminoAcid} → {state.mutation.targetAminoAcid}</strong></div><div className="heuristic-list">{state.mutation.heuristics.map((item) => <div key={item.dimension}><span>{item.dimension}</span><strong>{item.from} → {item.to}</strong><i className={item.changed ? "changed" : "same"}>{item.changed ? "change" : "similar"}</i></div>)}</div><p>{state.mutation.neighbors.length} nearby residues within 5 Å. No stability prediction.</p></>}
            </section>
          )}

          <section className="mutation-card">
            <div className="card-kicker"><Sparkles size={15} /> Mutation context</div>
            <div className="mutation-inputs"><label>Chain<input value={mutationChain} onChange={(event) => setMutationChain(event.target.value.toUpperCase())} /></label><label>Residue<input type="number" value={mutationResidue} onChange={(event) => setMutationResidue(event.target.value)} /></label><label>To<select value={mutationTarget} onChange={(event) => setMutationTarget(event.target.value)}>{"ARNDCQEGHILKMFPSTWYV".split("").map((code) => <option key={code}>{code}</option>)}</select></label></div>
            <button onClick={previewMutation} disabled={!state.structure}>Preview local context <ChevronRight size={15} /></button>
            <p><Info size={14} /> Visual context and physicochemical heuristic only.</p>
          </section>

          <section className="activity-section">
            <div className="section-label activity-heading"><span>Shared activity</span><small>{state.activity.length} events</small></div>
            <div className="activity-list" aria-live="polite" aria-relevant="additions">
              {state.activity.length === 0 ? <div className="activity-empty"><Bot size={19} /><span>Human and agent actions will appear here.</span></div> : state.activity.slice(0, 8).map((entry) => <ActivityItem entry={entry} key={entry.id} />)}
            </div>
          </section>
          <button className="reset-button" onClick={() => void commandBus.execute("reset_workspace", { scope: "all" }, { origin: "human" })}><RefreshCcw size={15} /> Clear workspace</button>
          </div>}
        />
      </main>

      {projectError && <div className="project-sync-error" role="alert">
        <span>{projectError}</span>
        <button type="button" onClick={() => setProjectReloadToken((value) => value + 1)}>Reload saved project</button>
      </div>}
      {state.error && <div className="error-toast" role="alert"><div><Info size={17} /><span>{state.error}</span></div><button onClick={() => state.setError(undefined)} aria-label="Dismiss error"><X size={16} /></button></div>}
    </div>
  );
}

export default Laboratory;
