import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  Activity,
  AlertTriangle,
  Atom,
  Bookmark,
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock3,
  Dna,
  Download,
  Eye,
  Focus,

  History,
  UserRound,
  Info,
  Layers3,
  LoaderCircle,
  Maximize2,
  Microscope,
  Minus,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCcw,
  RotateCw,
  Ruler,
  Search,
  Share2,
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
import { AssistantChat } from "./features/assistant/ui/AssistantChat";
import { MolecularExplorer } from "./features/explorer/MolecularExplorer";
import { MutationWorkbench } from "./features/workbench/MutationWorkbench";
import { AuditHistoryView } from "./features/audit/AuditHistoryView";
import { getCatalogItem } from "./data/molecularCatalog";
import { PersistenceIndicator } from "./features/projects/PersistenceIndicator";
import type { PersistenceState } from "./features/projects/types";
import { useAppStore } from "./store/appStore";
import { UniversalSearch } from "./components/search/UniversalSearch";
import { BiologicalAnnotationsSection } from "./features/annotations/BiologicalAnnotationsSection";
import { StructureBookmarksSection } from "./features/bookmarks/StructureBookmarksSection";
import { ShareProjectModal } from "./features/sharing/ShareProjectModal";
import { TimeTravelBar } from "./features/timeline/TimeTravelBar";
import { ExportFigureAndReportModal } from "./features/export/ExportFigureAndReportModal";
import { restoreStateToStep } from "./services/timelineReplayService";

import "./styles.css";
import type { CommandProposal } from "./types/assistant";
import type {
  ProjectDataPort,
  ProjectEventDraft,
  ProjectEventRecord,
  WorkspaceSnapshotV1,
} from "./types/projects";
import type {
  ActivityEntry,
  ColorScheme,
  CommandName,
  RepresentationStyle,
} from "./types/domain";

/** Width of the collapsed inspector rail: room for the toggle button only. */
const INSPECTOR_RAIL_WIDTH = 48;

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
  export_publication_figure: "Export Figure",
  annotate_active_site: "Annotate Site",
  query_uniprot_annotations: "UniProt Annotations",
  compare_structures_rmsd: "RMSD Alignment",
  save_project_snapshot: "Save Snapshot",
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
    case "export_publication_figure": return commandBus.execute("export_publication_figure", proposal.input, context);
    case "annotate_active_site": return commandBus.execute("annotate_active_site", proposal.input, context);
    case "query_uniprot_annotations": return commandBus.execute("query_uniprot_annotations", proposal.input, context);
    case "compare_structures_rmsd": return commandBus.execute("compare_structures_rmsd", proposal.input, context);
    case "save_project_snapshot": return commandBus.execute("save_project_snapshot", proposal.input, context);
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

  const [activeScreen, setActiveScreen] = useState<"studio" | "explorer" | "workbench" | "copilot" | "audit">("studio");
  const [isCopilotSidebarOpen, setIsCopilotSidebarOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTimeTravelOpen, setIsTimeTravelOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [projectTitle, setProjectTitle] = useState<string>("Molecular Project");
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isSceneDockOpen, setIsSceneDockOpen] = useState(true);
  const [isGeometryDockOpen, setIsGeometryDockOpen] = useState(true);
  const [inspectorSubTab, setInspectorSubTab] = useState<"all" | "overview" | "bio_bookmarks" | "activity">("all");

  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    try {
      const val = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("biofold_left_sidebar_width") : null;
      if (val) return Math.max(240, Math.min(500, Number(val)));
      if (typeof window !== "undefined" && window.innerWidth <= 1180) return 260;
      return 300;
    } catch {
      return 300;
    }
  });
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    try {
      const val = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem("biofold_right_sidebar_width") : null;
      if (val) return Math.max(240, Math.min(500, Number(val)));
      if (typeof window !== "undefined" && window.innerWidth <= 1180) return 260;
      return 290;
    } catch {
      return 290;
    }
  });
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const effectiveLeftWidth = useMemo(() => {
    if (isLeftPanelCollapsed) return 0;
    if (typeof window !== "undefined") {
      const maxAllowed = Math.max(240, Math.floor(window.innerWidth * 0.28));
      return Math.min(leftSidebarWidth, maxAllowed);
    }
    return leftSidebarWidth;
  }, [isLeftPanelCollapsed, leftSidebarWidth]);

  const effectiveRightWidth = useMemo(() => {
    // Collapsing the inspector has to shrink the grid track, not just the panel
    // inside it, or the reclaimed width stays as an empty gap.
    if (isInspectorCollapsed) return INSPECTOR_RAIL_WIDTH;
    if (typeof window !== "undefined") {
      const maxAllowed = Math.max(240, Math.floor(window.innerWidth * 0.28));
      return Math.min(rightSidebarWidth, maxAllowed);
    }
    return rightSidebarWidth;
  }, [rightSidebarWidth, isInspectorCollapsed]);

  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  }, []);

  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
  }, []);

  useEffect(() => {
    if (!isDraggingLeft && !isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const maxAllowed = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.38) : 500;
        const newWidth = Math.max(240, Math.min(maxAllowed, e.clientX));
        setLeftSidebarWidth(newWidth);
        try {
          window.localStorage?.setItem("biofold_left_sidebar_width", String(newWidth));
        } catch {}
      } else if (isDraggingRight) {
        const maxAllowed = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.38) : 500;
        const newWidth = Math.max(240, Math.min(maxAllowed, window.innerWidth - e.clientX));
        setRightSidebarWidth(newWidth);
        try {
          window.localStorage?.setItem("biofold_right_sidebar_width", String(newWidth));
        } catch {}
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      viewerPort.resize();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight]);

  const projectEventsRef = useRef<ProjectEventRecord[]>([]);
  const currentCatalogItem = useMemo(() => getCatalogItem(state.structure?.id ?? pdbId), [state.structure?.id, pdbId]);
  const navigate = useNavigate();

  const handleSnapshotToVision = () => {
    try {
      const snapshot = viewerPort.capturePngURI();
      if (snapshot) {
        sessionStorage.setItem("biofold_pending_vision_snapshot", snapshot);
        sessionStorage.setItem("biofold_pending_vision_target", state.structure?.id ?? pdbId);
      }
    } catch {
      /* ignore */
    }
    navigate("/app/vision");
  };

  useEffect(() => {
    if (activeScreen === "studio") {
      window.setTimeout(() => viewerPort.resize(), 50);
    }
  }, [activeScreen, isLeftPanelCollapsed, isInspectorCollapsed]);

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
    if (hydratedProjectRef.current === attemptKey && projectRevisionRef.current !== null) {
      if (typeof viewerPort.hasModel === "function" && !viewerPort.hasModel() && state.structure?.id) {
        void commandBus.execute("load_structure", { pdbId: state.structure.id }, { origin: "human" });
      }
      return;
    }
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
      setProjectTitle(loaded.data.title);
      setPdbId(loaded.data.activePdbId ?? initialPdbId);
      await restoreWorkspaceSnapshot(loaded.data.snapshot, controller.signal);
      const events = await projectDataPort.listEvents(projectId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!events.ok) throw new Error(events.error.message);
      projectEventsRef.current = events.data;
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
      const eventDraft = executionToProjectEvent(execution);
      projectEventsRef.current.push(eventDraft as ProjectEventRecord);
      enqueuePersistence(snapshot, eventDraft);
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
    if (!active || !state.viewerReady) return;

    // Automatic recovery: if the 3D viewer has lost its model (e.g. remount, hot-reload, tab switch),
    // immediately re-load the current structure and restore view state so the canvas never stays black.
    const modelMissing = typeof viewerPort.hasModel === "function" ? !viewerPort.hasModel() : false;
    if (modelMissing) {
      const targetPdbId = (state.structure?.id ?? initialPdbId ?? pdbId).trim().toUpperCase();
      if (targetPdbId) {
        lastRequest.current = requestKey;
        setPdbId(targetPdbId);
        void commandBus.execute("load_structure", { pdbId: targetPdbId }, { origin: "human" }).then(() => {
          if (state.representation && state.colorScheme) {
            void commandBus.execute("set_representation", { style: state.representation, colorScheme: state.colorScheme }, { origin: "human" });
          }
          if (state.measurement) {
            void commandBus.execute("measure_distance", { from: state.measurement.from, to: state.measurement.to }, { origin: "human" });
          }
        });
        return;
      }
    }

    if (projectId || lastRequest.current === requestKey) return;
    if (lastRequest.current !== null && requestKey === "initial" && (typeof viewerPort.hasModel === "function" ? viewerPort.hasModel() : true)) return;
    lastRequest.current = requestKey;
    setPdbId(initialPdbId);
    void commandBus.execute("load_structure", { pdbId: initialPdbId }, { origin: "human" });
  }, [active, state.viewerReady, initialPdbId, projectId, requestKey, state.structure?.id, state.representation, state.colorScheme, state.measurement, pdbId]);

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

  const handleFlyToResidue = (chain: string, residueNumber: number) =>
    void commandBus.execute(
      "focus_residues",
      { residues: [{ chain, residueNumber }], label: true },
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
          <div className="brand-mark">
            <img
              src="/logo.png"
              alt=""
              aria-hidden="true"
              className="brand-mark-img"
              width="38"
              height="38"
            />
          </div>
          <div><strong>BioFold <em>3D</em></strong><span>Agentic molecular workspace</span></div>
        </Link>

        <UniversalSearch
          currentId={pdbId}
          isLoading={state.loading}
          onSelect={(selectedId) => loadStructure(selectedId)}
        />

        <div className="header-actions">
          {projectId && (
            <button
              type="button"
              className="bf-topbar-btn bf-topbar-share-btn"
              title="Share Project Publicly"
              aria-label="Share Project"
              onClick={() => setIsShareModalOpen(true)}
            >
              <Share2 size={15} />
              <span>Share</span>
            </button>
          )}
          {projectId && <PersistenceIndicator
            status={persistenceStatus}
            revision={projectRevisionRef.current ?? undefined}
            onResolveConflict={() => setProjectReloadToken((value) => value + 1)}
            onRetry={() => setProjectReloadToken((value) => value + 1)}
            className="lab-persistence-indicator"
          />}
          <Link
            className="bf-topbar-btn bf-topbar-vision-btn"
            to="/app/vision"
            title="Multimodal AI Vision Studio (MiniMax M3 / Vision Analysis)"
          >
            <Sparkles size={15} />
            <span>Multimodal AI</span>
          </Link>
          <Link className="bf-topbar-btn account-link" to="/app/account" aria-label="Account">
            <UserRound size={16} aria-hidden="true" />
            <span>Account</span>
          </Link>
        </div>
      </header>

      {/* Secondary Laboratory Navigation for the 5 Specialized Screens */}
      <nav className="lab-subnav" role="tablist" aria-label="Laboratory Workspaces">
        <div className="lab-subnav-screens">
          <button
            type="button"
            className={`lab-screen-tab ${activeScreen === "studio" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("studio")}
            role="tab"
            aria-selected={activeScreen === "studio"}
            aria-label="Studio 3D"
          >
            <Microscope size={15} />
            <span>Studio 3D</span>
          </button>
          <button
            type="button"
            className={`lab-screen-tab ${activeScreen === "explorer" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("explorer")}
            role="tab"
            aria-selected={activeScreen === "explorer"}
            aria-label="Molecular Explorer"
          >
            <Layers3 size={15} />
            <span>Molecular Explorer</span>
            <span className="lab-screen-count-chip">52</span>
          </button>
          <button
            type="button"
            className={`lab-screen-tab ${activeScreen === "workbench" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("workbench")}
            role="tab"
            aria-selected={activeScreen === "workbench"}
            aria-label="Sequence Workbench"
          >
            <Dna size={15} />
            <span>Sequence Workbench</span>
          </button>
          <button
            type="button"
            className={`lab-screen-tab ${activeScreen === "copilot" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("copilot")}
            role="tab"
            aria-selected={activeScreen === "copilot"}
            aria-label="Research Copilot"
          >
            <Bot size={15} />
            <span>Research Copilot</span>
          </button>
          <button
            type="button"
            className={`lab-screen-tab ${activeScreen === "audit" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("audit")}
            role="tab"
            aria-selected={activeScreen === "audit"}
            aria-label="Session Audit"
          >
            <Activity size={15} />
            <span>Session Audit</span>
            <span className="lab-screen-count-chip">{state.activity.length}</span>
          </button>
        </div>

        <div className="lab-subnav-current">
          <span className="lab-current-label">Active:</span>
          <button
            type="button"
            className="lab-current-chip"
            onClick={() => setActiveScreen("explorer")}
            title="Browse all 52 molecules in Molecular Explorer"
          >
            <strong>{state.structure?.id ?? pdbId}</strong>
            <span>{currentCatalogItem?.name ?? "Molecular structure"}</span>
          </button>
        </div>
      </nav>

      <main
        ref={workspaceRef}
        id="workspace"
        className={`workspace ${isLeftPanelCollapsed ? "is-left-collapsed" : ""} ${isDraggingLeft || isDraggingRight ? "is-resizing" : ""}`}
        style={
          typeof window !== "undefined" && window.innerWidth <= 720
            ? undefined
            : {
                gridTemplateColumns: isLeftPanelCollapsed
                  ? `0px minmax(340px, 1fr) ${effectiveRightWidth}px`
                  : `${effectiveLeftWidth}px minmax(340px, 1fr) ${effectiveRightWidth}px`,
              }
        }
        tabIndex={-1}
        aria-label="Molecular laboratory"
      >
        {/* Screen 1: 3D Studio Workspace (always kept mounted to preserve WebGL context) */}
        <div className="lab-studio-view" style={{ display: activeScreen === "studio" ? "contents" : "none" }}>
        <aside className="control-panel panel bf-left-assistant-panel" aria-label="Research Copilot AI">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "11px", paddingRight: "12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="panel-title-icon"><Bot size={18} /></div>
              <div>
                <span style={{ display: "block", color: "var(--faint)", fontSize: "12px", fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase" }}>AI Copilot</span>
                <h2 style={{ margin: "2px 0 0", fontSize: "15px", letterSpacing: "-.01em" }}>Research Assistant</h2>
              </div>
            </div>
            <button
              type="button"
              className="bf-collapse-sidebar-btn"
              onClick={() => setIsLeftPanelCollapsed(true)}
              title="Collapse AI Copilot sidebar to maximize 3D canvas"
              aria-label="Collapse scene controls sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>

          <div className="bf-left-assistant-body">
            <AssistantChat
              assistantClient={assistantServices.client}
              assistantConversations={assistantServices.conversations}
              enabled={!assistantServices.remote || Boolean(projectId)}
              projectId={projectId ?? "unsaved-workspace"}
              onApplyProposal={executeAssistantProposal}
              confirmedActivities={state.activity}
            />
          </div>
        </aside>

        <section className="viewer-stage panel" aria-busy={state.loading}>
          {/* Draggable sidebar resizer splitters */}
          {!isLeftPanelCollapsed && (
            <div
              className="bf-sidebar-resizer bf-resizer-left"
              onMouseDown={handleLeftResizeStart}
              onDoubleClick={() => {
                setLeftSidebarWidth(300);
                try { window.localStorage?.setItem("biofold_left_sidebar_width", "300"); } catch {}
                viewerPort.resize();
              }}
              title="Drag to resize AI Assistant sidebar (double-click to reset)"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize left sidebar"
            />
          )}
          <div
            className="bf-sidebar-resizer bf-resizer-right"
            onMouseDown={handleRightResizeStart}
            onDoubleClick={() => {
              setRightSidebarWidth(290);
              try { window.localStorage?.setItem("biofold_right_sidebar_width", "290"); } catch {}
              viewerPort.resize();
            }}
            title="Drag to resize Inspector sidebar (double-click to reset)"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right sidebar"
          />
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

          {/* zIndex clears .loading-overlay / .empty-state (z-index 9), which cover
              the whole stage and would otherwise swallow the only way back. */}
          {isLeftPanelCollapsed && (
            <button
              type="button"
              className="bf-collapse-sidebar-btn"
              style={{ position: "absolute", top: "76px", left: "16px", zIndex: 10, background: "rgba(7, 15, 13, 0.9)" }}
              onClick={() => setIsLeftPanelCollapsed(false)}
              title="Expand scene controls sidebar"
              aria-label="Expand scene controls sidebar"
            >
              <PanelLeftOpen size={15} />
            </button>
          )}

          <div className="viewer-tools" aria-label="Viewer camera controls">
            <button onClick={() => viewerPort.zoom(1.15)} aria-label="Zoom in"><Plus size={17} /></button>
            <button onClick={() => viewerPort.zoom(0.87)} aria-label="Zoom out"><Minus size={17} /></button>
            <button className={spinning ? "active" : ""} onClick={toggleSpin} aria-label="Toggle rotation"><RotateCw size={17} /></button>
            <button onClick={() => void commandBus.execute("reset_workspace", { scope: "view" }, { origin: "human" })} aria-label="Reset view"><Maximize2 size={17} /></button>
          </div>
          <div className="viewer-legend"><span><i className="legend-selected" /> Selected</span><span><i className="legend-measure" /> Measurement</span><span><i className="legend-heuristic" /> Heuristic</span></div>

          {state.loading && <div className="loading-overlay"><div className="loading-orbit"><Atom size={27} /><i /><i /></div><strong>Resolving molecular coordinates</strong><span>Parsing mmCIF and preparing the shared 3D scene…</span></div>}
          {!state.loading && !state.structure && <div className="empty-state"><div><Atom size={34} /></div><h2>Start with a molecular structure</h2><p>Load a PDB ID manually or ask an agent to prepare the workspace.</p><button onClick={() => loadStructure("1CRN")}><Sparkles size={16} /> Load the 1CRN demo</button></div>}

          {/* Collapsible Horizontal Docks: Scene Controls & Geometry Tools (Aparte los dos) */}
          {state.structure && (
            <div className="bf-bottom-docks-container" role="region" aria-label="Molecular Scene & Geometry Docks">
              {/* Dock 1: Scene Controls */}
              <div className="bf-scene-dock bf-dock-card-scene" role="region" aria-label="Scene Controls Dock">
                <div className="bf-dock-header">
                  <div className="bf-dock-title-group">
                    <Waves size={14} className="bf-dock-title-icon" />
                    <span className="bf-dock-title">Scene Controls</span>
                    <span className="bf-dock-subtitle">Style · Color · Surface</span>
                  </div>
                  <button
                    type="button"
                    className="bf-dock-toggle-btn"
                    onClick={() => setIsSceneDockOpen(!isSceneDockOpen)}
                    title={isSceneDockOpen ? "Minimize Scene Controls" : "Expand Scene Controls"}
                    aria-label={isSceneDockOpen ? "Minimize Scene Controls" : "Expand Scene Controls"}
                  >
                    {isSceneDockOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>

                {isSceneDockOpen && (
                  <div className="bf-dock-body">
                    <div className="bf-dock-controls-ribbon">
                      {/* Representation */}
                      <div className="bf-dock-group">
                        <span className="bf-dock-group-label">Style</span>
                        <div className="bf-dock-pill-group">
                          {REPRESENTATIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`bf-dock-pill ${state.representation === option.value ? "is-active" : ""}`}
                              disabled={!state.structure}
                              onClick={() => setRepresentation(option.value)}
                              title={option.label}
                              aria-pressed={state.representation === option.value}
                            >
                              <span className={`style-glyph glyph-${option.value}`} />
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bf-dock-divider" />

                      {/* Color */}
                      <div className="bf-dock-group">
                        <span className="bf-dock-group-label">Color</span>
                        <div className="bf-dock-pill-group">
                          {COLOR_SCHEMES.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`bf-dock-pill ${state.colorScheme === option.value ? "is-active" : ""}`}
                              disabled={!state.structure}
                              onClick={() => setColorScheme(option.value)}
                              title={option.label}
                              aria-pressed={state.colorScheme === option.value}
                            >
                              <span className={`color-swatch swatch-${option.value}`} />
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bf-dock-divider" />

                      {/* Surface */}
                      <div className="bf-dock-group surface-control" aria-busy={surfaceBusy}>
                        <span className="bf-dock-group-label">Surface</span>
                        <div className={`bf-dock-surface-row surface-state ${surfaceBusy ? "loading" : ""} ${surfaceFailed ? "error" : ""}`}>
                          <div role="status" aria-live="polite" className="bf-dock-surface-status-indicator">
                            {surfaceBusy ? <LoaderCircle className="spin" size={14} /> : surfaceFailed ? <AlertTriangle size={14} /> : <Eye size={14} />}
                            <span>{surfaceBusy ? "Computing surface…" : surfaceFailed ? "Surface failed" : state.surfaceVisible ? "Surface visible" : "Surface hidden"}</span>
                          </div>
                          <button
                            role="switch"
                            aria-label="Molecular surface"
                            aria-checked={state.surfaceVisible}
                            className={`switch ${state.surfaceVisible ? "on" : ""}`}
                            disabled={!state.structure || surfaceBusy}
                            onClick={() => toggleSurface(!state.surfaceVisible)}
                          >
                            <span />
                          </button>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.01"
                            value={surfaceOpacity}
                            aria-label="Surface opacity"
                            aria-valuetext={`${Math.round(surfaceOpacity * 100)} percent`}
                            disabled={!state.structure || surfaceBusy}
                            onChange={(e) => setSurfaceOpacity(Number(e.target.value))}
                            onPointerUp={() => state.surfaceVisible && toggleSurface(true)}
                            onKeyUp={(event) => { if (state.surfaceVisible && event.key.startsWith("Arrow")) toggleSurface(true); }}
                            className="bf-dock-slider"
                          />
                          <output aria-live="polite" className="bf-dock-val-text">{Math.round(surfaceOpacity * 100)}%</output>
                        </div>
                        {state.surfaceOperation.status === "error" && (
                          <div className="surface-error bf-dock-surface-error" role="alert">
                            <AlertTriangle size={14} />
                            <div>
                              <strong>Surface render failed</strong>
                              <span>{state.surfaceOperation.message}</span>
                              <div className="surface-error-actions">
                                <button type="button" onClick={retrySurface}>Retry</button>
                                <button type="button" onClick={state.clearSurfaceError}>Dismiss</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Dock 2: Geometry Tools */}
              <div className="bf-scene-dock bf-dock-card-geometry" role="region" aria-label="Geometry Tools Dock">
                <div className="bf-dock-header">
                  <div className="bf-dock-title-group">
                    <Ruler size={14} className="bf-dock-title-icon" />
                    <span className="bf-dock-title">Geometry Tools</span>
                    <span className="bf-dock-subtitle">Focus · Distance</span>
                  </div>
                  <button
                    type="button"
                    className="bf-dock-toggle-btn"
                    onClick={() => setIsGeometryDockOpen(!isGeometryDockOpen)}
                    title={isGeometryDockOpen ? "Minimize Geometry Tools" : "Expand Geometry Tools"}
                    aria-label={isGeometryDockOpen ? "Minimize Geometry Tools" : "Expand Geometry Tools"}
                  >
                    {isGeometryDockOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>

                {isGeometryDockOpen && (
                  <div className="bf-dock-body">
                    <div className="bf-dock-controls-ribbon">
                      {/* Focus */}
                      <div className="bf-dock-group">
                        <span className="bf-dock-group-label">Focus</span>
                        <div className="bf-dock-input-row">
                          <label className="bf-dock-label-inline">
                            <span>Chain</span>
                            <input
                              placeholder="A"
                              value={focusChain}
                              onChange={(e) => setFocusChain(e.target.value.toUpperCase())}
                              className="bf-dock-input bf-dock-input-sm"
                              aria-label="Focus chain"
                            />
                          </label>
                          <label className="bf-dock-label-inline">
                            <span>Res</span>
                            <input
                              placeholder="1"
                              type="number"
                              value={focusResidue}
                              onChange={(e) => setFocusResidue(e.target.value)}
                              className="bf-dock-input bf-dock-input-sm"
                              aria-label="Focus residue"
                            />
                          </label>
                          <button
                            type="button"
                            className="bf-dock-btn"
                            onClick={focusSelection}
                            disabled={!state.structure}
                            aria-label="Focus in 3D"
                            title="Focus selection in 3D"
                          >
                            <Focus size={13} />
                            <span>Focus in 3D</span>
                          </button>
                        </div>
                      </div>

                      <div className="bf-dock-divider" />

                      {/* Distance (Å) */}
                      <div className="bf-dock-group bf-dock-distance-group">
                        <span className="bf-dock-group-label">Distance</span>
                        <div className="bf-dock-distance-fields">
                          <div className="bf-dock-subgroup">
                            <span className="bf-dock-sublabel">From</span>
                            <input
                              placeholder="Ch"
                              aria-label="From chain"
                              value={measureFrom.chain}
                              onChange={(event) => setMeasureFrom({ ...measureFrom, chain: event.target.value.toUpperCase() })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                            <input
                              placeholder="Res"
                              type="number"
                              aria-label="From residue"
                              value={measureFrom.residue}
                              onChange={(event) => setMeasureFrom({ ...measureFrom, residue: event.target.value })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                            <input
                              placeholder="Atom"
                              aria-label="From atom"
                              value={measureFrom.atom}
                              onChange={(event) => setMeasureFrom({ ...measureFrom, atom: event.target.value.toUpperCase() })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                          </div>
                          <ChevronRight size={12} className="bf-dock-arrow" aria-hidden="true" />
                          <div className="bf-dock-subgroup">
                            <span className="bf-dock-sublabel">To</span>
                            <input
                              placeholder="Ch"
                              aria-label="To chain"
                              value={measureTo.chain}
                              onChange={(event) => setMeasureTo({ ...measureTo, chain: event.target.value.toUpperCase() })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                            <input
                              placeholder="Res"
                              type="number"
                              aria-label="To residue"
                              value={measureTo.residue}
                              onChange={(event) => setMeasureTo({ ...measureTo, residue: event.target.value })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                            <input
                              placeholder="Atom"
                              aria-label="To atom"
                              value={measureTo.atom}
                              onChange={(event) => setMeasureTo({ ...measureTo, atom: event.target.value.toUpperCase() })}
                              className="bf-dock-input bf-dock-input-xs"
                            />
                          </div>
                          <button
                            type="button"
                            className="bf-dock-btn-secondary"
                            onClick={measure}
                            disabled={!state.structure}
                            aria-label="Measure distance"
                          >
                            <Ruler size={13} />
                            <span>Measure distance</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <TimeTravelBar
            isOpen={isTimeTravelOpen}
            activities={state.activity}
            onClose={() => setIsTimeTravelOpen(false)}
            onRestoreStep={async (stepIndex) => {
              await restoreStateToStep(
                state.activity,
                stepIndex,
                projectEventsRef.current,
              );
            }}
          />

          <div className="viewer-footer">
            <span><CircleDot size={13} /> Drag to rotate · scroll to zoom · right-drag to translate</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className={`bf-snapshot-vision-btn ${isTimeTravelOpen ? "active" : ""}`}
                onClick={() => setIsTimeTravelOpen((prev) => !prev)}
                title="Time-Travel: timeline replay and history scrubbing"
                aria-label="Toggle Timeline Replay"
              >
                <History size={13} />
                <span>Timeline</span>
              </button>
              <button
                type="button"
                className="bf-snapshot-vision-btn"
                onClick={handleSnapshotToVision}
                disabled={!state.structure}
                title="Capture 3D scene and analyze in Multimodal Vision Studio"
              >
                <Camera size={13} />
                <span>Analyze Scene</span>
              </button>
              <button
                type="button"
                className="bf-snapshot-vision-btn"
                onClick={() => setIsExportModalOpen(true)}
                disabled={!state.structure}
                title="Export publication figure (4K / 300 DPI) and scientific report (PDF / Markdown)"
                aria-label="Export Figure and Scientific Report"
              >
                <Download size={13} />
                <span>Export & Report</span>
              </button>
              <span className="render-badge"><Zap size={12} /> WebGL live</span>

            </div>
          </div>
        </section>

        <InspectorPanel
          onCollapsedChange={setIsInspectorCollapsed}
          assistantClient={assistantServices.client}
          assistantConversations={assistantServices.conversations}
          assistantEnabled={false}
          hideAssistantTab={true}
          projectId={projectId ?? "unsaved-workspace"}
          pdbId={state.structure?.id ?? pdbId}
          summary={state.summary}
          measurement={state.measurement}
          mutation={state.mutation}
          activityEntries={state.activity}
          selectedResidue={state.selectedResidues?.[0] ?? null}
          onFlyToResidue={handleFlyToResidue}
          onApplyProposal={executeAssistantProposal}
          className="panel inspector-panel integrated-inspector"
          resultsContent={<div className="legacy-inspector-content">
          <div className="bf-inspector-subtabs" role="tablist" aria-label="Inspector Sections">
            <button
              type="button"
              className={`bf-inspector-subtab ${inspectorSubTab === "all" ? "is-active" : ""}`}
              onClick={() => setInspectorSubTab("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`bf-inspector-subtab ${inspectorSubTab === "overview" ? "is-active" : ""}`}
              onClick={() => setInspectorSubTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`bf-inspector-subtab ${inspectorSubTab === "bio_bookmarks" ? "is-active" : ""}`}
              onClick={() => setInspectorSubTab("bio_bookmarks")}
            >
              Bio & Bookmarks
            </button>
            <button
              type="button"
              className={`bf-inspector-subtab ${inspectorSubTab === "activity" ? "is-active" : ""}`}
              onClick={() => setInspectorSubTab("activity")}
            >
              Activity
            </button>
          </div>

          {(inspectorSubTab === "all" || inspectorSubTab === "overview") && (
            <>
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
            </>
          )}

          {(inspectorSubTab === "all" || inspectorSubTab === "bio_bookmarks") && (
            <div className="bf-inspector-bio-bookmarks-stack">
              {state.structure?.id && (
                <BiologicalAnnotationsSection
                  pdbId={state.structure.id}
                  onHighlightResidues={(residues) => {
                    void commandBus.execute("focus_residues", { residues, label: true }, { origin: "human" });
                  }}
                  onInspectMutation={() => {
                    setActiveScreen("workbench");
                  }}
                />
              )}
              <StructureBookmarksSection
                pdbId={state.structure?.id ?? pdbId}
                projectId={projectId}
                selectedResidue={state.selectedResidues?.[0] ?? null}
                onFlyToResidue={handleFlyToResidue}
              />
            </div>
          )}

          {(inspectorSubTab === "all" || inspectorSubTab === "activity") && (
            <section className="activity-section">
              <div className="section-label activity-heading"><span>Shared activity</span><small>{state.activity.length} events</small></div>
              <div className="activity-list" aria-live="polite" aria-relevant="additions">
                {state.activity.length === 0 ? <div className="activity-empty"><Bot size={19} /><span>Human and agent actions will appear here.</span></div> : state.activity.slice(0, 8).map((entry) => <ActivityItem entry={entry} key={entry.id} />)}
              </div>
            </section>
          )}

          <button className="reset-button" onClick={() => void commandBus.execute("reset_workspace", { scope: "all" }, { origin: "human" })}><RefreshCcw size={15} /> Clear workspace</button>
          </div>}
        />
        </div>

        {/* Screen 2: Molecular Explorer Screen */}
        {activeScreen === "explorer" && (
          <div className="lab-full-screen-container">
            <MolecularExplorer
              currentPdbId={state.structure?.id ?? pdbId}
              onSelectMolecule={(selectedId, targetScreen) => {
                void loadStructure(selectedId);
                setActiveScreen(targetScreen ?? "studio");
              }}
            />
          </div>
        )}

        {/* Screen 3: Sequence & Mutation Workbench Screen */}
        {activeScreen === "workbench" && (
          <div className="lab-full-screen-container">
            <MutationWorkbench
              currentPdbId={state.structure?.id ?? pdbId}
              summary={state.summary}
              mutation={state.mutation}
              onExecuteMutation={async (chain, residueNumber, targetAminoAcid) => {
                await commandBus.execute(
                  "preview_mutation_context",
                  { residue: { chain, residueNumber }, toAminoAcid: targetAminoAcid },
                  { origin: "human" },
                );
              }}
              onFocusResidue={(chain, residueNumber) => {
                void commandBus.execute(
                  "focus_residues",
                  { residues: [{ chain, residueNumber }], label: true },
                  { origin: "human" },
                );
              }}
              onSwitchScreen={setActiveScreen}
            />
          </div>
        )}

        {/* Screen 4: Research Copilot Screen (Full Screen Immersive Workspace) */}
        {activeScreen === "copilot" && (
          <div className="lab-full-screen-container">
            <div
              className={`bf-copilot-screen-layout ${!isCopilotSidebarOpen ? "is-fullwidth" : ""}`}
              role="region"
              aria-label="Research Copilot Workspace"
            >
              {isCopilotSidebarOpen && (
                <aside className="bf-copilot-sidebar panel" aria-label="Copilot Context and Knowledge">
                  <div className="panel-title">
                    <div className="panel-title-icon">
                      <Bot size={18} />
                    </div>
                    <div>
                      <span>AI AGENT COPILOT</span>
                      <h2>Research Copilot</h2>
                    </div>
                  </div>

                  <section className="control-section">
                    <div className="section-label">
                      <span>AI Model & Quota</span>
                      <small>OpenRouter</small>
                    </div>
                    <div className="bf-copilot-quota-card">
                      <div className="bf-quota-row">
                        <span>Model:</span>
                        <strong>GLM 5.2 (Free)</strong>
                      </div>
                      <div className="bf-quota-row">
                        <span>Daily Budget:</span>
                        <strong style={{ color: "#5ccfb5" }}>$1.00 USD</strong>
                      </div>
                      <div className="bf-quota-row">
                        <span>Rate Window:</span>
                        <span>6 req / 60s</span>
                      </div>
                    </div>
                  </section>

                  <section className="control-section">
                    <div className="section-label">
                      <span>Grounded RAG Sources</span>
                      <small>Live Graph</small>
                    </div>
                    <div className="bf-rag-sources-list">
                      <div className="bf-rag-source-item">
                        <span className="live-dot" />
                        <span>RCSB PDB REST / GraphQL</span>
                      </div>
                      <div className="bf-rag-source-item">
                        <span className="live-dot" />
                        <span>UniProtKB Reference Data</span>
                      </div>
                      <div className="bf-rag-source-item">
                        <span className="live-dot" />
                        <span>BioFold Vector Corpus (384d)</span>
                      </div>
                    </div>
                  </section>

                  <section className="control-section">
                    <div className="section-label">
                      <span>Active 3D Context</span>
                      <small>Pinned</small>
                    </div>
                    <div className="bf-current-target-card">
                      <div className="bf-target-id">{state.structure?.id ?? pdbId}</div>
                      <div className="bf-target-name">{currentCatalogItem?.name ?? "Molecular structure"}</div>
                      <button
                        type="button"
                        className="bf-return-studio-btn"
                        onClick={() => setActiveScreen("studio")}
                        style={{ marginTop: "6px" }}
                      >
                        <Eye size={14} />
                        <span>Inspect in 3D Studio</span>
                      </button>
                    </div>
                  </section>
                </aside>
              )}

              <main className="bf-copilot-main panel" aria-label="Copilot Conversation">
                <div className="bf-copilot-top-controls">
                  <button
                    type="button"
                    className="bf-copilot-sidebar-toggle-btn"
                    onClick={() => setIsCopilotSidebarOpen(!isCopilotSidebarOpen)}
                    title={isCopilotSidebarOpen ? "Maximize chat (hide sidebar)" : "Show scientific context panel"}
                  >
                    {isCopilotSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                    <span>{isCopilotSidebarOpen ? "Full screen chat" : "Show context panel"}</span>
                  </button>
                  <div className="bf-copilot-top-target-badge">
                    Active Molecule: <strong>{state.structure?.id ?? pdbId}</strong>
                    {currentCatalogItem?.name && <span> · {currentCatalogItem.name}</span>}
                  </div>
                </div>

                <AssistantChat
                  assistantClient={assistantServices.client}
                  assistantConversations={assistantServices.conversations}
                  enabled={!assistantServices.remote || Boolean(projectId)}
                  projectId={projectId ?? "unsaved-workspace"}
                  onApplyProposal={executeAssistantProposal}
                  confirmedActivities={state.activity}
                />
              </main>
            </div>
          </div>
        )}

        {/* Screen 5: Session Audit & History Screen */}
        {activeScreen === "audit" && (
          <div className="lab-full-screen-container">
            <AuditHistoryView
              activities={state.activity}
              currentPdbId={state.structure?.id ?? pdbId}
              projectId={projectId}
            />
          </div>
        )}
      </main>

      {projectId && (
        <ShareProjectModal
          isOpen={isShareModalOpen}
          projectId={projectId}
          projectTitle={projectTitle}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      <ExportFigureAndReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        pdbId={state.structure?.id ?? pdbId}
        structureName={currentCatalogItem?.name}
        summary={state.summary}
        currentRepresentation={state.representation}
        currentColorScheme={state.colorScheme}
        activeMeasurement={state.measurement}
        activeMutation={state.mutation}
        activityEntries={state.activity}
        projectId={projectId}
        projectTitle={projectTitle}
      />


      {projectError && <div className="project-sync-error" role="alert">
        <span>{projectError}</span>
        <button type="button" onClick={() => setProjectReloadToken((value) => value + 1)}>Reload saved project</button>
      </div>}
      {state.error && <div className="error-toast" role="alert"><div><Info size={17} /><span>{state.error}</span></div><button onClick={() => state.setError(undefined)} aria-label="Dismiss error"><X size={16} /></button></div>}
    </div>
  );
}

export default Laboratory;
