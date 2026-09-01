import { ArrowRight, ArrowUpRight, Layers3, Ruler, ScanLine, UsersRound, Sparkles, ClipboardList, Info } from "lucide-react";
import { Link } from "react-router";
import { Footer, PlatformPage, PublicHeader } from "../components/platform/PlatformLayout";

export default function LandingPage() {
  return <PlatformPage name="landing" title="Explore molecular structures">
    <a className="bf-skip" href="#main-content">Skip to content</a><PublicHeader />
    <main id="main-content">
      <section className="bf-hero bf-container" aria-labelledby="hero-title">
        <div className="bf-hero-copy"><span className="bf-eyebrow"><span className="bf-small-dot" /> Molecular exploration, together</span>
          <h1 id="hero-title">Explore molecular structures.<br /><span>With clarity.</span></h1>
          <p>A clearer view of the molecules behind the questions. Inspect structures, measure distances, and explore alongside an agent in one shared workspace.</p>
          <div className="bf-actions"><Link className="bf-button" to="/signup">Create account <ArrowUpRight size={18} aria-hidden="true" /></Link><a className="bf-link-action" href="#explore">Explore the workspace <ArrowRight size={17} aria-hidden="true" /></a></div>
          <p className="bf-hero-note">Built around real structures. Grounded in visible evidence.</p>
        </div>
        <figure className="bf-preview"><div className="bf-preview-heading"><span>Inside the laboratory</span><span className="bf-tag">Structure preview</span></div>
          <img src="/4hhb-preview.png" width="840" height="812" fetchPriority="high" alt="Actual BioFold view of 4HHB, showing four hemoglobin chains in a cartoon representation" />
          <figcaption><strong>4HHB <span>Hemoglobin</span></strong><span>Actual laboratory capture · RCSB fixture</span></figcaption>
        </figure>
      </section>

      <section className="bf-section bf-container" id="explore" aria-labelledby="explore-title"><div className="bf-section-heading"><div><span className="bf-eyebrow">01 / A closer look</span><h2 id="explore-title">From structure to understanding.</h2></div><p>Clear controls. Useful context. Every change reflected in the scene.</p></div>
        <div className="bf-capabilities">
          <article><span className="bf-feature-icon"><Layers3 aria-hidden="true" /></span><h3>Find your perspective</h3><p>Move between cartoon, stick, sphere and line views. Color by chain, element or residue spectrum.</p><span className="bf-feature-detail">Representation & color</span></article>
          <article><span className="bf-feature-icon"><ScanLine aria-hidden="true" /></span><h3>See the surrounding shape</h3><p>Reveal the molecular surface and adjust its opacity while keeping the underlying structure in view.</p><span className="bf-feature-detail">Molecular surfaces</span></article>
          <article><span className="bf-feature-icon bf-icon-rose"><Ruler aria-hidden="true" /></span><h3>Make a precise observation</h3><p>Select two atoms and measure their distance in ångströms, with endpoints and references you can inspect.</p><span className="bf-feature-detail">Distances & selections</span></article>
        </div>
      </section>

      <section className="bf-section bf-container" id="collaborate" aria-labelledby="collaborate-title"><div className="bf-collaboration">
        <div><span className="bf-eyebrow">02 / Human + agent</span><h2 id="collaborate-title">Different ways in.<br />The same shared view.</h2><p>Work directly with the controls, or ask a compatible browser agent to act through WebMCP. Both use the same commands, scene and activity log.</p><p className="bf-subtle">No WebMCP support? Every human control still works.</p></div>
        <ol className="bf-workflow"><li><UsersRound aria-hidden="true" /><div><h3>You set the direction</h3><p>Choose a structure and the question you want to explore.</p></div></li><li><Sparkles aria-hidden="true" /><div><h3>The agent can act in context</h3><p>Eight structured tools connect it to the active laboratory.</p></div></li><li><ClipboardList aria-hidden="true" /><div><h3>The result stays inspectable</h3><p>See what changed, who requested it and the evidence returned.</p></div></li></ol>
      </div></section>

      <section className="bf-section bf-container bf-limits" aria-labelledby="limits-title"><span className="bf-eyebrow">03 / Scientific clarity</span><h2 id="limits-title">Know what the view can tell you.</h2><div className="bf-evidence-grid"><div><span>Observed</span><p>Coordinates and structure information from RCSB or bundled examples.</p></div><div><span>Calculated</span><p>Geometric distances and spatial neighbors based on those coordinates.</p></div><div><span className="bf-amber">Heuristic</span><p>Mutation context compares residue properties. It does not simulate a mutation.</p></div></div><p className="bf-limit-note"><Info size={17} aria-hidden="true" /> BioFold does not predict folding, stability, binding affinity or clinical outcomes.</p></section>

      <section className="bf-container bf-closing"><div><span className="bf-eyebrow">Your next perspective</span><h2>Start with a structure.<br />See where your questions lead.</h2></div><Link className="bf-button" to="/signup">Create account <ArrowUpRight size={18} aria-hidden="true" /></Link></section>
    </main><Footer />
  </PlatformPage>;
}
