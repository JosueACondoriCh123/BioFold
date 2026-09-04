import { PLATFORM_FACTS } from "./landingContent";

export function PlatformSection() {
  return (
    <section className="bf-section bf-container" aria-labelledby="platform-title">
      <div className="bf-section-heading">
        <div>
          <span className="bf-eyebrow">05 / The platform underneath</span>
          <h2 id="platform-title">Built like a product, not a demo.</h2>
        </div>
        <p>The parts a judge cannot see from a screenshot, stated plainly.</p>
      </div>

      <div className="bf-platform-grid">
        {PLATFORM_FACTS.map((fact) => (
          <article key={fact.title}>
            <h3>{fact.title}</h3>
            <p>{fact.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
