import { useState, useEffect, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router";
import {
  Search,
  X,
  Dna,
  Microscope,
  Sparkles,
  LayoutDashboard,
  Settings,
  Keyboard,
  ArrowRight,
  Camera,
  Layers,
  RotateCw,
  Eye,
  LoaderCircle,
} from "lucide-react";
import {
  searchBiologicalStructures,
  type BiologicalSearchResult,
} from "../../services/biologicalSearchService";
import "./navigationComponents.css";

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "navigation" | "structure" | "action" | "shortcut";
  icon: typeof Dna;
  action: () => void;
  badge?: string;
}

const POPULAR_STRUCTURES = [
  { id: "6LU7", title: "6LU7 · SARS-CoV-2 Mpro", subtitle: "Proteasa principal en complejo con inhibidor N3", badge: "PDB" },
  { id: "P04637", title: "P04637 · Proteína Supresora Tumoral P53", subtitle: "Modelo de alta precisión en AlphaFold DB", badge: "AlphaFold" },
  { id: "4HHB", title: "4HHB · Hemoglobina Humana (Deoxyhemoglobin)", subtitle: "Proteína transportadora de oxígeno tetramérica", badge: "PDB" },
  { id: "1CRN", title: "1CRN · Crambina", subtitle: "Semilla vegetal de alta resolución hidrofóbica", badge: "PDB" },
];

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPaletteModal({ isOpen, onClose }: CommandPaletteModalProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BiologicalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setShowShortcutsModal(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle biological search debounced
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsSearching(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const results = await searchBiologicalStructures(trimmed);
        setSearchResults(results.slice(0, 6));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  // Base navigation actions
  const navigationItems: CommandItem[] = useMemo(() => [
    {
      id: "nav-lab",
      title: "Saltar a Laboratory (Laboratorio 3D)",
      subtitle: "Abrir visor molecular interactivo, agente IA y herramientas",
      category: "navigation",
      icon: Microscope,
      action: () => {
        navigate("/app/lab");
        onClose();
      },
      badge: "Ir",
    },
    {
      id: "nav-vision",
      title: "Saltar a Multimodal Vision Studio",
      subtitle: "Analizar capturas moleculares y gráficos con MiniMax M3",
      category: "navigation",
      icon: Sparkles,
      action: () => {
        navigate("/app/vision");
        onClose();
      },
      badge: "Vision",
    },
    {
      id: "nav-dashboard",
      title: "Saltar a Dashboard de Proyectos",
      subtitle: "Gestionar proyectos guardados y almacenamiento en la nube",
      category: "navigation",
      icon: LayoutDashboard,
      action: () => {
        navigate("/app");
        onClose();
      },
      badge: "Home",
    },
    {
      id: "nav-account",
      title: "Configuración de Cuenta y Perfil",
      subtitle: "Preferencias de laboratorio, credenciales y clave de IA",
      category: "navigation",
      icon: Settings,
      action: () => {
        navigate("/app/account");
        onClose();
      },
      badge: "Cuenta",
    },
  ], [navigate, onClose]);

  // Quick actions
  const actionItems: CommandItem[] = useMemo(() => [
    {
      id: "action-export-4k",
      title: "Exportar Figura 4K (Publication Figure)",
      subtitle: "Capturar renderizado en ultra alta resolución (300 DPI) o compilar reporte PDF",
      category: "action",
      icon: Camera,
      action: () => {
        navigate("/app/lab?screen=studio&action=export");
        onClose();
      },
      badge: "Export",
    },
    {
      id: "action-surface",
      title: "Alternar Superficie Molecular",
      subtitle: "Activar o desactivar la superficie accesible al solvente (SAS / Van der Waals)",
      category: "action",
      icon: Eye,
      action: () => {
        navigate("/app/lab?action=surface");
        onClose();
      },
      badge: "Visor 3D",
    },
    {
      id: "action-shortcuts",
      title: "Guía de Atajos de Teclado",
      subtitle: "Consultar lista completa de comandos rápidos del laboratorio",
      category: "action",
      icon: Keyboard,
      action: () => {
        setShowShortcutsModal(true);
      },
      badge: "?",
    },
    {
      id: "action-spin",
      title: "Alternar Rotación Automática (Spin 3D)",
      subtitle: "Pausar o reanudar el giro libre orbital de la molécula",
      category: "action",
      icon: RotateCw,
      action: () => {
        navigate("/app/lab?action=spin");
        onClose();
      },
      badge: "Visor 3D",
    },
    {
      id: "action-new-project",
      title: "Iniciar Nuevo Proyecto Molecular",
      subtitle: "Reiniciar espacio de trabajo y cargar nueva molécula",
      category: "action",
      icon: Microscope,
      action: () => {
        navigate("/app/lab");
        onClose();
      },
      badge: "Proyecto",
    },
  ], [navigate, onClose]);

  // Combined items based on query
  const combinedItems: CommandItem[] = useMemo(() => {
    const q = query.toLowerCase().trim();

    // 1. Biological structures matching search
    const structureItems: CommandItem[] = (
      searchResults.length > 0
        ? searchResults.map((res) => ({
            id: `struct-${res.id}`,
            title: `${res.id} · ${res.title}`,
            subtitle: `${res.organism ?? "Estructura biológica"} ${res.resolution ? `(${res.resolution})` : ""}`,
            category: "structure" as const,
            icon: Dna,
            action: () => {
              navigate(`/app/lab?pdb=${res.id}`);
              onClose();
            },
            badge: res.badge,
          }))
        : !q
        ? POPULAR_STRUCTURES.map((res) => ({
            id: `struct-${res.id}`,
            title: res.title,
            subtitle: res.subtitle,
            category: "structure" as const,
            icon: Dna,
            action: () => {
              navigate(`/app/lab?pdb=${res.id}`);
              onClose();
            },
            badge: res.badge,
          }))
        : POPULAR_STRUCTURES.filter(
            (res) =>
              res.id.toLowerCase().includes(q) ||
              res.title.toLowerCase().includes(q) ||
              res.subtitle.toLowerCase().includes(q)
          ).map((res) => ({
            id: `struct-${res.id}`,
            title: res.title,
            subtitle: res.subtitle,
            category: "structure" as const,
            icon: Dna,
            action: () => {
              navigate(`/app/lab?pdb=${res.id}`);
              onClose();
            },
            badge: res.badge,
          }))
    );

    // 2. Filter navigation & actions
    const filteredNav = q
      ? navigationItems.filter(
          (item) =>
            item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q)
        )
      : navigationItems;

    const filteredActions = q
      ? actionItems.filter(
          (item) =>
            item.title.toLowerCase().includes(q) || item.subtitle?.toLowerCase().includes(q)
        )
      : actionItems;

    return [...structureItems, ...filteredNav, ...filteredActions];
  }, [query, searchResults, navigationItems, actionItems, navigate, onClose]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (combinedItems.length === 0) return 0;
      return Math.min(prev, combinedItems.length - 1);
    });
  }, [combinedItems.length]);

  // Scroll selected item into view safely
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (selectedEl && typeof selectedEl.scrollIntoView === "function") {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keydown navigation in list
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, combinedItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % Math.max(1, combinedItems.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (combinedItems[selectedIndex]) {
        combinedItems[selectedIndex].action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (showShortcutsModal) {
        setShowShortcutsModal(false);
      } else {
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bf-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command Palette">
      <div
        className="bf-palette-container"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header Search Bar */}
        <div className="bf-palette-header">
          <div className="bf-palette-search-icon">
            {isSearching ? (
              <LoaderCircle size={18} className="bf-spin" />
            ) : (
              <Search size={18} />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            className="bf-palette-input"
            placeholder="Buscar moléculas (ej. 6LU7, P04637, Hemoglobina) o comandos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-controls="bf-palette-results"
            aria-activedescendant={combinedItems[selectedIndex]?.id}
          />
          {query && (
            <button
              type="button"
              className="bf-palette-clear-btn"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="bf-palette-esc-badge" onClick={onClose} title="Cerrar">
            Esc
          </kbd>
        </div>

        {/* Shortcuts View Modal Overlay */}
        {showShortcutsModal ? (
          <div className="bf-palette-shortcuts-panel">
            <div className="bf-palette-shortcuts-header">
              <div className="bf-palette-shortcuts-title">
                <Keyboard size={16} />
                <span>Atajos de Teclado del Laboratorio</span>
              </div>
              <button
                type="button"
                className="bf-palette-back-btn"
                onClick={() => setShowShortcutsModal(false)}
              >
                Volver a búsqueda
              </button>
            </div>
            <div className="bf-palette-shortcuts-grid">
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Abrir Command Palette y Buscador</span>
                <span className="bf-shortcut-keys"><kbd>Ctrl</kbd> + <kbd>K</kbd> / <kbd>/</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Rotación Libre 3D</span>
                <span className="bf-shortcut-keys"><kbd>Clic Izquierdo + Arrastrar</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Traslación / Desplazamiento (Pan)</span>
                <span className="bf-shortcut-keys"><kbd>Clic Derecho + Arrastrar</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Acercar / Alejar (Zoom)</span>
                <span className="bf-shortcut-keys"><kbd>Rueda del Ratón</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Medir Distancia Atómica</span>
                <span className="bf-shortcut-keys"><kbd>Clic en Átomo 1 y 2</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Cambiar Pantallas 1 a 5 (Studio, Explorer, Workbench, Copilot, Audit)</span>
                <span className="bf-shortcut-keys"><kbd>1</kbd> .. <kbd>5</kbd></span>
              </div>
              <div className="bf-shortcut-row">
                <span className="bf-shortcut-desc">Cerrar Modales / Resetear Vista</span>
                <span className="bf-shortcut-keys"><kbd>Esc</kbd></span>
              </div>
            </div>
          </div>
        ) : (
          /* List of Results */
          <div
            id="bf-palette-results"
            className="bf-palette-list"
            ref={listRef}
            role="listbox"
          >
            {combinedItems.length === 0 ? (
              <div className="bf-palette-empty">
                <Dna size={28} />
                <p>No se encontraron estructuras ni comandos para &ldquo;{query}&rdquo;</p>
                <span>Prueba buscando por código PDB (ej. 6LU7, 1CRN), código UniProt (ej. P04637) o término biológico (Hemoglobina, Kinase).</span>
              </div>
            ) : (
              combinedItems.map((item, index) => {
                const Icon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={item.id}
                    id={item.id}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    className={`bf-palette-item ${isSelected ? "is-selected" : ""}`}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="bf-palette-item-icon">
                      <Icon size={16} />
                    </div>
                    <div className="bf-palette-item-content">
                      <div className="bf-palette-item-title-row">
                        <span className="bf-palette-item-title">{item.title}</span>
                        {item.badge && (
                          <span className={`bf-palette-item-badge badge-${item.category}`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <span className="bf-palette-item-subtitle">{item.subtitle}</span>
                      )}
                    </div>
                    <div className="bf-palette-item-arrow">
                      <ArrowRight size={14} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Palette Footer */}
        <div className="bf-palette-footer">
          <div className="bf-palette-footer-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> Navegar</span>
            <span><kbd>Enter</kbd> Seleccionar</span>
            <span><kbd>Esc</kbd> Cerrar</span>
          </div>
          <button
            type="button"
            className="bf-palette-shortcuts-trigger"
            onClick={() => setShowShortcutsModal((prev) => !prev)}
          >
            <Keyboard size={13} />
            <span>{showShortcutsModal ? "Búsqueda" : "Atajos (?)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="bf-palette-trigger-btn"
      onClick={onOpen}
      title="Buscar moléculas o ejecutar comandos (Ctrl+K)"
      aria-label="Abrir Command Palette (Ctrl+K)"
    >
      <Search size={14} className="bf-palette-trigger-icon" />
      <span className="bf-palette-trigger-text">Buscar moléculas o acciones...</span>
      <kbd className="bf-palette-trigger-kbd">Ctrl K</kbd>
    </button>
  );
}
