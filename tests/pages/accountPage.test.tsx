import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AccountPage from "../../src/pages/AccountPage";
import type { AuthContextValue } from "../../src/integration/contracts";
import * as structureCache from "../../src/adapters/structureCache";

const authContext = vi.hoisted(() => ({
  value: null as AuthContextValue | null,
}));

vi.mock("../../src/auth/useAuth", () => ({
  useAuth: () => authContext.value,
}));

beforeEach(() => {
  authContext.value = {
    state: {
      status: "authenticated",
      user: { id: "test-user-123", email: "elena.rostova@biochem.org", displayName: "Dr. Elena Rostova" },
      recoveryAllowed: false,
    },
    actions: {
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      requestPasswordReset: vi.fn(),
      resendVerification: vi.fn(),
      completeCallback: vi.fn().mockResolvedValue("/app"),
      updatePassword: vi.fn(),
      updateDisplayName: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      retrySession: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Enhanced AccountPage Component Tests", () => {
  it("renders profile header with avatar initials and user details", () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Your account." })).toBeInTheDocument();
    expect(screen.getByText("Dr. Elena Rostova")).toBeInTheDocument();
    expect(screen.getByText("elena.rostova@biochem.org")).toBeInTheDocument();
    expect(screen.getByText("DE")).toBeInTheDocument();
  });

  it("switches to 3D Laboratory Preferences and saves settings", async () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    // Click on 3D Laboratory Preferences tab
    const prefTab = screen.getByRole("tab", { name: /3D Laboratory Preferences/i });
    fireEvent.click(prefTab);

    expect(screen.getByText("Default Laboratory 3D Settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Default Representation")).toBeInTheDocument();

    // Change representation to Stick
    const repSelect = screen.getByLabelText("Default Representation");
    fireEvent.change(repSelect, { target: { value: "stick" } });

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /Save 3D preferences/i });
    fireEvent.click(saveBtn);

    expect(await screen.findByText("Laboratory preferences saved successfully.")).toBeInTheDocument();
  });

  it("switches to AI & BYOK Keys tab and saves personal API key", async () => {
    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    // Click on AI tab
    const aiTab = screen.getByRole("tab", { name: /AI & BYOK Keys/i });
    fireEvent.click(aiTab);

    expect(screen.getByText("AI Models & Bring Your Own Key (BYOK)")).toBeInTheDocument();

    // Enter API key
    const keyInput = screen.getByLabelText(/Personal OpenRouter API Key/i);
    fireEvent.change(keyInput, { target: { value: "sk-or-v1-abcdef123456" } });

    // Save AI settings
    const saveAiBtn = screen.getByRole("button", { name: /Save AI settings/i });
    fireEvent.click(saveAiBtn);

    expect(await screen.findByText("Personal OpenRouter API key saved.")).toBeInTheDocument();
    expect(screen.getByText(/Custom OpenRouter API key configured/i)).toBeInTheDocument();
  });

  it("switches to Storage & Cache tab and allows purging local cache", async () => {
    vi.spyOn(structureCache, "getCachedStructureIds").mockResolvedValue(["1CRN", "4HHB", "6LU7"]);
    const clearSpy = vi.spyOn(structureCache, "clearStructureCache").mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <AccountPage />
      </MemoryRouter>,
    );

    // Click Storage tab
    const storageTab = screen.getByRole("tab", { name: /Storage & Cache/i });
    fireEvent.click(storageTab);

    expect(screen.getByText("Local Cache & Storage Management")).toBeInTheDocument();

    // Wait for cached count
    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });
    expect(screen.getByText("Cached Structures")).toBeInTheDocument();

    // Click purge button
    const purgeBtn = screen.getByRole("button", { name: /Purge local cache/i });
    fireEvent.click(purgeBtn);

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalled();
      expect(screen.getByText("Local structure cache successfully purged.")).toBeInTheDocument();
    });
  });
});
