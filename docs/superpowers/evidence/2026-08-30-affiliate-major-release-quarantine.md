# Affiliate Major Release Quarantine Evidence

Date: 2026-08-30

## Release boundary

The merchant Affiliate task workspace is complete on the isolated branch and is intentionally excluded from `main` until the user approves a future major release.

Do not merge, cherry-pick, push, or deploy until the user approves the Affiliate major release.

## Current feature checkpoint

- Branch: `codex/affiliate-merchant-task-workspace`
- Worktree: `/Users/eason/Documents/New project/.worktrees/affiliate-merchant-task-workspace`
- Feature HEAD before the authenticated browser evidence update: `073dfb96`
- Common ancestor with current local `main`: `f8a02ea3`
- Divergence before the authenticated browser evidence update: `main` has 16 commits not in the feature branch; the feature branch has 14 commits not in `main`.
- `git merge-base --is-ancestor codex/affiliate-merchant-task-workspace main` returned exit code `1`, proving this major-release workspace is not integrated into `main`.
- The local `main` checkout was clean at `27809dfd` during the authenticated browser evidence update. This Affiliate task did not touch, stage, merge, or run its isolated runtime from the main checkout.

## Affiliate worktree inventory

Every local branch whose name contains `affiliate` is attached to its own worktree:

| Branch | Worktree | Recorded HEAD | Main ancestry at isolation time |
| --- | --- | --- | --- |
| `codex/affiliate-alliance-invitations` | `.worktrees/affiliate-alliance-invitations` | `b4a7f05f` | already an ancestor of `main` |
| `codex/affiliate-invitations-integration` | `.worktrees/affiliate-invitations-integration` | `ca5bda07` | already an ancestor of `main` |
| `codex/affiliate-profile` | `.worktrees/codex-affiliate-profile` | `73787e94` | already an ancestor of `main` |
| `codex/affiliate-merchant-task-workspace` | `.worktrees/affiliate-merchant-task-workspace` | `073dfb96` | not in `main` |

The three historical Affiliate branches were already ancestors of `main`; they were not reverted or rewritten because doing so would change existing application behavior. Their dedicated worktrees preserve branch isolation without destabilizing current code. The new merchant task major-release workspace remains completely outside `main`.

The `affiliate-alliance-invitations` worktree contained unrelated pre-existing uncommitted changes at isolation time. They were preserved exactly as found and were not staged, committed, moved, or overwritten by this task.

## Functional boundary delivered in the isolated major release

- The identity switch page shows a `TEST` badge only beside Affiliate Marketing.
- Merchant task lists and detail surfaces show the task display ID (`taskCode`).
- Shop scope displays the formal public shop ID.
- Affiliate people surfaces retain their public `needoId` where applicable.
- Service database IDs, Merchant Account IDs, internal user IDs, and identity IDs are not rendered.
- Merchant publishers can create drafts, select owned scopes, save five independent locales, preview the server fee snapshot, submit idempotently, and inspect the read-only status timeline.
- The formal API uses authenticated identity scope, RBAC, Zod validation, pagination, OpenAPI documentation, persistence, audit logging, and the existing wallet/ledger freeze workflow.

## Verification evidence

- Frontend lint passed.
- Frontend i18n audit completed; i18n quality reported zero missing entries for every supported language.
- Frontend regression suite passed: 255 files, 1,514 tests, zero failures.
- The post-browser Affiliate frontend target suite passed again: 6 files, 28 tests, zero failures.
- Production build verification and bundle audit passed.
- Backend lint and TypeScript build passed.
- Backend regression suite passed: 326 suites and 2,161 tests passed; 10 suites and 38 tests were skipped; zero failures.
- The checker contract suite passed: 7 of 7 tests.
- `check:merchant-affiliate-task-workspace` passed against local `needo_dev` with the formal repositories and services.
- Real-MySQL evidence covered pagination, public shop IDs, display projection, fee preview with zero mutations, exact single-shop and multi-shop freezes, duplicate-submit idempotency, mixed-rate and insufficient-balance rollback, outsider-scope rejection, fresh-service persistence, and zero cleanup residue.
- Backend health and readiness reported healthy MySQL and Redis dependencies.
- Authenticated desktop Chrome acceptance passed against an isolated feature runtime (`5181` frontend and `3004` backend) without using the main runtime (`5180` and `3000`).
- The real `merchant@example.com` merchant-admin session created and reloaded single-shop and multi-shop drafts through the formal API. The task display ID and public shop IDs were visible; service database IDs, Merchant Account IDs, internal shop IDs, user IDs, identity IDs, and media IDs were absent from rendered text.
- The editor exercised all six steps and all five locale tabs. Formal fee previews were correct for 100,000 NDP and 1,000,000 NDP budgets; mixed shop fee rates and insufficient wallet balance produced the expected errors without freezing funds or creating ledger records.
- Optimistic locking acceptance passed: an external lock-version advance produced the 409 conflict panel, kept the unsaved local value in the editor, and replaced it with the server value only after the explicit `重新加载最新版本` action.
- Persistence acceptance passed after a full isolated-backend stop/start and after a real logout and credential re-login. The task ID, name, publisher, and both public shop IDs remained available.
- The identity switch page showed `联盟营销 TEST`, with the `TEST` badge limited to Affiliate Marketing.
- Desktop layout at 1512 × 711 had no document-level horizontal overflow (`clientWidth` and `scrollWidth` were both 1512). The controlled Chrome surface did not expose a viewport resize API, so a second authenticated narrow-window screenshot was not manufactured or claimed. Narrow-layout contracts remain covered structurally by stacked filter grids, a three-column small-screen editor step grid, and the shared horizontal-scroll region for the 1,180 px task table, together with the passing frontend regression suite.
- Application-origin console warnings/errors from `http://localhost:5181` were empty throughout acceptance. Repeated warnings from an unrelated installed browser extension were excluded by URL, not attributed to NeeDo.
- The browser-created draft, temporary merchant account, second shop, service, category, wallet, memberships, and public identifier were deleted after guarded assertions proved `DRAFT` status, 200,000 NDP available, zero NDP frozen, zero budget reservations, and zero affiliate-task ledger rows. Post-cleanup checks found zero marker residue and confirmed the existing Aoyama shop public ID and merchant test user were unchanged.

## Integration rule

When the user schedules the Affiliate major release, start from this worktree, synchronize with the then-current `main`, regenerate Prisma Client, rerun the full verification matrix and authenticated desktop plus exact narrow-viewport browser acceptance, and only then request explicit approval to integrate.
