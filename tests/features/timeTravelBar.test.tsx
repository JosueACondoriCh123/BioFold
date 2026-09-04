import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TimeTravelBar } from "../../src/features/timeline/TimeTravelBar";
import type { ActivityEntry } from "../../src/types/domain";

describe("TimeTravelBar Component", () => {
  const mockActivities: ActivityEntry[] = [
    {
      id: "act-1",
      command: "load_structure",
      origin: "human",
      status: "success",
      message: "1CRN loaded and rendered.",
      createdAt: new Date(Date.now() - 60000).toISOString(),
      durationMs: 120,
    },
    {
      id: "act-2",
      command: "set_representation",
      origin: "human",
      status: "success",
      message: "Representation set to cartoon.",
      createdAt: new Date(Date.now() - 40000).toISOString(),
      durationMs: 80,
    },
    {
      id: "act-3",
      command: "show_surface",
      origin: "human",
      status: "success",
      message: "Molecular surface shown.",
      createdAt: new Date(Date.now() - 20000).toISOString(),
      durationMs: 250,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false or activities list is empty", () => {
    const handleRestore = vi.fn();
    const handleClose = vi.fn();

    const { container: c1 } = render(
      <TimeTravelBar
        isOpen={false}
        activities={mockActivities}
        onRestoreStep={handleRestore}
        onClose={handleClose}
      />,
    );
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <TimeTravelBar
        isOpen={true}
        activities={[]}
        onRestoreStep={handleRestore}
        onClose={handleClose}
      />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it("renders with the latest step by default and allows scrubbing", async () => {
    const handleRestore = vi.fn();
    const handleClose = vi.fn();

    render(
      <TimeTravelBar
        isOpen={true}
        activities={mockActivities}
        onRestoreStep={handleRestore}
        onClose={handleClose}
      />,
    );

    expect(screen.getByText("Time-Travel Slider")).toBeInTheDocument();
    // Default at step 3
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByText("show_surface")).toBeInTheDocument();

    // Scrub to step 0
    const slider = screen.getByLabelText(/Scrub through historical events/i);
    fireEvent.change(slider, { target: { value: "0" } });

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
      expect(screen.getByText("load_structure")).toBeInTheDocument();
    });

    // Jump to present state (step 3)
    const forwardBtn = screen.getByTitle(/Jump to present state/i);
    fireEvent.click(forwardBtn);

    await waitFor(() => {
      expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });
  });

  it("triggers onRestoreStep when Restore State is clicked", async () => {
    const handleRestore = vi.fn();
    const handleClose = vi.fn();

    render(
      <TimeTravelBar
        isOpen={true}
        activities={mockActivities}
        onRestoreStep={handleRestore}
        onClose={handleClose}
      />,
    );

    // Scrub to step 1
    const slider = screen.getByLabelText(/Scrub through historical events/i);
    fireEvent.change(slider, { target: { value: "1" } });

    const restoreBtn = screen.getByRole("button", { name: /Restore this State/i });
    fireEvent.click(restoreBtn);

    expect(handleRestore).toHaveBeenCalledWith(1);
    await waitFor(() => {
      expect(screen.getByText("State Restored!")).toBeInTheDocument();
    });
  });

  it("calls onClose when Exit is clicked", () => {
    const handleRestore = vi.fn();
    const handleClose = vi.fn();

    render(
      <TimeTravelBar
        isOpen={true}
        activities={mockActivities}
        onRestoreStep={handleRestore}
        onClose={handleClose}
      />,
    );

    const exitBtn = screen.getByRole("button", { name: /Exit/i });
    fireEvent.click(exitBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
