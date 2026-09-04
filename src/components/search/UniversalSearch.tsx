import { useState, useEffect, useRef, useMemo, type FormEvent, type KeyboardEvent } from "react";
import { Search, X, LoaderCircle, ChevronRight, Dna, Sparkles } from "lucide-react";
import { searchBiologicalStructures, type BiologicalSearchResult } from "../../services/biologicalSearchService";
import "./search.css";

export interface UniversalSearchProps {
  currentId?: string;
  isLoading?: boolean;
  onSelect: (id: string) => void;
  className?: string;
}

export function UniversalSearch({
  currentId = "",
  isLoading = false,
  onSelect,
  className = "",
}: UniversalSearchProps) {
  const [query, setQuery] = useState(currentId);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<BiologicalSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Sync query when currentId changes externally
  useEffect(() => {
    if (currentId && !isOpen) {
      setQuery(currentId);
    }
  }, [currentId, isOpen]);

  // Global shortcut to focus search ("/" or "Ctrl+K")
  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if (
        (e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search trigger
  useEffect(() => {
    const trimmed = query.trim();
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();

    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const found = await searchBiologicalStructures(trimmed, controller.signal);
        setResults(found);
      } catch {
        /* fallback */
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => {
      controller.abort();
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim().toUpperCase();
    if (!trimmed) return;

    if (selectedIndex >= 0 && results[selectedIndex]) {
      handleSelectItem(results[selectedIndex].id);
    } else {
      handleSelectItem(trimmed);
    }
  };

  const handleSelectItem = (id: string) => {
    setIsOpen(false);
    setQuery(id);
    onSelect(id);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < results.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const badgeClass = (source: BiologicalSearchResult["source"]) => {
    if (source === "rcsb") return "is-rcsb";
    if (source === "alphafold") return "is-alphafold";
    return "is-catalog";
  };

  return (
    <div className={`bf-universal-search-container ${className}`} ref={containerRef}>
      <form
        className="bf-universal-search-form"
        onSubmit={handleFormSubmit}
        role="search"
        aria-label="Search structures across RCSB PDB and AlphaFold"
      >
        <Search size={16} className="bf-search-leading-icon" aria-hidden="true" />
        <label className="sr-only" htmlFor="universal-search-input">
          Search RCSB PDB, AlphaFold or protein name
        </label>
        <input
          id="universal-search-input"
          ref={inputRef}
          type="text"
          className="bf-universal-search-input"
          placeholder="Search PDB ID, protein name, gene, or AlphaFold…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="bf-search-suggestions"
        />

        <div className="bf-search-trailing-actions">
          {query && (
            <button
              type="button"
              className="bf-search-clear-btn"
              onClick={handleClear}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}

          {!query && <span className="bf-search-shortcut-kbd">/</span>}

          <button
            type="submit"
            className="bf-search-submit-btn"
            disabled={isLoading || !query.trim()}
            title="Load structure"
          >
            {isLoading ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <ChevronRight size={14} />
            )}
            <span>Explore</span>
          </button>
        </div>
      </form>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div
          id="bf-search-suggestions"
          className="bf-search-dropdown"
          role="listbox"
          aria-label="Search suggestions"
        >
          {isSearching && (
            <div className="bf-search-loading-row">
              <LoaderCircle size={14} className="spin" />
              <span>Querying biological archives…</span>
            </div>
          )}

          {!isSearching && results.length > 0 && (
            <>
              <div className="bf-search-dropdown-header">Biological Matches</div>
              {results.map((item, index) => (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === index}
                  className={`bf-search-item ${selectedIndex === index ? "is-focused" : ""}`}
                  onClick={() => handleSelectItem(item.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="bf-search-item-info">
                    <div className="bf-search-item-title-row">
                      <span className="bf-search-item-id">{item.id}</span>
                      <span className="bf-search-item-name">{item.title}</span>
                    </div>
                    <div className="bf-search-item-meta">
                      {item.organism && <span>{item.organism}</span>}
                      {item.resolution && <span>· {item.resolution}</span>}
                    </div>
                  </div>
                  <span className={`bf-search-badge ${badgeClass(item.source)}`}>
                    {item.badge}
                  </span>
                </button>
              ))}
            </>
          )}

          {!isSearching && query.trim().length >= 2 && results.length === 0 && (
            <div className="bf-search-empty-row">
              <span>No direct match. Press Explore to attempt direct archive retrieval.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
