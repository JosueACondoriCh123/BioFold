-- Keep the durable audit allowlist aligned with src/core/commandContracts.ts.
-- One atomic ALTER preserves all existing rows and the other audit/RLS controls.
ALTER TABLE public.project_events
  DROP CONSTRAINT project_events_command_audited,
  ADD CONSTRAINT project_events_command_audited CHECK (command IN (
    'load_structure',
    'get_structure_summary',
    'focus_residues',
    'set_representation',
    'show_surface',
    'measure_distance',
    'preview_mutation_context',
    'reset_workspace',
    'export_publication_figure',
    'annotate_active_site',
    'query_uniprot_annotations',
    'compare_structures_rmsd',
    'save_project_snapshot'
  ));
