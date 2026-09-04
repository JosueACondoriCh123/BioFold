import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { COMMAND_NAMES } from "../../src/core/commandContracts";
import { CinematicStage } from "../../src/features/landing/CinematicStage";
import { TOOL_COUNT, TOOL_COUNT_WORD_CAPS, TOOLS } from "../../src/features/landing/landingContent";
import { ToolsSection } from "../../src/features/landing/ToolsSection";
import { panelMotion } from "../../src/features/landing/useStageProgress";

function stubMotionPreference(prefersReduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: prefersReduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("landing tool table", () => {
  it("stays in sync with the registered command contracts", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual([...COMMAND_NAMES]);
  });

  it("renders every registered tool name verbatim", () => {
    render(<MemoryRouter><ToolsSection /></MemoryRouter>);
    const list = within(screen.getByRole("region", { name: /tools, registered on the live scene/i }));
    for (const name of COMMAND_NAMES) expect(list.getByText(name)).toBeInTheDocument();
  });

  it("never announces a tool count it does not actually list", () => {
    render(<MemoryRouter><ToolsSection /></MemoryRouter>);
    // Registering a new command must update the headline, not silently contradict it.
    expect(TOOL_COUNT).toBe(COMMAND_NAMES.length);
    expect(screen.getByRole("heading", { level: 2 }).textContent)
      .toBe(`${TOOL_COUNT_WORD_CAPS} tools, registered on the live scene.`);
    expect(document.querySelectorAll(".bf-tools > li")).toHaveLength(COMMAND_NAMES.length);
  });
});

describe("cinematic stage", () => {
  it("keeps every panel readable regardless of scroll position", () => {
    stubMotionPreference(false);
    render(<MemoryRouter><CinematicStage /></MemoryRouter>);
    // Panels fade visually, but none of them may leave the accessibility tree.
    for (const panel of document.querySelectorAll(".bf-stage-panel")) {
      expect(panel.getAttribute("aria-hidden")).toBeNull();
    }
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/One command bus/)).toBeInTheDocument();
  });

  it("drops motion styling entirely under prefers-reduced-motion", () => {
    stubMotionPreference(true);
    render(<MemoryRouter><CinematicStage /></MemoryRouter>);
    const panels = [...document.querySelectorAll<HTMLElement>(".bf-stage-panel")];
    expect(panels).toHaveLength(5);
    for (const panel of panels) {
      expect(panel.style.opacity).toBe("");
      expect(panel.style.transform).toBe("");
    }
    // The hero must stay reachable: nothing is animating it out of the way.
    expect(panels[0].hasAttribute("inert")).toBe(false);
  });

  it("does not let a faded hero hold hidden keyboard focus", () => {
    stubMotionPreference(false);
    render(<MemoryRouter><CinematicStage /></MemoryRouter>);
    const hero = document.querySelector<HTMLElement>(".bf-stage-hero")!;
    // At rest the hero is on screen and its links are reachable.
    expect(hero.hasAttribute("inert")).toBe(false);
    expect(within(hero).getByRole("link", { name: /Create account/ })).toBeInTheDocument();
  });
});

describe("stage panel motion", () => {
  it("shows the opening panel before any scrolling happens", () => {
    expect(panelMotion(0, 0, 5)).toMatchObject({ opacity: 1, offset: 0, active: true });
  });

  it("hides panels whose slice has not been reached", () => {
    expect(panelMotion(0, 3, 5)).toMatchObject({ opacity: 0, active: false });
  });

  it("brings a panel to full opacity in the middle of its own slice", () => {
    expect(panelMotion(0.5, 2, 5)).toMatchObject({ opacity: 1, offset: 0, active: true });
  });
});
