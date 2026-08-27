# Contact NeeDoID And Social Activity Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every formal IM contact display its immutable NeeDoID and add a database-backed, text-only “recent activity” entry below tags that links to the friend’s full Social page.

**Architecture:** Extend the existing IM payloads with `needoId` while retaining numeric database IDs as internal relation keys. Add a narrowly indexed Social existence query for visible posts created in the last 30 rolling days; the contact page calls only this status API, while the full author-specific Social feed loads only after the user follows the link. Reuse the existing IM page and `SocialProfileScene`; do not create simplified duplicate pages.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Express, Zod, Prisma, MySQL 8, Jest, Supertest.

## Global Constraints

- Execute only this Step 13 microstep; do not bundle unrelated IM, Social, Booking, wallet, or admin work.
- Preserve the current React / TSX / Vite frontend and the existing complete IM/Social UI.
- Do not add mock, demo, placeholder, fake API, browser-local business state, `TODO`, or `FIXME` code.
- Keep `User.id` as the internal foreign key and display/search with immutable `User.needoId`.
- Recent means `createdAt >= now - 30 * 24 * 60 * 60 * 1000`; pinned state does not extend the window.
- The status query must enforce the current viewer’s Social visibility and must not read media JSON or full post rows.
- Both “前往好友的动态页” and “好友近期无动态” link to the same full friend Social page.
- Preserve all unrelated dirty-worktree changes. In particular, merge carefully in `backend/src/api/openapi.ts`, `backend/src/repositories/backoffice.repository.ts`, `backend/src/services/backoffice.service.ts`, `src/api/backofficeRealData.ts`, `src/features/im/formal-api.test.ts`, `src/features/im/formal-api.ts`, `src/features/im/pages.tsx`, `src/features/im/model.ts`, and `src/features/im/store.ts`.
- Several implementation files were already modified before this plan. Before every checkpoint, inspect the full working and staged diffs. Stage only task-owned hunks with `git add -p`; if an existing hunk and the new change cannot be separated safely, skip that checkpoint commit and leave the combined file for explicit user review. Never commit or discard a pre-existing hunk merely to satisfy the checkpoint.
- Use the formal backend on port 3000 and frontend on port 5180 for acceptance; the root `npm run dev:backend` is the legacy mock and is not valid evidence.

---

## File Map

**Formal identity contract**

- Modify `backend/src/repositories/realtime.repository.ts`: include `needoId` in participants and embedded contact users.
- Modify `backend/src/services/backoffice.service.ts`: include `needoId` in technician payloads used by organization contacts.
- Modify `backend/src/repositories/backoffice.repository.ts`: select/map technician account NeeDoID.
- Modify `src/features/realtime/api.ts`: match the expanded formal IM and Social status contracts.
- Modify `src/api/backofficeRealData.ts`: match the expanded technician payload.
- Modify `src/features/im/formal-api.ts`: map `userIdLabel` from `needoId` while retaining numeric `id` internally.
- Modify `src/features/im/store.ts`: pass the authenticated user’s `needoId` into the formal adapter.

**Recent activity API**

- Modify `backend/prisma/schema.prisma`: add the composite Social lookup index.
- Create `backend/prisma/migrations/20260827193000_social_post_activity_lookup/migration.sql`: create the matching MySQL index.
- Modify `backend/src/validators/realtime.validator.ts`: validate `userId` route params.
- Modify `backend/src/repositories/realtime.repository.ts`: add the visibility-aware existence query.
- Modify `backend/src/services/realtime.service.ts`: apply the fixed rolling-30-day cutoff and not-found behavior.
- Modify `backend/src/controllers/realtime.controller.ts`: expose the status handler.
- Modify `backend/src/routes/realtime.routes.ts`: register the protected route under `social-post:list`.
- Modify `backend/src/api/openapi.ts`: document the exact request and response.

**Frontend activity entry and full-page routing**

- Modify `src/features/im/pages.tsx`: render the text-only entry below tags and load status by target user ID.
- Modify `src/features/social/paths.ts`: add a user-account-backed Social profile path.
- Modify `src/features/social/context.tsx`: load an author-specific formal profile/feed only when the full page opens.
- Modify `src/features/social/formal-adapter.ts`: expose one-author-to-profile mapping.
- Modify `src/features/social/pages/SocialProfilePage.tsx`: add a user-ID route wrapper that reuses `SocialProfileScene`.
- Modify `src/features/social/route-pages.tsx`: export the account-profile route component.
- Modify `src/App.tsx`: register user, merchant, and technician account-profile routes.

**Tests and docs**

- Create `backend/tests/realtime-repository-identity.test.ts`.
- Create `backend/tests/realtime-social-activity.test.ts`.
- Modify `backend/tests/realtime-api.test.ts`.
- Modify `src/features/im/formal-api.test.ts`.
- Modify `src/features/im/pages.test.ts`.
- Modify `src/features/im/formal-pages.test.ts`.
- Modify `src/features/social/formal-adapter.test.ts`.
- Modify `src/features/social/formal-provider.test.ts`.
- Modify `src/i18n/translations.ts` with Simplified Chinese, Traditional Chinese, Japanese, English, and Korean strings for the four new activity states.
- Create `docs/contact-social-activity.md` for the formal contract; do not mix this task into the already-dirty `docs/realtime.md`.

---

### Task 1: Make NeeDoID the only user-visible formal IM identifier

**Files:**

- Create: `backend/tests/realtime-repository-identity.test.ts`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/backoffice.service.ts`
- Modify: `backend/src/repositories/backoffice.repository.ts`
- Modify: `src/features/realtime/api.ts`
- Modify: `src/api/backofficeRealData.ts`
- Modify: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify: `src/features/im/store.ts`

**Interfaces:**

- Produces `ParticipantPayload.needoId: string` and `ContactPayload.contactUser: ParticipantPayload`.
- Produces `BackofficeTechnicianPayload.needoId: string`.
- Keeps `ImUser.id = String(User.id)` and sets `ImUser.userIdLabel = User.needoId`.

- [ ] **Step 1: Write the failing backend repository contract test**

Create a Jest test with a mocked Prisma client that returns contact user 237:

```ts
import type { PrismaClient } from "@prisma/client";
import { RealtimeRepository } from "../src/repositories/realtime.repository";

it("returns immutable NeeDoID with every formal contact", async () => {
  const client = {
    contact: {
      findMany: jest.fn(async () => [{
        id: 4056,
        ownerUserId: 137,
        contactUserId: 237,
        nickname: null,
        source: "simulation_seed",
        createdAt: new Date("2026-08-25T00:00:00.000Z"),
        updatedAt: new Date("2026-08-25T00:00:00.000Z"),
        deletedAt: null,
        contactUser: {
          id: 237,
          needoId: "n0000000237",
          username: "柴田 陽菜",
          avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
        }
      }]),
      count: jest.fn(async () => 1)
    }
  } as unknown as PrismaClient;

  const result = await new RealtimeRepository(client).listContacts(137, { page: 1, pageSize: 20 });

  expect(result.list[0]?.contactUser).toEqual({
    userId: 237,
    needoId: "n0000000237",
    username: "柴田 陽菜",
    avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
  });
});
```

- [ ] **Step 2: Run the backend test and verify RED**

Run:

```bash
npm --prefix backend test -- --runInBand tests/realtime-repository-identity.test.ts
```

Expected: FAIL because `ContactPayload` has no `contactUser` and the repository does not include that relation.

- [ ] **Step 3: Extend the failing frontend adapter test**

Update the first `formal-api.test.ts` fixture so both participants and the contact carry formal identity data:

```ts
participants: [
  { userId: 100, needoId: "n0000000100", username: "sim-customer-100", avatarUrl: null },
  { userId: 237, needoId: "n0000000237", username: "柴田 陽菜", avatarUrl: "/images/generated/profiles/cartoon-profile-03.png" }
]
```

```ts
contactUser: {
  userId: 237,
  needoId: "n0000000237",
  username: "柴田 陽菜",
  avatarUrl: "/images/generated/profiles/cartoon-profile-03.png"
}
```

Assert:

```ts
expect(bootstrap.users.find((user) => user.id === "237")).toMatchObject({
  id: "237",
  accountId: "n0000000237",
  userIdLabel: "n0000000237",
  nickname: "柴田 陽菜"
});
```

- [ ] **Step 4: Run the frontend test and verify RED**

Run:

```bash
npm test -- src/features/im/formal-api.test.ts
```

Expected: FAIL because the adapter still maps `userIdLabel` and `accountId` from numeric `userId`.

- [ ] **Step 5: Implement the minimal backend identity mapping**

Use these payload shapes in `realtime.repository.ts`:

```ts
export interface ParticipantPayload {
  userId: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
}

export interface ContactPayload {
  id: number;
  ownerUserId: number;
  contactUserId: number;
  contactUser: ParticipantPayload;
  nickname: string | null;
  source: string;
  createdAt: Date;
}
```

Expand the existing Social author contract at the same repository boundary with the real account join time:

```ts
export interface SocialPostAuthorPayload {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  entityType: "user" | "technician" | "shop";
  joinedAt: Date;
}
```

Add `needoId: true` to conversation participant user selections. Define one contact include and use it in the type and query:

```ts
const contactInclude = {
  contactUser: {
    select: { id: true, needoId: true, username: true, avatarUrl: true }
  }
} satisfies Prisma.ContactInclude;

type ContactRecord = Prisma.ContactGetPayload<{ include: typeof contactInclude }>;
```

Map without exposing internal IDs as labels:

```ts
private mapParticipant(user: { id: number; needoId: string; username: string; avatarUrl: string | null }): ParticipantPayload {
  return { userId: user.id, needoId: user.needoId, username: user.username, avatarUrl: user.avatarUrl };
}

private mapContact(contact: ContactRecord): ContactPayload {
  return {
    id: contact.id,
    ownerUserId: contact.ownerUserId,
    contactUserId: contact.contactUserId,
    contactUser: this.mapParticipant(contact.contactUser),
    nickname: contact.nickname,
    source: contact.source,
    createdAt: contact.createdAt
  };
}
```

Add `needoId` to the backoffice technician account select and payload. Do not overwrite the existing avatar work in those dirty files.

Also select `User.createdAt` in `socialPostInclude` and expose it as `SocialPostAuthorPayload.joinedAt`. This is real account metadata used by Task 5; do not derive account join time from a post timestamp.

- [ ] **Step 6: Implement the minimal frontend identity mapping**

Update the API types:

```ts
export type RealtimeParticipant = {
  avatarUrl: string | null;
  needoId: string;
  userId: number;
  username: string;
};

export type RealtimeContact = {
  contactUser: RealtimeParticipant;
  contactUserId: number;
  createdAt: string;
  id: number;
  nickname: string | null;
  ownerUserId: number;
  source: string;
};
```

Add `joinedAt: string` to the existing `RealtimeSocialPost.author` type. Keep it required so formal profile mapping cannot invent an epoch, current time, or post timestamp.

Map the formal user as follows:

```ts
return {
  id: String(participant.userId),
  accountId: participant.needoId,
  nickname: participant.username,
  searchableFields: [participant.username, participant.needoId],
  userIdLabel: participant.needoId,
  // keep the existing avatar/profile fields unchanged
};
```

Populate contact users directly from `contact.contactUser` and delete the numeric placeholder fallback for formal contacts. Pass `session.needoId ?? ""` through `getScopedStore`; fail the formal bootstrap if it is missing instead of displaying `session.id`. Set organization technician `userIdLabel` from its new `needoId` field.

- [ ] **Step 7: Run the focused identity tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- --runInBand tests/realtime-repository-identity.test.ts
npm test -- src/features/im/formal-api.test.ts
```

Expected: both commands PASS; the formal adapter assertion contains `n0000000237` and no user-visible fallback to `237`.

- [ ] **Step 8: Commit the identity contract**

Inspect every listed file, add the new test normally, and stage only task-owned hunks from already-dirty files:

```bash
git add backend/tests/realtime-repository-identity.test.ts
git add -p -- backend/src/repositories/realtime.repository.ts backend/src/repositories/backoffice.repository.ts backend/src/services/backoffice.service.ts src/features/realtime/api.ts src/api/backofficeRealData.ts src/features/im/formal-api.test.ts src/features/im/formal-api.ts src/features/im/store.ts
git diff --cached --check
git diff --cached
git commit -m "fix: show NeeDoID for formal IM contacts"
```

If any staged hunk includes pre-existing work, unstage that hunk and skip this commit rather than absorbing unrelated changes.

---

### Task 2: Add an indexed, visibility-safe 30-day activity query

**Files:**

- Create: `backend/tests/realtime-social-activity.test.ts`
- Create: `backend/prisma/migrations/20260827193000_social_post_activity_lookup/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`

**Interfaces:**

- Produces `SocialActivityStatusPayload` with `status`, `profile`, and `latestVisiblePostAt`.
- Produces repository method `getSocialActivityStatus(input)`; Task 3 exposes it over HTTP.

- [ ] **Step 1: Write failing repository and service tests**

Use a fixed clock and assert the exact 30-day boundary:

```ts
const now = new Date("2026-08-27T10:00:00.000Z");
const since = new Date("2026-07-28T10:00:00.000Z");

expect(repository.getSocialActivityStatus).toHaveBeenCalledWith({
  viewerUserId: 137,
  targetUserId: 237,
  since
});
```

The mocked Prisma repository test must assert an author-scoped, media-free existence query:

```ts
expect(client.socialPost.findFirst).toHaveBeenCalledWith({
  where: {
    authorUserId: 237,
    createdAt: { gte: since },
    deletedAt: null,
    OR: [
      { visibility: "PUBLIC" },
      { authorUserId: 137 },
      { author: { followers: { some: { followerUserId: 137, deletedAt: null } } } }
    ]
  },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  select: { createdAt: true, id: true }
});
```

Also cover `recent_posts`, `no_recent_posts`, a missing target user, and a followers-only post not visible to a non-follower.

- [ ] **Step 2: Run the activity test and verify RED**

```bash
npm --prefix backend test -- --runInBand tests/realtime-social-activity.test.ts
```

Expected: FAIL because the payload and repository/service methods do not exist.

- [ ] **Step 3: Add the composite index and migration**

Add to `SocialPost`:

```prisma
@@index([authorUserId, deletedAt, createdAt])
```

Create the migration with exactly:

```sql
CREATE INDEX `social_posts_author_user_id_deleted_at_created_at_idx`
  ON `social_posts`(`author_user_id`, `deleted_at`, `created_at`);
```

- [ ] **Step 4: Implement the minimal repository contract**

Add:

```ts
export type SocialActivityStatus = "recent_posts" | "no_recent_posts";

export interface SocialActivityStatusPayload {
  status: SocialActivityStatus;
  profile: SocialPostAuthorPayload;
  latestVisiblePostAt: Date | null;
}

export interface SocialActivityStatusInput {
  viewerUserId: number;
  targetUserId: number;
  since: Date;
}
```

The repository first loads only the active target account fields and identities needed for `SocialPostAuthorPayload`, including the real `User.createdAt` mapped to `joinedAt`, then performs the indexed `findFirst` shown in Step 1. Return `null` only when the target account does not exist; otherwise return `no_recent_posts` with `latestVisiblePostAt: null` or `recent_posts` with the selected timestamp. Extract a shared `mapSocialAuthor` helper so the existing post mapper and the new status method derive `entityType` and joined time consistently.

- [ ] **Step 5: Implement the fixed cutoff in the service**

```ts
const SOCIAL_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

public async getSocialActivityStatus(
  auth: AuthenticatedAccessContext,
  targetUserId: number,
  now: Date = new Date()
) {
  const result = await this.repository.getSocialActivityStatus({
    viewerUserId: auth.userId,
    targetUserId,
    since: new Date(now.getTime() - SOCIAL_ACTIVITY_WINDOW_MS)
  });

  if (!result) throw this.notFoundError("error.realtime.social_profile_not_found");
  return result;
}
```

- [ ] **Step 6: Run the activity tests and verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/realtime-social-activity.test.ts
```

Expected: PASS for the boundary, privacy, missing-user, and no-media-read assertions.

- [ ] **Step 7: Verify Prisma formatting and commit**

```bash
npm --prefix backend exec prisma format
git diff --check
git add backend/prisma/migrations/20260827193000_social_post_activity_lookup/migration.sql backend/tests/realtime-social-activity.test.ts
git add -p -- backend/prisma/schema.prisma backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts
git diff --cached --check
git diff --cached
git commit -m "feat: query recent friend activity efficiently"
```

---

### Task 3: Expose and document the protected activity-status API

**Files:**

- Modify: `backend/src/validators/realtime.validator.ts`
- Modify: `backend/src/controllers/realtime.controller.ts`
- Modify: `backend/src/routes/realtime.routes.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Interfaces:**

- Consumes `RealtimeService.getSocialActivityStatus(auth, targetUserId)` from Task 2.
- Produces `GET /api/v1/social/users/:userId/activity-status` protected by `social-post:list`.

- [ ] **Step 1: Write the failing Supertest assertions**

Extend the fake repository with `getSocialActivityStatus`, then assert:

```ts
const response = await request(app)
  .get("/api/v1/social/users/237/activity-status")
  .set("Authorization", `Bearer ${customerAccessToken}`)
  .expect(200);

expect(response.body).toEqual({
  code: 0,
  message: "success",
  data: {
    status: "recent_posts",
    latestVisiblePostAt: "2026-08-27T09:00:00.000Z",
    profile: {
      userId: 237,
      username: "柴田 陽菜",
      displayName: "柴田 陽菜",
      avatarUrl: "/images/generated/profiles/cartoon-profile-03.png",
      entityType: "user",
      joinedAt: "2026-08-01T00:00:00.000Z"
    }
  }
});
```

Add invalid `userId` and missing `social-post:list` cases expecting 400 and 403.

- [ ] **Step 2: Run the API test and verify RED**

```bash
npm --prefix backend test -- --runInBand tests/realtime-api.test.ts
```

Expected: FAIL with 404 because the route is not registered.

- [ ] **Step 3: Add Zod, controller, route, and permission wiring**

Validator:

```ts
export const socialUserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});
```

Controller:

```ts
public getSocialActivityStatus = this.createHandler((request, response) => {
  const params = socialUserIdParamSchema.parse(request.params);
  return this.service.getSocialActivityStatus(getAuthenticatedAccess(response), params.userId);
});
```

Route:

```ts
router.get(
  "/social/users/:userId/activity-status",
  authenticate(),
  authorize(REALTIME_ROUTE_PERMISSIONS.listSocialPosts),
  validateRequest({ params: socialUserIdParamSchema }),
  controller.getSocialActivityStatus
);
```

- [ ] **Step 4: Add OpenAPI documentation without overwriting concurrent changes**

Document path parameter `userId`, bearer auth, required `social-post:list`, the `recent_posts | no_recent_posts` status enum, nullable ISO `latestVisiblePostAt`, and the non-sensitive profile shape including ISO `joinedAt`. Re-open the dirty file immediately before patching and preserve all unrelated modifications. Also add `joinedAt` to the existing Social post author schema so the HTTP contract matches Task 1.

- [ ] **Step 5: Run API tests and verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/realtime-api.test.ts tests/realtime-social-activity.test.ts
```

Expected: PASS with 200/400/403 coverage.

- [ ] **Step 6: Commit the API contract**

```bash
git add -p -- backend/src/validators/realtime.validator.ts backend/src/controllers/realtime.controller.ts backend/src/routes/realtime.routes.ts backend/src/api/openapi.ts backend/tests/realtime-api.test.ts
git diff --cached --check
git diff --cached
git commit -m "feat: expose friend activity status API"
```

---

### Task 4: Render the text-only activity entry below tags

**Files:**

- Modify: `src/features/realtime/api.ts`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/features/im/formal-pages.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**

- Consumes `GET /social/users/:userId/activity-status`.
- Produces a stable UI state: `loading | recent_posts | no_recent_posts | error`.
- Produces no image, video, thumbnail, or media request.

- [ ] **Step 1: Write failing component and placement tests**

Export the entry component and test it in a `MemoryRouter`:

```tsx
render(
  <MemoryRouter>
    <ImContactActivityEntry status="recent_posts" to="/moments/users/237" />
  </MemoryRouter>
);
expect(screen.getByRole("link", { name: /前往好友的动态页/ })).toHaveAttribute("href", "/moments/users/237");
expect(screen.queryByRole("img")).not.toBeInTheDocument();
```

Repeat with `no_recent_posts` and assert “好友近期无动态” remains a link. In the source-slice test for `ImConversationInfoPage`, assert the tag section occurs before `<ImContactActivityEntry` and remove expectations for `ImContactMomentsMediaTile`.

- [ ] **Step 2: Run the frontend tests and verify RED**

```bash
npm test -- src/features/im/pages.test.ts src/features/im/formal-pages.test.ts
```

Expected: FAIL because the text-only component and status API do not exist.

- [ ] **Step 3: Add the frontend API type and method**

```ts
export type RealtimeSocialProfileSummary = NonNullable<RealtimeSocialPost["author"]>;

export type RealtimeSocialActivityStatus = {
  status: "recent_posts" | "no_recent_posts";
  latestVisiblePostAt: string | null;
  profile: RealtimeSocialProfileSummary;
};
```

```ts
getSocialActivityStatus(userId: number) {
  return httpClient.request<RealtimeSocialActivityStatus>(
    `/social/users/${userId}/activity-status`
  );
}
```

- [ ] **Step 4: Implement the entry without media code**

Replace the old media component with:

```tsx
export function ImContactActivityEntry({
  status,
  to
}: {
  status: "loading" | "recent_posts" | "no_recent_posts" | "error";
  to: string;
}) {
  const label = status === "loading"
    ? "正在查看好友近期动态"
    : status === "recent_posts"
      ? "前往好友的动态页"
      : status === "no_recent_posts"
        ? "好友近期无动态"
        : "动态暂时无法加载";

  return (
    <Link aria-label={label} className="focus-ring flex min-h-[84px] items-center gap-4 rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4" to={to}>
      <span className="text-[15px] font-black">动态</span>
      <span className="ml-auto text-sm font-semibold text-[color:var(--client-muted)]">{label}</span>
      <ImIcon className="h-4 w-4 -rotate-90" name="chevron-down" />
    </Link>
  );
}
```

In `ImConversationInfoPage`, call the status endpoint only when `conversation.type === "single"`, `Number(user.id)` is a positive integer, and `user.userIdLabel` matches the formal immutable format `/^n\d{10}$/`. This includes both ordinary formal contacts and `merchant_technician_profile` contacts while excluding the legacy static adapter. Use an effect cancellation flag so a late response cannot update a different contact page.

For the pre-existing static-demo adapter only, calculate status from its already-loaded local posts without adding data or making a formal request:

```ts
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const legacyStatus = infoSocialProfileKey && social
  .getProfilePosts(infoSocialProfileKey, "posts", infoSocialActorKey)
  .some((post) => new Date(post.createdAt).getTime() >= cutoff)
    ? "recent_posts"
    : "no_recent_posts";
```

Reuse the existing `动态` translation. Add exact translations for `正在查看好友近期动态`, `前往好友的动态页`, `好友近期无动态`, and `动态暂时无法加载` to `src/i18n/translations.ts` in Traditional Chinese, Japanese, English, and Korean; the Simplified Chinese source strings remain the lookup keys.

Render the activity entry immediately after the closing tag-section `</section>` and before mute/pin/settings sections. Remove `MediaPlayGlyph`, `SocialMediaItem`, preview flattening, and all thumbnail markup from this page.

- [ ] **Step 5: Run the focused UI tests and verify GREEN**

```bash
npm test -- src/features/im/pages.test.ts src/features/im/formal-pages.test.ts src/features/im/formal-api.test.ts
```

Expected: PASS; source and rendered DOM contain no activity thumbnail element and both text states are links.

- [ ] **Step 6: Commit the contact activity entry**

```bash
git add -p -- src/features/realtime/api.ts src/features/im/pages.test.ts src/features/im/formal-pages.test.ts src/features/im/pages.tsx src/i18n/translations.ts
git diff --cached --check
git diff --cached
git commit -m "feat: show friend activity status below tags"
```

---

### Task 5: Load the full friend Social page only after click

**Files:**

- Modify: `src/features/social/paths.ts`
- Modify: `src/features/social/formal-adapter.ts`
- Modify: `src/features/social/formal-adapter.test.ts`
- Modify: `src/features/social/context.tsx`
- Modify: `src/features/social/formal-provider.test.ts`
- Modify: `src/features/social/pages/SocialProfilePage.tsx`
- Modify: `src/features/social/route-pages.tsx`
- Modify: `src/App.tsx`
- Modify: `src/features/im/pages.tsx`

**Interfaces:**

- Produces `socialPaths.accountProfile(scope, userId)`.
- Produces `ensureAccountProfile(userId): Promise<SocialProfile | null>` on Social context.
- Reuses the existing `SocialProfileScene`; no duplicate profile page.

- [ ] **Step 1: Write failing path, adapter, and provider tests**

Assert paths:

```ts
expect(socialPaths.accountProfile("user", 237)).toBe("/moments/users/237");
expect(socialPaths.accountProfile("merchant", 237)).toBe("/merchant/moments/users/237");
expect(socialPaths.accountProfile("technician", 237)).toBe("/technician/moments/users/237");
```

Assert `mapFormalSocialProfile` maps the status profile to key `user:237`. In the formal-provider source contract, require both `realtimeApi.getSocialActivityStatus(userId)` and `realtimeApi.listSocialPosts({ page: 1, pageSize: 100, authorUserId: userId })` inside `ensureAccountProfile`, and assert neither call occurs in the contact-list bootstrap.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/features/social/formal-adapter.test.ts src/features/social/formal-provider.test.ts
```

Expected: FAIL because the account path and loader do not exist.

- [ ] **Step 3: Implement one reusable profile mapper**

Export from `formal-adapter.ts`:

```ts
export function mapFormalSocialProfile(author: RealtimeSocialProfileSummary): SocialProfile {
  const entityType = toEntityType(author.entityType);
  return {
    id: String(author.userId),
    entityType,
    displayName: author.displayName || author.username,
    handle: author.username,
    avatar: author.avatarUrl ?? "",
    coverImage: author.avatarUrl ?? "",
    bio: "NeeDo 正式账号动态",
    joinedAt: author.joinedAt,
    verifiedStatus: entityType === "shop" ? "business" : entityType === "technician" ? "verified" : "none",
    followerCount: 0,
    followingCount: 0,
    extraProfileFields: {}
  };
}
```

Use this helper inside `mapFormalSocialProfiles` so status and post-derived profiles cannot drift. The expanded post-author contract from Task 1 supplies the real account `joinedAt`; no epoch, current-time, or post-time fallback is allowed.

- [ ] **Step 4: Implement the account path and lazy formal loader**

Path:

```ts
accountProfile(scope: SocialPortalScope, userId: number | string) {
  return `${scopePrefix(scope)}/moments/users/${encodeURIComponent(String(userId))}`;
}
```

Add `ensureAccountProfile` to `SocialContextValue`. The formal implementation must:

1. call the activity-status API for the target account;
2. call the existing paginated author feed only after this account page opens;
3. merge the mapped profile and returned posts into formal state without removing the current timeline;
4. deduplicate concurrent loads by user ID using `useRef(new Map<number, Promise<SocialProfile | null>>())`; return the existing promise for the same ID and remove it from the map in `finally`;
5. return `null` on stable not-found while surfacing other errors to the page.

The legacy implementation returns the already loaded matching profile and does not make a formal request.

- [ ] **Step 5: Add the route wrapper that reuses `SocialProfileScene`**

In `SocialProfilePage.tsx`, add `SocialAccountProfilePage` using `userId` params. It displays the existing loading/error empty-state components while `ensureAccountProfile` runs, then renders:

```tsx
return (
  <SocialProfileScene
    actorKey={actorKey}
    onClose={closeProfile}
    profile={profile}
    resetKey={`account:${userId}`}
    scope={scope}
  />
);
```

Register these existing-scene routes in `App.tsx`:

```tsx
<Route path="/moments/users/:userId" element={protect("user", <SocialAccountProfilePage />)} />
<Route path="/merchant/moments/users/:userId" element={protect("merchant", <SocialAccountProfilePage />)} />
<Route path="/technician/moments/users/:userId" element={protect("technician", <SocialAccountProfilePage />)} />
```

Update the contact entry `to` prop to `socialPaths.accountProfile(socialScope, Number(user.id))`.

- [ ] **Step 6: Run tests and verify GREEN**

```bash
npm test -- src/features/social/formal-adapter.test.ts src/features/social/formal-provider.test.ts src/features/im/pages.test.ts
```

Expected: PASS; the account page loads an author-specific formal feed only after navigation and continues to use `SocialProfileScene`.

- [ ] **Step 7: Commit the full-page route**

```bash
git add -p -- src/features/social/paths.ts src/features/social/formal-adapter.ts src/features/social/formal-adapter.test.ts src/features/social/context.tsx src/features/social/formal-provider.test.ts src/features/social/pages/SocialProfilePage.tsx src/features/social/route-pages.tsx src/App.tsx src/features/im/pages.tsx
git diff --cached --check
git diff --cached
git commit -m "feat: load formal friend Social pages by account"
```

---

### Task 6: Apply, verify, and accept against real local data

**Files:**

- Create: `docs/contact-social-activity.md`
- Temporary acceptance script: `/tmp/verify-needo-contact-activity.py` (create with `apply_patch`, do not commit credentials or tokens)

**Interfaces:**

- Consumes all prior tasks.
- Produces fresh migration, test, build, API, database, and browser evidence.

- [ ] **Step 1: Regenerate Prisma and apply the migration to local `needo_dev`**

```bash
ENV_FILE=.env.dev npm --prefix backend run prisma:generate
ENV_FILE=.env.dev npm --prefix backend run prisma:migrate:deploy
ENV_FILE=.env.dev npm --prefix backend run prisma:status
```

Expected: generation succeeds; migration `20260827193000_social_post_activity_lookup` applies; status reports the schema up to date.

- [ ] **Step 2: Run all focused backend and frontend tests**

```bash
npm --prefix backend test -- --runInBand tests/realtime-repository-identity.test.ts tests/realtime-social-activity.test.ts tests/realtime-api.test.ts tests/realtime-service.test.ts
npm test -- src/features/im/formal-api.test.ts src/features/im/pages.test.ts src/features/im/formal-pages.test.ts src/features/social/formal-adapter.test.ts src/features/social/formal-provider.test.ts
```

Expected: both commands exit 0 with zero failed tests.

- [ ] **Step 3: Run lint, type checks, and formal builds**

```bash
npm --prefix backend run lint
npm --prefix backend run build
npm run lint
npm run verify:production-build
```

Expected: all commands exit 0. Use formal build mode; do not report a static-demo build as formal evidence.

- [ ] **Step 4: Restore and verify the deterministic local test-account contract**

The current pre-implementation evidence is `admin@example.com.username = "admin"`, while the formal Social plan expects `神谷 俊介`. Restore the complete guarded local dataset through the existing seed, not a manual one-row patch:

```bash
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run seed:formal-social-test
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:simulation-data
ENV_FILE=.env.dev ALLOW_SIMULATION_SEED=true npm --prefix backend run check:formal-social-test
```

Expected: simulation check reports 210 accounts, 210 conversations, 860 messages, and 420 contacts; formal Social check reports 216 accounts, 216 unique NeeDoIDs, 15 posts and 36 friends per account, `status: "ok"`.

- [ ] **Step 5: Verify the exact API against a real authenticated test account**

Use the configured shared test password without printing it. Log in as the real owner of contact relation 4056 (`sim.tech.071@needo.local`) and verify:

```text
GET /api/v1/im/contacts -> contact user 237 has needoId n0000000237
GET /api/v1/social/users/237/activity-status -> recent_posts or no_recent_posts according to current seeded timestamps
```

Confirm the response contains no password hash, email, media JSON, token, or internal-only tag data.

Verify the index is present and selected for the author/time existence lookup. Run `EXPLAIN FORMAT=JSON` through the configured backend Prisma connection for an equivalent `SELECT id, created_at FROM social_posts WHERE author_user_id = 237 AND deleted_at IS NULL AND created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY ORDER BY created_at DESC, id DESC LIMIT 1`, and assert the reported key is `social_posts_author_user_id_deleted_at_created_at_idx`. Do not print the database URL.

- [ ] **Step 6: Perform Playwright acceptance on the live formal page**

Follow the webapp-testing reconnaissance pattern: open `http://127.0.0.1:5180/user.html`, wait for `networkidle`, log in through the formal auth path, open the real contact/conversation for 柴田陽菜, and verify:

```text
Visible ID: n0000000237
Forbidden visible ID: ID 237
Order: profile card -> 标签 -> 动态 -> message settings
Dynamic state: 前往好友的动态页 OR 好友近期无动态
Activity images/videos: 0
Click target: /moments/users/237
Full friend page: loads the author-specific formal feed after navigation
```

Capture a full-page screenshot and the two relevant network responses under `/tmp`; do not commit access tokens.

- [ ] **Step 7: Update formal realtime documentation**

Document the immutable NeeDoID payload, embedded contact user, activity-status endpoint, 30-day window, visibility rule, composite index, text-only UI states, and user-ID Social route in the new `docs/contact-social-activity.md`. Link to the approved design and implementation plan. Do not modify or commit the already-dirty `docs/realtime.md` as part of this microstep.

- [ ] **Step 8: Run final diff and completion gates**

```bash
git diff --check
git status --short
git diff --cached --check
git log --oneline --max-count=8
```

Re-run any test affected by the final doc or merge adjustments. Confirm no mock, placeholder, hardcoded credential, `TODO`, or `FIXME` was added.

- [ ] **Step 9: Commit documentation and acceptance script exclusions**

```bash
git add docs/contact-social-activity.md
git diff --cached --check
git diff --cached
git commit -m "docs: document contact identity and activity status"
```

Do not add `/tmp/verify-needo-contact-activity.py`, screenshots, tokens, or local account exports to Git.
