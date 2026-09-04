# Dashboard final closure — 2026-09-05

Scope: finish the outstanding local acceptance and maintenance items from the
operations/merchant dashboard conversation, then integrate into local `main`.
Fare and consumables remain reserved APIs; franchisee/supplier detail navigation
remains TEST as explicitly requested. No remote push or deployment is included.

## Work sequence

- [x] Reconcile current source, historical acceptance notes, and local runtime.
- [x] Close backend formatter debt in directory-bounded mechanical batches.
- [x] Verify merchant-account multi-shop switching against formal data and UI.
- [x] Resolve local carousel storage configuration and verify the five published
  media objects without altering the separately owned IM/Social repair.
- [x] Run appropriate regression/build checks, correct stale dashboard documents,
  and merge the reviewed commits into local `main`.

## Starting evidence

- Start revision: `886dc470`.
- All five previously reported carousel hashes exist under the main checkout's
  `backend/runtime/content-media`; the previous "files missing" statement was
  inaccurate. The running worktree's relative storage root explains the 404s.
- Merchant dashboard membership now returns formal `memberCount` with
  `memberDataStatus: ready`; the old reserved/null description is stale.
- The root checkout contains unrelated work. This closure uses its own linked
  worktree and preserves the root checkout unchanged.

## Branch verification

- Backend: four sequential Jest shards, 594 passing suites, 4,341 passing tests;
  14 suites / 51 tests skipped by their configured gates. This is not a claim
  that opt-in MySQL suites were enabled by the default command.
- Backend ESLint, TypeScript build and Prettier check all passed.
- The 527 formatted TypeScript files were compared against `886dc470` using
  normalized TypeScript ASTs: zero semantic differences. A read-only reviewer
  independently reran that comparison and found no merge blockers.
- Frontend: 373 files / 2,603 tests passed. After the route/chunk adjustment,
  42 focused assertions, TypeScript production build and production bundle audit
  passed (8 HTML entries / 39 assets).
- Main JavaScript fell below the unchanged 4,000,000-byte budget; the translation
  chunk fell below its unchanged 3,704,096-byte budget. Agent and operating-cost
  pages now load lazily behind their existing permission guards. The affiliate
  translation split is a per-chunk adjustment, not a reduction of all initial
  translation downloads.

## Real merchant browser acceptance

Verified on standard `http://127.0.0.1:5180`, with frontend PID 14207, formal API
PID 14208, merchant API PID 14209 and operations API PID 14210. Their cwd was
the local main integration worktree; merchant requests used `/merchant-api/v1/`.

- Formal merchant-organization login with the configured local password; no
  credential reset, mock session, or browser-state permission injection.
- Paginated shop list, Escape close and trigger focus restoration.
- Deliberately failed switch leaves the current shop and data scope unchanged.
- Switch from the existing shop to an empty, temporary shop owned by the same
  merchant; dashboard API scope changes to the new public shop ID and has zero GMV.
- Prior access token returns HTTP 401 after the successful switch.
- Browser refresh retains the selected shop; switching back restores the original
  scope. Desktop and 390px screenshots were inspected after the startup overlay
  disappeared. At 390px, document width equals viewport width; no page errors.
- Only an isolated empty shop, its public identifier and merchant membership were
  created. They were removed in `finally`, with setup/cleanup audit records retained.
  No existing shop, password, order, wallet or membership-card data was changed.

## Final integration and runtime

- Latest main changes were integrated before final merge. Five formatting conflicts
  were resolved by preserving the complete main version and applying Prettier.
  All 533 backend files differing from that main revision were AST-equivalent.
- All 30 test files introduced/changed by that main update were selected explicitly:
  29 suites / 370 tests passed; one opt-in MySQL suite/test remained skipped.
  Backend lint, build and format check passed on the combined result.
- Final frontend regression: 374 files / 2,613 tests passed. Build and unchanged
  production bundle audit passed with 8 HTML entries / 40 assets. Service-search
  administration is also lazy-loaded after the integration's bundle regression;
  its added test was verified RED then GREEN.
- Authenticated production-preview acceptance on isolated port 5181 loaded all
  three management page chunks with HTTP 200 and no page errors. The actual
  agent, operating-cost, taxonomy and search-trend APIs returned HTTP 200.
  This preview check is separate from the standard-port acceptance below.
- Code was fast-forwarded into local main at `f9f35ac8`. On standard port 5180,
  the main dashboard rendered all 17 finance/commission/growth accessories in
  their card headers, with the five unavailable/reserved actions marked TEST.
  All three rankings switched from GMV to completed-count ordering, with their
  formal API requests returning HTTP 200. The three management routes also
  rendered successfully on main, with no page errors.
- Final main listeners: frontend 14207, formal API 27167, operations API 27151,
  merchant API 27168. Their cwd was the main integration worktree. Health and
  readiness checks returned HTTP 200.
- The ignored local `.env.dev` now sets `CONTENT_MEDIA_STORAGE_DIR` to the
  existing shared checkout media directory. No media file or publication record
  was replaced. After main's development servers reloaded, all five previously
  failing images returned HTTP 200 with image MIME types. This is a local
  configuration repair; it does not claim the separate IM/Social work is merged.
- No remote push, production deployment, production migration, or production
  data mutation was performed. Explicitly reserved fare/consumables integrations
  and franchisee/supplier TEST navigation remain intentionally reserved.

Raw logs and screenshots are retained as ignored acceptance artifacts under the
main integration worktree's `backend/.data/dashboard-final-closure/`. No credentials
or session tokens are included in this report. The temporary preview and closure
worktree can be removed after preserving these artifacts; main remains runnable.
