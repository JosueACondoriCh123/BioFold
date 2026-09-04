import { useRef, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { STAGE_PANELS, TOOL_COUNT_WORD } from "./landingContent";
import { panelMotion, useStageProgress } from "./useStageProgress";

/** Hero panel plus one panel per narrative beat; the hero owns slice zero. */
const PANEL_COUNT = STAGE_PANELS.length + 1;

export function CinematicStage() {
  const track = useRef<HTMLDivElement>(null);
  const { progress, reduced } = useStageProgress(track);
  const hero = panelMotion(progress, 0, PANEL_COUNT);

  /**
   * Panels stay in the accessibility tree at every scroll position: the fading
   * is decoration, not a change of content. Only the hero holds links, so only
   * the hero goes inert — nothing else could take hidden keyboard focus.
   */
  const motionStyle = (motion: { opacity: number; offset: number }) =>
    reduced ? undefined : { opacity: motion.opacity, transform: `translate3d(0, ${motion.offset}px, 0)` };

  return (
    <section className="bf-stage" aria-labelledby="hero-title">
      <div className="bf-stage-track" ref={track} style={{ "--bf-stage-panels": PANEL_COUNT } as CSSProperties}>
        <div className="bf-stage-pin">
          <video
            className="bf-stage-video"
            poster="/media/helix-poster.jpg"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src="/media/helix.webm" type="video/webm" />
            <source src="/media/helix.mp4" type="video/mp4" />
          </video>
          <img className="bf-stage-still" src="/media/helix-poster.jpg" alt="" aria-hidden="true" />
          <div className="bf-stage-scrim" aria-hidden="true" />

          <div className="bf-stage-content">
            <div
              className="bf-stage-panel bf-stage-hero"
              style={motionStyle(hero)}
              inert={!reduced && !hero.active}
            >
              <span className="bf-eyebrow">
                <span className="bf-small-dot" /> WebMCP-native molecular workspace
              </span>
              <h1 id="hero-title">
                Agents don't need to see your screen.
                <br />
                <span>They need hands.</span>
              </h1>
              <p>
                BioFold 3D exposes {TOOL_COUNT_WORD} typed WebMCP tools over a live protein structure. You and the
                agent run the same commands, on the same scene, through the same audit trail.
              </p>
              <div className="bf-actions">
                <Link className="bf-button" to="/signup">
                  Create account <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
                <a className="bf-link-action" href="#tools">
                  See the {TOOL_COUNT_WORD} tools <ArrowRight size={17} aria-hidden="true" />
                </a>
              </div>
            </div>

            {STAGE_PANELS.map((panel, index) => {
              const motion = panelMotion(progress, index + 1, PANEL_COUNT);
              return (
                <div
                  key={panel.id}
                  className="bf-stage-panel"
                  style={motionStyle(motion)}
                >
                  <span className="bf-eyebrow">{panel.eyebrow}</span>
                  <h2>
                    {panel.heading.split("\n").map((line, i) => (
                      <span key={line}>
                        {i > 0 && <br />}
                        {line}
                      </span>
                    ))}
                  </h2>
                  <p>{panel.body}</p>
                  {panel.aside && <p className="bf-stage-aside">{panel.aside}</p>}
                </div>
              );
            })}
          </div>

          <ol className="bf-stage-ticks" aria-hidden="true">
            {Array.from({ length: PANEL_COUNT }, (_, index) => {
              const motion = panelMotion(progress, index, PANEL_COUNT);
              return <li key={index} className={motion.active ? "is-active" : undefined} />;
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
