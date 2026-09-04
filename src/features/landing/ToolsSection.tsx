import { TOOL_COUNT_WORD_CAPS, TOOLS } from "./landingContent";

export function ToolsSection() {
  return (
    <section className="bf-section bf-container" id="tools" aria-labelledby="tools-title">
      <div className="bf-section-heading">
        <div>
          <span className="bf-eyebrow">03 / The typed surface</span>
          <h2 id="tools-title">{TOOL_COUNT_WORD_CAPS} tools, registered on the live scene.</h2>
        </div>
        <p>
          Titles and descriptions below are read straight from the contracts BioFold registers. This
          is the manifest the agent receives, not a summary of it.
        </p>
      </div>

      <ul className="bf-tools">
        {TOOLS.map((tool, index) => (
          <li key={tool.name}>
            <div className="bf-tool-head">
              <span className="bf-tool-index">{String(index + 1).padStart(2, "0")}</span>
              <code>{tool.name}</code>
            </div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            {tool.hints.length > 0 && (
              <ul className="bf-tool-hints">
                {tool.hints.map((hint) => (
                  <li key={hint} data-hint={hint}>{hint}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <p className="bf-tools-note">
        Tools register only when an authenticated researcher opens the laboratory, and de-register on
        the way out. In a browser without WebMCP, every human control still works.
      </p>
    </section>
  );
}
