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

- Focused brief tests: PASS — 3 files, 38 tests.
- Full frontend suite: PASS — 193 files, 1,073 tests.
- ESLint: PASS.
- i18n quality gate: PASS — zero missing entries for all five languages.
- Production build and production artifact audit: PASS — 8 HTML entries and 22 built assets audited.
- `git diff --check`: PASS.

## Concerns / deferred acceptance

- Browser interaction and visual acceptance are intentionally deferred to Task 12, as required by the plan.
- The broader repository i18n audit still reports its pre-existing untranslated-string backlog; the Task 9 five-language quality gate is clean.
- The production build retains pre-existing warnings for the SocialProfile mixed static/dynamic import and large chunks; neither warning originates in Task 9.
- The worktree contains unrelated concurrent changes, including existing `App.tsx` and `App.test.tsx` changes. Only the Task 9 import/route hunks from `App.tsx` are staged; `App.test.tsx` and all unrelated changes remain unstaged.
