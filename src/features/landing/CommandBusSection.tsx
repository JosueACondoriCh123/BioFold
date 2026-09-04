import { MousePointerClick, Bot, ShieldCheck } from "lucide-react";

const OUTPUTS = [
  { y: 34, label: "3D viewer", note: "3Dmol.js scene" },
  { y: 132, label: "Geometry workers", note: "off the main thread" },
  { y: 230, label: "Activity audit", note: "timestamp · evidence" },
  { y: 328, label: "Snapshot store", note: "versioned, RLS-scoped" },
];

export function CommandBusSection() {
  return (
    <section className="bf-section bf-container" id="architecture" aria-labelledby="architecture-title">
      <div className="bf-section-heading">
        <div>
          <span className="bf-eyebrow">02 / Architecture</span>
          <h2 id="architecture-title">One bus. No back doors.</h2>
        </div>
        <p>
          A tool call and a button click enter the system at the same place and leave the same trace.
          That is the whole design.
        </p>
      </div>

      <div className="bf-bus">
        <svg
          className="bf-bus-diagram"
          viewBox="0 14 920 404"
          role="img"
          aria-labelledby="bus-diagram-title bus-diagram-desc"
          preserveAspectRatio="xMidYMid meet"
        >
          <title id="bus-diagram-title">How a command flows through BioFold</title>
          <desc id="bus-diagram-desc">
            Two entry points, the researcher interface and a WebMCP browser agent, both feed a single
            command bus. The bus drives the 3D viewer, the geometry workers, the activity audit and the
            snapshot store.
          </desc>

          <defs>
            <linearGradient id="bf-bus-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22382e" />
              <stop offset="100%" stopColor="#1a2b23" />
            </linearGradient>
          </defs>

          <g className="bf-bus-wire" fill="none">
            <path d="M206 114 C 250 114, 252 196, 292 200" />
            <path d="M206 326 C 250 326, 252 244, 292 240" />
            {OUTPUTS.map((output) => (
              <path
                key={output.y}
                d={`M630 220 C 670 220, 676 ${output.y + 35}, 714 ${output.y + 35}`}
              />
            ))}
          </g>

          <g className="bf-bus-node">
            <rect x="16" y="70" width="190" height="88" rx="14" />
            <text x="40" y="106">You</text>
            <text x="40" y="130" className="bf-bus-note">clicks, drags, sliders</text>

            <rect x="16" y="282" width="190" height="88" rx="14" />
            <text x="40" y="318">Browser agent</text>
            <text x="40" y="342" className="bf-bus-note">document.modelContext</text>
          </g>

          <g className="bf-bus-core">
            <rect x="292" y="176" width="338" height="88" rx="16" fill="url(#bf-bus-fill)" />
            <text x="461" y="212" textAnchor="middle">Command bus</text>
            <text x="461" y="236" textAnchor="middle" className="bf-bus-note">
              typed contract · strict validation
            </text>
          </g>

          <g className="bf-bus-node">
            {OUTPUTS.map((output) => (
              <g key={output.label}>
                <rect x="714" y={output.y} width="190" height="70" rx="14" />
                <text x="736" y={output.y + 32}>{output.label}</text>
                <text x="736" y={output.y + 52} className="bf-bus-note">{output.note}</text>
              </g>
            ))}
          </g>
        </svg>

        <ol className="bf-bus-stack">
          <li>
            <MousePointerClick aria-hidden="true" />
            <div>
              <h3>You act, or the agent does</h3>
              <p>Clicks and tool calls are two doors into one room.</p>
            </div>
          </li>
          <li>
            <Bot aria-hidden="true" />
            <div>
              <h3>The bus validates and executes</h3>
              <p>Strict input schemas, one typed handler per command.</p>
            </div>
          </li>
          <li>
            <ShieldCheck aria-hidden="true" />
            <div>
              <h3>The result is recorded</h3>
              <p>Viewer, workers, audit trail and snapshot store, in that order.</p>
            </div>
          </li>
        </ol>
      </div>

      <p className="bf-bus-note-line">
        Assistant proposals never execute themselves. They wait for <strong>Apply</strong>, and the
        audit trail refuses to record them without <code>approvedByUser: true</code>.
      </p>
    </section>
  );
}
