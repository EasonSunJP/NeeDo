# IM Avatar Contact Information Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every identifiable single-chat or group-chat avatar open the contact-information flow for the account represented by that avatar, including the authenticated user, without routing group members into group settings.

**Architecture:** Route avatar clicks by sender/member `user.id` into the existing scoped DirectoryProfile route. Extend the formal DirectoryProfile contract with a read-only `self` relationship; existing `friend` profiles continue to promote into the idempotent direct-conversation information page, while non-friends and self remain on identity-specific contact-information surfaces. Preserve anonymous group-member privacy by returning no target when member profiles are hidden.

**Tech Stack:** React 19, TypeScript 5.9/5.7, React Router 7, Vitest 4, Express, Prisma 7, Jest 29, existing NeeDo formal IM REST/Store contracts.

## Global Constraints

- Execute only this Step 13 micro-change; do not modify friend-request timing, friendship deletion, send permissions, group settings, Social profile routes, schema, or migrations.
- Do not create mock/demo data, browser business persistence, a parallel contact page, or a self Contact/FriendRequest/Follow/Conversation.
- Every identifiable avatar resolves from its represented `ImUser.id`; never use the current group conversation ID as the member-information target.
- `relationship: "self"` is read-only and must not render friend, block, delete, mute, pin, label, or start-chat controls.
- Hidden group-member profiles remain anonymous and non-navigable.
- Preserve all unrelated dirty files, especially `ContactEventTimeline*` and `src/features/technician-schedule/*`.
- Do not push, deploy, or mutate formal database data.

---

### Task 1: Add the server-authoritative `self` DirectoryProfile contract

**Files:**
- Modify: `backend/tests/realtime-service.test.ts:17-75`
- Modify: `backend/tests/friend-request-lifecycle.repository.test.ts:330-440`
- Modify: `backend/src/services/realtime.service.ts:491-507`
- Modify: `backend/src/repositories/realtime.repository.ts:182-188,736-760,2303-2440,4160-4295`

**Interfaces:**
- Consumes: `AuthenticatedAccessContext.userId`, resolved personal `identityId`, and `RealtimeRepository.getDirectoryProfile(viewerUserId, viewerIdentityId, targetUserId, targetIdentityId)`.
- Produces: `DirectoryProfilePayload.relationship` with `"self"`; identity-card selection by exact `targetIdentityId`.

- [ ] **Step 1: Add the failing Service test for the authenticated account**

Append inside `describe("RealtimeService fuzzy search", ...)`:

```ts
it("loads the authenticated account as a read-only directory profile in the active identity", async () => {
  const profile = {
    user: { userId: 41, needoId: "u0000000041", username: "Requester", avatarUrl: null },
    identityCard: {
      entityType: "technician" as const,
      profileId: 741,
      displayName: "Requester Technician",
      identityLabel: "INDEPENDENT",
      verified: true,
      creditValue: null,
      creditReviewCount: 0,
      gender: null,
      age: null,
      heightCm: null,
      languages: [],
      city: "东京",
      serviceArea: "新宿区",
      yearsExperience: 4,
      bio: null,
    },
    relationship: "self" as const,
    contactId: null,
    friendRequest: null,
  };
  const repository = {
    findCanonicalIdentityIdForUser: jest.fn(),
    getDirectoryProfile: jest.fn(async () => profile),
  };
  const service = new RealtimeService(repository as never, {
    publish: jest.fn(),
    subscribe: jest.fn(),
  });

  await expect(
    service.getDirectoryProfile(
      { userId: 41, currentIdentityId: 410 } as never,
      41,
    ),
  ).resolves.toBe(profile);

  expect(repository.getDirectoryProfile).toHaveBeenCalledWith(41, 410, 41, 410);
  expect(repository.findCanonicalIdentityIdForUser).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Add the failing Repository test for exact identity selection and zero relationship queries**

Append after the existing directory-profile tests:

```ts
it("returns a self profile for the active identity without reading relationship rows", async () => {
  const selfUser = {
    ...requester,
    identities: [
      {
        id: 411,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: 141,
        displayName: "Requester Customer",
        isDefault: true,
      },
      {
        id: requesterIdentityId,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: 741,
        displayName: "Requester Technician",
        isDefault: false,
      },
    ],
    customerProfile: null,
    technicianProfile: {
      id: 741,
      displayName: "Requester Technician",
      bio: "本人技师资料",
      city: "东京",
      serviceArea: "新宿区",
      yearsExperience: 4,
      employmentType: "INDEPENDENT",
      status: "published",
      verifiedAt: dbNow,
      deletedAt: null,
      reviewSummary: null,
    },
  };
  const contactFindFirst = jest.fn();
  const friendRequestFindFirst = jest.fn();
  const client = {
    $queryRaw: jest.fn().mockResolvedValue([{ dbNow }]),
    user: { findFirst: jest.fn().mockResolvedValue(selfUser) },
    contact: { findFirst: contactFindFirst },
    friendRequest: { findFirst: friendRequestFindFirst },
  } as unknown as PrismaClient;

  await expect(
    new RealtimeRepository(client).getDirectoryProfile(
      requester.id,
      requesterIdentityId,
      requester.id,
      requesterIdentityId,
    ),
  ).resolves.toMatchObject({
    relationship: "self",
    contactId: null,
    friendRequest: null,
    identityCard: {
      entityType: "technician",
      profileId: 741,
      displayName: "Requester Technician",
    },
  });
  expect(contactFindFirst).not.toHaveBeenCalled();
  expect(friendRequestFindFirst).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the focused backend tests and verify RED**

Run:

```bash
npm --prefix backend test -- realtime-service.test.ts friend-request-lifecycle.repository.test.ts
```

Expected: FAIL because the Service throws `error.realtime.contact_self`, `DirectoryProfilePayload` excludes `self`, and the Repository does not select an identity by ID or short-circuit self relationships.

- [ ] **Step 4: Implement the minimal Service and Repository contract**

In `DirectoryProfilePayload`, add `self`:

```ts
relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
```

Add `id` to `DirectoryProfileUserRecord.identities` and the Prisma select:

```ts
identities: Array<{
  id: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
  isDefault: boolean;
}>;
```

```ts
identities: {
  where: { deletedAt: null, isActive: true },
  select: {
    id: true,
    type: true,
    scopeType: true,
    scopeId: true,
    displayName: true,
    isDefault: true,
  },
  orderBy: [{ isDefault: "desc" }, { id: "asc" }],
},
```

Pass the target identity into the identity-card builder:

```ts
private async buildDirectoryIdentityCard(
  user: DirectoryProfileUserRecord,
  targetIdentityId: number,
): Promise<DirectoryIdentityCardPayload> {
  const identity =
    user.identities.find((item) => item.id === targetIdentityId) ??
    user.identities.find((item) =>
      ["customer", "technician", "merchant", "merchant_owner", "merchant_staff"].includes(item.type),
    ) ??
    user.identities[0];
```

After loading `user` and building `identityCard`, return before Contact/FriendRequest reads:

```ts
const identityCard = await this.buildDirectoryIdentityCard(user, targetIdentityId);
if (viewerUserId === targetUserId && viewerIdentityId === targetIdentityId) {
  return {
    user: this.mapParticipant(user),
    identityCard,
    relationship: "self",
    contactId: null,
    friendRequest: null,
  };
}
```

Replace the Service self rejection with active-identity target selection:

```ts
public async getDirectoryProfile(auth: AuthenticatedAccessContext, targetUserId: number) {
  const scope = await this.resolvePersonalIdentityScope(auth);
  const targetIdentityId = auth.userId === targetUserId
    ? scope.identityId
    : await this.requireCanonicalTargetIdentity(targetUserId);
  const profile = await this.repository.getDirectoryProfile(
    auth.userId,
    scope.identityId,
    targetUserId,
    targetIdentityId,
  );
  if (!profile) {
    throw this.notFoundError("error.realtime.user_not_found");
  }
  return profile;
}
```

- [ ] **Step 5: Run the focused backend tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- realtime-service.test.ts friend-request-lifecycle.repository.test.ts
```

Expected: both suites PASS with zero failures.

- [ ] **Step 6: Commit the server contract**

```bash
git add backend/src/services/realtime.service.ts backend/src/repositories/realtime.repository.ts backend/tests/realtime-service.test.ts backend/tests/friend-request-lifecycle.repository.test.ts
git commit -m "feat(im): support self directory profiles"
```

---

### Task 2: Propagate `self` through OpenAPI and frontend formal types

**Files:**
- Modify: `backend/tests/openapi.test.ts:330-350`
- Modify: `backend/src/api/openapi.ts:1638-1660`
- Modify: `src/features/realtime/api.ts:135-142`
- Modify: `src/features/im/model.ts:92-98`
- Modify: `src/features/im/formal-api.test.ts:960-1032`

**Interfaces:**
- Consumes: server `DirectoryProfilePayload.relationship` from Task 1.
- Produces: `RealtimeDirectoryProfile.relationship` and frontend `DirectoryProfile.relationship` unions including `"self"`.

- [ ] **Step 1: Add failing OpenAPI and adapter expectations**

In `backend/tests/openapi.test.ts`, add:

```ts
expect(
  response.body.components.schemas.RealtimeDirectoryProfile.properties.relationship.enum,
).toEqual(["none", "friend", "incoming_pending", "outgoing_pending", "self"]);
```

In the existing formal DirectoryProfile adapter test, add a second API response and assertion:

```ts
getDirectoryProfile.mockResolvedValueOnce({
  user: {
    userId: 100,
    needoId: "u0000000100",
    username: "测试用户",
    avatarUrl: null,
  },
  relationship: "self",
  contactId: null,
  friendRequest: null,
  identityCard: {
    entityType: "user",
    profileId: 70,
    displayName: "测试用户",
    identityLabel: "free",
    verified: false,
    creditValue: null,
    creditReviewCount: 0,
    gender: null,
    age: null,
    heightCm: null,
    languages: [],
    city: null,
    serviceArea: null,
    yearsExperience: null,
    bio: null,
  },
});
await expect(api.getDirectoryProfile("100")).resolves.toMatchObject({
  user: { id: "100" },
  relationship: "self",
  contactId: undefined,
  friendRequest: undefined,
});
```

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```bash
npm --prefix backend test -- openapi.test.ts
npm test -- src/features/im/formal-api.test.ts
```

Expected: OpenAPI omits `self`; TypeScript rejects the mocked `self` response.

- [ ] **Step 3: Add `self` to each exact union**

Update all three contract locations:

```ts
// backend/src/api/openapi.ts
enum: ["none", "friend", "incoming_pending", "outgoing_pending", "self"]

// src/features/realtime/api.ts
relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";

// src/features/im/model.ts
relationship: "none" | "friend" | "incoming_pending" | "outgoing_pending" | "self";
```

The existing `formal-api.ts` mapping remains a direct pass-through and needs no production branch.

- [ ] **Step 4: Run the contract tests and verify GREEN**

Run:

```bash
npm --prefix backend test -- openapi.test.ts
npm test -- src/features/im/formal-api.test.ts src/features/realtime/api.test.ts
```

Expected: all selected suites PASS.

- [ ] **Step 5: Commit the shared contract**

```bash
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts src/features/realtime/api.ts src/features/im/model.ts src/features/im/formal-api.test.ts
git commit -m "feat(im): expose self contact profile state"
```

---

### Task 3: Resolve every identifiable chat avatar by represented account

**Files:**
- Modify: `src/features/im/friend-request-presentation.test.ts:1-125`
- Modify: `src/features/im/pages.test.ts:200-235`
- Modify: `src/features/im/role-config.ts:198-210`
- Modify: `src/features/im/pages.tsx:4998-5006,6228-6278,7220-7235,7355-7380,7615-7635`

**Interfaces:**
- Consumes: `ImRoleType`, `ImUser`, `getImRoleConfig(scope).routes.directoryProfile(user.id)`.
- Produces: `resolveImContactInformationPath(scope, user, profilesHidden?) => string | undefined`.

- [ ] **Step 1: Add failing pure routing tests**

Import the helper from `role-config` and append:

```ts
it("routes each identifiable avatar to that account's scoped contact information", () => {
  expect(resolveImContactInformationPath("user", profile.user)).toBe(
    "/contacts/directory/2",
  );
  expect(resolveImContactInformationPath("merchant", profile.user)).toBe(
    "/merchant/contacts/directory/2",
  );
  expect(resolveImContactInformationPath("technician", profile.user)).toBe(
    "/technician/contacts/directory/2",
  );
});

it("does not reveal unknown or privacy-hidden group identities", () => {
  expect(resolveImContactInformationPath("user", undefined)).toBeUndefined();
  expect(resolveImContactInformationPath("user", profile.user, true)).toBeUndefined();
});
```

- [ ] **Step 2: Add a failing source contract for message, owner, and member avatars**

In `src/features/im/pages.test.ts`, slice `ImConversationRoomPage` and `ImConversationInfoPage`, then assert:

```ts
expect(conversationRoomSource).toContain(
  "resolveImContactInformationPath(scope, user, hiddenMemberProfilesActive)",
);
expect(conversationInfoSource).toContain(
  "resolveImContactInformationPath(scope, groupOwner.user, hiddenMemberProfilesActive)",
);
expect(conversationInfoSource).toContain(
  "resolveImContactInformationPath(scope, user, hiddenMemberProfilesActive)",
);
expect(conversationInfoSource).not.toContain(
  "config.routes.conversationInfo(conversation.id)",
);
```

Name the test narrowly so the `not.toContain` slice covers only avatar-target assignments, not the unrelated accepted-friend transition elsewhere.

- [ ] **Step 3: Run the frontend routing tests and verify RED**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts
```

Expected: FAIL because `resolveImContactInformationPath` does not exist and avatar targets still use `resolveImProfilePath`.

- [ ] **Step 4: Implement the pure scoped helper**

Add to `role-config.ts`:

```ts
export function resolveImContactInformationPath(
  scope: ImRoleType,
  user?: ImUser,
  profilesHidden = false,
) {
  if (!user || profilesHidden) {
    return undefined;
  }

  return getImRoleConfig(scope).routes.directoryProfile(user.id);
}
```

- [ ] **Step 5: Replace only chat participant avatar targets**

Import the helper in `pages.tsx` and use it for:

```ts
const getConversationMemberProfilePath = (user?: ImUser) =>
  resolveImContactInformationPath(scope, user, hiddenMemberProfilesActive);

const groupOwnerProfilePath = groupOwner
  ? resolveImContactInformationPath(scope, groupOwner.user, hiddenMemberProfilesActive)
  : undefined;

const profilePath = resolveImContactInformationPath(
  scope,
  user,
  hiddenMemberProfilesActive,
);
```

Keep `MessageBubble avatarTo={senderProfilePath}` unchanged; its value now comes from the account-specific helper. Keep the group owner name and avatar on the same `groupOwnerProfilePath`.

- [ ] **Step 6: Run the routing tests and verify GREEN**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts src/features/im/components.action-menu.test.tsx
```

Expected: all selected suites PASS; message click/press behavior remains green.

- [ ] **Step 7: Commit avatar routing**

```bash
git add src/features/im/role-config.ts src/features/im/friend-request-presentation.test.ts src/features/im/pages.tsx src/features/im/pages.test.ts
git commit -m "fix(im): open contact information from chat avatars"
```

---

### Task 4: Render the authenticated account as read-only contact information

**Files:**
- Modify: `src/features/im/friend-request-presentation.test.ts:60-110`
- Modify: `src/features/im/pages.test.tsx:25-115`
- Modify: `src/features/im/pages.tsx:214-260,2700-2915`

**Interfaces:**
- Consumes: `DirectoryProfile.relationship === "self"` from Tasks 1-2.
- Produces: no relationship actions for `self`; identity card plus optional own-activity entry; no contact tags or direct-conversation redirect.

- [ ] **Step 1: Add failing presentation and page contracts**

Extend the action resolver test:

```ts
expect(
  resolveDirectoryProfileActions(
    { ...profile, relationship: "self", user: { ...profile.user, id: "1" } },
    null,
    "1",
  ),
).toEqual([]);
```

Add a source contract around `ImDirectoryProfilePage`:

```tsx
expect(profileSource).toContain('const isSelfProfile = profile?.relationship === "self"');
expect(profileSource).toContain("!isSelfProfile");
expect(profileSource).toContain("profile && !isFriendProfile && !isSelfProfile");
expect(profileSource).toContain("<ConversationIdentityProfileCard");
expect(profileSource).toContain("{!isSelfProfile ? (");
```

The `!isSelfProfile` guarded block must be the contact-tag section, while `ImContactActivityEntry` remains outside it.

- [ ] **Step 2: Run the focused presentation tests and verify RED**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.tsx
```

Expected: FAIL because the `self` union/page branch is not explicitly handled.

- [ ] **Step 3: Implement the minimal read-only `self` rendering**

Update the action resolver first guard:

```ts
if (profile.relationship === "friend" || profile.relationship === "self") {
  return [];
}
```

Add the derived state:

```ts
const isSelfProfile = profile?.user.id === userId && profile?.relationship === "self";
```

Keep the redirect effect friend-only. In the normal identity-card content, wrap the contact tag section:

```tsx
{!isSelfProfile ? (
  <section className="rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_66%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-5 py-4">
    <h2 className="text-[15px] font-black text-[color:var(--client-text)]">{t("标签")}</h2>
    <p className="mt-3 text-sm font-semibold text-[color:var(--client-muted)]">{t("还没有添加标签")}</p>
  </section>
) : null}
```

Keep the activity entry after this guard. Restrict the bottom relationship action bar:

```tsx
{profile && !isFriendProfile && !isSelfProfile ? (
  <ImFriendProfileActionBar ... />
) : null}
```

- [ ] **Step 4: Run the presentation tests and verify GREEN**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.tsx
```

Expected: both suites PASS.

- [ ] **Step 5: Commit the self page**

```bash
git add src/features/im/pages.tsx src/features/im/pages.test.tsx src/features/im/friend-request-presentation.test.ts
git commit -m "feat(im): show read-only self contact information"
```

---

### Task 5: Verify the full micro-change and perform browser acceptance

**Files:**
- Verify: all files modified in Tasks 1-4

**Interfaces:**
- Consumes: completed server contract, shared types, avatar resolver, and self page.
- Produces: fresh automated, build, diff, and browser evidence for the approved behavior.

- [ ] **Step 1: Run the complete focused backend regression set**

Run:

```bash
npm --prefix backend test -- realtime-service.test.ts friend-request-lifecycle.repository.test.ts realtime-api.test.ts openapi.test.ts
```

Expected: all selected backend suites PASS with zero failures.

- [ ] **Step 2: Run the complete focused frontend regression set**

Run:

```bash
npm test -- src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/formal-api.test.ts src/features/realtime/api.test.ts
```

Expected: all selected frontend suites PASS with zero failures.

- [ ] **Step 3: Run static verification and formal builds**

Run:

```bash
npm --prefix backend run build
npm run lint
npm run verify:production-build
git diff --check HEAD~4..HEAD
```

Expected: all commands exit 0. If unrelated dirty schedule work affects lint/build, record the exact file and do not modify it.

- [ ] **Step 4: Inspect the final scope**

Run:

```bash
git status --short
git log -5 --oneline --decorate
git diff HEAD~4..HEAD -- backend/src/services/realtime.service.ts backend/src/repositories/realtime.repository.ts backend/src/api/openapi.ts backend/tests/realtime-service.test.ts backend/tests/friend-request-lifecycle.repository.test.ts backend/tests/openapi.test.ts src/features/realtime/api.ts src/features/im/model.ts src/features/im/role-config.ts src/features/im/pages.tsx src/features/im/friend-request-presentation.test.ts src/features/im/pages.test.ts src/features/im/pages.test.tsx src/features/im/formal-api.test.ts
```

Expected: implementation commits contain only the approved server contract, avatar routing, self rendering, and tests; unrelated dirty files remain uncommitted and unchanged by this plan.

- [ ] **Step 5: Perform read-only formal browser acceptance**

At a mobile viewport, against the formal local runtime and an already-existing account/conversation cohort:

1. In a one-to-one chat, click the incoming avatar and confirm the other account's full contact information opens.
2. Click the outgoing/current-account avatar and confirm the read-only self contact information opens, without friend/contact/conversation controls.
3. In a group chat, click at least two distinct member message avatars and confirm each opens that member's contact information, never the group settings page.
4. Open group information and repeat for the group owner and member-grid avatars.
5. If an existing privacy-hidden group is available, confirm anonymous avatars have no navigation target.
6. Verify back navigation, refresh, route prefixes for available user/merchant/technician sessions, no horizontal overflow, and no new console errors.

Do not create or mutate database/browser business data just to manufacture missing acceptance states. Record any unavailable role/privacy scenario as not browser-verified.

- [ ] **Step 6: Report completion boundaries**

Report separately:

- source changes and commits;
- focused automated test counts;
- backend/frontend build results;
- which browser scenarios were actually verified;
- any scenario blocked by missing existing data/runtime;
- no push/deployment/database-write claim.
