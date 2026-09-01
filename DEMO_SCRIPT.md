# BioFold 3D — Demo Video Script (3:00 Target)

A comprehensive walkthrough showcasing the full platform: public landing, authentication, workspace navigation, active 3D molecular laboratory, and real-time human + agent WebMCP collaboration.

---

## 0:00–0:30 — Problem & Public Landing Page
**Visual:** Show the fast, clean landing page at `http://127.0.0.1:4173/` (`/`). Scroll past the feature grid and structure preview.
**Narration:**
> *"Protein structures contain the molecular keys to life, therapeutics, and disease. But conventional 3D molecular viewers are difficult for AI agents to use—vision models struggle to click through complex 3D canvases, and external scripts disconnect the scientist from the visual context.*
>
> *This is BioFold 3D: a WebMCP-native molecular workspace platform where humans and browser AI agents explore, measure, and understand proteins together in one shared live scene."*

---

## 0:30–0:55 — Authentication & Workspace Dashboard
**Visual:** Click **Sign In**, log in via `/login`, and arrive at `/app` (Dashboard). Show personalized greeting *"Welcome, Ada"*, quick guides, and example structure cards (`1CRN`, `4HHB`).
**Narration:**
> *"BioFold is a full production platform with real Supabase authentication, PKCE flow, and private workspace routing. The public landing has zero WebGL overhead, loading instantly.*
>
> *Once signed in, we land in our workspace dashboard. Let’s open the live 3D laboratory."*

---

## 0:55–1:35 — Entering the Lab & Agent Discovery
**Visual:** Click **Open Laboratory** (`/app/lab`). The 3Dmol WebGL canvas boots up with Crambin (`1CRN`). The topbar status indicator switches to **"8 agent tools · WebMCP ready"**. Open the browser agent prompt sidebar.
**Narration:**
> *"Inside the laboratory, BioFold registers eight imperative WebMCP site tools directly into `document.modelContext`. Notice that our AI agent now has direct access to the live scene.*
>
> *Let’s give the agent a prompt: **'Summarize this protein, switch representation to stick with spectrum coloring, and focus on chain A residue 10.'**"*

**Visual:** The agent executes `get_structure_summary`, `set_representation`, and `focus_residues`. The 3D canvas updates in real time to stick representation, and zooms into residue 10. The live activity log records every command.
**Narration:**
> *"The agent executes the exact domain commands. The 3D representation transforms, the camera zooms into residue 10, and our activity stream logs the action with full scientific provenance."*

---

## 1:35–2:10 — Shared Human + Agent Co-Exploration
**Visual:** Manually grab the mouse and rotate the 3D model. Then type a measurement prompt to the agent: **"Measure distance from chain A residue 1 CA to chain A residue 10 CA."**
**Narration:**
> *"Human and agent are equal partners in this workspace. I can take manual control with the mouse at any second to rotate the view or adjust the zoom.*
>
> *Now, let’s ask the agent to measure: **'Measure distance between A:1:CA and A:10:CA.'**"*

**Visual:** The agent executes `measure_distance`. A magenta dashed vector appears in 3D between the two carbon-alpha atoms, labeled **12.60 Å**. The HUD displays the distance, and the activity stream tags it as **Calculated** evidence.
**Narration:**
> *"The measurement is rendered immediately in 3D with an exact vector and Ångström readout. The activity item clearly tags this as 'Calculated' evidence, grounded in observed atomic coordinates."*

---

## 2:10–2:40 — Honest Mutation Context & Surfaces
**Visual:** Prompt the agent: **"Preview changing chain A residue 10 to Tryptophan, and enable molecular surface at 50% opacity."**
**Narration:**
> *"Let’s explore a mutation question: **'Preview changing chain A residue 10 to Tryptophan, and turn on the molecular surface at 50% opacity.'**"*

**Visual:** The target residue turns amber, its 5 Å spatial neighbors highlight in cyan, and the mutation panel reports sidechain volume, hydropathy, and charge differences. In parallel, a non-blocking background worker computes and displays the semi-transparent molecular surface.
**Narration:**
> *"BioFold maps the spatial neighborhood in 3D and compares physicochemical properties. Crucially, we maintain strict scientific honesty: this is labeled as a heuristic context tool, not an ungrounded claim of stability or folding prediction."*

---

## 2:40–3:00 — Session Isolation, Account & Wrap-Up
**Visual:** Click **Account** in the header. The canvas cleanly hides, tools unregister, and user profile details appear. Click back to **Laboratory**—the 3D scene and camera are preserved. Click **Sign Out**, returning cleanly to `/login`.
**Narration:**
> *"When we navigate to our Account settings, WebMCP tools deactivate and the canvas is suspended without losing our 3D session in memory. Upon signing out, the active scene and tokens are safely purged.*
>
> *WebMCP turns AI agents from passive chatbot observers into active, high-precision collaborators inside scientific applications. Thank you for exploring BioFold 3D!"*
