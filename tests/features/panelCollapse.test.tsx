import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InspectorPanel } from "../../src/features/assistant/ui/InspectorPanel";
import type { AssistantClient } from "../../src/types/assistant";

const client = { send: vi.fn() } as unknown as AssistantClient;

describe("inspector collapse", () => {
  it("tells the workspace when it collapses, so the grid track can shrink", () => {
    const onCollapsedChange = vi.fn();
    render(<InspectorPanel assistantClient={client} onCollapsedChange={onCollapsedChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse inspector panel" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector panel" }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it("drops the tab strip while collapsed so the rail is not clipped", () => {
    render(<InspectorPanel assistantClient={client} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse inspector panel" }));
    expect(screen.queryByRole("tablist")).toBeNull();
    // The way back must survive the collapse.
    expect(screen.getByRole("button", { name: "Expand inspector panel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand inspector panel" }));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("keeps working when the workspace does not pass a collapse listener", () => {
    render(<InspectorPanel assistantClient={client} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Collapse inspector panel" })),
    ).not.toThrow();
  });
});
