# Social Composer Contacts, Media, and Glass Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the formal Social composer load “提醒谁看” from the authenticated user’s real contacts, upload images through a formal audited media route, persist mention notifications, and use the shared chat-style glass header.

**Architecture:** Add a Social-specific authenticated upload vertical slice backed by the existing content-media file store and `MediaAsset`. Extend formal Social post creation so media ownership, active unblocked contacts, the post, and Social notifications are validated or written transactionally. Keep the UI on the existing full Social page, with focused contact and media adapters plus the shared `MobileFullscreenHeader` contract.

**Tech Stack:** React 19, TypeScript strict, Vite, Express, Zod, Prisma/MySQL, Vitest, Jest, Supertest, existing SSE gateway and i18n runtime.

## Global Constraints

- Execute only the approved Step 13 Social composer micro-step.
- Preserve the existing React/TSX/Vite frontend and the single complete formal Social UI.
- Do not add mock, demo, placeholder, fake API, browser business database, TODO, FIXME, or `not implemented` code.
- Do not persist `blob:` media URLs or accept client-selected media owners, paths, notification actors, or contacts.
- “提醒谁看” candidates are current active contacts; exclude deleted, invalid, self, and blocked contacts.
- Support JPEG, PNG, and WebP images up to 8 MiB each. Do not advertise formal video upload in this slice.
- Reuse existing `Contact`, `SocialPost`, `Notification`, `MediaAsset`, and `AuditLog`; do not add or edit a migration.
- Use `social-post:create` for the upload and create-post routes, with Zod/OpenAPI coverage.
- Preserve unrelated dirty-worktree changes and stage only files named in each task.
- Follow TDD for every behavior: write the failing test, run and observe the expected failure, then implement the smallest passing change.
- Browser acceptance must use a real authenticated local API/MySQL/Redis session and `domcontentloaded`, because SSE prevents reliable `networkidle` completion.

---

## File Responsibility Map

- `backend/src/services/social-media.service.ts`: validate upload ownership flow and compensate stored files when persistence fails.
- `backend/src/repositories/social-media.repository.ts`: create the Social `MediaAsset` plus upload audit record.
- `backend/src/controllers/social-media.controller.ts`: parse raw image requests and return the standard envelope.
- `backend/src/routes/social-media.routes.ts`: authentication, `social-post:create`, Zod query validation, 8 MiB raw body parser, and error mapping.
- `backend/src/validators/social-media.validator.ts`: filename query contract.
- `backend/src/repositories/realtime.repository.ts`: atomically validate mention contacts/media ownership, create the post, bind assets, create notifications, and audit.
- `backend/src/services/realtime.service.ts`: publish post and notification SSE only after repository success.
- `src/features/social/formal-contacts.ts`: page through formal contacts and map them into a Social mention-candidate view model.
- `src/features/realtime/api.ts`: raw Social image upload plus create-post `mentionUserIds` request support.
- `src/features/social/pages/SocialComposerPage.tsx`: contact loading, selection, image upload state, retry, publish gating, and formal request data.
- `src/features/social/components/UnifiedComposerUi.tsx`: contact selector states, image status UI, and the shared glass header callsite.
- `src/components/mobile/MobileFullscreenHeader.tsx`: accept the Social composer width without forking the header design.
- `src/i18n/translations.ts`: user-readable upload/contact/publish errors in all supported locales.

---

### Task 1: Formal Social Image Upload Vertical Slice

**Files:**
- Create: `backend/tests/social-media.service.test.ts`
- Create: `backend/tests/social-media-api.test.ts`
- Create: `backend/src/services/social-media.service.ts`
- Create: `backend/src/repositories/social-media.repository.ts`
- Create: `backend/src/controllers/social-media.controller.ts`
- Create: `backend/src/routes/social-media.routes.ts`
- Create: `backend/src/validators/social-media.validator.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Consumes: `ContentMediaStoragePort.save/delete`, `AuthenticatedAccessContext`, `AuthRequestContext`, `social-post:create`.
- Produces: `SocialMediaService.upload(actor, context, input): Promise<SocialMediaProjection>` and `POST /api/v1/social/media?fileName=...`.

- [ ] **Step 1: Write the failing service tests**

Create a test with a real temporary `ContentMediaFileStorage` and a repository spy:

```ts
it("stores a validated Social image and persists its owner and audit context", async () => {
  const repository = { createUpload: jest.fn(async (input) => ({
    publicId: input.checksumSha256,
    mediaAssetId: 91,
    url: `/media/content/${input.fileKey}`,
    mimeType: input.mimeType,
    fileSize: input.fileSize
  })) };
  const service = new SocialMediaService(repository, storage);

  await expect(service.upload({ userId: 41 } as never, requestContext, {
    bytes: pngBytes,
    fileName: "moment.png",
    mimeType: "image/png",
    now
  })).resolves.toMatchObject({ mediaAssetId: 91, mimeType: "image/png" });
  expect(repository.createUpload).toHaveBeenCalledWith(expect.objectContaining({
    ownerUserId: 41,
    entityType: "social_post_upload",
    usageType: "social_post_public"
  }));
});
```

Add a second test where `createUpload` rejects and assert the just-created file is removed.

- [ ] **Step 2: Run the service tests and verify RED**

Run: `npm --prefix backend test -- social-media.service.test.ts`

Expected: FAIL because `SocialMediaService` and `SocialMediaRepositoryPort` do not exist.

- [ ] **Step 3: Implement the service and repository**

Define these exact contracts:

```ts
export interface SocialMediaProjection {
  publicId: string;
  mediaAssetId: number;
  url: string;
  mimeType: ContentMediaMimeType;
  fileSize: number;
}

export interface SocialMediaRepositoryPort {
  createUpload(input: {
    ownerUserId: number;
    entityType: "social_post_upload";
    usageType: "social_post_public";
    fileKey: string;
    mimeType: ContentMediaMimeType;
    fileName: string;
    fileSize: number;
    checksumSha256: string;
    createdAt: Date;
    context: AuthRequestContext;
  }): Promise<SocialMediaProjection>;
}
```

`SocialMediaRepository.createUpload` must create one `MediaAsset` with `url=/media/content/<fileKey>`, `entityId=ownerUserId`, `ownerUserId`, `entityType=social_post_upload`, `usageType=social_post_public`, and one `AuditLog` with action `social.media.uploaded` in one Prisma transaction. The audit metadata contains only asset ID, checksum, MIME, sanitized filename, and byte count.

`SocialMediaService.upload` calls `storage.save`, then `repository.createUpload`; if persistence fails and `stored.created` is true, call `storage.delete(stored.fileKey)` before rethrowing.

- [ ] **Step 4: Run the service tests and verify GREEN**

Run: `npm --prefix backend test -- social-media.service.test.ts`

Expected: PASS with both storage/persistence and compensation cases green.

- [ ] **Step 5: Write the failing HTTP tests**

Use `createApp` with a test auth repository and injected `socialMediaService`:

```ts
const response = await request(app)
  .post("/api/v1/social/media?fileName=moment.png")
  .set("Authorization", `Bearer ${token}`)
  .set("Content-Type", "image/png")
  .send(validPng);

expect(response.status).toBe(201);
expect(response.body.data).toMatchObject({
  publicId: "a".repeat(64),
  url: `/media/content/${"a".repeat(64)}.png`,
  mimeType: "image/png"
});
```

Also assert 401 without auth, 403 without `social-post:create`, 415 for unsupported MIME, 400 for spoofed bytes, and 413 above 8 MiB.

- [ ] **Step 6: Run the HTTP tests and verify RED**

Run: `npm --prefix backend test -- social-media-api.test.ts`

Expected: FAIL with 404 because `/api/v1/social/media` is not registered.

- [ ] **Step 7: Implement controller, validator, route, app dependency injection, and OpenAPI**

Use a strict query schema and raw body route:

```ts
export const socialMediaUploadQuerySchema = z.object({
  fileName: z.string().trim().min(1).max(255)
}).strict();

router.post(
  "/social/media",
  authenticate(),
  createAuthorizeMiddleware("social-post:create"),
  validateRequest({ query: socialMediaUploadQuerySchema }),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  mapSocialMediaRawBodyError,
  controller.upload
);
```

Add `socialMediaRepository`, `socialMediaStorage`, and `socialMediaService` optional seams to `AppDependencies`, register `createSocialMediaRoutes` before realtime routes, and document 201/400/401/403/413/415 responses in OpenAPI.

- [ ] **Step 8: Run the upload vertical-slice tests**

Run: `npm --prefix backend test -- social-media.service.test.ts social-media-api.test.ts`

Expected: PASS with no unhandled parser warnings.

- [ ] **Step 9: Commit Task 1 only**

```bash
git add backend/src/services/social-media.service.ts backend/src/repositories/social-media.repository.ts backend/src/controllers/social-media.controller.ts backend/src/routes/social-media.routes.ts backend/src/validators/social-media.validator.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/social-media.service.test.ts backend/tests/social-media-api.test.ts
git commit -m "feat: add formal social image upload"
```

---

### Task 2: Atomic Media Ownership and Contact Mention Notifications

**Files:**
- Create: `backend/tests/realtime-social-mentions.repository.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/api/openapi.ts`

**Interfaces:**
- Consumes: Social upload `publicId`, current authenticated user ID, request audit context, owner-scoped active contacts.
- Produces: `CreateSocialPostInput.mentionUserIds?: number[]`, request-only asset references, canonical persisted media items, `NotificationType.SOCIAL` mention notifications, and post/notification SSE.

- [ ] **Step 1: Write failing validator/API assertions**

Extend the create-post contract with these exact fields:

```ts
const socialCreateMediaItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  type: z.literal("image"),
  mediaAssetPublicId: z.string().regex(/^[a-f0-9]{64}$/u),
  alt: z.string().trim().max(255).optional()
}).strict();

const socialCreateMediaEnvelopeSchema = z.object({
  items: z.array(socialCreateMediaItemSchema).max(9),
  quotePostId: z.union([z.number().int().positive(), z.string().trim().min(1).max(120)]).optional(),
  replyToPostId: z.union([z.number().int().positive(), z.string().trim().min(1).max(120)]).optional(),
  postType: z.enum(["post", "reply", "quote", "repost", "announcement", "technician-daily"]).optional(),
  locationLabel: z.string().trim().max(160).optional()
}).strict();

mentionUserIds: z.array(z.number().int().positive()).max(50)
  .refine((ids) => new Set(ids).size === ids.length, "error.social.duplicate_mention_contact")
  .default([])
```

Make `socialPostCreateBodySchema` strict and accept only `socialCreateMediaEnvelopeSchema` for new posts. Assert duplicate mention IDs are rejected, video items are rejected, and arbitrary client URLs, counters, namespace, or dataset are not accepted for newly created media.

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm --prefix backend test -- realtime-api.test.ts`

Expected: FAIL because `mentionUserIds` is ignored and media ownership is not checked.

- [ ] **Step 3: Write the failing repository transaction tests**

Cover these cases with a Prisma repository fixture or transaction-capable client double:

```ts
await expect(repository.createSocialPost({
  authorUserId: 41,
  content: "formal post",
  visibility: "public",
  mentionUserIds: [52, 63],
  media: { items: [{ id: "m1", type: "image", mediaAssetPublicId: "a".repeat(64) }] }
})).resolves.toMatchObject({
  post: expect.objectContaining({ id: expect.any(Number) }),
  notifications: [
    expect.objectContaining({ recipientUserId: 52, type: "social" }),
    expect.objectContaining({ recipientUserId: 63, type: "social" })
  ]
});
```

Then assert full rollback for a blocked contact, a contact owned by another user, an inactive/deleted target, or a media checksum not owned by user 41.

- [ ] **Step 4: Run repository tests and verify RED**

Run: `npm --prefix backend test -- realtime-social-mentions.repository.test.ts`

Expected: FAIL because repository creation does not validate contacts/assets or create notifications.

- [ ] **Step 5: Implement one Prisma transaction**

Change the repository result to:

```ts
export interface CreateSocialPostResult {
  post: SocialPostPayload;
  notifications: NotificationPayload[];
}
```

Inside one `$transaction`:

1. Deduplicate `mentionUserIds` and reject more than 50.
2. Query `Contact` with `ownerUserId=authorUserId`, `contactUserId in targets`, `blockedAt=null`, `deletedAt=null`, and active/non-deleted `contactUser`; require an exact set match.
3. Deduplicate the submitted media checksums, reject duplicate media references, and query active `MediaAsset` rows with matching checksums, `ownerUserId=authorUserId`, `entityType=social_post_upload`, `usageType=social_post_public`, `deletedAt=null`, and `purgedAt=null`; require at least one match per checksum and bind only the newest pending row for each checksum.
4. Build the persisted media envelope from repository-owned `url` values only.
5. Create `SocialPost`, update matched assets to `entityType=social_post` and `entityId=post.id`, create one `NotificationType.SOCIAL` row per target with title `动态提醒`, body `提醒你查看一条新动态。`, and payload `{ kind: "post_mention", postId }`, then create `social.post.created` audit evidence with the authenticated actor and `AuthRequestContext`.
6. Return the mapped post and notifications after the transaction succeeds.

Use `error.social.invalid_mention_contact` for a contact mismatch and `error.social.media_not_owned` for an asset mismatch.

Pass `getRequestContext(request)` from `RealtimeController.createSocialPost` through `RealtimeService.createSocialPost` into the repository transaction; the client cannot submit any audit actor or request metadata.

- [ ] **Step 6: Update service SSE behavior and tests**

`RealtimeService.createSocialPost` must publish:

```ts
for (const notification of result.notifications) {
  eventGateway.publish({
    id: createEventId(),
    type: "notification.created",
    recipientUserId: notification.recipientUserId,
    payload: notification,
    createdAt: nowIso
  });
}
```

Continue publishing `social.post.created` to author/followers using `result.post`. Assert no SSE calls occur when the repository transaction rejects.

- [ ] **Step 7: Run all Task 2 tests**

Run: `npm --prefix backend test -- realtime-social-mentions.repository.test.ts realtime-service.test.ts realtime-api.test.ts`

Expected: PASS, including rollback and SSE recipient counts.

- [ ] **Step 8: Commit Task 2 only**

```bash
git add backend/src/validators/realtime.validator.ts backend/src/controllers/realtime.controller.ts backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/src/api/openapi.ts backend/tests/realtime-social-mentions.repository.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts
git commit -m "feat: persist social contact reminders"
```

---

### Task 3: Formal Contact Candidate and Frontend Upload Adapters

**Files:**
- Create: `src/features/social/formal-contacts.ts`
- Create: `src/features/social/formal-contacts.test.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/realtime/api.test.ts`
- Modify: `src/features/social/types.ts`
- Modify: `src/features/social/formal-adapter.ts`
- Modify: `src/features/social/formal-adapter.test.ts`

**Interfaces:**
- Consumes: `realtimeApi.listContacts`, `RealtimeContact`, `POST /social/media`.
- Produces: `SocialMentionCandidate`, `loadFormalSocialMentionCandidates()`, `realtimeApi.uploadSocialMedia(file)`, and a request-only Social media envelope containing public asset IDs.

- [ ] **Step 1: Write failing contact-mapping tests**

Use two pages containing active, blocked, and remark-named contacts:

```ts
expect(await loadFormalSocialMentionCandidates()).toEqual([
  {
    userId: 52,
    needoId: "u0000000052",
    displayName: "小林さん",
    username: "小林 美咲",
    avatarUrl: "/media/customer-avatars/a.png",
    searchText: "小林さん 小林 美咲 u0000000052"
  }
]);
expect(realtimeApi.listContacts).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
expect(realtimeApi.listContacts).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
```

Assert `isBlocked=true` never appears and an empty list returns `[]`.

- [ ] **Step 2: Run contact tests and verify RED**

Run: `npm test -- src/features/social/formal-contacts.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the candidate view model and paginated loader**

Add to `types.ts`:

```ts
export interface SocialMentionCandidate {
  userId: number;
  needoId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  searchText: string;
}
```

The loader fetches page 1 with 100 rows, calculates `Math.ceil(total / 100)`, fetches remaining pages once, flattens in API order, filters blocked contacts, and maps `displayName = nickname?.trim() || contactUser.username`.

- [ ] **Step 4: Write failing raw-upload API tests**

```ts
const file = new File([new Uint8Array([0x89, 0x50])], "moment.png", { type: "image/png" });
await realtimeApi.uploadSocialMedia(file);
expect(requestSpy).toHaveBeenCalledWith("/social/media", expect.objectContaining({
  method: "POST",
  body: file,
  headers: { "Content-Type": "image/png" },
  query: { fileName: "moment.png" }
}));
```

Also assert create-post requests include `mentionUserIds` and media items use `mediaAssetPublicId`, not `blob:` or arbitrary URL.

- [ ] **Step 5: Run API/adapter tests and verify RED**

Run: `npm test -- src/features/realtime/api.test.ts src/features/social/formal-adapter.test.ts`

Expected: FAIL because Social upload and asset-reference serialization do not exist.

- [ ] **Step 6: Implement the frontend contracts**

Add:

```ts
export type RealtimeSocialMediaUpload = {
  publicId: string;
  mediaAssetId: number;
  url: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  fileSize: number;
};
```

Extend `SocialMediaItem` with optional `mediaAssetPublicId`. `uploadSocialMedia` sends raw bytes. Keep `FormalSocialMediaEnvelope` as the persisted/read projection and add a distinct `FormalSocialCreateMediaEnvelope` plus `buildFormalSocialCreateMediaEnvelope`. The create builder rejects any selected item missing `mediaAssetPublicId` and emits only `{ id, type: "image", mediaAssetPublicId, alt }`; it must never return `url`, preview state, or counters. Add `mentionUserIds` to `SocialCreatePostInput`.

- [ ] **Step 7: Run all Task 3 tests**

Run: `npm test -- src/features/social/formal-contacts.test.ts src/features/realtime/api.test.ts src/features/social/formal-adapter.test.ts`

Expected: PASS with no `blob:` in the serialized request body.

- [ ] **Step 8: Commit Task 3 only**

```bash
git add src/features/social/formal-contacts.ts src/features/social/formal-contacts.test.ts src/features/realtime/api.ts src/features/realtime/api.test.ts src/features/social/types.ts src/features/social/formal-adapter.ts src/features/social/formal-adapter.test.ts
git commit -m "feat: add formal social composer adapters"
```

---

### Task 4: Composer Contact List, Image Upload State, Retry, and Publish

**Files:**
- Create: `src/features/social/pages/SocialComposerPage.test.tsx`
- Modify: `src/features/social/pages/SocialComposerPage.tsx`
- Modify: `src/features/social/components/UnifiedComposerUi.tsx`
- Modify: `src/features/social/context.tsx`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: `loadFormalSocialMentionCandidates`, `uploadSocialMedia`, `SocialMentionCandidate`, asset-backed `SocialMediaItem`.
- Produces: real contact selector behavior, ready/uploading/failed image states, retry/remove controls, and create-post `mentionUserIds`.

- [ ] **Step 1: Write the failing composer interaction test**

Render the formal composer with API spies and exercise the actual controls:

```ts
await user.click(screen.getByRole("button", { name: /提醒谁看/u }));
await waitFor(() => expect(screen.getByText("小林さん")).toBeVisible());
expect(screen.queryByText("时间线店铺作者")).toBeNull();
await user.type(screen.getByRole("textbox", { name: "搜索提醒对象" }), "u0000000052");
await user.click(screen.getByRole("button", { name: /小林さん/u }));
await user.click(screen.getByRole("button", { name: "确定并返回" }));
```

Then select two PNG files, assert publish is disabled while uploads are pending, make one upload reject, assert the readable failure plus retry button, resolve retry, publish, and assert create-post receives `mentionUserIds: [52]` and two asset public IDs.

- [ ] **Step 2: Run the composer test and verify RED**

Run: `npm test -- src/features/social/pages/SocialComposerPage.test.tsx`

Expected: FAIL because the page still derives reminders from `profileList` and selected files remain `blob:` media.

- [ ] **Step 3: Implement contact loading and selection**

Add page state:

```ts
const [mentionCandidates, setMentionCandidates] = useState<SocialMentionCandidate[]>([]);
const [mentionStatus, setMentionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
const [mentionUserIds, setMentionUserIds] = useState<number[]>(initialMentionUserIds);
```

Load only when entering the mentions view and status is `idle`; retry explicitly sets `loading` and calls the loader again. Filter locally against `candidate.searchText.toLowerCase()`. Remove the old `profileList` candidate derivation and 18-item slice. Summaries use the candidate display name and selected numeric IDs.

- [ ] **Step 4: Implement upload state and retry**

Keep the selected `File` by media ID for retry. For each supported file:

1. Create a local preview.
2. Mark ID `uploading` and call `uploadSocialMedia(file)`.
3. On success, revoke the preview URL and replace it with the canonical URL plus `mediaAssetPublicId`.
4. On failure, retain the preview and file, mark ID `failed`, show “图片上传失败，请重试”, and offer retry/remove.

Compute:

```ts
const mediaReady = media.every((item) => Boolean(item.mediaAssetPublicId));
const canPublish = hasContent && hasValidMediaSet && mediaReady && uploadingMediaIds.length === 0;
```

Use `accept="image/jpeg,image/png,image/webp"`, remove the unimplemented video branch, and render “最多 9 张图片；单张不超过 8 MiB”。

- [ ] **Step 5: Pass contact IDs into the formal create call**

Update `FormalSocialProvider.createPost`:

```ts
const created = await realtimeApi.createSocialPost({
  content: input.text.trim(),
  media: buildFormalSocialCreateMediaEnvelope({ media: input.media ?? [], ... }),
  mentionUserIds: input.mentionUserIds ?? [],
  visibility: input.visibility === "followers" ? "followers" : "public"
});
```

Do not navigate or clear the draft when upload or post creation fails.

- [ ] **Step 6: Add user-readable multilingual copy**

Add translations for:

- `联系人加载失败，请重试。`
- `当前没有可提醒的联系人。`
- `图片上传失败，请重试。`
- `图片格式无效，请选择 JPEG、PNG 或 WebP。`
- `图片不能超过 8 MiB。`
- `联系人状态已变化，请刷新后重试。`
- `最多 9 张图片；单张不超过 8 MiB。`
- `动态提醒`
- `提醒你查看一条新动态。`

Update `translations.test.ts` so every new source has `zh-Hant`, `ja`, `en`, and `ko` values.

- [ ] **Step 7: Run Task 4 tests**

Run: `npm test -- src/features/social/pages/SocialComposerPage.test.tsx src/i18n/translations.test.ts src/features/social/formal-provider.test.ts`

Expected: PASS; no raw `error.social.media_upload_unavailable` is rendered.

- [ ] **Step 8: Commit Task 4 only**

```bash
git add src/features/social/pages/SocialComposerPage.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedComposerUi.tsx src/features/social/context.tsx src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix: publish Social posts with contacts and images"
```

---

### Task 5: Shared Chat-Style Glass Header

**Files:**
- Modify: `src/components/mobile/MobileFullscreenHeader.tsx`
- Modify: `src/components/mobile/MobileFullscreenHeader.test.tsx`
- Modify: `src/features/social/components/UnifiedComposerUi.tsx`
- Modify: `src/features/social/components/UnifiedSocialUi.test.ts`

**Interfaces:**
- Consumes: `FloatingHomeHeader`, `floatingHeaderGlassPanelClassName`, `needo-composer-glass-header` existing CSS.
- Produces: a `MobileFullscreenHeader.maxWidth` option and shared glass selector headers without page-local solid bars.

- [ ] **Step 1: Write failing source and render tests**

Assert the shared header accepts a width and SelectorLayout uses it:

```ts
expect(fullscreenHeaderSource).toContain('maxWidth?: CSSProperties["maxWidth"]');
expect(fullscreenHeaderSource).toContain("maxWidth={maxWidth}");
expect(composerSource).toContain("<MobileFullscreenHeader");
expect(composerSource).toContain('className="needo-composer-glass-header"');
expect(composerSource).not.toContain("fixed inset-x-0 top-0 z-30 border-b");
expect(composerSource).not.toContain("<FloatingBackButton onClick={onBack}");
```

- [ ] **Step 2: Run header tests and verify RED**

Run: `npm test -- src/components/mobile/MobileFullscreenHeader.test.tsx src/features/social/components/UnifiedSocialUi.test.ts`

Expected: FAIL because SelectorLayout still owns a solid header and external back button.

- [ ] **Step 3: Implement the shared header callsite**

Extend `MobileFullscreenHeader` with:

```ts
maxWidth?: CSSProperties["maxWidth"];
```

and pass `maxWidth={maxWidth ?? "480px"}` to `FloatingHomeHeader`.

Replace SelectorLayout’s fixed bar with:

```tsx
<MobileFullscreenHeader
  className="needo-composer-glass-header"
  info={subtitle}
  maxWidth="720px"
  onBack={onBack}
  title={title}
/>
```

The `info` content must remain reachable through `TitleWithInfo`’s circle `i`. Keep the shared spacer; remove the manual `h-[calc(env(safe-area-inset-top)+5rem)]` block and external `FloatingBackButton`.

- [ ] **Step 4: Run header and composer tests**

Run: `npm test -- src/components/mobile/MobileFullscreenHeader.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/pages/SocialComposerPage.test.tsx`

Expected: PASS; title, info, and back control use one header row.

- [ ] **Step 5: Commit Task 5 only without staging unrelated style changes**

```bash
git add src/components/mobile/MobileFullscreenHeader.tsx src/components/mobile/MobileFullscreenHeader.test.tsx src/features/social/components/UnifiedComposerUi.tsx src/features/social/components/UnifiedSocialUi.test.ts
git commit -m "fix: share glass header in Social selectors"
```

---

### Task 6: Documentation, Full Verification, and Formal Browser Acceptance

**Files:**
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `docs/realtime.md`
- Modify: `README.md`
- Verify: all Task 1-5 files

**Interfaces:**
- Consumes: completed formal media/contact/header slices.
- Produces: current contracts, automated evidence, and observed mobile acceptance evidence.

- [ ] **Step 1: Update formal documentation**

Document:

- `POST /api/v1/social/media` formats, 8 MiB limit, permission, response, storage/audit behavior.
- `POST /api/v1/social/posts` `mentionUserIds`, owner-scoped unblocked-contact validation, transaction behavior, notifications, and SSE.
- The composer’s contact-only candidate source and JPEG/PNG/WebP boundary.
- The shared glass header reuse and explicit exclusion of video upload from this slice.

- [ ] **Step 2: Run focused frontend verification**

Run:

```bash
npm test -- src/features/social/formal-contacts.test.ts src/features/realtime/api.test.ts src/features/social/formal-adapter.test.ts src/features/social/pages/SocialComposerPage.test.tsx src/features/social/formal-provider.test.ts src/features/social/components/UnifiedSocialUi.test.ts src/components/mobile/MobileFullscreenHeader.test.tsx src/i18n/translations.test.ts
```

Expected: all selected files pass, zero failed tests.

- [ ] **Step 3: Run focused backend verification**

Run:

```bash
npm --prefix backend test -- social-media.service.test.ts social-media-api.test.ts realtime-social-mentions.repository.test.ts realtime-service.test.ts realtime-api.test.ts
```

Expected: all selected suites pass, zero failed tests.

- [ ] **Step 4: Run complete static and build gates**

Run:

```bash
npm run lint
npm --prefix backend run lint
npm test
npm --prefix backend test
npm run verify:production-build
npm --prefix backend run build
```

Expected: every command exits 0. If Supertest fails only with sandbox `listen EPERM`, rerun in the approved local environment and report the sandbox distinction explicitly.

- [ ] **Step 5: Start or reuse the formal local runtime**

Verify listeners and readiness before UI debugging:

```bash
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend health is OK, readiness is ready, and the frontend returns HTTP 200. If not ready, recover MySQL/Redis and restart the formal backend before browser acceptance.

- [ ] **Step 6: Perform formal browser acceptance at 440 × 956**

Use an authenticated formal account with known persisted contacts. Navigate with `domcontentloaded` to `/user.html#/moments/compose`, then:

1. Enter “提醒谁看” and capture the candidate names, NeeDoIDs, contact request count, and glass-header classes.
2. Reconcile candidates with `GET /api/v1/im/contacts`; confirm no timeline-only author and no blocked contact appears.
3. Search by remark, username, and NeeDoID; select at least two contacts; use the real back/confirm controls.
4. Upload two real JPEG/PNG/WebP files; verify the publish button is disabled during upload and enabled after both 201 responses.
5. Publish; verify the post create response is 201, reload the timeline, and confirm both image URLs still render.
6. Query the current account’s formal notifications or use the recipient test account to confirm persisted mention notifications.
7. Confirm no horizontal overflow, covered first row, raw `error.*`, console error, failed request, or recovery page.

- [ ] **Step 7: Review the exact diff and working tree**

Run:

```bash
git diff --check
git status --short
git diff --name-only HEAD~5..HEAD
```

Expected: no whitespace errors; only planned files are in the implementation commits; pre-existing unrelated dirty files remain uncommitted and unchanged by this work.

- [ ] **Step 8: Commit documentation only**

```bash
git add README.md docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md docs/realtime.md
git commit -m "docs: record formal Social composer flow"
```

- [ ] **Step 9: Final completion evidence**

Report exact test suite/test counts, build exits, browser viewport, API statuses, persisted post/notification evidence, changed files, commit IDs, and any unverified deployment state. Do not describe local acceptance as pushed, deployed, or live.
