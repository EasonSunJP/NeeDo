# Task 9 Report: Five-language backoffice announcement and carousel editors

## Scope delivered

- Added one shared `LocalizedCarouselEditor` whose `scene`, read permission, edit permission, and publish permission are fixed by its wrapper.
- Replaced the user-home carousel capability gate with a formal server-backed editor.
- Added the Affiliate TEST-section route containing the fixed `affiliate-home-notice` carousel editor and `AnnouncementEditor`.
- Added separate, independently permissioned Admin menu entries and route guards.
- Extended the existing content-publication i18n module for Simplified Chinese, Traditional Chinese, English, Japanese, and Korean editor copy.

## RED / GREEN evidence

RED was established before implementation with:

```text
npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts
```

Both focused test files failed at module resolution because `LocalizedCarouselEditor.tsx` and `AffiliateNoticeCarouselPage.tsx` did not exist. No implementation was added before this failure was observed.

After the minimum formal implementation, the brief-focused command passed:

```text
npm test -- src/features/content-publication/LocalizedCarouselEditor.test.tsx src/pages/admin/AdminCapabilityRoutes.test.ts src/App.test.tsx
Test Files 3 passed (3)
Tests 38 passed (38)
```

The editor tests cover server draft loading, the exact five language tabs, initial-copy disclosure, independent locale edits, confirmed copy-to-all, raw media upload, paginated typed server target search, reorder, server preview, complete-draft save, publish, schedule, disable and rollback reasons, read-only 403 behavior, 409 reload, and preservation of unsaved input after a failed save. Static route tests verify both fixed-scene wrappers, independent page permissions, menu placement, and absence of a scene query/body selector.

## Implementation and safety review

- All reads and mutations call the Task 8 `contentPublicationApi`; no carousel state is persisted through browser storage or `homeCarouselStore`.
- Save submits the full in-memory draft with `expectedLockVersion`; the scene is supplied only by the wrapper prop and is not accepted from URL, search params, or editable request input.
- Locale fields are edited independently. Copy-to-all requires an explicit browser confirmation before the server mutation.
- Media upload sends the selected raw `File`. Target search is server-backed, typed, paginated, and keeps the selected formal target identifier.
- Read, edit, and publish boundaries are separately enforced with `PermissionGate`. A reader without edit permission receives disabled fields and no mutation controls.
- A 409 response exposes an explicit reload action. Other failed saves retain the reducer's in-memory draft so operator input is not lost.
- Existing `AdminLayout`, card, form, spacing, and color tokens are reused; no font, palette, or parallel visual system was introduced. The information hierarchy leads with fixed scene and publication status, then language, slide content, and lifecycle controls.
- User-visible additions live in the five-language content-publication i18n dictionary. Admin menu labels also resolve through that dictionary while retaining stable Chinese source labels for route capability assertions.

## Verification

- Focused brief and review tests: PASS — 4 files, 54 tests.
- Focused tests plus the Task 8 frontend API contract suite: PASS — 5 files, 62 tests.
- Full frontend suite: PASS — 194 files, 1,089 tests.
- ESLint: PASS.
- i18n quality gate: PASS — zero missing entries for all five languages.
- Production build and production artifact audit: PASS — 8 HTML entries and 22 built assets audited.
- `git diff --check`: PASS.

## Review follow-up

An independent Task 9 review identified lifecycle and draft-continuation gaps. The follow-up began with contract-level RED coverage: 11 failures and 38 passes across the focused editor/route suite. The failures represented published-only and empty-scene bootstrap, historical cloning, draft-only announcement editing, dirty-operation guards, provenance-safe saves, slide structure controls, active-slot disable, historical rollback, media RBAC, announcement conflict reload, and post-mutation reconciliation.

The follow-up implementation now:

- creates a first carousel draft only after a real media upload, a real server-searched target, and a complete source-locale translation are present;
- uses the formal rollback endpoint to clone an explicitly selected published or historical release into a new same-scene/same-announcement draft;
- reloads the authoritative carousel scene and history, or announcement list and history, after lifecycle mutations;
- edits only `draft` announcement releases and exposes immutable published/scheduled releases for preview, disable, or historical cloning;
- saves dirty text before copy, preview, publish, and schedule, and aborts the requested operation when that save fails;
- saves translation-only carousel edits through `updateCarouselSlideLocale`, so untouched locale provenance is not rewritten by the structural replacement endpoint;
- strips server-owned provenance fields from strict structural request bodies and blocks structural replacement while any locale still carries initial-copy/non-self provenance, because the existing Task 8 replacement contract cannot persist those metadata fields; once every locale has been explicitly reviewed, known provenance is reconciled from the server response;
- adds slide add/delete/enable controls and selects the actual published/scheduled release for disable plus an explicit historical source for rollback;
- gates raw media inputs with `button:backoffice-content-media-upload`; and
- gives announcement 409 conflicts the same explicit server-reload action while preserving in-memory input until that action is chosen.

Dedicated `AnnouncementEditor.test.tsx` coverage was added. The expanded brief-focused suite covers multi-locale sequential locks and the structural provenance guard in addition to the original review cases. Final verification passed at 4 files / 54 tests focused, 5 files / 62 tests with the Task 8 frontend API contract, and 194 files / 1,089 tests across the full frontend suite.

## Second review follow-up

The second review exposed two formal-contract gaps. TDD RED was recorded before implementation: the frontend contract/editor run had 4 failures and 29 passes, while the backend focused run had 3 executable failures and 39 passes plus 2 suites that could not compile because the new repository/service contracts did not yet exist.

The announcement editor now uses a formal, protected, paginated AffiliateTask search endpoint (`GET /api/v1/backoffice/affiliate/announcements/affiliate-tasks`) and persists `affiliateTaskId`, `visibleFrom`, and `visibleUntil` through the existing announcement mutation route with `operation: update_metadata`. The implementation follows Route → Controller → Service → Repository, validates query/body input with Zod, documents the endpoint and mutation in OpenAPI, enforces announcement read/edit RBAC, uses optimistic locking, and writes a `content.affiliate_announcement.metadata_updated` audit event. Task association is canonical on `OfficialAnnouncement`; visibility windows remain release metadata. Historical/published clones therefore inherit the canonical task and source release window and can then be explicitly changed on the new draft.

The first follow-up's conservative non-self-provenance block is superseded. The formal carousel replacement contract now requires `sourceLocale` and `isInitialCopy` for every translation, validates them server-side, and persists them. Structural save is blocked only while `isInitialCopy === true`; an explicitly confirmed copy-to-all has `isInitialCopy === false` and retains its non-self `sourceLocale` through upload, reorder, and replace. A dedicated contract test covers copy-to-all → raw upload → reorder → save and asserts all five provenance records, while the initial-copy blocked test remains.

Fresh post-format focused verification passed at 4 frontend files / 54 tests and 6 backend suites / 104 tests. The complete verification run passed at 194 frontend files / 1,092 tests and 225 backend suites / 1,526 tests (with the repository's existing skips), plus frontend TypeScript lint, backend ESLint, five-language i18n quality, backend build, production frontend build/audit, targeted Prettier checks, and `git diff --check`.

## Concerns / deferred acceptance

- Browser interaction and visual acceptance are intentionally deferred to Task 12, as required by the plan.
- The broader repository i18n audit still reports its pre-existing untranslated-string backlog; the Task 9 five-language quality gate is clean.
- The production build retains pre-existing warnings for the SocialProfile mixed static/dynamic import and large chunks; neither warning originates in Task 9.
- The root package does not install Prettier, so the existing backend Prettier dependency was used to format and check the exact Task 9 frontend and backend file list without adding tooling.
- The worktree contains unrelated concurrent changes, including existing `App.tsx` and `App.test.tsx` changes. This follow-up does not stage either App file or any unrelated change.
