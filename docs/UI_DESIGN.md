# BioFold 3D — soft dark interface

Implemented 2026-08-31. UI copy is English; this delivery covers screens, visual integration and laboratory styling, not production authentication acceptance.

## Delivered

- Public landing with the real 4HHB laboratory capture, scientific capabilities, human/agent collaboration and explicit evidence limits.
- Sign-in, signup, email verification, password recovery, callback and password-reset screens. Shared accessible forms validate before calling the existing auth actions.
- Private home, example links, account editing, sign-out UI and a 404 screen.
- Profile, loading, unconfigured, error and recovery-required views share the same visual system.
- Existing laboratory layout and scientific commands preserved. Softer panels, readable functional labels (12 px minimum), named Account navigation and active-route title/focus handling.
- No new dependencies, fonts, scientific endpoints, persistent analyses or chat UI.

## Visual system

| Role | Value |
| --- | --- |
| Background / panel / elevated panel | `#0D1514` / `#151F1D` / `#1C2926` |
| Primary / secondary text | `#E8EEEA` / `#AAB9B3` |
| Primary action / button text | `#A7CFBC` / `#13231C` |
| Selection and surface / measurement / heuristic | `#5CCFB5` / `#E8A2CE` / `#E0BA7B` |
| Form outline | `#647B70` |
| Font | System sans-serif, with system monospace for structure identifiers |
| Forms / labels / laboratory functional text | 16 px / 14 px / at least 12 px |
| Controls / panels | 10 px / 16 px corner radius |

The platform styles use `bf-` classes under `.platform-root`. Scientific styles stay inside `@scope (.laboratory-root)`. The actual molecular chain, element and spectrum colors are unchanged.

Base color pairs are verified from the CSS by `tests/platform/designTokens.test.ts`: normal text >=4.5:1 and input outlines >=3:1. Primary button text is approximately 9.57:1; secondary text on the elevated panel is approximately 7.39:1. Keyboard focus, field error descriptions and reduced motion are covered by component/browser tests. These checks are not a substitute for a full independent accessibility audit.

## Routes and behavior

Public: `/`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/auth/callback`. Recovery-only: `/reset-password`. Authenticated: `/app`, `/app/lab`, `/app/account`.

Pages consume only `useAuth().state` and `useAuth().actions`; they never read tokens, call Supabase directly or add auth data to molecular state/activity. Login destinations are allowlisted internal routes. Email confirmation addresses use navigation state rather than query strings. Only the auth module can authorize recovery.

Landing and ordinary platform pages do not import the molecular runtime. The laboratory remains lazy and its existing session lifecycle retains scene/camera during navigation, cancels pending work outside the lab and clears resources on identity changes or logout.

## Verification and evidence

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: 156 tests passed across 15 files, including 32 new platform/visual-token tests.
- `pnpm build`: passed. Existing 3Dmol warnings remain: dependency `eval` and a lazy laboratory chunk above 500 kB. The landing does not fetch that chunk.
- Full `pnpm test:e2e`: 21 passed / 11 failed before the final additional production-isolation test; every failure was in the externally owned `tests/e2e/platform.spec.ts`.
- Targeted final UI/scientific run: **16 passed** using the command below. This includes the production landing isolation check, 24 screen/viewport combinations, keyboard/reduced-motion validation and the ten existing laboratory/WebMCP regressions. The final responsive checks assert zero browser console errors and zero uncaught page errors. A missing favicon reference in the separate visual fixture was corrected before this final run.

```sh
pnpm test:e2e tests/e2e/design.spec.ts tests/e2e/smoke.spec.ts tests/e2e/laboratorySession.spec.ts --output=.qa_ui-verification
```

Screenshots are in `.qa_ui-verification/`; a flat copy is available locally in `.qa_ui-review/`: landing, login, signup, dashboard, account and laboratory at 1440, 1000, 720 and 390 px, plus measured-distance laboratory captures. These artifact directories are git-ignored and are not deployed. The active screenshot source for the landing is `public/4hhb-preview.png`.

Private screenshots use the explicit `tests/fixtures/platform-visual.html` entry with a simulated profile and real UI/laboratory code. It is built only by `vite.e2e.config.ts`, is absent from production `dist`, and does **not** establish that real Supabase authentication works. The ordinary production landing was separately tested without a simulated auth provider.

## Handoff to external QA/auth owners

Full-suite failures are retained in `test-results/`. Do not weaken the application to make these stale tests pass:

1. The brand appears in both header and footer. Scope selectors to the banner instead of assuming `.bf-brand` is unique.
2. Password reveal buttons also contain the word "password". Use exact input labels from `PLATFORM_UI_HANDOFF.md`.
3. Verification copy is `Check your inbox.`; update copy-dependent selectors accordingly.
4. With no Supabase environment, protected routes intentionally show **Authentication is not configured**, not a fake anonymous login flow. Add a separate assertion for this state.
5. Injecting a string into `localStorage` does not simulate a verified Supabase session. Configure a test project origin/key and mock its auth network responses; do not introduce a production bypass.
6. Exercise logout through the real Sign out control, not by deleting storage and reloading. Verify input values with `toHaveValue`, not body text.
7. A test that merely verifies the body is visible after a recovery fragment does not prove recovery authorization or callback cleanup.

The actual Supabase project, SMTP/email delivery, Google consent, callback destinations and evaluator credentials still require live verification by their owner. No real account was created and no email was sent for these visual checks. GitHub/Vercel publishing remains the user's responsibility.
