# Social Single Reply System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Social reply entry with one post-detail quick-reply system, delete the obsolete full-page reply UI, persist formal reply counts and judgement stickers, and give the shared plus panel working image, camera, and location actions.

**Architecture:** Add an indexed self-relation to `SocialPost` so reply totals are derived from active database rows, while keeping the JSON envelope readable during migration. Carry validated versioned rich-text parts beside the text fallback, then reuse the existing IM judgement serializer and SVG assets in Social. Route every reply action to the canonical detail page, keep focus state transient, and let `SocialQuickReplyComposer` provide Social-safe actions through the existing `ImChatComposerAction` contract.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Vitest/jsdom, Node.js 22, Express, Zod, Prisma 7, MySQL 8, Jest/Supertest, Tailwind CSS, existing NeeDo i18n and theme tokens.

## Global Constraints

- Work in an isolated `codex/` worktree at execution time; do not edit unrelated dirty files.
- Keep React/TSX/Vite and the existing shared Social and IM modules; do not add a second reply store or composer implementation.
- Delete the obsolete full-page reply UI and every entry point that can render it. Historical deep links may redirect only; they must not mount `SocialComposerPage` in reply mode.
- The only reply destination is `.../moments/posts/:postId`, with the header copy `回复动态`.
- The Social plus panel exposes exactly `相册`, `拍照`, and `位置`; chat-only file, card, service, schedule, and group actions remain absent.
- Formal writes use `/api/v1`, Prisma, Zod, RBAC, audit, and existing media upload contracts. Do not add mock, demo, placeholder, fake API, polling, or browser business persistence.
- Reply counts include active rows only (`deletedAt IS NULL`) and must be returned without one query per post.
- Judgement values are exactly `OK`, `NO`, `Pending`, `+1`, `Done`, `Cool`, `Good`, and `Thanks`. Plain text that happens to match one value stays text unless valid structured metadata says it is a sticker.
- User-visible copy must exist in Simplified Chinese, Traditional Chinese, Japanese, English, and Korean through the existing i18n bundle.
- Verify real authenticated user, merchant, and technician routes in the browser at 440-by-956 and 320-pixel widths. Tests/build do not replace browser acceptance.
- Do not push, deploy, or publish externally as part of this plan.

---

## Planned File Structure

### New files

- `backend/prisma/migrations/20260831000000_social_reply_relation/migration.sql` — additive reply self-relation and legacy JSON backfill.
- `backend/scripts/check-social-reply-relations.ts` — guarded preflight/postflight database reconciliation.
- `backend/tests/social-reply-relation-migration.test.ts` — migration and checker contract.
- `backend/tests/realtime-social-replies.repository.test.ts` — parent validation, persisted relation, and active count behavior.
- `src/features/social/route-pages.test.tsx` — legacy deep-link redirect without loading the obsolete composer.
- `src/features/social/composer-location.ts` — shared pure location-option builder for full composer and quick reply.
- `src/features/social/composer-location.test.ts` — deterministic location option coverage.

### Existing files with focused changes

- `backend/prisma/schema.prisma` — `SocialPost.replyToPostId`, self-relation, and reply index.
- `backend/package.json` — checker command.
- `backend/src/repositories/realtime.repository.ts` — relation writes, batched active reply counts, response fields, and rich-text persistence.
- `backend/src/validators/realtime.validator.ts` — strict Social rich-text schema and fallback equality check.
- `backend/src/api/openapi.ts` — response count/relation and request rich-text contract.
- `backend/tests/realtime-api.test.ts`, `backend/tests/openapi.test.ts`, `backend/tests/realtime-social-mentions.repository.test.ts`, `backend/tests/realtime-social-update.repository.test.ts` — formal request/response regressions and fixture counts.
- `src/features/realtime/api.ts` — formal Social relation/count/rich-text wire types.
- `src/features/im/reaction-policy.ts`, `src/features/im/reaction-policy.test.ts` — reusable validated rich-text normalization.
- `src/features/social/types.ts` — `SocialRichText`, formal reply count, and quick-reply payload types.
- `src/features/social/formal-adapter.ts`, `src/features/social/formal-adapter.test.ts` — top-level count/relation mapping and structured content round-trip.
- `src/features/social/context.tsx`, `src/features/social/formal-provider.test.ts` — submit structured content/attachments and update the mounted parent after success.
- `src/features/social/components/UnifiedSocialUi.tsx`, `src/features/social/components/UnifiedSocialUi.test.ts` — judgement-aware Social text and canonical timeline reply navigation.
- `src/features/social/components/SocialQuickReplyComposer.tsx`, `src/features/social/components/SocialQuickReplyComposer.test.tsx` — focus contract, three plus actions, upload/location state, and structured submit.
- `src/features/social/pages/SocialPostDetailPage.tsx`, `src/features/social/pages/SocialPostDetailPage.test.ts` — one header, local focus actions, independent cards, authoritative count.
- `src/features/social/pages/SocialComposerPage.tsx`, `src/features/social/pages/SocialComposerPage.test.tsx` — remove reply mode while preserving post/edit/quote.
- `src/features/social/pages/SocialDraftsPage.tsx` — remove resumable legacy reply drafts.
- `src/features/social/paths.ts`, `src/features/social/paths.test.ts`, `src/features/social/route-pages.tsx` — typed compose params and redirect-only legacy reply routes.
- `src/App.tsx`, `src/App.test.tsx` — route all three `/replies` paths through the redirect component.
- `src/i18n/translations.ts`, `src/i18n/translations.test.ts` — five-language reply and attachment copy.
- `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`, `README.md` — completed Step 13 slice and verification commands.

---

### Task 1: Add the Formal Social Reply Relation and Guarded Migration Check

**Files:**
- Create: `backend/prisma/migrations/20260831000000_social_reply_relation/migration.sql`
- Create: `backend/scripts/check-social-reply-relations.ts`
- Create: `backend/tests/social-reply-relation-migration.test.ts`
- Modify: `backend/prisma/schema.prisma:2044-2068`
- Modify: `backend/package.json:8-70`

**Interfaces:**
- Consumes: legacy `social_posts.media.replyToPostId` JSON values.
- Produces: `SocialPost.replyToPostId: number | null`, Prisma relations `replyToPost` and `replies`, index `social_posts_reply_parent_active_idx`, and command `check:social-reply-relations -- --phase=preflight|postflight`.

- [ ] **Step 1: Write the failing migration contract test**

Create a test that reads the migration, schema, checker, and package scripts:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "@jest/globals";

const backendRoot = process.cwd();
const migration = readFileSync(resolve(
  backendRoot,
  "prisma/migrations/20260831000000_social_reply_relation/migration.sql"
), "utf8");
const schema = readFileSync(resolve(backendRoot, "prisma/schema.prisma"), "utf8");
const checker = readFileSync(resolve(backendRoot, "scripts/check-social-reply-relations.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8"));

describe("Social reply relation migration", () => {
  it("adds, backfills, indexes, and constrains the reply parent", () => {
    expect(migration).toContain("ADD COLUMN `reply_to_post_id` INTEGER NULL");
    expect(migration).toContain("JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')");
    expect(migration).toContain("social_posts_reply_parent_active_idx");
    expect(migration).toContain("social_posts_reply_to_post_id_fkey");
    expect(schema).toContain("replyToPostId Int?");
    expect(schema).toContain('@relation("SocialPostReplies"');
  });

  it("ships a local-only preflight and postflight checker", () => {
    expect(packageJson.scripts["check:social-reply-relations"]).toContain("check-social-reply-relations.ts");
    expect(checker).toContain('phase === "preflight"');
    expect(checker).toContain('phase === "postflight"');
    expect(checker).toContain("social-reply-relation-preflight.json");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm --prefix backend test -- social-reply-relation-migration.test.ts
```

Expected: FAIL because the migration and checker files do not exist.

- [ ] **Step 3: Add the Prisma self-relation**

Add these fields and index to `SocialPost`:

```prisma
  replyToPostId Int? @map("reply_to_post_id")

  replyToPost SocialPost?  @relation("SocialPostReplies", fields: [replyToPostId], references: [id], onDelete: SetNull)
  replies     SocialPost[] @relation("SocialPostReplies")

  @@index([replyToPostId, deletedAt, createdAt], map: "social_posts_reply_parent_active_idx")
```

- [ ] **Step 4: Add the additive migration**

Create the SQL with a guarded legacy backfill:

```sql
ALTER TABLE `social_posts`
  ADD COLUMN `reply_to_post_id` INTEGER NULL;

UPDATE `social_posts` AS `reply`
INNER JOIN `social_posts` AS `parent`
  ON `parent`.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')) AS UNSIGNED)
SET `reply`.`reply_to_post_id` = `parent`.`id`
WHERE JSON_EXTRACT(`reply`.`media`, '$.replyToPostId') IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')) REGEXP '^[1-9][0-9]*$';

CREATE INDEX `social_posts_reply_parent_active_idx`
  ON `social_posts`(`reply_to_post_id`, `deleted_at`, `created_at`);

ALTER TABLE `social_posts`
  ADD CONSTRAINT `social_posts_reply_to_post_id_fkey`
  FOREIGN KEY (`reply_to_post_id`) REFERENCES `social_posts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Implement the guarded checker and package command**

The checker must load `ENV_FILE`, reject production/staging flags, reject non-loopback database hosts, and reject production-like database names. Preflight writes only this ignored snapshot:

```ts
type ReplySnapshot = {
  databaseName: string;
  totalPosts: number;
  validLegacyReplies: number;
};

const snapshotPath = resolve(process.cwd(), ".data/social-reply-relation-preflight.json");
```

Use fixed tagged queries for these values:

```ts
const [totalRow] = await prisma.$queryRaw<Array<{ totalPosts: bigint }>>`
  SELECT COUNT(*) AS totalPosts FROM social_posts
`;
const [legacyRow] = await prisma.$queryRaw<Array<{ validLegacyReplies: bigint }>>`
  SELECT COUNT(*) AS validLegacyReplies
  FROM social_posts AS reply
  INNER JOIN social_posts AS parent
    ON parent.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(reply.media, '$.replyToPostId')) AS UNSIGNED)
  WHERE JSON_EXTRACT(reply.media, '$.replyToPostId') IS NOT NULL
    AND JSON_UNQUOTE(JSON_EXTRACT(reply.media, '$.replyToPostId')) REGEXP '^[1-9][0-9]*$'
`;
```

Postflight must read the snapshot and assert the same total post count, exact backfill count, zero orphaned non-null relations, and the index/foreign key in `information_schema`. Add this package command:

```json
"check:social-reply-relations": "ENV_FILE=.env.dev tsx scripts/check-social-reply-relations.ts"
```

- [ ] **Step 6: Generate Prisma Client and verify GREEN**

Run:

```bash
npm --prefix backend run prisma:generate
ENV_FILE=.env.dev npm --prefix backend exec -- prisma validate
npm --prefix backend test -- social-reply-relation-migration.test.ts
```

Expected: Prisma generation succeeds, schema validation succeeds, and the migration test passes.

- [ ] **Step 7: Commit the relation foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260831000000_social_reply_relation/migration.sql backend/scripts/check-social-reply-relations.ts backend/tests/social-reply-relation-migration.test.ts backend/package.json
git commit -m "feat(social): add formal reply relation"
```

---

### Task 2: Return Server-Authoritative Reply Counts

**Files:**
- Create: `backend/tests/realtime-social-replies.repository.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts:236-252, 661-730, 2840-3030, 3240-3335, 4421-4465`
- Modify: `backend/src/api/openapi.ts:90-165, 14180-14260`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/tests/realtime-social-mentions.repository.test.ts`
- Modify: `backend/tests/realtime-social-update.repository.test.ts`

**Interfaces:**
- Consumes: `SocialPost.replyToPostId` from Task 1 and `CreateSocialPostMediaEnvelope.replyToPostId`.
- Produces: `SocialPostPayload.replyToPostId: number | null` and `SocialPostPayload.replyCount: number` on create, list, detail, and SSE payloads.

- [ ] **Step 1: Write failing repository tests**

Cover a valid parent, missing parent, active child count, and soft-deleted exclusion. The successful fixture must assert this create input:

```ts
const result = await repository.createSocialPost({
  authorUserId: 41,
  authorIdentityId: 71,
  content: "reply",
  visibility: "public",
  mentionUserIds: [],
  context: { ip: "127.0.0.1", userAgent: "social-reply-test" },
  media: { items: [], postType: "reply", replyToPostId: 700 }
});

expect(transaction.socialPost.findFirst).toHaveBeenCalledWith({
  where: { id: 700, deletedAt: null },
  select: { id: true }
});
expect(transaction.socialPost.create).toHaveBeenCalledWith(
  expect.objectContaining({ data: expect.objectContaining({ replyToPostId: 700 }) })
);
expect(result.post).toMatchObject({ replyToPostId: 700, replyCount: 0 });
```

The missing-parent case must reject with `error.social.reply_target_not_found` before `socialPost.create`.

- [ ] **Step 2: Run the repository test and verify RED**

```bash
npm --prefix backend test -- realtime-social-replies.repository.test.ts
```

Expected: FAIL because the repository does not validate or persist the formal parent and the payload has no count fields.

- [ ] **Step 3: Add count fields and one-query includes**

Extend the payload and include:

```ts
export interface SocialPostPayload {
  id: number;
  authorUserId: number;
  authorIdentityId: number;
  content: string;
  media: unknown;
  replyToPostId: number | null;
  replyCount: number;
  visibility: SocialPostVisibilityPayload;
  createdAt: Date;
  updatedAt: Date;
  author: SocialPostAuthorPayload;
  viewerFollowsAuthor: boolean;
  authorFollowsViewer: boolean;
  viewerIsFriend: boolean;
}

const socialPostInclude = {
  author: { select: socialAuthorSelect },
  authorIdentity: { select: { id: true, type: true, displayName: true } },
  _count: { select: { replies: { where: { deletedAt: null } } } }
} satisfies Prisma.SocialPostInclude;
```

Map the relation and count directly:

```ts
replyToPostId: socialPost.replyToPostId,
replyCount: socialPost._count.replies,
```

Because `_count` is included with each list/detail query, this adds no per-post query.

- [ ] **Step 4: Validate and persist the parent in the create transaction**

Before media binding, add:

```ts
const replyToPostId = input.media?.replyToPostId;
if (replyToPostId !== undefined) {
  const replyTarget = await transaction.socialPost.findFirst({
    where: { id: replyToPostId, deletedAt: null },
    select: { id: true }
  });
  if (!replyTarget) {
    throw this.socialPostConflict("error.social.reply_target_not_found");
  }
}
```

Add `replyToPostId: replyToPostId ?? null` to `transaction.socialPost.create`. On update, reject an input whose `media.replyToPostId` differs from `existingPost.replyToPostId`; do not allow an edit to create or move a reply relation.

- [ ] **Step 5: Update OpenAPI and fixtures**

Add response properties:

```ts
replyToPostId: { type: "integer", nullable: true, minimum: 1 },
replyCount: { type: "integer", minimum: 0 }
```

Update repository fixtures that pass through `mapSocialPost` with:

```ts
replyToPostId: null,
_count: { replies: 0 }
```

Add an API assertion that a created reply returns `replyToPostId` and that a subsequent parent detail returns the incremented `replyCount`.

- [ ] **Step 6: Run targeted backend tests**

```bash
npm --prefix backend test -- realtime-social-replies.repository.test.ts realtime-social-mentions.repository.test.ts realtime-social-update.repository.test.ts realtime-api.test.ts openapi.test.ts
```

Expected: all selected suites pass with no extra count query assertion failures.

- [ ] **Step 7: Commit the authoritative count contract**

```bash
git add backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/tests/realtime-social-replies.repository.test.ts backend/tests/realtime-social-mentions.repository.test.ts backend/tests/realtime-social-update.repository.test.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts
git commit -m "feat(social): return authoritative reply counts"
```

---

### Task 3: Validate and Persist Social Judgement Rich Text

**Files:**
- Modify: `backend/src/validators/realtime.validator.ts:170-220`
- Modify: `backend/src/repositories/realtime.repository.ts:430-465, 2880-2965, 3110-3165`
- Modify: `backend/src/api/openapi.ts:90-165, 14180-14260`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `backend/tests/realtime-social-mentions.repository.test.ts`
- Modify: `backend/tests/realtime-social-update.repository.test.ts`

**Interfaces:**
- Consumes: `MESSAGE_JUDGEMENT_REACTIONS` from `backend/src/constants/message-reaction.constants.ts`.
- Produces: optional `media.richText` with version 1 and validated text/judgement parts; persisted `content` remains the searchable fallback.

- [ ] **Step 1: Write failing API validation tests**

Add cases for a valid mixed payload, unknown judgement value, and content mismatch:

```ts
const richText = {
  version: 1 as const,
  parts: [
    { type: "text" as const, value: "确认" },
    { type: "judgement" as const, value: "Pending" }
  ]
};

expect(
  socialPostCreateBodySchema.parse({
    content: "确认Pending",
    media: { items: [], postType: "reply", replyToPostId: 700, richText }
  }).media?.richText
).toEqual(richText);

expect(() => socialPostCreateBodySchema.parse({
  content: "Later",
  media: {
    items: [],
    richText: { version: 1, parts: [{ type: "judgement", value: "Later" }] }
  }
})).toThrow();

expect(() => socialPostCreateBodySchema.parse({
  content: "Pending!",
  media: { items: [], richText }
})).toThrow();
```

- [ ] **Step 2: Run the API test and verify RED**

```bash
npm --prefix backend test -- realtime-api.test.ts openapi.test.ts
```

Expected: FAIL because strict media validation rejects `richText` and OpenAPI does not document it.

- [ ] **Step 3: Add the strict Zod schema**

Import `MESSAGE_JUDGEMENT_REACTIONS` and add:

```ts
const socialRichTextPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string().min(1).max(5000) }).strict(),
  z.object({
    type: z.literal("judgement"),
    value: z.enum(MESSAGE_JUDGEMENT_REACTIONS)
  }).strict()
]);

const socialRichTextSchema = z.object({
  version: z.literal(1),
  parts: z.array(socialRichTextPartSchema).min(1).max(100)
}).strict();
```

Add `richText: socialRichTextSchema.optional()` to `socialCreateMediaEnvelopeSchema`. Extend the body `superRefine` so `parts.map(part => part.value).join("") === content`; report `error.social.rich_text_mismatch` at `media.richText` when it differs.

- [ ] **Step 4: Persist rich text in create and update envelopes**

Extend `CreateSocialPostMediaEnvelope` with:

```ts
richText?: {
  version: 1;
  parts: Array<
    | { type: "text"; value: string }
    | { type: "judgement"; value: (typeof MESSAGE_JUDGEMENT_REACTIONS)[number] }
  >;
};
```

Copy it into both create and update media envelopes:

```ts
...(input.media.richText !== undefined ? { richText: input.media.richText } : {}),
```

- [ ] **Step 5: Document the request schema and assert persistence**

Add the OpenAPI discriminated part schema, `version: { type: "integer", enum: [1] }`, and the eight-value judgement enum. Update repository tests to expect the exact `richText` object beside `items`, `postType`, `locationLabel`, `mentionUserIds`, and counters.

- [ ] **Step 6: Run targeted backend tests**

```bash
npm --prefix backend test -- realtime-api.test.ts openapi.test.ts realtime-social-mentions.repository.test.ts realtime-social-update.repository.test.ts
```

Expected: all selected suites pass; invalid structured values are rejected before repository calls.

- [ ] **Step 7: Commit the rich-text backend contract**

```bash
git add backend/src/validators/realtime.validator.ts backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts backend/tests/openapi.test.ts backend/tests/realtime-social-mentions.repository.test.ts backend/tests/realtime-social-update.repository.test.ts
git commit -m "feat(social): persist judgement rich text"
```

---

### Task 4: Map Reply Counts and Structured Content into the Social Provider

**Files:**
- Modify: `src/features/realtime/api.ts:166-255`
- Modify: `src/features/im/reaction-policy.ts:30-180`
- Modify: `src/features/im/reaction-policy.test.ts`
- Modify: `src/features/social/types.ts:70-215`
- Modify: `src/features/social/formal-adapter.ts:1-275`
- Modify: `src/features/social/formal-adapter.test.ts`
- Modify: `src/features/social/context.tsx:300-380`
- Modify: `src/features/social/formal-provider.test.ts`

**Interfaces:**
- Consumes: backend `replyToPostId`, `replyCount`, and `media.richText` from Tasks 2 and 3.
- Produces: `SocialPost.richText`, adapter normalization, structured create payloads, and a parent count update after successful reply creation.

- [ ] **Step 1: Write failing adapter and provider tests**

Add a formal post fixture with top-level count/relation and a mixed rich-text envelope:

```ts
const mapped = mapFormalSocialPost({
  id: 701,
  authorUserId: 41,
  content: "确认Pending",
  createdAt: "2026-08-30T03:00:00.000Z",
  media: {
    items: [],
    richText: {
      version: 1,
      parts: [
        { type: "text", value: "确认" },
        { type: "judgement", value: "Pending" }
      ]
    }
  },
  replyToPostId: 700,
  replyCount: 2,
  visibility: "public"
});

expect(mapped).toMatchObject({
  replyToPostId: "700",
  replyCount: 2,
  richText: {
    version: 1,
    parts: [
      { type: "text", value: "确认" },
      { type: "judgement", value: "Pending" }
    ]
  }
});
```

Assert malformed metadata becomes `richText: undefined`, and `buildFormalSocialCreateMediaEnvelope` preserves valid structured parts.

- [ ] **Step 2: Run frontend adapter tests and verify RED**

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/social/formal-adapter.test.ts src/features/social/formal-provider.test.ts
```

Expected: FAIL because the wire and Social types do not carry the new fields.

- [ ] **Step 3: Add reusable rich-text normalization**

Export a normalizer from `reaction-policy.ts`:

```ts
export function normalizeImMessageRichText(
  content: string,
  richText: unknown
): ImMessageRichText | undefined {
  const parts = resolveImMessageRichText(content, richText);
  const hasJudgement = parts.some((part) => part.type === "judgement");
  if (!hasJudgement || parts.map((part) => part.value).join("") !== content) {
    return undefined;
  }
  return { version: 1, parts };
}
```

Keep `resolveImMessageRichText` fallback behavior unchanged for existing IM callers.

- [ ] **Step 4: Extend formal and Social types**

Add to `RealtimeSocialPost`:

```ts
replyToPostId: number | null;
replyCount: number;
```

Add `richText?: ImMessageRichText` to `RealtimeSocialCreateMediaEnvelope` and define:

```ts
export type SocialRichText = ImMessageRichText;
```

Add `richText?: SocialRichText` to `SocialPost` and `SocialCreatePostInput`.

- [ ] **Step 5: Map and submit the new fields**

In `mapFormalSocialPost`, prefer top-level relation/count and normalize metadata:

```ts
replyToPostId: post.replyToPostId === null ? undefined : String(post.replyToPostId),
replyCount: post.replyCount,
richText: normalizeImMessageRichText(post.content, envelope.richText),
```

Add `richText` to both formal envelope builders and to `context.tsx` create/update calls. After a successful reply POST, update the mounted parent only after success:

```ts
posts: sortPostsByNewest([
  mapped,
  ...current.posts
    .filter((post) => post.id !== mapped.id)
    .map((post) => post.id === mapped.replyToPostId
      ? { ...post, replyCount: post.replyCount + 1 }
      : post)
])
```

- [ ] **Step 6: Run targeted frontend tests**

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/social/formal-adapter.test.ts src/features/social/formal-provider.test.ts
```

Expected: all selected suites pass, including malformed fallback and post-success parent count update.

- [ ] **Step 7: Commit the frontend formal mapping**

```bash
git add src/features/realtime/api.ts src/features/im/reaction-policy.ts src/features/im/reaction-policy.test.ts src/features/social/types.ts src/features/social/formal-adapter.ts src/features/social/formal-adapter.test.ts src/features/social/context.tsx src/features/social/formal-provider.test.ts
git commit -m "feat(social): map reply counts and rich text"
```

---

### Task 5: Render Judgement Stickers on Every Social Surface

**Files:**
- Modify: `src/features/social/components/UnifiedSocialUi.tsx:790-1050, 1180-1235, 1550-1590`
- Modify: `src/features/social/components/UnifiedSocialUi.test.ts`
- Modify: `src/features/social/pages/SocialPostDetailPage.tsx:250-460, 530-650`

**Interfaces:**
- Consumes: `SocialPost.richText` from Task 4 and `ImReactionValue` from `src/features/im/JudgementReactionIcon.tsx`.
- Produces: one judgement-aware `UnifiedPostText` used by timeline, detail, reply cards, mini cards, and quoted content.

- [ ] **Step 1: Write failing renderer tests**

Render `UnifiedPostText` with structured and unstructured values:

```tsx
root.render(
  <MemoryRouter>
    <UnifiedPostText
      expanded
      profiles={{}}
      richText={{ version: 1, parts: [{ type: "judgement", value: "Pending" }] }}
      scope="user"
      text="Pending"
    />
  </MemoryRouter>
);
expect(container.querySelector('[data-social-judgement="Pending"] img')).not.toBeNull();
expect(container.textContent).not.toContain("PendingPending");
```

Then render plain `text="Pending"` without `richText` and assert no judgement image.

- [ ] **Step 2: Run the renderer test and verify RED**

```bash
npm test -- src/features/social/components/UnifiedSocialUi.test.ts
```

Expected: FAIL because `UnifiedPostText` has no `richText` prop.

- [ ] **Step 3: Refactor text parts without losing linkification**

Keep the existing mention, hashtag, and URL tokenization for each text part. Resolve structured parts once in `UnifiedPostText`, and render judgement parts with:

```tsx
<span
  className="mx-0.5 inline-flex align-[-0.3em]"
  data-social-judgement={part.value}
  key={`judgement-${part.value}-${index}`}
>
  <ImReactionValue judgementDisplay="summary" value={part.value} />
</span>
```

For collapsed content, slice resolved parts by Unicode character count and append a final text part containing `...`; never convert a structured judgement part into text merely because the post is collapsed.

- [ ] **Step 4: Pass structured content at every post call site**

Update each call whose source object is a `SocialPost`:

```tsx
<UnifiedPostText
  className={className}
  expanded={expanded}
  profiles={profiles}
  richText={post.richText}
  scope={scope}
  text={post.text}
/>
```

Apply the same prop in `SocialPostDetailPage` for the main post, `ReplyListItem`, `DetailMiniPostCard`, and quoted posts.

- [ ] **Step 5: Run renderer and detail tests**

```bash
npm test -- src/features/social/components/UnifiedSocialUi.test.ts src/features/social/pages/SocialPostDetailPage.test.ts
```

Expected: structured judgement values render SVGs, plain words remain text, and current mention/tag/link tests still pass.

- [ ] **Step 6: Commit the Social sticker renderer**

```bash
git add src/features/social/components/UnifiedSocialUi.tsx src/features/social/components/UnifiedSocialUi.test.ts src/features/social/pages/SocialPostDetailPage.tsx src/features/social/pages/SocialPostDetailPage.test.ts
git commit -m "fix(social): preserve judgement stickers"
```

---

### Task 6: Delete the Obsolete Reply Page and Canonicalize Every Reply Route

**Files:**
- Create: `src/features/social/route-pages.test.tsx`
- Modify: `src/features/social/paths.ts:1-70`
- Modify: `src/features/social/paths.test.ts`
- Modify: `src/features/social/route-pages.tsx:1-35`
- Modify: `src/features/social/pages/SocialComposerPage.tsx:45-280, 480-535`
- Modify: `src/features/social/pages/SocialComposerPage.test.tsx`
- Modify: `src/features/social/pages/SocialDraftsPage.tsx:30-65`
- Modify: `src/features/social/components/UnifiedSocialUi.tsx:1390-1440`
- Modify: `src/features/social/components/UnifiedSocialUi.test.ts`
- Modify: `src/App.tsx:1120-1135, 1215-1230, 1345-1360`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: canonical `socialPaths.post(scope, postId)`.
- Produces: route state `{ focusSocialReply: true }`, redirect-only `SocialLegacyReplyRedirectPage`, and a composer route wrapper that never loads reply mode.

- [ ] **Step 1: Write failing route-deletion tests**

Assert typed compose params exclude `replyToPostId`, source contains no reply-mode branch, and all three alternate routes use the redirect page:

```ts
expect(composerSource).not.toContain('searchParams.get("replyToPostId")');
expect(composerSource).not.toContain("replyPost");
expect(appSource).toContain('path="/moments/posts/:postId/replies" element={protect("user", <SocialLegacyReplyRedirectPage />)}');
expect(appSource).toContain('path="/merchant/moments/posts/:postId/replies" element={protect("merchant", <SocialLegacyReplyRedirectPage />)}');
expect(appSource).toContain('path="/technician/moments/posts/:postId/replies" element={protect("technician", <SocialLegacyReplyRedirectPage />)}');
```

The route-page test must mock the lazy composer module and assert it is not rendered for `?replyToPostId=700`.

- [ ] **Step 2: Run route tests and verify RED**

```bash
npm test -- src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/App.test.tsx
```

Expected: FAIL because reply mode and duplicate routes still exist.

- [ ] **Step 3: Restrict path APIs and add transient focus state**

Replace the generic compose params with:

```ts
type SocialComposeParams = {
  author?: string;
  editPostId?: string;
  quotePostId?: string;
};

export const socialReplyFocusState = { focusSocialReply: true } as const;
```

Delete `socialPaths.replies`. Keep `socialPaths.compose` for only the three valid parameters.

- [ ] **Step 4: Add redirect-only route wrappers**

Implement the composer query guard before the lazy page is rendered:

```tsx
export function SocialComposerPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const replyToPostId = searchParams.get("replyToPostId");
  const scope = getSocialScopeFromPathname(location.pathname);

  if (replyToPostId && /^\d+$/u.test(replyToPostId)) {
    return <Navigate replace state={socialReplyFocusState} to={socialPaths.post(scope, replyToPostId)} />;
  }

  return <FullSocialRoute page={FullSocialComposerPage} />;
}

export function SocialLegacyReplyRedirectPage() {
  const location = useLocation();
  const { postId } = useParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  return postId
    ? <Navigate replace state={socialReplyFocusState} to={socialPaths.post(scope, postId)} />
    : <Navigate replace to={socialPaths.timeline(scope)} />;
}
```

- [ ] **Step 5: Delete full-page reply mode**

From `SocialComposerPage`, remove `replyToPostId`, `replyPost`, reply-specific draft keys, reply title/submit labels, reply preview, and `createPost({ replyToPostId })`. Keep only root post, edit, and quote branches. In `SocialDraftsPage`, filter legacy reply drafts and remove their resume path and `回复草稿` label.

- [ ] **Step 6: Route timeline reply actions to canonical detail**

Replace the interaction handler with:

```tsx
onClick={() => navigate(detailHref, { state: socialReplyFocusState })}
```

Update all three `/replies` routes in `App.tsx` to `SocialLegacyReplyRedirectPage`.

- [ ] **Step 7: Run deletion guard searches and tests**

```bash
rg -n "replyPost|isThreadPage|socialPaths\.replies|socialPaths\.compose\([^\n]*replyToPostId|onOpenFullComposer" src/features/social src/App.tsx
npm test -- src/features/social/paths.test.ts src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/components/UnifiedSocialUi.test.ts src/App.test.tsx
```

Expected: `rg` returns no obsolete UI entry; all selected tests pass. The compatibility query guard is allowed to contain the literal `replyToPostId` only inside `route-pages.tsx` and its test.

- [ ] **Step 8: Commit the obsolete-page removal**

```bash
git add src/features/social/paths.ts src/features/social/paths.test.ts src/features/social/route-pages.tsx src/features/social/route-pages.test.tsx src/features/social/pages/SocialComposerPage.tsx src/features/social/pages/SocialComposerPage.test.tsx src/features/social/pages/SocialDraftsPage.tsx src/features/social/components/UnifiedSocialUi.tsx src/features/social/components/UnifiedSocialUi.test.ts src/App.tsx src/App.test.tsx
git commit -m "refactor(social): remove duplicate reply page"
```

---

### Task 7: Make Post Detail the One Reply UI

**Files:**
- Modify: `src/features/social/components/SocialQuickReplyComposer.tsx:1-95`
- Modify: `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- Modify: `src/features/social/pages/SocialPostDetailPage.tsx:90-150, 399-675`
- Modify: `src/features/social/pages/SocialPostDetailPage.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: `socialReplyFocusState` and server-authoritative `post.replyCount`.
- Produces: `SocialQuickReplyComposerHandle.focus()`, local focus actions, `回复动态` header, and independent reply cards.

- [ ] **Step 1: Write failing detail tests**

Assert the source and rendered composer expose the approved contract:

```ts
expect(detailSource).toContain('title="回复动态"');
expect(detailSource).not.toContain("isThreadPage");
expect(detailSource).not.toContain("overflow-hidden rounded-[28px]");
expect(detailSource).toContain('className="mt-4 space-y-3"');
expect(detailSource).toContain("composerRef.current?.focus()");
expect(detailSource).toContain("count={post.replyCount}");
```

Add a jsdom test that calls the forwarded handle and asserts the rich textbox owns `document.activeElement`.

- [ ] **Step 2: Run detail tests and verify RED**

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
```

Expected: FAIL because the composer has no focus handle and the page still renders the old title/shared shell.

- [ ] **Step 3: Add the composer focus handle**

Use `forwardRef` and `useImperativeHandle`:

```ts
export type SocialQuickReplyComposerHandle = { focus: () => void };

export const SocialQuickReplyComposer = forwardRef<
  SocialQuickReplyComposerHandle,
  SocialQuickReplyComposerProps
>(function SocialQuickReplyComposer(props, ref) {
  return <SocialQuickReplyComposerState forwardedRef={ref} key={props.targetIdentity} {...props} />;
});
```

Keep a rich-input ref and implement `focus()` by focusing it and collapsing the selection at the end.

- [ ] **Step 4: Consume transient route focus and local buttons**

In detail:

```ts
const composerRef = useRef<SocialQuickReplyComposerHandle>(null);
const focusReply = () => composerRef.current?.focus();

useEffect(() => {
  if (location.state?.focusSocialReply !== true) return;
  window.requestAnimationFrame(focusReply);
  navigate(location.pathname, { replace: true, state: null });
}, [location.pathname, location.state, navigate]);
```

Render the detail reply action and `写回复` as buttons whose `onClick` is `focusReply`; neither receives a `to` prop.

- [ ] **Step 5: Apply the header and independent-card structure**

Use `回复动态` in success and missing-post headers. Change the list to:

```tsx
<div className="mt-4 space-y-3">
  {replies.map((reply) => (
    <ReplyListItem key={reply.id} post={reply} profiles={profiles} scope={scope} />
  ))}
</div>
```

Give each `ReplyListItem` article its own `rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4` and remove row dividers.

- [ ] **Step 6: Add five-language copy**

Add an explicit `回复动态` entry with these values:

```ts
"回复动态": {
  "zh-Hant": "回覆動態",
  ja: "投稿に返信",
  en: "Reply to Post",
  ko: "게시물에 답글"
}
```

Remove the obsolete `打开完整回复` key only after `rg` proves no caller remains.

- [ ] **Step 7: Run detail and i18n tests**

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
npm run i18n:audit
npm run i18n:quality
```

Expected: selected tests and both i18n audits pass.

- [ ] **Step 8: Commit the canonical detail UI**

```bash
git add src/features/social/components/SocialQuickReplyComposer.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "fix(social): keep one reply detail UI"
```

---

### Task 8: Give the Shared Plus Panel Working Social Actions

**Files:**
- Create: `src/features/social/composer-location.ts`
- Create: `src/features/social/composer-location.test.ts`
- Modify: `src/features/social/pages/SocialComposerPage.tsx:315-355`
- Modify: `src/features/social/components/SocialQuickReplyComposer.tsx:1-170`
- Modify: `src/features/social/components/SocialQuickReplyComposer.test.tsx`
- Modify: `src/features/social/pages/SocialPostDetailPage.tsx:645-675`
- Modify: `src/features/social/types.ts:185-220`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: `ImChatComposerAction[]`, `realtimeApi.uploadSocialMedia`, `serializeImComposerMessage`, `ComposerLocationSelector`, and `createPost` structured input.
- Produces: quick-reply submit payload `{ text, richText, media, locationLabel }` and exactly three working more-panel actions.

- [ ] **Step 1: Write failing quick-composer tests**

Mock `realtimeApi.uploadSocialMedia` and assert the more panel contains exactly three actions:

```ts
await act(async () => {
  container.querySelector<HTMLButtonElement>('[aria-label="打开更多功能"]')?.click();
});
expect(
  [...container.querySelectorAll('[data-im-composer-panel="more"] button')].map((button) => button.textContent)
).toEqual(["相册", "拍照", "位置"]);
```

Select a `Pending` judgement and an uploaded image, submit, and assert:

```ts
expect(onSubmit).toHaveBeenCalledWith({
  text: "Pending",
  richText: { version: 1, parts: [{ type: "judgement", value: "Pending" }] },
  media: [expect.objectContaining({ mediaAssetPublicId: "a".repeat(64) })],
  locationLabel: undefined
});
```

In the same test file, assert each required state explicitly:

```ts
expect(screen.getByLabelText("拍照")).toHaveAttribute("capture", "environment");
expect(screen.getByRole("textbox")).toBeDisabled();
expect(screen.getByRole("button", { name: "打开表情" })).toBeDisabled();
expect(screen.getByRole("button", { name: "打开更多功能" })).toBeDisabled();
expect(screen.getByText("上传失败")).toBeVisible();
expect(screen.getByRole("button", { name: "重试图片" })).toBeEnabled();
expect(screen.getByText("东京 / 新宿区 / 新宿")).toBeVisible();
```

Rerender first with another `targetIdentity`, then with another `postId`, and assert the prior text, preview URL, upload error, and selected location are absent in both states.

- [ ] **Step 2: Run quick-composer tests and verify RED**

```bash
npm test -- src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/composer-location.test.ts
```

Expected: FAIL because the plus button navigates and the shared location helper does not exist.

- [ ] **Step 3: Extract the shared pure location builder**

Create:

```ts
export function buildSocialLocationOptions(
  authorLocation: string | undefined,
  query: string
): string[] {
  const base = [
    authorLocation,
    "东京 / 新宿区 / 新宿",
    "东京 / 涩谷区 / 涩谷",
    "东京 / 中央区 / 银座",
    "东京 / 港区 / 六本木",
    "东京 / 千代田区 / 丸之内"
  ].filter((value): value is string => Boolean(value));
  const normalized = query.trim().toLowerCase();
  const filtered = [...new Set(base)].filter((value) => !normalized || value.toLowerCase().includes(normalized));
  if (query.trim() && !filtered.includes(query.trim())) filtered.unshift(query.trim());
  return filtered.slice(0, 8);
}
```

Use this helper in both `SocialComposerPage` and `SocialQuickReplyComposer`.

- [ ] **Step 4: Replace the navigation override with shared actions**

Remove `moreAction` and pass:

```ts
const actions: ImChatComposerAction[] = [
  { key: "image", label: "相册", icon: "photo", run: () => albumInputRef.current?.click() },
  { key: "camera", label: "拍照", icon: "camera", run: () => cameraInputRef.current?.click() },
  { key: "location", label: "位置", icon: "location", run: () => setLocationOpen(true) }
];
```

Add hidden JPEG/PNG/WebP inputs; the camera input includes `capture="environment"`. Validate with `getSocialImageValidationError`, create a preview URL, upload through `realtimeApi.uploadSocialMedia`, and retain failed state for retry/removal.

- [ ] **Step 5: Serialize structured content and submit attachments**

Replace materialization-only submit with:

```ts
const serialized = serializeImComposerMessage(draft);
const text = serialized.content.trim();
await onSubmit({
  text,
  richText: serialized.richText,
  media: uploadedMedia ? [uploadedMedia] : [],
  locationLabel: locationLabel || undefined
});
```

Allow an uploaded image with empty text, disable sending while upload is pending, revoke every replaced/removed object URL, and clear all state only after POST success.

- [ ] **Step 6: Reuse the existing Social location selector**

When location mode is open, render `ComposerLocationSelector` in the same Social component state and preserve the reply draft. On confirmation, return to the fixed composer and show a removable location summary above the input shell.

- [ ] **Step 7: Pass the structured payload into `createPost`**

Update the detail callback:

```tsx
onSubmit={(input) => createPost({
  authorKey: actorKey,
  replyToPostId: post.id,
  text: input.text,
  richText: input.richText,
  media: input.media,
  locationLabel: input.locationLabel,
  postType: "reply"
})}
```

- [ ] **Step 8: Complete i18n coverage and run targeted tests**

Reuse the existing five-language entries for `相册`, `拍照`, and `位置`. Add only the missing five-language keys for upload pending/failure, remove image, retry image, selected location, and remove location; add a translation test that enumerates those keys and asserts non-empty Simplified Chinese, Traditional Chinese, Japanese, English, and Korean values. Then run:

```bash
npm test -- src/features/social/composer-location.test.ts src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.test.ts src/i18n/translations.test.ts
npm run i18n:audit
npm run i18n:quality
```

Expected: the plus panel has only the three formal actions; image/location and judgement payload tests pass; i18n audits pass.

- [ ] **Step 9: Commit the working Social plus panel**

```bash
git add src/features/social/composer-location.ts src/features/social/composer-location.test.ts src/features/social/pages/SocialComposerPage.tsx src/features/social/components/SocialQuickReplyComposer.tsx src/features/social/components/SocialQuickReplyComposer.test.tsx src/features/social/pages/SocialPostDetailPage.tsx src/features/social/types.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat(social): add quick reply attachments"
```

---

### Task 9: Apply the Migration, Document the Slice, and Run Full Acceptance

**Files:**
- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all Tasks 1-8.
- Produces: applied local migration evidence, complete regression evidence, browser screenshots/notes, and merge-ready commits.

- [ ] **Step 1: Run the guarded migration preflight**

```bash
ENV_FILE=.env.dev npm --prefix backend run check:social-reply-relations -- --phase=preflight
```

Expected: JSON reports `ready: true`, a local non-production database, total post count, and valid legacy reply count; snapshot is written only under ignored `backend/.data/`.

- [ ] **Step 2: Apply and verify the additive migration**

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run check:social-reply-relations -- --phase=postflight
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

Expected: migration applies once; postflight reports unchanged total posts, exact relation backfill, zero orphans, index present, foreign key present; Prisma reports all repository migrations applied.

- [ ] **Step 3: Run backend quality gates**

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test
```

Expected: lint, TypeScript build, and complete Jest suite pass. Conditional environment skips remain explicitly reported rather than counted as passes.

- [ ] **Step 4: Run frontend quality gates**

```bash
npm run lint
npm test
npm run i18n:audit
npm run i18n:quality
npm run verify:production-build
```

Expected: TypeScript, complete Vitest suite, both i18n audits, formal build, and production-bundle audit pass.

- [ ] **Step 5: Update formal documentation**

Append a new completion section to Step 13 recording:

```markdown
## 6.21 动态单一回复系统、正式回复计数与判断贴纸（2026-08-31）

- 三端所有回复入口统一进入动态详情并聚焦底部聊天式输入框；完整回复模式、替代详情模式及其入口已经删除，历史深链只做无 UI 重定向。
- 每条回复使用独立容器；头部统一为“回复动态”；底部“+”复用聊天面板并只提供可正式落库的相册、拍照和位置。
- `SocialPost.replyToPostId` 成为带索引的正式自关联，现有 JSON 回复关系已回填；API 从有效子记录返回权威 `replyCount`。
- 判断贴纸保存严格校验的版本化结构与文字回退，时间线、详情、回复卡、引用和刷新后均继续显示共享 SVG。
- 本切片不新增 mock、轮询、平行回复状态，也不改变聊天端语音或完整附件能力。
```

Add the guarded migration/check commands and browser-acceptance route matrix to `README.md`.

- [ ] **Step 6: Start or verify the formal runtime**

```bash
npm run dev
curl -s http://127.0.0.1:3000/api/v1/health
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend health reports success and the frontend returns HTTP 200. Confirm port 5180 is serving this worktree before acceptance.

- [ ] **Step 7: Run real browser acceptance**

Use the `webapp-testing` skill against formal authenticated accounts. For user, merchant, and technician portals:

1. Open a timeline item with replies and confirm the reply icon count equals the detail total.
2. Click the timeline reply icon; confirm canonical detail opens, header reads `回复动态`, and the fixed input is focused.
3. Click the detail reply icon and `写回复`; confirm neither changes route.
4. Open both historical reply URL forms; confirm immediate replacement to canonical detail and no obsolete full-page reply UI.
5. Confirm each reply is a separate rounded container with spacing and no internal white divider.
6. Open emoji and plus panels; confirm plus shows only 相册, 拍照, 位置.
7. Submit text, a judgement sticker, an image, and a location through real APIs; reload and confirm count, media/location, and SVG sticker persist.
8. Submit plain text `Pending`; reload and confirm it remains plain text.
9. Repeat at 440-by-956 and 320-pixel widths; inspect horizontal overflow, last-card visibility, safe area, console, and failed requests.

Expected: every item passes on all three portals with no hidden alternate reply UI.

- [ ] **Step 8: Commit documentation and verification notes**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md README.md
git commit -m "docs(social): record single reply acceptance"
```

- [ ] **Step 9: Perform the final branch audit**

```bash
git status --short --branch
git log --oneline --decorate -12
git diff main...HEAD --stat
git merge-base --is-ancestor main HEAD
```

Expected: the feature worktree is clean, commits are reviewable, the branch contains current `main`, and only planned Social/backend/docs files changed. If `main` advanced, merge current `main` into the feature branch, rerun the affected tests and formal build, then repeat this audit before local integration.

---

## Plan Self-Review Checklist

- Spec coverage: Tasks 6-8 delete the obsolete UI, canonicalize entry points, add one detail UI, independent reply cards, and working shared composer actions. Tasks 1-4 establish authoritative relation/count and structured persistence. Task 5 renders stickers everywhere. Task 9 covers migration, documentation, full tests, and live browser acceptance.
- Placeholder scan: every code-changing step names exact files, signatures, snippets, commands, and expected results; no deferred implementation marker is present.
- Type consistency: backend and frontend both use `replyToPostId`, `replyCount`, `richText.version = 1`, and the same text/judgement part shape. `SocialQuickReplyComposer` submits `{ text, richText, media, locationLabel }`, and `SocialPostDetailPage` passes those fields unchanged to `createPost`.
- Deletion guard: only `route-pages.tsx` and its test may retain the historical `replyToPostId` query string. `SocialComposerPage`, `SocialDraftsPage`, interaction controls, detail controls, and the shared quick composer contain no path to the obsolete UI.
- Formal-data guard: counts come from indexed active child rows; structured content is validated against fallback text; media/location use existing formal routes; no browser business state or fake success is added.
