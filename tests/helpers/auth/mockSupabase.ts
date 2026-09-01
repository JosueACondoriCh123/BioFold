import type {
  AuthChangeEvent as SupabaseAuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import { vi } from "vitest";

export interface MockSupabaseOptions {
  initialSession?: Session | null;
  initialUser?: User | null;
}

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-123",
    app_metadata: {},
    user_metadata: {
      full_name: "Rosalind Franklin",
      avatar_url: "https://example.com/avatar.png",
    },
    aud: "authenticated",
    confirmation_sent_at: "2026-08-01T00:00:00.000Z",
    recovery_sent_at: undefined,
    email_change_sent_at: undefined,
    new_email: undefined,
    invited_at: undefined,
    action_link: undefined,
    email: "rosalind@crystallography.org",
    phone: "",
    created_at: "2026-08-01T00:00:00.000Z",
    confirmed_at: "2026-08-01T00:05:00.000Z",
    email_confirmed_at: "2026-08-01T00:05:00.000Z",
    phone_confirmed_at: undefined,
    last_sign_in_at: "2026-08-30T10:00:00.000Z",
    role: "authenticated",
    updated_at: "2026-08-30T10:00:00.000Z",
    identities: [],
    factors: [],
    ...overrides,
  };
}

export function createMockSession(
  user: User = createMockUser(),
  overrides: Partial<Session> = {},
): Session {
  return {
    access_token: "mock-jwt-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
    ...overrides,
  };
}

export interface MockSupabaseAuthController {
  client: SupabaseClient;
  listeners: Set<(event: SupabaseAuthChangeEvent, session: Session | null) => void>;
  triggerAuthChange: (event: SupabaseAuthChangeEvent, session: Session | null) => void;
  mockGetSession: ReturnType<typeof vi.fn>;
  mockGetUser: ReturnType<typeof vi.fn>;
  mockVerifyOtp: ReturnType<typeof vi.fn>;
  mockExchangeCodeForSession: ReturnType<typeof vi.fn>;
  mockSetSession: ReturnType<typeof vi.fn>;
  mockSignInWithPassword: ReturnType<typeof vi.fn>;
  mockSignUp: ReturnType<typeof vi.fn>;
  mockSignInWithOAuth: ReturnType<typeof vi.fn>;
  mockSignOut: ReturnType<typeof vi.fn>;
  mockResetPasswordForEmail: ReturnType<typeof vi.fn>;
  mockUpdateUser: ReturnType<typeof vi.fn>;
  mockResend: ReturnType<typeof vi.fn>;
}

/** Point the jsdom window at a path (keeps the current origin). */
export function setTestUrl(path: string): void {
  window.history.replaceState(null, "", path);
}

export function currentTestUrl(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

export function createMockSupabaseAuth(
  options: MockSupabaseOptions = {},
): MockSupabaseAuthController {
  const defaultUser = options.initialUser ?? createMockUser();
  const defaultSession =
    options.initialSession !== undefined
      ? options.initialSession
      : createMockSession(defaultUser);

  const listeners = new Set<
    (event: SupabaseAuthChangeEvent, session: Session | null) => void
  >();
  let storedSession = defaultSession;

  const triggerAuthChange = (
    event: SupabaseAuthChangeEvent,
    session: Session | null,
  ) => {
    storedSession = session;
    listeners.forEach((callback) => callback(event, session));
  };

  const mockGetSession = vi.fn().mockImplementation(async () => ({
    data: { session: storedSession },
    error: null,
  }));
  const mockGetUser = vi.fn().mockImplementation(async () => ({
    data: { user: storedSession?.user ?? defaultUser }, error: null,
  }));
  const mockVerifyOtp = vi.fn().mockResolvedValue({ data: { session: defaultSession, user: defaultUser }, error: null });

  const mockExchangeCodeForSession = vi.fn().mockResolvedValue({
    data: { session: defaultSession, user: defaultUser, redirectType: null },
    error: null,
  });

  const mockSetSession = vi.fn().mockResolvedValue({
    data: { session: defaultSession, user: defaultUser },
    error: null,
  });

  const mockOnAuthStateChange = vi
    .fn()
    .mockImplementation(
      (callback: (event: SupabaseAuthChangeEvent, session: Session | null) => void) => {
        listeners.add(callback);
        return {
          data: {
            subscription: {
              id: "sub-123",
              callback,
              unsubscribe: () => {
                listeners.delete(callback);
              },
            },
          },
        };
      },
    );

  const mockSignInWithPassword = vi.fn().mockResolvedValue({
    data: { session: defaultSession, user: defaultUser },
    error: null,
  });

  const mockSignUp = vi.fn().mockResolvedValue({
    data: { session: defaultSession, user: defaultUser },
    error: null,
  });

  const mockSignInWithOAuth = vi.fn().mockResolvedValue({
    data: { provider: "google", url: "https://accounts.google.com/o/oauth2/v2/auth?..." },
    error: null,
  });

  const mockSignOut = vi.fn().mockResolvedValue({
    error: null,
  });

  const mockResetPasswordForEmail = vi.fn().mockResolvedValue({
    data: {},
    error: null,
  });

  const mockUpdateUser = vi.fn().mockImplementation((attributes: { data?: { full_name?: string }; password?: string }) => {
    const updatedUser = {
      ...defaultUser,
      user_metadata: {
        ...defaultUser.user_metadata,
        ...(attributes.data?.full_name ? { full_name: attributes.data.full_name } : {}),
      },
    };
    return Promise.resolve({
      data: { user: updatedUser },
      error: null,
    });
  });

  const mockResend = vi.fn().mockResolvedValue({
    data: {},
    error: null,
  });

  const authMock = {
    getSession: mockGetSession,
    getUser: mockGetUser,
    verifyOtp: mockVerifyOtp,
    exchangeCodeForSession: mockExchangeCodeForSession,
    setSession: mockSetSession,
    onAuthStateChange: mockOnAuthStateChange,
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signInWithOAuth: mockSignInWithOAuth,
    signOut: mockSignOut,
    resetPasswordForEmail: mockResetPasswordForEmail,
    updateUser: mockUpdateUser,
    resend: mockResend,
  };

  const client = {
    auth: authMock,
  } as unknown as SupabaseClient;

  return {
    client,
    listeners,
    triggerAuthChange,
    mockGetSession,
    mockGetUser,
    mockVerifyOtp,
    mockExchangeCodeForSession,
    mockSetSession,
    mockSignInWithPassword,
    mockSignUp,
    mockSignInWithOAuth,
    mockSignOut,
    mockResetPasswordForEmail,
    mockUpdateUser,
    mockResend,
  };
}
