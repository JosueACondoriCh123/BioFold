export type MolecularCategory =
  | "enzymes"
  | "viral"
  | "oncology"
  | "membrane"
  | "immunology"
  | "nucleic"
  | "custom";

export interface CatalogCategoryMeta {
  id: MolecularCategory;
  label: string;
  description: string;
  color: string;
}

export const CATALOG_CATEGORIES: CatalogCategoryMeta[] = [
  {
    id: "enzymes",
    label: "Enzymes & Metabolism",
    description: "Classic catalytic archetypes, metabolic enzymes, and fluorescent proteins.",
    color: "#5CCFB5",
  },
  {
    id: "viral",
    label: "Viral Targets",
    description: "Pathogen proteases, spike glycoproteins, and viral capsids.",
    color: "#E8A2CE",
  },
  {
    id: "oncology",
    label: "Oncology & Kinases",
    description: "Oncogenic drivers, kinase inhibitors, and therapeutic targets.",
    color: "#E0BA7B",
  },
  {
    id: "membrane",
    label: "Membrane & GPCRs",
    description: "Ion channels, transporters, and G-protein coupled receptors.",
    color: "#7B9FE0",
  },
  {
    id: "immunology",
    label: "Immunology & Antibodies",
    description: "Monoclonal antibodies, checkpoint inhibitors, TCRs, and nanobodies.",
    color: "#A7CFBC",
  },
  {
    id: "nucleic",
    label: "Nucleic Acids & Ribosomes",
    description: "DNA double helices, CRISPR-Cas9 complexes, tRNAs, and ribosomal subunits.",
    color: "#D48BE8",
  },
  {
    id: "custom",
    label: "Custom & Uploads",
    description: "User-imported molecular structures and project files.",
    color: "#ff8474",
  },
];

export interface MolecularCatalogItem {
  id: string; // 4-char uppercase PDB ID
  name: string;
  category: MolecularCategory;
  organism: string;
  resolution: number; // in Angstroms
  method: "X-ray" | "Cryo-EM" | "NMR" | "Synthetic";
  uniProtId?: string;
  description: string;
  keyResidues?: string[];
  isFixture?: boolean;
}

export const MOLECULAR_CATALOG: MolecularCatalogItem[] = [
  // 1. ENZYMES & METABOLISM (10)
  {
    id: "1CRN",
    name: "Crambin",
    category: "enzymes",
    organism: "Crambe abyssinica",
    resolution: 1.5,
    method: "X-ray",
    uniProtId: "P01542",
    description: "Compact plant seed protein with a dense hydrophobic core; ideal for spatial calibration.",
    keyResidues: ["A:10", "A:16", "A:32"],
    isFixture: true,
  },
  {
    id: "1TIM",
    name: "Triosephosphate Isomerase",
    category: "enzymes",
    organism: "Saccharomyces cerevisiae",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P00940",
    description: "Canonical glycolytic enzyme defining the alpha/beta TIM-barrel fold archetype.",
    keyResidues: ["A:165", "A:95"],
    isFixture: true,
  },
  {
    id: "1LYZ",
    name: "Egg-White Lysozyme",
    category: "enzymes",
    organism: "Gallus gallus",
    resolution: 2.0,
    method: "X-ray",
    uniProtId: "P00698",
    description: "Seminal Phillips catalytic model hydrolyzing bacterial peptidoglycan walls.",
    keyResidues: ["A:35", "A:52"],
  },
  {
    id: "1EMA",
    name: "Green Fluorescent Protein (GFP)",
    category: "enzymes",
    organism: "Aequorea victoria",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P42212",
    description: "11-stranded beta-barrel containing an internal autocatalytic fluorophore (Ser65-Tyr66-Gly67).",
    keyResidues: ["A:65", "A:66", "A:67"],
  },
  {
    id: "4HHB",
    name: "Deoxyhemoglobin",
    category: "enzymes",
    organism: "Homo sapiens",
    resolution: 1.74,
    method: "X-ray",
    uniProtId: "P69905",
    description: "Heterotetrameric respiratory protein demonstrating cooperativity and T-state allosterism.",
    keyResidues: ["A:14", "B:14", "A:87", "B:92"],
    isFixture: true,
  },
  {
    id: "1MBN",
    name: "Myoglobin",
    category: "enzymes",
    organism: "Physeter catodon",
    resolution: 2.0,
    method: "X-ray",
    uniProtId: "P02185",
    description: "Historic Kendrew structure: the first protein atomic model solved by X-ray crystallography.",
    keyResidues: ["A:64", "A:93"],
  },
  {
    id: "1HHO",
    name: "Oxyhemoglobin",
    category: "enzymes",
    organism: "Homo sapiens",
    resolution: 2.1,
    method: "X-ray",
    uniProtId: "P69905",
    description: "Relaxed R-state hemoglobin conformation showing quaternary iron coordination shift.",
    keyResidues: ["A:87", "B:92"],
  },
  {
    id: "1HVP",
    name: "HIV-1 Protease with Indinavir",
    category: "enzymes",
    organism: "HIV-1",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P03367",
    description: "Homodimeric aspartic protease complexed with the clinical peptidomimetic inhibitor indinavir.",
    keyResidues: ["A:25", "B:25"],
  },
  {
    id: "1A28",
    name: "Progesterone Receptor LBD",
    category: "enzymes",
    organism: "Homo sapiens",
    resolution: 1.8,
    method: "X-ray",
    uniProtId: "P06401",
    description: "Steroid hormone nuclear receptor ligand-binding pocket regulating reproductive physiology.",
    keyResidues: ["A:756", "A:758"],
  },
  {
    id: "3CL0",
    name: "T4 Bacteriophage Lysozyme",
    category: "enzymes",
    organism: "Bacteriophage T4",
    resolution: 2.0,
    method: "X-ray",
    uniProtId: "P00720",
    description: "Benchmark model system used across hundreds of biophysical protein folding and stability studies.",
    keyResidues: ["A:11", "A:20"],
  },

  // 2. VIRAL TARGETS & PATHOGENS (10)
  {
    id: "6LU7",
    name: "SARS-CoV-2 Main Protease (Mpro)",
    category: "viral",
    organism: "SARS-CoV-2",
    resolution: 2.16,
    method: "X-ray",
    uniProtId: "P0DTD1",
    description: "Essential viral 3C-like protease with peptide-like covalent inhibitor N3 in active site pocket.",
    keyResidues: ["A:41", "A:145"],
    isFixture: true,
  },
  {
    id: "6VXX",
    name: "SARS-CoV-2 Spike Glycoprotein (Closed)",
    category: "viral",
    organism: "SARS-CoV-2",
    resolution: 2.8,
    method: "Cryo-EM",
    uniProtId: "P0DTC2",
    description: "Prefusion closed homotrimer with receptor binding domains buried against immune detection.",
    keyResidues: ["A:501", "B:501", "C:501"],
  },
  {
    id: "6VYB",
    name: "SARS-CoV-2 Spike Glycoprotein (Open)",
    category: "viral",
    organism: "SARS-CoV-2",
    resolution: 3.2,
    method: "Cryo-EM",
    uniProtId: "P0DTC2",
    description: "Prefusion open conformation with one receptor-binding domain flexed up for ACE2 engagement.",
    keyResidues: ["A:484", "A:501"],
  },
  {
    id: "7BW4",
    name: "SARS-CoV-2 RBD + Neutralizing mAb",
    category: "viral",
    organism: "SARS-CoV-2 / Homo sapiens",
    resolution: 2.45,
    method: "X-ray",
    uniProtId: "P0DTC2",
    description: "Receptor binding domain complexed with human neutralizing monoclonal antibody P2C-1F11.",
    keyResidues: ["A:453", "A:484"],
  },
  {
    id: "6M0J",
    name: "SARS-CoV-2 RBD + Human ACE2 Receptor",
    category: "viral",
    organism: "SARS-CoV-2 / Homo sapiens",
    resolution: 2.45,
    method: "X-ray",
    uniProtId: "Q9BYF1",
    description: "Co-crystal structure demonstrating molecular contacts between viral spike RBD and human ACE2 receptor.",
    keyResidues: ["A:486", "A:493", "A:501"],
  },
  {
    id: "4Z9C",
    name: "Zika Virus NS2B-NS3 Protease",
    category: "viral",
    organism: "Zika virus",
    resolution: 1.62,
    method: "X-ray",
    uniProtId: "Q32ZE1",
    description: "Essential flavivirus serine protease critical for viral polyprotein precursor processing.",
    keyResidues: ["A:51", "A:75", "A:135"],
  },
  {
    id: "1E9Y",
    name: "Influenza A Hemagglutinin",
    category: "viral",
    organism: "Influenza A virus",
    resolution: 2.8,
    method: "X-ray",
    uniProtId: "P03437",
    description: "Major viral surface glycoprotein responsible for host sialic acid binding and membrane fusion.",
    keyResidues: ["A:190", "A:225"],
  },
  {
    id: "4G0N",
    name: "Ebola Virus Glycoprotein + mAb",
    category: "viral",
    organism: "Zaire ebolavirus / Homo sapiens",
    resolution: 2.2,
    method: "X-ray",
    uniProtId: "Q05320",
    description: "Filovirus envelope spike glycoprotein bound to protective therapeutic human antibody.",
    keyResidues: ["A:505", "A:549"],
  },
  {
    id: "1T60",
    name: "Dengue Virus NS3 Protease-Helicase",
    category: "viral",
    organism: "Dengue virus type 2",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P29990",
    description: "Dual-domain enzyme executing RNA unwinding and viral polyprotein cleavage in flavivirus life cycle.",
    keyResidues: ["A:135", "A:180"],
  },
  {
    id: "1PRT",
    name: "Pertussis Toxin Catalytic Subunit",
    category: "viral",
    organism: "Bordetella pertussis",
    resolution: 2.7,
    method: "X-ray",
    uniProtId: "P04977",
    description: "AB5 toxin S1 subunit that modifies host G-protein alpha subunits via ADP-ribosylation.",
    keyResidues: ["A:9", "A:129"],
  },

  // 3. ONCOLOGY & KINASES (10)
  {
    id: "1IEP",
    name: "Abl Kinase + Gleevec (Imatinib)",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 2.1,
    method: "X-ray",
    uniProtId: "P00519",
    description: "First targeted kinase inhibitor therapy; binds the inactive DFG-out conformation of Bcr-Abl.",
    keyResidues: ["A:315", "A:381"],
  },
  {
    id: "2V6S",
    name: "Aurora-A Kinase",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 2.45,
    method: "X-ray",
    uniProtId: "O14965",
    description: "Mitotic checkpoint regulator frequently amplified across breast, colorectal, and ovarian cancers.",
    keyResidues: ["A:217", "A:288"],
  },
  {
    id: "1T46",
    name: "c-Kit Tyrosine Kinase",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 1.6,
    method: "X-ray",
    uniProtId: "P10721",
    description: "Receptor tyrosine kinase driving gastrointestinal stromal tumors (GIST) and systemic mastocytosis.",
    keyResidues: ["A:670", "A:816"],
  },
  {
    id: "4HJO",
    name: "KRAS G12C Oncogene",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 1.65,
    method: "X-ray",
    uniProtId: "P01116",
    description: "Key oncogenic driver mutation in non-small cell lung cancer, featuring the G12C reactive cysteine.",
    keyResidues: ["A:12", "A:61"],
  },
  {
    id: "6OIM",
    name: "KRAS G12C + Sotorasib (AMG 510)",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 1.6,
    method: "X-ray",
    uniProtId: "P01116",
    description: "Breakthrough covalent inhibitor trapping mutant KRAS G12C in the inactive GDP-bound state.",
    keyResidues: ["A:12", "A:68", "A:95"],
  },
  {
    id: "1Y6A",
    name: "Estrogen Receptor Alpha LBD",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P03372",
    description: "Nuclear hormone receptor ligand binding domain targeted by selective estrogen receptor modulators.",
    keyResidues: ["A:351", "A:537", "A:538"],
  },
  {
    id: "1J4N",
    name: "Androgen Receptor LBD + DHT",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P10275",
    description: "Primary target of androgen deprivation therapies in castration-resistant prostate cancer.",
    keyResidues: ["A:741", "A:877"],
  },
  {
    id: "1ATP",
    name: "cAMP-Dependent Protein Kinase (PKA)",
    category: "oncology",
    organism: "Mus musculus",
    resolution: 2.2,
    method: "X-ray",
    uniProtId: "P05132",
    description: "Structural foundation of eukaryotic protein kinase architecture, showing ATP and peptide binding.",
    keyResidues: ["A:72", "A:166", "A:184"],
  },
  {
    id: "3POZ",
    name: "PARP1 Catalytic Domain + Olaparib",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 2.2,
    method: "X-ray",
    uniProtId: "P09874",
    description: "Poly(ADP-ribose) polymerase inhibitor exploited via synthetic lethality in BRCA-mutated tumors.",
    keyResidues: ["A:893", "A:988"],
  },
  {
    id: "1M17",
    name: "EGFR Kinase Domain + Erlotinib",
    category: "oncology",
    organism: "Homo sapiens",
    resolution: 2.6,
    method: "X-ray",
    uniProtId: "P00533",
    description: "Epidermal growth factor receptor tyrosine kinase domain complexed with 4-anilinoquinazoline.",
    keyResidues: ["A:790", "A:858"],
  },

  // 4. MEMBRANE, CHANNELS & GPCRS (10)
  {
    id: "1BL8",
    name: "KcsA Potassium Channel",
    category: "membrane",
    organism: "Streptomyces lividans",
    resolution: 3.2,
    method: "X-ray",
    uniProtId: "P0A334",
    description: "MacKinnon Nobel structure revealing carbonyl oxygen coordination in ion selectivity filters.",
    keyResidues: ["A:75", "A:76", "A:77", "A:78"],
  },
  {
    id: "2R4R",
    name: "Beta-2 Adrenergic Receptor + Timolol",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 2.8,
    method: "X-ray",
    uniProtId: "P07550",
    description: "Landmark 7-transmembrane GPCR crystallized in lipidic cubic phase with inverse agonist timolol.",
    keyResidues: ["A:118", "A:288"],
  },
  {
    id: "3P0G",
    name: "Beta-2 AR - Gs Heterotrimer Complex",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.2,
    method: "X-ray",
    uniProtId: "P07550",
    description: "Full ternary complex capturing signal transmission from activated GPCR to heterotrimeric G protein.",
    keyResidues: ["A:131", "A:225"],
  },
  {
    id: "3SN6",
    name: "Beta-2 AR Complex with Nanobody",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.2,
    method: "X-ray",
    uniProtId: "P07550",
    description: "Kobilka Nobel crystal structure of active GPCR with bound agonist BI-167107 and nanobody Nb35.",
    keyResidues: ["A:131", "A:288"],
  },
  {
    id: "1F88",
    name: "Bovine Rhodopsin Ground State",
    category: "membrane",
    organism: "Bos taurus",
    resolution: 2.8,
    method: "X-ray",
    uniProtId: "P02699",
    description: "Visual pigment archetype with 11-cis-retinal chromophore covalently attached via Schiff base.",
    keyResidues: ["A:113", "A:296"],
  },
  {
    id: "4COF",
    name: "Aquaporin-1 Water Channel",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 2.2,
    method: "X-ray",
    uniProtId: "P29972",
    description: "Membrane pore tetramer facilitating bidirectional osmotic water transport across cell membranes.",
    keyResidues: ["A:180", "A:192"],
  },
  {
    id: "5V6P",
    name: "Human CFTR Chloride Channel",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.2,
    method: "Cryo-EM",
    uniProtId: "P13569",
    description: "ATP-binding cassette transporter chloride channel mutated in cystic fibrosis patients.",
    keyResidues: ["A:508", "A:1280"],
  },
  {
    id: "6V01",
    name: "TRPV1 Ion Channel in Nanodisc",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.1,
    method: "Cryo-EM",
    uniProtId: "Q8NER1",
    description: "Noxious heat and capsaicin pain receptor reconstituted in native-like lipid bilayers.",
    keyResidues: ["A:511", "A:575"],
  },
  {
    id: "5X29",
    name: "Human Glucose Transporter GLUT1",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.2,
    method: "X-ray",
    uniProtId: "P11166",
    description: "Major facilitator superfamily uniporter mediating basal glucose influx across the blood-brain barrier.",
    keyResidues: ["A:161", "A:292"],
  },
  {
    id: "4U43",
    name: "Serotonin Transporter (SERT) + Paroxetine",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 3.15,
    method: "X-ray",
    uniProtId: "P31645",
    description: "Neurotransmitter sodium symporter locked in outward-open state by selective serotonin reuptake inhibitor.",
    keyResidues: ["A:176", "A:438"],
  },
  {
    id: "6HUP",
    name: "Cannabinoid CB1 Receptor",
    category: "membrane",
    organism: "Homo sapiens",
    resolution: 2.8,
    method: "Cryo-EM",
    uniProtId: "P21554",
    description: "Central nervous system GPCR regulating neurotransmission, appetite, and analgesic pathways.",
    keyResidues: ["A:192", "A:383"],
  },

  // 5. IMMUNOLOGY & ANTIBODIES (10)
  {
    id: "1IGT",
    name: "Intact Murine IgG2a Monoclonal Antibody",
    category: "immunology",
    organism: "Mus musculus",
    resolution: 2.8,
    method: "X-ray",
    uniProtId: "P01863",
    description: "Rare intact antibody crystal structure displaying two Fab arms connected to Fc via hinge region.",
    keyResidues: ["A:32", "B:91"],
  },
  {
    id: "1IGY",
    name: "Intact Human IgG1 (b12)",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.7,
    method: "X-ray",
    uniProtId: "P01857",
    description: "Broadly neutralizing anti-HIV antibody targeting the CD4 binding site on envelope spike.",
    keyResidues: ["H:100", "L:50"],
  },
  {
    id: "5I15",
    name: "Pembrolizumab (Keytruda) + PD-1",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.3,
    method: "X-ray",
    uniProtId: "Q15116",
    description: "Blockbuster checkpoint inhibitor Fab bound to programmed cell death 1 receptor.",
    keyResidues: ["A:68", "A:128"],
  },
  {
    id: "4JAN",
    name: "Trastuzumab (Herceptin) + HER2",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.7,
    method: "X-ray",
    uniProtId: "P04626",
    description: "Monoclonal antibody Fab bound to domain IV of HER2 receptor in breast cancer therapy.",
    keyResidues: ["A:557", "A:570"],
  },
  {
    id: "1AQD",
    name: "MHC Class I (HLA-A2) + Peptide",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.5,
    method: "X-ray",
    uniProtId: "P01892",
    description: "Antigen presentation complex with nonameric peptide displayed inside the alpha-1/alpha-2 groove.",
    keyResidues: ["A:66", "A:159"],
  },
  {
    id: "1BD2",
    name: "T-Cell Receptor (TCR) Alpha/Beta",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.5,
    method: "X-ray",
    uniProtId: "P01848",
    description: "Heterodimeric T-lymphocyte receptor recognizing peptide antigens presented by MHC.",
    keyResidues: ["A:30", "B:30"],
  },
  {
    id: "4F3F",
    name: "Nivolumab (Opdivo) Fab + PD-1",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.45,
    method: "X-ray",
    uniProtId: "Q15116",
    description: "Human IgG4 immune checkpoint monoclonal antibody binding the BC and FG loops of PD-1.",
    keyResidues: ["A:64", "A:132"],
  },
  {
    id: "6OGY",
    name: "Human Serum Albumin Nanobody",
    category: "immunology",
    organism: "Camelus dromedarius",
    resolution: 1.8,
    method: "X-ray",
    uniProtId: "P02768",
    description: "Single-domain VHH camelid antibody engineered for half-life extension of biologics.",
    keyResidues: ["A:31", "A:53"],
  },
  {
    id: "1N8Z",
    name: "Unbound Herceptin Fab",
    category: "immunology",
    organism: "Homo sapiens",
    resolution: 2.4,
    method: "X-ray",
    uniProtId: "P01857",
    description: "Apo conformation of trastuzumab Fab providing reference baseline for induced-fit binding studies.",
    keyResidues: ["H:33", "L:92"],
  },
  {
    id: "2XWT",
    name: "Camelid Single-Domain VHH Benchmark",
    category: "immunology",
    organism: "Lama glama",
    resolution: 1.45,
    method: "X-ray",
    uniProtId: "P01867",
    description: "Ultra-high resolution benchmark of a stable, autonomous heavy-chain nanobody.",
    keyResidues: ["A:37", "A:45", "A:47"],
  },

  // 6. NUCLEIC ACIDS & RIBOSOMAL COMPLEXES (10)
  {
    id: "1BNA",
    name: "B-DNA Dodecamer (Drew-Dickerson)",
    category: "nucleic",
    organism: "Synthetic",
    resolution: 1.9,
    method: "X-ray",
    description: "Classic self-complementary DNA d(CGCGAATTCGCG) establishing high-resolution B-form geometry.",
    keyResidues: ["A:1", "B:12"],
    isFixture: true,
  },
  {
    id: "1RNA",
    name: "A-Form RNA Double Helix",
    category: "nucleic",
    organism: "Synthetic",
    resolution: 1.4,
    method: "X-ray",
    description: "Standard A-RNA geometry exhibiting a deep major groove and shallow, broad minor groove.",
    keyResidues: ["A:1", "B:8"],
  },
  {
    id: "4P9R",
    name: "CRISPR-Cas9 + sgRNA + Target DNA",
    category: "nucleic",
    organism: "Streptococcus pyogenes",
    resolution: 2.5,
    method: "X-ray",
    uniProtId: "Q99ZW2",
    description: "Endonuclease complexed with chimeric single-guide RNA and cleaved target double-stranded DNA.",
    keyResidues: ["A:10", "A:840"],
  },
  {
    id: "5L36",
    name: "CRISPR-Cas9 Cleaved Complex",
    category: "nucleic",
    organism: "Streptococcus pyogenes",
    resolution: 2.6,
    method: "X-ray",
    uniProtId: "Q99ZW2",
    description: "Post-catalytic conformation revealing HNH and RuvC active site positioning on PAM-proximal duplex.",
    keyResidues: ["A:840", "A:854"],
  },
  {
    id: "1EHZ",
    name: "Yeast Phenylalanine tRNA",
    category: "nucleic",
    organism: "Saccharomyces cerevisiae",
    resolution: 1.93,
    method: "X-ray",
    description: "Landmark cloverleaf secondary structure folded into the 3D L-shaped tertiary conformation.",
    keyResidues: ["A:34", "A:76"],
  },
  {
    id: "1FFK",
    name: "50S Large Ribosomal Subunit",
    category: "nucleic",
    organism: "Haloarcula marismortui",
    resolution: 2.4,
    method: "X-ray",
    description: "Steitz Nobel structure proving the ribosome is a ribozyme centered at the peptidyl transferase RNA core.",
    keyResidues: ["0:2451"],
  },
  {
    id: "1S72",
    name: "Ribosomal Decoding Center + Antibiotic",
    category: "nucleic",
    organism: "Thermus thermophilus",
    resolution: 2.4,
    method: "X-ray",
    description: "Conserved A-site 16S rRNA bases flipping out to verify mRNA codon-tRNA anticodon pairing.",
    keyResidues: ["A:1492", "A:1493"],
  },
  {
    id: "1D66",
    name: "Zinc Finger Zif268 + DNA Complex",
    category: "nucleic",
    organism: "Mus musculus",
    resolution: 1.6,
    method: "X-ray",
    uniProtId: "P08047",
    description: "Three Cys2His2 zinc fingers wrapping around the major groove of double-stranded B-DNA.",
    keyResidues: ["A:34", "A:62", "A:90"],
  },
  {
    id: "1LE8",
    name: "TATA-Box Binding Protein (TBP) + DNA",
    category: "nucleic",
    organism: "Arabidopsis thaliana",
    resolution: 1.9,
    method: "X-ray",
    uniProtId: "P28147",
    description: "Molecular saddle that binds the minor groove and introduces a sharp 80-degree kink in promoter DNA.",
    keyResidues: ["A:99", "A:114"],
  },
  {
    id: "1A3N",
    name: "Deoxyhemoglobin (High Resolution)",
    category: "enzymes",
    organism: "Homo sapiens",
    resolution: 1.8,
    method: "X-ray",
    uniProtId: "P69905",
    description: "High-resolution human hemoglobin T-state tetramer without organic phosphate.",
    keyResidues: ["A:42", "B:99"],
  },
  {
    id: "2MS2",
    name: "Bacteriophage MS2 Capsid + RNA",
    category: "viral",
    organism: "Bacteriophage MS2",
    resolution: 2.8,
    method: "X-ray",
    uniProtId: "P03612",
    description: "Icosahedral viral capsid assembly interacting with an RNA operator hairpin loop.",
    keyResidues: ["A:45", "A:87"],
  },
];

export const CUSTOM_CATALOG_STORAGE_KEY = "biofold_custom_molecular_catalog";
const memoryCatalogFallback: MolecularCatalogItem[] = [];

export function getCustomCatalogItems(): MolecularCatalogItem[] {
  try {
    if (typeof localStorage === "undefined") return [...memoryCatalogFallback];
    const raw = localStorage.getItem(CUSTOM_CATALOG_STORAGE_KEY);
    if (!raw) return [...memoryCatalogFallback];
    const parsed = JSON.parse(raw) as MolecularCatalogItem[];
    for (const mem of memoryCatalogFallback) {
      if (!parsed.some((p) => p.id === mem.id)) {
        parsed.unshift(mem);
      }
    }
    return parsed;
  } catch {
    return [...memoryCatalogFallback];
  }
}

export function saveCustomCatalogItem(item: MolecularCatalogItem): void {
  const upperId = item.id.trim().toUpperCase();
  const newItem: MolecularCatalogItem = { ...item, id: upperId, category: "custom" };
  const existingIdx = memoryCatalogFallback.findIndex((m) => m.id === upperId);
  if (existingIdx >= 0) {
    memoryCatalogFallback[existingIdx] = newItem;
  } else {
    memoryCatalogFallback.unshift(newItem);
  }

  try {
    if (typeof localStorage !== "undefined") {
      const current = getCustomCatalogItems();
      const updated = current.filter((c) => c.id !== upperId);
      updated.unshift(newItem);
      localStorage.setItem(CUSTOM_CATALOG_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // Non-fatal
  }
}

export function removeCustomCatalogItem(id: string): void {
  const upperId = id.trim().toUpperCase();
  const idx = memoryCatalogFallback.findIndex((m) => m.id === upperId);
  if (idx >= 0) memoryCatalogFallback.splice(idx, 1);

  try {
    if (typeof localStorage !== "undefined") {
      const current = getCustomCatalogItems();
      const updated = current.filter((c) => c.id !== upperId);
      localStorage.setItem(CUSTOM_CATALOG_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch {
    // Non-fatal
  }
}

export function getAllCatalogItems(): MolecularCatalogItem[] {
  const custom = getCustomCatalogItems();
  const customFiltered = custom.filter((c) => !MOLECULAR_CATALOG.some((b) => b.id === c.id));
  return [...customFiltered, ...MOLECULAR_CATALOG];
}

export function getCatalogItem(id: string): MolecularCatalogItem | undefined {
  const upper = id.trim().toUpperCase();
  return getAllCatalogItems().find((item) => item.id === upper);
}

export function filterCatalog(options: {
  category?: MolecularCategory | "all";
  query?: string;
}): MolecularCatalogItem[] {
  const { category = "all", query = "" } = options;
  const cleanQuery = query.trim().toLowerCase();

  return getAllCatalogItems().filter((item) => {
    if (category !== "all" && item.category !== category) {
      return false;
    }
    if (!cleanQuery) return true;

    return (
      item.id.toLowerCase().includes(cleanQuery) ||
      item.name.toLowerCase().includes(cleanQuery) ||
      item.organism.toLowerCase().includes(cleanQuery) ||
      (Boolean(item.uniProtId) && item.uniProtId!.toLowerCase().includes(cleanQuery)) ||
      item.description.toLowerCase().includes(cleanQuery)
    );
  });
}
