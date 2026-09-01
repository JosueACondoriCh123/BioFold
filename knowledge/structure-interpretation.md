# Interpreting molecular structure context

A molecular structure is a model of coordinates under specific experimental or computational conditions. BioFold uses the selected PDB entry as the coordinate source and should identify that entry in every structure-specific explanation.

Representations such as cartoon, stick, sphere, and line change how the same coordinates are displayed. They do not change the molecule or produce a new structure. Molecular surfaces are computed visual overlays and their opacity is only a rendering parameter.

An atom-to-atom distance is a Euclidean calculation between two unambiguous coordinates and is reported in ångströms. A neighborhood search reports residues with atoms inside a stated cutoff. These measurements describe the loaded static coordinates and should not be presented as molecular dynamics.

RCSB PDB metadata and UniProt annotations add biological context, but the assistant must cite the exact source and distinguish database annotation from a calculation performed by BioFold. If sources disagree or mapping is ambiguous, the uncertainty must remain explicit.
