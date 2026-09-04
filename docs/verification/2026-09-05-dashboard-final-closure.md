# Dashboard final closure — 2026-09-05

Scope: finish the outstanding local acceptance and maintenance items from the
operations/merchant dashboard conversation, then integrate into local `main`.
Fare and consumables remain reserved APIs; franchisee/supplier detail navigation
remains TEST as explicitly requested. No remote push or deployment is included.

## Work sequence

- [x] Reconcile current source, historical acceptance notes, and local runtime.
- [x] Close backend formatter debt in directory-bounded mechanical batches.
- [x] Verify merchant-account multi-shop switching against formal data and UI.
- [ ] Verify the five published carousel media objects after the separately owned
  media storage repair is available, without duplicating its active changes.
- [ ] Run appropriate regression/build checks, correct stale dashboard documents,
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

Raw logs and screenshots are local ignored acceptance artifacts under
`backend/.data/dashboard-closure/`; no credentials or session tokens are included
in this report.
