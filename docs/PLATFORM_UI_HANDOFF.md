# Platform UI — parallel ownership and integration

## Ownership

- **Codex (former Agent 2):** `src/pages/`, `src/components/platform/`, `src/platform.css`, `tests/platform/`, `public/4hhb-preview.png`, this document, and necessary integration/router changes. Do not modify the molecular tools or scientific contracts.
- **Codex — authentication closure:** `src/auth/`, `tests/auth/`, `tests/helpers/auth/`, `.env.example`, `docs/AUTH_SETUP.md`, `docs/AUTH_CLOSURE.md`, and required routing integration. Local closure is complete; coordinate further changes with Codex.
- **Codex — platform acceptance:** `tests/e2e/platform.spec.ts`, `tests/helpers/platform/`, `docs/PLATFORM_ACCEPTANCE.md` and the isolated Vite/Playwright configuration. Closure is integrated; future changes must preserve the HTTP-only mock boundary.

Do not edit another owner's files, change dependencies/configuration, commit, or revert concurrent changes without coordination.

## Shared contract

Pages import `useAuth` from `src/auth/useAuth` and consume **only** `state` and `actions`, structurally matching `src/integration/contracts.ts`. All action errors reject with a safe, user-facing Error message. No page reads/stores passwords outside its local form, accesses tokens, constructs OAuth URLs, or calls Supabase directly.

`signInWithGoogle(returnTo)` receives a validated **relative internal workspace destination**, not an OAuth redirect URL. The adapter constructs `/auth/callback` and remembers the validated destination. `completeCallback()` validates/exchanges the callback, cleans sensitive URL parameters and returns `/app`, `/app/lab`, `/app/account`, or `/reset-password` for **validated** recovery. Pages never infer recovery from query text.

The UI helper `src/components/platform/navigation.ts` restricts workspace return links to these routes and a valid optional `pdb` on the lab route. Auth must enforce the same allowlist at its own boundary; browser-supplied state is never trusted. Confirmation email addresses pass through React Router state, not query parameters. Signup password minimum is 8 characters; the server may impose stricter policy.

## Stable accessible selectors

Prefer roles and exact names instead of CSS structure. All page forms have a matching accessible name.

| Page | Form name | Input labels | Main action |
| --- | --- | --- | --- |
| `/login` | Sign in | Email address, Password | Sign in |
| `/signup` | Create account | Full name, Email address, Password | Create account |
| `/verify-email` | Resend confirmation | Email address | Resend confirmation |
| `/forgot-password` | Password recovery | Email address | Send reset link |
| `/reset-password` | Set new password | New password, Confirm new password | Update password |
| `/app/account` | Profile details | Full name, Email address (read-only) | Save changes |

- Google button: `Continue with Google` on both login/signup.
- Logout: `Sign out` on Account; clears the laboratory through existing session lifecycle.
- Navigation: `Workspace navigation`, links `Home`, `Laboratory`, `Account` (Home is exact `/app`).
- Dashboard example links: `Explore 1CRN` and `Explore 4HHB`; resume link: `Open laboratory`.
- Main headings: `Explore molecular structures. With clarity.`, `Welcome back.`, `A new perspective starts here.`, `Check your inbox.`, `Forgot your password?`, `Verifying your link.`, `Choose a new password.`, `Your laboratory, ready when you are.`, `Your account.`, `This page is uncharted.`
- Errors have `role=alert`; success/busy notices have `role=status`; forms expose `aria-busy`.
- Stable root attributes: `data-page="landing|login|signup|verify-email|forgot-password|auth-callback|reset-password|dashboard|account|not-found"`.
- Landing preview is a static `<img>` with alt text beginning `Actual BioFold view of 4HHB`; not a WebGL canvas.
- Both public header and footer include the brand. Use `getByRole('banner')` to scope header queries; do not assume `.bf-brand` is unique. Password reveal controls also have accessible names containing "password"; locate inputs using exact label names from the table.
- Current UI palette is soft charcoal/sage. Body text is 16 px, form labels 14 px, laboratory functional text >=12 px. No external fonts or new dependencies.

## Authentication — implementation handoff (2026-08-31)

The provider now uses an auth-only session controller. The callback is exchanged once and its verified outcome is reused; no existing session or URL marker substitutes for callback validation. PKCE recovery comes from the installed SDK's redirectType; token_hash is verified by the server with a supported type. Legacy implicit bearer-token callbacks are cleaned and rejected. All email/OAuth redirects use `/auth/callback`. Google requests only basic identity scopes.

Stored sessions now require `GET /auth/v1/user` before workspace access. A subsequent storage check detects identity/token changes during verification. Logout closes the workspace immediately and serializes SDK cleanup after pending mutations; failed logout stays closed and retries cleanup. User changes and unmount invalidate late results. Recovery permission is consumed after successful password update, and routing preserves the form's success navigation.

`state/actions`, scientific tools and accessible names are unchanged. New-password minimum is 8, display-name maximum is 80. E2E configuration must use a syntactically valid fake publishable key (`sb_publishable_e2e_test`) with a fake HTTPS Supabase origin. An arbitrary string key is deliberately rejected; never use actual secrets. Detailed endpoint and acceptance guidance is in `docs/AUTH_SETUP.md`.

## Platform QA — completed closure

The E2E suite exercises the real platform and installed SDK with test-only Supabase HTTP mocks. It has no production test login and does not treat arbitrary localStorage as proof of authentication. The scientific/session E2Es remain intact, and missing configuration has its own isolated build. See `docs/PLATFORM_ACCEPTANCE.md` for the current matrix.

Real Supabase email delivery, Google consent, SMTP and evaluation credentials require the owner's project and are a separate manual acceptance gate. Do not send real mail, create real users or change actual credentials during automated testing.

## Reference

Email confirmation and password recovery behavior follows [Supabase's password guide](https://supabase.com/docs/guides/auth/passwords). Scientific scene continuity and WebMCP registration remain owned by the already integrated laboratory lifecycle.
