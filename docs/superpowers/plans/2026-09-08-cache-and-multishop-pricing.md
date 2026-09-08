# Persistent cache and multi-shop pricing implementation plan

> Execute locally in `codex/cache-pricing-batch`; do not push or deploy.

## Task 1: Protect the baseline and characterize prior IM cache work

- Verify the isolated worktree is clean and based on the current pricing implementation.
- Run focused baseline tests for carousel, core-read, IM store, scheduling, and pricing.
- Compare the prior IM cache contract with current Auth/IM/realtime interfaces; port behavior instead of merging obsolete page code.

## Task 2: Add the shared encrypted persistent resource cache

- Add failing unit tests for scope isolation, cache-first reads, once-per-session revalidation, changed-payload notifications, retry, corruption recovery, and memory locking.
- Implement IndexedDB and in-memory ports with account-scoped AES-GCM encryption.
- Add a React hook that renders memory/persistent data before network completion, preserves cached data on refresh errors, and supports force retry.

## Task 3: Connect carousel, information-card, and schedule reads

- Add failing hook/component tests proving route remounts do not show an empty loading state or issue repeated server requests.
- Connect published carousel and core-read queries to stable cache keys.
- Connect customer profile, calendar windows, and technician schedule resources to account/shop/range-scoped cache keys.
- Invalidate relevant entries after successful local mutations.
- Verify NeeDo media endpoints keep stable browser-cache headers and cached payloads retain image URLs.

## Task 4: Port and integrate the secure IM cache

- Bring forward the prior encrypted message/cache database core with current types.
- Add failing current-store tests for cached bootstrap/history hydration before the server resolves, account isolation, authoritative-message persistence, and recall/delete/clear purges.
- Wire current auth lifecycle to lock decrypted account state on logout/switch.
- Wire current realtime events and server history to update/purge cache records without restoring stale terminal messages.

## Task 5: Prove multi-shop pricing isolation

- Add a two-shop/one-technician regression test at repository/service/booking boundaries.
- Verify pricing-mode changes mutate only the selected shop and technician services remain independently persisted.
- Fix only demonstrated gaps; preserve the existing shop-scoped implementation when already correct.
- Require the final checkout request to carry the displayed JPY amount; compare it with the current service source inside the booking transaction and return a dedicated conflict on change.

## Task 6: Complete local verification and Git integration

- Run focused tests, frontend lint/typecheck/build, backend tests/typecheck/build, and relevant schema/OpenAPI checks.
- Review the diff for secrets, mocks, TODOs, unrelated files, and cache security regressions.
- Commit the batch, merge it into local `main`, prove the merge, then remove only this batch worktree/branch and the superseded IM cache worktree/branch after confirming no unique effective changes remain.
- Do not push, deploy, or touch any remote environment.
