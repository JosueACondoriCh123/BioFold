import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenuDropdown } from "../../src/components/navigation/UserMenuDropdown";
import { NotificationsDropdown } from "../../src/components/navigation/NotificationsDropdown";
import {
  CommandPaletteModal,
  CommandPaletteTrigger,
} from "../../src/components/navigation/CommandPaletteModal";
import { AuthContext } from "../../src/auth/AuthContext";
import type { AuthContextValue } from "../../src/auth/authContextDef";
import { notificationService } from "../../src/services/notificationService";

function renderWithRouter(ui: React.ReactElement, authValue?: Partial<AuthContextValue>) {
  const defaultAuth: AuthContextValue = {
    state: {
      status: "authenticated",
      user: {
        id: "user-123",
        email: "marie.curie@science.test",
        displayName: "Marie Curie",
      },
      recoveryAllowed: false,
    },
    actions: {
      signIn: vi.fn(),
      signUp: vi.fn(),
      signInWithGoogle: vi.fn(),
      requestPasswordReset: vi.fn(),
      resendVerification: vi.fn(),
      completeCallback: vi.fn(),
      updatePassword: vi.fn(),
      updateDisplayName: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
      retrySession: vi.fn(),
    },
    user: null,
    session: null,
    status: "authenticated",
    isLoading: false,
    isAuthenticated: true,
    isRecoveryMode: false,
    isConfigured: true,
    error: null,
    clearError: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    requestPasswordRecovery: vi.fn(),
    updatePassword: vi.fn(),
    updateDisplayName: vi.fn(),
    resendConfirmation: vi.fn(),
    ...authValue,
  };

  return render(
    <StrictMode>
      <AuthContext.Provider value={defaultAuth}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </StrictMode>
  );
}

describe("1. UserMenuDropdown (Avatar & Menú de Usuario)", () => {
  it("renders user initials in avatar button", () => {
    renderWithRouter(<UserMenuDropdown />);
    const button = screen.getByRole("button", { name: /User menu for Marie Curie/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("MC");
  });

  it("renders avatar image when avatar_url is present", () => {
    renderWithRouter(<UserMenuDropdown />, {
      state: {
        status: "authenticated",
        user: {
          id: "google-user",
          email: "scientist@google.com",
          displayName: "Google Scientist",
          avatarUrl: "https://lh3.googleusercontent.com/a/photo.jpg",
        } as any,
        recoveryAllowed: false,
      },
    });

    const img = screen.getByAltText("Google Scientist");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/photo.jpg");
  });

  it("opens popover menu with user details, Supabase connection status and quick links on click", async () => {
    renderWithRouter(<UserMenuDropdown />);
    const button = screen.getByRole("button", { name: /User menu for Marie Curie/i });
    fireEvent.click(button);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Marie Curie")).toBeInTheDocument();
    expect(screen.getByText("marie.curie@science.test")).toBeInTheDocument();
    expect(screen.getByText(/Supabase Conectado/i)).toBeInTheDocument();

    // Check menu links
    expect(screen.getByRole("menuitem", { name: /Dashboard & Proyectos/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Laboratorio 3D/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Multimodal Vision/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Configuración de Cuenta/i })).toBeInTheDocument();
  });

  it("triggers signOut when clicking Sign Out button", async () => {
    const signOutMock = vi.fn().mockResolvedValue(undefined);
    renderWithRouter(<UserMenuDropdown />, {
      actions: {
        signIn: vi.fn(),
        signUp: vi.fn(),
        signInWithGoogle: vi.fn(),
        requestPasswordReset: vi.fn(),
        resendVerification: vi.fn(),
        completeCallback: vi.fn(),
        updatePassword: vi.fn(),
        updateDisplayName: vi.fn(),
        signOut: signOutMock,
        retrySession: vi.fn(),
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /User menu for Marie Curie/i }));
    const signOutBtn = screen.getByRole("menuitem", { name: /Cerrar Sesión/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledOnce();
    });
  });

  it("closes dropdown on Escape key", () => {
    renderWithRouter(<UserMenuDropdown />);
    const button = screen.getByRole("button", { name: /User menu for Marie Curie/i });
    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("2. CommandPaletteModal & Trigger (Ctrl+K)", () => {
  it("renders search trigger button with Ctrl K badge and handles clicks", () => {
    const handleOpen = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteTrigger onOpen={handleOpen} />
      </MemoryRouter>
    );

    const trigger = screen.getByRole("button", { name: /Abrir Command Palette/i });
    expect(trigger).toHaveTextContent("Buscar moléculas o acciones...");
    expect(trigger).toHaveTextContent("Ctrl K");

    fireEvent.click(trigger);
    expect(handleOpen).toHaveBeenCalledOnce();
  });

  it("renders search bar, popular structures (6LU7, P04637, Hemoglobina) and quick commands", () => {
    const handleClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    );

    expect(screen.getByRole("dialog", { name: /Command Palette/i })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Buscar moléculas \(ej\. 6LU7, P04637, Hemoglobina\) o comandos\.\.\./i)
    ).toBeInTheDocument();

    // Check popular structures
    expect(screen.getByText(/6LU7 · SARS-CoV-2 Mpro/i)).toBeInTheDocument();
    expect(screen.getByText(/P04637 · Proteína Supresora Tumoral P53/i)).toBeInTheDocument();
    expect(screen.getByText(/4HHB · Hemoglobina Humana/i)).toBeInTheDocument();

    // Check quick commands
    expect(screen.getByText(/Saltar a Laboratory/i)).toBeInTheDocument();
    expect(screen.getByText(/Exportar Figura 4K/i)).toBeInTheDocument();
    expect(screen.getByText(/Alternar Superficie Molecular/i)).toBeInTheDocument();
  });

  it("toggles keyboard shortcuts guide", () => {
    const handleClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    );

    const shortcutsBtn = screen.getByRole("button", { name: /Atajos \(\?\)/i });
    fireEvent.click(shortcutsBtn);

    expect(screen.getByText("Atajos de Teclado del Laboratorio")).toBeInTheDocument();
    expect(screen.getByText("Rotación Libre 3D")).toBeInTheDocument();
    expect(screen.getByText("Medir Distancia Atómica")).toBeInTheDocument();

    const backBtn = screen.getByRole("button", { name: /Volver a búsqueda/i });
    fireEvent.click(backBtn);
    expect(screen.queryByText("Atajos de Teclado del Laboratorio")).not.toBeInTheDocument();
  });

  it("closes when pressing Esc key", () => {
    const handleClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteModal isOpen={true} onClose={handleClose} />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Buscar moléculas/i);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledOnce();
  });
});

describe("3. NotificationsDropdown (Centro de Notificaciones 🔔)", () => {
  beforeEach(() => {
    notificationService.clearAll();
    notificationService.addNotification({
      id: "test-alert-1",
      type: "storage",
      title: "PDB Subido a Supabase Storage",
      message: "Estructura 6LU7 almacenada con compresión.",
      read: false,
    });
  });

  it("renders bell icon with unread badge counter", () => {
    const { container } = render(
      <MemoryRouter>
        <NotificationsDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole("button", { name: /Notificaciones/i });
    expect(bellBtn).toBeInTheDocument();
    const badge = container.querySelector(".bf-bell-badge");
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe("1");
  });

  it("opens popover on click and shows session alerts (Storage, Vision, Export)", () => {
    render(
      <MemoryRouter>
        <NotificationsDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole("button", { name: /Notificaciones/i });
    fireEvent.click(bellBtn);

    expect(screen.getByRole("dialog", { name: /Centro de Notificaciones/i })).toBeInTheDocument();
    expect(screen.getByText("PDB Subido a Supabase Storage")).toBeInTheDocument();
    expect(screen.getByText("Estructura 6LU7 almacenada con compresión.")).toBeInTheDocument();
  });

  it("marks all notifications as read when clicking Leídas button", () => {
    render(
      <MemoryRouter>
        <NotificationsDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole("button", { name: /Notificaciones/i });
    fireEvent.click(bellBtn);

    const markReadBtn = screen.getByRole("button", { name: /Marcar todas como leídas/i });
    fireEvent.click(markReadBtn);

    expect(notificationService.getUnreadCount()).toBe(0);
  });

  it("closes popover on Escape key", () => {
    render(
      <MemoryRouter>
        <NotificationsDropdown />
      </MemoryRouter>
    );

    const bellBtn = screen.getByRole("button", { name: /Notificaciones/i });
    fireEvent.click(bellBtn);
    expect(screen.getByRole("dialog", { name: /Centro de Notificaciones/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Centro de Notificaciones/i })).not.toBeInTheDocument();
  });
});
