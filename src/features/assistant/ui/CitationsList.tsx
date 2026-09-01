import { useState } from "react";
import { BookOpen, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { Citation } from "../../../types/assistant";

export interface CitationsListProps {
  citations: Citation[];
}

export function CitationsList({ citations }: CitationsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="bf-citations-container">
      <button
        type="button"
        className="bf-citations-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="citations-list"
        aria-label={`Scientific sources (${citations.length})`}
      >
        <BookOpen size={14} aria-hidden="true" />
        <span>Scientific sources ({citations.length})</span>
        {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} />}
      </button>

      {isOpen && (
        <ul id="citations-list" className="bf-citations-list" role="list">
          {citations.map((citation) => (
            <li key={citation.id} className="bf-citation-item">
              <div className="bf-citation-header">
                <span className={`bf-citation-publisher is-${citation.publisher.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                  {citation.publisher}
                </span>
                {citation.locator && <span className="bf-citation-locator">{citation.locator}</span>}
              </div>

              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bf-citation-link"
                aria-label={`${citation.title} on ${citation.publisher} (opens in new window)`}
              >
                <span>{citation.title}</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>

              <span className="bf-citation-date">
                Retrieved: {citation.retrievedAt}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
