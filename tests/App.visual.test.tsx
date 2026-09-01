import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Laboratory from "../src/Laboratory";
import { useAppStore } from "../src/store/appStore";

const { executeMock, attachMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  attachMock: vi.fn(),
}));

vi.mock("../src/core/commandBus", () => ({
  commandBus: { execute: executeMock },
}));

vi.mock("../src/adapters/viewerPort", () => ({
  viewerPort: {
    attach: attachMock,
    resize: vi.fn(),
    zoom: vi.fn(),
    spin: vi.fn(),
    setSuspended: vi.fn(),
    dispose: vi.fn(),
  },
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const structure = {
  id: "1CRN",
  source: "fixture" as const,
  format: "cif" as const,
  loadedAt: "2026-08-27T00:00:00.000Z",
};

const summary = {
  chains: ["A"],
  chainCount: 1,
  residueCount: 46,
  atomCount: 327,
  ligandCount: 0,
  waterCount: 0,
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  executeMock.mockResolvedValue({ ok: true, evidence: "observed", activityId: "test" });
  useAppStore.setState({
    viewerReady: false,
    structure,
    summary,
    loading: false,
    error: undefined,
    representation: "cartoon",
    colorScheme: "chain",
    surfaceVisible: false,
    surfaceOpacity: 0.72,
    surfaceOperation: { status: "idle" },
    selectedResidues: [],
    measurement: undefined,
    mutation: undefined,
    activity: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const renderApp = () => render(<MemoryRouter><Laboratory /></MemoryRouter>);

describe("viewer-first visual states", () => {
  it("shows non-blocking surface progress inline and in the HUD", () => {
    useAppStore.setState({
      surfaceOperation: {
        status: "loading",
        request: { visible: true, opacity: 0.55 },
      },
    });

    renderApp();

    expect(screen.getAllByText("Computing surface…")).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "Molecular surface" })).toBeDisabled();
    expect(screen.getByRole("slider", { name: "Surface opacity" })).toBeDisabled();
    expect(document.querySelector(".surface-control")).toHaveAttribute("aria-busy", "true");
  });

  it("keeps a surface error visible and retries the exact request as a human action", () => {
    useAppStore.setState({
      surfaceVisible: true,
      surfaceOpacity: 0.4,
      surfaceOperation: {
        status: "error",
        request: { visible: true, opacity: 0.8 },
        message: "Surface triangulation failed.",
      },
    });

    renderApp();

    expect(screen.getByRole("alert")).toHaveTextContent("Surface triangulation failed.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(executeMock).toHaveBeenCalledWith(
      "show_surface",
      { visible: true, opacity: 0.8 },
      { origin: "human" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(useAppStore.getState().surfaceOperation).toEqual({ status: "idle" });
  });

  it("synchronizes agent-applied opacity with the slider and scene HUD", () => {
    useAppStore.setState({
      surfaceVisible: true,
      surfaceOpacity: 0.55,
      surfaceOperation: { status: "idle" },
    });

    renderApp();

    expect(screen.getByRole("slider", { name: "Surface opacity" })).toHaveValue("0.55");
    expect(screen.getByText("55%")).toBeVisible();
    expect(screen.getByText("Surface · 55%")).toBeVisible();
    expect(screen.getByText("Surface visible")).toBeVisible();
  });

  it("renders compact audit metadata without exposing the activity ID visually", () => {
    useAppStore.setState({
      activity: [{
        id: "activity-visual-test",
        command: "measure_distance",
        origin: "agent",
        status: "success",
        message: "Distance measured: 12.60 Å.",
        createdAt: "2026-08-27T12:34:56.000Z",
        durationMs: 42,
      }],
    });

    renderApp();

    const item = document.querySelector(".activity-item");
    expect(item).toHaveAttribute("data-activity-id", "activity-visual-test");
    expect(item).toHaveAttribute("data-command", "measure_distance");
    expect(item).toHaveAttribute("data-origin", "agent");
    expect(item).toHaveTextContent("Distance");
    expect(item).toHaveTextContent("agent");
    expect(item).toHaveTextContent("42 ms");
    expect(item).not.toHaveTextContent("activity-visual-test");
  });
});
