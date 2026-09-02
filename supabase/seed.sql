-- Curated, versioned knowledge used by the local Phase 2.2 RAG fixture.
-- Production ingestion may add embeddings, but keyword retrieval remains a
-- deterministic fallback when the embedding runtime is unavailable.
INSERT INTO public.knowledge_sources
  (id, title, publisher, url, license, retrieved_at, content_path, sha256)
VALUES
  ('biofold-evidence-levels-v1', 'Scientific evidence levels in BioFold', 'BioFold',
   'https://github.com/JosueACondoriCh123/BioFold/blob/main/knowledge/evidence-levels.md',
   'MIT', '2026-09-01', 'knowledge/evidence-levels.md',
   '5dfca4e25bdd95847fbce42f5e5e27cdbca1c35360e2f78609baf8f46b7be59d'),
  ('biofold-structure-interpretation-v1', 'Interpreting molecular structure context', 'BioFold',
   'https://github.com/JosueACondoriCh123/BioFold/blob/main/knowledge/structure-interpretation.md',
   'MIT', '2026-09-01', 'knowledge/structure-interpretation.md',
   '4a32ae9ccde3f54251e396c2475536bc6892762d0c735ec33503451057af8710')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  publisher = EXCLUDED.publisher,
  url = EXCLUDED.url,
  license = EXCLUDED.license,
  retrieved_at = EXCLUDED.retrieved_at,
  content_path = EXCLUDED.content_path,
  sha256 = EXCLUDED.sha256;

INSERT INTO public.knowledge_chunks
  (source_id, chunk_index, title, content, locator, token_count)
VALUES
  ('biofold-evidence-levels-v1', 0, 'Observed and calculated evidence',
   'Observed information comes directly from a loaded structural record. Calculated information is derived deterministically from observed coordinates or viewer state, including Euclidean distances, residue counts, spatial neighborhoods, and representations.',
   'Observed; Calculated', 36),
  ('biofold-evidence-levels-v1', 1, 'Heuristic and unavailable evidence',
   'Mutation context in BioFold is a qualitative heuristic. It does not predict stability, folding, binding affinity, pathogenicity, or clinical effect. Unavailable means evidence could not be obtained and must never be replaced by an invented claim.',
   'Heuristic; Unavailable', 38),
  ('biofold-structure-interpretation-v1', 0, 'Representations and surfaces',
   'Cartoon, stick, sphere, and line representations change only how the same coordinates are displayed. Molecular surfaces are computed visual overlays and opacity is a rendering parameter; neither operation produces a new molecular structure.',
   'Representations', 34),
  ('biofold-structure-interpretation-v1', 1, 'Distances and molecular context',
   'An atom-to-atom distance is a Euclidean calculation between two unambiguous coordinates and is reported in ångströms. These measurements describe loaded static coordinates and are not molecular dynamics. Database annotations must cite their exact source.',
   'Distances', 37)
ON CONFLICT (source_id, chunk_index) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  locator = EXCLUDED.locator,
  token_count = EXCLUDED.token_count;
