# Affiliate Major Release Quarantine Evidence

Date: 2026-08-30

## Release boundary

The merchant Affiliate task workspace is complete on the isolated branch and is intentionally excluded from `main` until the user approves a future major release.

Do not merge, cherry-pick, push, or deploy until the user approves the Affiliate major release.

## Current feature checkpoint

- Branch: `codex/affiliate-merchant-task-workspace`
- Worktree: `/Users/eason/Documents/New project/.worktrees/affiliate-merchant-task-workspace`
- Feature HEAD before this evidence note: `ce933c3b`
- Common ancestor with current local `main`: `f8a02ea3`
- Divergence before this evidence note: `main` has 14 commits not in the feature branch; the feature branch has 12 commits not in `main`.
- `git merge-base --is-ancestor codex/affiliate-merchant-task-workspace main` returned exit code `1`, proving this major-release workspace is not integrated into `main`.
- The local `main` checkout remained clean at `30eed0ca` while the feature worktree was developed and verified.

## Affiliate worktree inventory

Every local branch whose name contains `affiliate` is attached to its own worktree:

| Branch | Worktree | Recorded HEAD | Main ancestry at isolation time |
| --- | --- | --- | --- |
| `codex/affiliate-alliance-invitations` | `.worktrees/affiliate-alliance-invitations` | `b4a7f05f` | already an ancestor of `main` |
| `codex/affiliate-invitations-integration` | `.worktrees/affiliate-invitations-integration` | `ca5bda07` | already an ancestor of `main` |
| `codex/affiliate-profile` | `.worktrees/codex-affiliate-profile` | `73787e94` | already an ancestor of `main` |
| `codex/affiliate-merchant-task-workspace` | `.worktrees/affiliate-merchant-task-workspace` | `ce933c3b` | not in `main` |

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
- Production build verification and bundle audit passed.
- Backend lint and TypeScript build passed.
- Backend regression suite passed: 326 suites and 2,161 tests passed; 10 suites and 38 tests were skipped; zero failures.
- The checker contract suite passed: 7 of 7 tests.
- `check:merchant-affiliate-task-workspace` passed against local `needo_dev` with the formal repositories and services.
- Real-MySQL evidence covered pagination, public shop IDs, display projection, fee preview with zero mutations, exact single-shop and multi-shop freezes, duplicate-submit idempotency, mixed-rate and insufficient-balance rollback, outsider-scope rejection, fresh-service persistence, and zero cleanup residue.
- Backend health and readiness reported healthy MySQL and Redis dependencies.
- Browser navigation reached the real merchant-admin authentication guard at `/store-admin.html#/merchant-admin/affiliate/tasks`; authenticated visual acceptance was not bypassed or falsely claimed.

## Integration rule

When the user schedules the Affiliate major release, start from this worktree, synchronize with the then-current `main`, regenerate Prisma Client, rerun the full verification matrix and authenticated desktop/mobile browser acceptance, and only then request explicit approval to integrate.
