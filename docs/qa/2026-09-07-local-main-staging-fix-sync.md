# Local main synchronization of staging fixes

User scope: synchronize the fixes to **local main**. GitHub uploads continue to target `origin/private`; this integration does not push either branch or redeploy staging.

Baseline: `d91773d2a10b24927906a7a9da3689fc884d6b59` (clean local main). Source: `private` at `35df278fdfbf0a5529ed0c211dd32f46fa2fe033`.

## Included corrections

- Operations settings layout, theme context, selected tab contrast and enabled switches.
- Expanded home search tags outside the clipped glass frame and persistent manual service areas.
- Membership adjustments for existing accounts, latest published card appearance, authoritative benefit capabilities and configurable benefit ordering.
- Shared effective membership filtering for user group counts, members and the user directory.
- Current-account contact card identifiers and the shared composer glass panel.
- PWA keyboard-dismissal/app-restoration framing, including the earlier standalone header safe-area and 16 px iOS composer corrections required by these fixes.
- Audited staging contact-sync tooling and its existing release record. No account/contact import was executed during this integration.

Source correction commits: `e39db074`, `f82d1100`, `9f5222e7`, `d3bac0bc`, `ead8d315`, `02b78a7c`, `6af029f2`, `883b33ea`, `a9098276`, `f9d05a16`, `6611b726`, `bc6db4a0`, `7df95af3`, `35df278f`. Earlier header/keyboard prerequisites were taken from the corresponding changes in `d0b22e0b`, `987542a4`, and `def8160a`, preserving unrelated main functionality.

## Integration verification

- Existing baseline: 3 frontend test files / 24 tests passed.
- Imported earlier PWA/header tests reproduced four failures on local main before their corresponding corrections; after correction these passed.
- Frontend: 30 focused test files / 139 tests, plus two category/search files / 16 tests passed (155 total).
- Backend: seven repository/service/API suites / 40 tests passed, including Supertest contact-card authorization and existing member/group contracts.
- Contact graph planner: four tests passed. No database writes, migrations or fixture imports were run.
- Frontend `npm run lint` and `npm run build`: passed. Vite retained its existing large-chunk advisory.
- Backend `npm --prefix backend run lint` and `npm --prefix backend run build`: passed.
- `git diff --check` and staged whitespace checks: passed.

The source staging release has separate API and browser acceptance recorded in `docs/STAGING_FIXES_20260907.md`. This local integration does not claim a new authenticated browser acceptance. Installed iPhone/iPad PWA keyboard behavior still requires physical-device verification.

The integration is a separate local commit and can be reverted normally without rewriting prior main history. No unrelated worktree changes or existing main features were replaced.
