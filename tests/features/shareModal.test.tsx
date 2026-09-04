import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareProjectModal } from "../../src/features/sharing/ShareProjectModal";

describe("ShareProjectModal Component", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined" && localStorage?.clear) {
      localStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const handleClose = vi.fn();
    const { container } = render(
      <ShareProjectModal
        isOpen={false}
        projectId="proj-123"
        projectTitle="Kinase Workspace"
        onClose={handleClose}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders sharing modal and handles toggling public share link", async () => {
    const handleClose = vi.fn();
    render(
      <ShareProjectModal
        isOpen={true}
        projectId="proj-123"
        projectTitle="Kinase Workspace"
        onClose={handleClose}
      />,
    );

    expect(screen.getByText("Share Research Project")).toBeInTheDocument();
    expect(screen.getByText("Kinase Workspace")).toBeInTheDocument();
    expect(screen.getByText("Public Read-Only Link")).toBeInTheDocument();

    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();

    // Turn ON sharing
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toBeChecked();
    });

    // Public share link input and copy button should appear
    expect(screen.getByText(/Shareable Link/i)).toBeInTheDocument();
    const copyBtn = screen.getByRole("button", { name: /^Copy$/i });
    expect(copyBtn).toBeInTheDocument();


    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /Close share dialog/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

