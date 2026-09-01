# Task 3 — navigation and laboratory integration

## Ownership and integration seam

The integration owner maintains `src/App.tsx`, `src/main.tsx`, `src/Laboratory.tsx`,
`src/integration/`, the scientific store/ports/command bus, and build/test configuration.
The auth owner maintains `src/auth/`; the platform owner maintains `src/pages/`,
`src/components/platform/`, and `src/platform.css`.

`PlatformEntry` discovers modules at build time. Auth must export `AuthProvider` from
`src/auth/AuthProvider.tsx` and `useAuth` from `src/auth/useAuth.ts` (or `.tsx`).
The hook must match `src/integration/contracts.ts`: `{ state, actions }`, with no
tokens in `state`. Pages use the names in `PAGE_NAMES`, one file per page under
`src/pages/`, exporting the named component or its default. No page receives props.
Restart the development server after delivering new modules if HMR has stale imports.

Missing auth or page modules show explicit integration-pending screens. There is no
production guest mode, mock login, or test-session flag. Missing configuration or
session errors fail closed. Auth error retry is owned by the provider.

## Routes

Public: `/`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/auth/callback`.
Private: `/app`, `/app/lab`, `/app/account`. Reset password requires
`state.recoveryAllowed`, which the auth module must set ONLY after Supabase validates
the recovery link. The router does not treat a query parameter as proof of recovery.
Private redirects use `/login?next=<encoded internal path>` and navigation state
`{ returnTo }`. Auth pages must validate the destination using `safeReturnTo`.

The integration adds a compact Home/Laboratory/Account navigation on private non-lab
screens. In the lab, the brand links to Home and the account icon links to Account;
do not wrap the lab in an additional platform sidebar/header.

Dashboard examples link to `/app/lab?pdb=1CRN` or `/app/lab?pdb=4HHB`. A plain lab link
resumes the current scene. An explicit example navigation loads that fixture. The
initial lab defaults to 1CRN. Invalid query IDs are not forwarded to commands.

## Lifetime guarantees

`workspaceSession` is a lightweight gate with identity and activation generations.
It imports no 3Dmol, workers, or auth tokens. Authenticated navigation activates it
only at `/app/lab`; the command bus checks it independently of visible controls.

The laboratory is lazy-loaded on first visit and retained in memory, hidden/inert
on other screens. Navigation preserves the last confirmed structure, camera,
representation, surface, selection, measurement, and activity. It stops rotation,
cancels pending work, and removes tools. No molecular state is persisted to disk or
cloud. Reloading resets it. Logging out or changing identity clears everything.

Each actual registration binds its current generation. Reusing a removed definition
returns `WORKSPACE_INACTIVE`; anonymous calls return `AUTH_REQUIRED`. These rejected
access attempts do not write to another workspace's activity. Accepted commands keep
their single activity ID and human/agent origin. Results from an ended identity do
not repopulate the store or activity. Tool inputs/names remain unchanged.

WebMCP registration removal and command cancellation use separate AbortSignals.
The registry retains successful registrations for retries within an activation and
discards all registrations on exit. Partial registration and late availability can
retry while active. Unsupported browsers keep authenticated human controls.

The geometry worker is created on demand and terminated on session teardown.
3Dmol 2.5 has no public destroy API: the adapter captures window/body/canvas listeners
only during synchronous construction, restores the registration methods immediately,
and removes those listeners on teardown. It disconnects 3Dmol's internal observers,
stops animations, removes models/surfaces/labels/shapes, and releases the GL context.
Recheck this adapter when upgrading 3Dmol; `viewerLifetime` has cleanup regression tests.
Pending surface candidates stay invisible and are removed on cancellation.

Lab CSS is scoped with `@scope (.laboratory-root)`, so visiting the lab cannot change
the platform's similarly named components. The intended browsers support CSS scope.

## Validation and deployment

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `pnpm run test:e2e:lab`: the scientific smoke tests plus navigation/teardown in Chrome.
- `pnpm test:e2e`: also includes the auth/platform owner's production-entry tests.

Playwright serves the production build at port 4180. Scientific E2E uses a separately
built entry at port 4181 (`tests/fixtures/`, `vite.e2e.config.ts`). The explicit test
identities, test pages, and inspection hooks exist ONLY in that entry. Its output is
`.qa_e2e-build`, ignored by Git and never included in production `dist` or Vercel.
The harness tests the real router, viewer, worker, commands, fixtures, and WebMCP adapter,
not real Supabase login. Keep the auth owner's network mocks separate.

Production CSP allows HTTPS Supabase project endpoints, not Google scripts or API
secrets. Before release, replace `https://*.supabase.co` in `vercel.json` with the exact
project origin once supplied (or its configured custom domain). Keep RCSB and worker
directives. The existing SPA rewrite supports direct navigation to nested routes.

Integration acceptance still requires the completed platform pages and verified
Supabase configuration (SMTP, Google, exact redirect allowlist). Specifically review
callback verification/URL cleanup, return destinations, and validated recovery in
the auth module. Passing isolated lab tests does not certify those auth flows.

No GitHub/Vercel publication, database, OpenRouter requests, or auth credentials are
created by task 3. The future chat endpoint must authenticate on the server; a SPA
route guard does not protect public assets or substitute for backend authorization.

## Verification snapshot — 2026-08-31

- Unit/component suite: 84 tests passed, including 9 lifetime/cancellation tests.
- Scientific and session Chrome E2E: all 10 passed, including real camera preservation,
  surface + distance continuity, stale tool rejection, logout and identity replacement.
- Full Chrome suite: 12 passed / 3 failed. The three failures belong to
  `tests/e2e/platform.spec.ts` (assertions at lines 47, 81, 94). They still expect the
  old public laboratory `.topbar` at `/`, contrary to the agreed protected routes.
  The auth owner should replace those assertions with actual landing/login/callback
  behavior. Do not reopen anonymous lab access to satisfy those tests.
- TypeScript and production build passed; existing 3Dmol eval/chunk-size warnings remain.
- Page modules were not yet present when this snapshot was recorded. Real Supabase
  email/Google access remains a separate acceptance step, not covered by the lab fixture.
- The actual rendered 4HHB preview is generated at `test-results/4hhb-viewer.png` by
  the session E2E; copy it to the platform's assets if using it in the landing page.
