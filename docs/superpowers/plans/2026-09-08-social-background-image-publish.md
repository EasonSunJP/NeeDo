# Social Background Image Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a new Social post to be submitted immediately while selected images continue uploading before the formal post API runs.

**Architecture:** Keep the existing eager formal media upload, store its result Promise by local media ID, and resolve the frozen submission snapshot in a detached background publish task. Separate content readiness from formal-asset readiness so create and edit flows retain their distinct safety requirements.

**Tech Stack:** React 19, TypeScript strict mode, Vitest, existing Social context and realtime API.

## Global Constraints

- Local-only development and verification; no push, staging deployment, or remote mutation.
- Use existing formal upload and create-post APIs; no mock, placeholder, fallback media, or missing-media post.
- Preserve published-post edit behavior and the existing nine-image/eight-MiB validation.

---

### Task 1: Non-blocking Social image publish

**Files:**
- Modify: `src/features/social/composer-media.ts`
- Modify: `src/features/social/pages/SocialComposerPage.tsx`
- Modify: `src/features/social/pages/SocialComposerPage.test.tsx`
- Create: `src/features/social/composer-media.test.ts`

**Interfaces:**
- Consumes: `realtimeApi.uploadSocialMedia(file)` and the existing `createPost(input)` context action.
- Produces: `isSocialComposerPublishReady({ text, media })`, `areSocialComposerMediaUploadsComplete(media)`, and `resolveSocialComposerMediaUploads(media, uploadTasks)`.

- [x] **Step 1: Write failing readiness and upload-resolution tests**

Add tests proving a local preview image is publishable, formal completion is reported separately, resolved media keeps selection order, and any failed/missing task rejects instead of returning incomplete media.

- [x] **Step 2: Run tests to verify RED**

Run: `npm test -- --run src/features/social/composer-media.test.ts src/features/social/pages/SocialComposerPage.test.tsx`

Expected: FAIL because pending local media is currently rejected and the new completion/resolution exports do not exist.

- [x] **Step 3: Implement minimal media helpers**

Change readiness to require content only, add the strict formal-asset completion predicate, and resolve each pending media item from the upload task keyed by local media ID. Reject with `error.social.media_upload_unavailable` when a task is absent, failed, or resolves without a valid asset ID.

- [x] **Step 4: Run helper tests to verify GREEN**

Run: `npm test -- --run src/features/social/composer-media.test.ts src/features/social/pages/SocialComposerPage.test.tsx`

Expected: both files pass.

- [x] **Step 5: Write failing page wiring assertions**

Assert that new-post publish captures upload tasks, navigates before awaiting the background task, reports background failure through `emitShareFeedback`, hides only uploading indicators for create mode, and keeps edit readiness tied to `areSocialComposerMediaUploadsComplete`.

- [x] **Step 6: Run page test to verify RED**

Run: `npm test -- --run src/features/social/pages/SocialComposerPage.test.tsx`

Expected: FAIL because the page still blocks on upload completion and awaits creation before navigation.

- [x] **Step 7: Wire the detached publish task**

Track upload result Promises by media ID, reuse them during publish, freeze the submission fields, navigate immediately for new posts, clear the draft only after formal creation succeeds, and emit a danger toast on background failure. Keep edit saving on the existing awaited path.

- [x] **Step 8: Run focused tests and refactor while green**

Run: `npm test -- --run src/features/social/composer-media.test.ts src/features/social/pages/SocialComposerPage.test.tsx`

Expected: all focused tests pass with no warnings.

- [x] **Step 9: Run repository verification**

Run: `npm run lint`, `npm test -- --run`, and `npm run build`.

Result: focused Social tests, TypeScript lint, and production build exit 0. The full suite has six stable failures in unrelated current-main admin/schedule/worktree/i18n checks plus two map timeouts that pass 88/88 when isolated. Bundle audit reports the existing i18n chunk 5,463 bytes over budget; no Social chunk budget failure is present.

- [x] **Step 10: Commit the completed microstep**

Stage only the two design/plan documents and Social composer files, inspect the staged diff, then commit with `fix(social): publish while images upload`.
