# IM Quick Response Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one of eight SVG judgement replies plus one emoji reply per user per message, and unify the message-action and composer catalogs around shared recent, judgement, and general sections.

**Architecture:** Keep `MessageReaction.emoji` as the persisted value and classify the eight specified word values into the judgement slot. A shared frontend catalog/store supplies device-local recent values and the three ordered sections to both entry points, while an SVG renderer gives judgement values one compact visual identity. The repository serializes mutations with the existing message-row lock; React remains server-authoritative for reactions and only records a reaction as recent after REST success.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/JSDOM, Node.js 22, Express, Prisma, MySQL 8, Jest/Supertest, OpenAPI.

## Global Constraints

- Implement only the approved design in `docs/superpowers/specs/2026-08-30-im-quick-response-slots-design.md`; do not add a third slot or direct replacement behavior.
- Judgement values are exactly `OK`, `NO`, `Pending`, `+1`, `Done`, `Cool`, `Good`, and `Thanks`, preserving case.
- The compact action row mixes recent judgement and emoji values in one row and keeps “more” at the end; expanded order is “常用表情”, “判断表情”, “一般表情”.
- The composer uses the same catalog and SVGs; a judgement inserts its text while an emoji inserts its Unicode value.
- Preserve the current React/Vite frontend, formal REST API, Prisma repository layering, SSE transport, and `reactionVersion` conflict protection.
- Do not add mock data, local-only reaction state, placeholder code, `TODO`, or `FIXME`.
- Preserve other users' reactions and all unrelated worktree changes. Before every commit run `git status --short`, then stage only the files named in that task.
- Re-read the tail of `backend/src/constants/error-codes.ts` before implementation; use `40946` only if it is still the next free conflict code, and keep tests/OpenAPI synchronized if a concurrent change has claimed it.
- The selected reply remains active and clickable; only the other replies in the same category become gray and natively disabled.
- Disabled buttons must not invoke `onReact`, the store, or the API.
- Do not optimistically insert or remove reaction summaries. REST/SSE responses are authoritative; failures keep the last confirmed state.
- Do not push, deploy, modify production data, or apply migrations to a database whose migration history has not been reconciled.
- Use test-driven development: add the failing assertion, run it and observe the expected failure, implement the smallest change, then rerun it.

---

## Task 1: Define the eight-value policy and shared recent catalog

**Files:**

- Create: `backend/src/constants/message-reaction.constants.ts`
- Create: `backend/tests/message-reaction-policy.test.ts`
- Create: `src/features/im/reaction-policy.ts`
- Create: `src/features/im/reaction-policy.test.ts`
- Create: `src/features/im/reaction-catalog.ts`
- Create: `src/features/im/reaction-catalog.test.ts`
- Reuse: `src/features/im/emoji.ts`

**Interfaces:**

- Produces: `MESSAGE_JUDGEMENT_REACTIONS`, `getMessageReactionCategory`, and `compareMessageReactionCategories` for repository and service code.
- Produces: `IM_JUDGEMENT_REPLIES`, `getImReactionCategory`, `deriveCurrentUserReactionSlots`, and `isImReactionChoiceDisabled` for UI state.
- Produces: `getRecentImReactionSnapshot()`, `subscribeRecentImReactions(listener)`, and `recordRecentImReaction(value)` for both catalog entry points.

- [ ] **Step 1: Add failing backend policy tests**

Create `backend/tests/message-reaction-policy.test.ts` with assertions for all eight judgement values, representative emoji values, and category ordering:

```ts
import {
  compareMessageReactionCategories,
  getMessageReactionCategory,
  MESSAGE_JUDGEMENT_REACTIONS
} from "../src/constants/message-reaction.constants";

describe("message reaction policy", () => {
  it.each(["OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"])("classifies %s as judgement", (value) => {
    expect(getMessageReactionCategory(value)).toBe("judgement");
  });

  it.each(["😂", "👍", "❤️"])("classifies %s as emoji", (value) => {
    expect(getMessageReactionCategory(value)).toBe("emoji");
  });

  it("keeps the contract values and judgement-first order stable", () => {
    expect(MESSAGE_JUDGEMENT_REACTIONS).toEqual([
      "OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"
    ]);
    expect(["😂", "Thanks", "OK"].sort(compareMessageReactionCategories))
      .toEqual(["Thanks", "OK", "😂"]);
  });
});
```

- [ ] **Step 2: Run the backend test and confirm the missing-module failure**

Run:

```bash
npm test -- --runInBand tests/message-reaction-policy.test.ts
```

Working directory: `backend`

Expected: FAIL because `message-reaction.constants.ts` does not exist.

- [ ] **Step 3: Implement the backend policy**

Create `backend/src/constants/message-reaction.constants.ts`:

```ts
export const MESSAGE_JUDGEMENT_REACTIONS = [
  "OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"
] as const;

export type MessageReactionCategory = "judgement" | "emoji";

const judgementReactionSet = new Set<string>(MESSAGE_JUDGEMENT_REACTIONS);

export function getMessageReactionCategory(value: string): MessageReactionCategory {
  return judgementReactionSet.has(value) ? "judgement" : "emoji";
}

export function compareMessageReactionCategories(left: string, right: string): number {
  return Number(getMessageReactionCategory(left) === "emoji")
    - Number(getMessageReactionCategory(right) === "emoji");
}
```

- [ ] **Step 4: Add failing frontend policy and catalog tests**

Create `src/features/im/reaction-policy.test.ts` covering classification, current-user slot derivation, disabling, and stable judgement-first ordering:

```ts
import { describe, expect, it } from "vitest";
import {
  deriveCurrentUserReactionSlots,
  getImReactionCategory,
  isImReactionChoiceDisabled,
  sortImReactionSummaries
} from "./reaction-policy";

describe("IM reaction policy", () => {
  it("derives one independent judgement and emoji slot", () => {
    expect(deriveCurrentUserReactionSlots({
      OK: [{ id: "7" }],
      "😂": [{ id: "7" }],
      "👍": [{ id: "8" }]
    }, "7")).toEqual({ judgement: "OK", emoji: "😂" });
  });

  it("disables only unselected values in an occupied category", () => {
    expect(isImReactionChoiceDisabled("NO", "OK", false)).toBe(true);
    expect(isImReactionChoiceDisabled("OK", "OK", false)).toBe(false);
    expect(isImReactionChoiceDisabled("😂", undefined, false)).toBe(false);
    expect(isImReactionChoiceDisabled("OK", "OK", true)).toBe(true);
  });

  it("orders judgement summaries before emoji summaries", () => {
    expect(sortImReactionSummaries([{ emoji: "😂" }, { emoji: "Thanks" }]))
      .toEqual([{ emoji: "Thanks" }, { emoji: "😂" }]);
    expect(getImReactionCategory("+1")).toBe("judgement");
  });
});
```

Create `src/features/im/reaction-catalog.test.ts` and use `vi.resetModules()` plus localStorage so the test exercises the real module state:

```ts
it("migrates legacy recent emojis and mixes new judgement usage at the front", async () => {
  window.localStorage.setItem(
    "needo.im.recent-emojis.v1",
    JSON.stringify(["😂", "👍"])
  );
  const catalog = await import("./reaction-catalog");

  expect(catalog.getRecentImReactionSnapshot().slice(0, 2)).toEqual(["😂", "👍"]);
  expect(JSON.parse(window.localStorage.getItem("needo.im.recent-reactions.v2") ?? "[]").slice(0, 2))
    .toEqual(["😂", "👍"]);
  catalog.recordRecentImReaction("Thanks");
  expect(catalog.getRecentImReactionSnapshot().slice(0, 3))
    .toEqual(["Thanks", "😂", "👍"]);
  expect(JSON.parse(window.localStorage.getItem("needo.im.recent-reactions.v2") ?? "[]"))
    .toEqual(catalog.getRecentImReactionSnapshot());
});

it("keeps only eight valid unique judgement-or-emoji values", async () => {
  window.localStorage.setItem(
    "needo.im.recent-reactions.v2",
    JSON.stringify(["bad", "OK", "OK", "😂", "NO", "👍", "Done", "Cool", "Good", "Thanks", "❤️"])
  );
  const catalog = await import("./reaction-catalog");
  expect(catalog.getRecentImReactionSnapshot()).toEqual([
    "OK", "😂", "NO", "👍", "Done", "Cool", "Good", "Thanks"
  ]);
});
```

- [ ] **Step 5: Run the frontend test and confirm the missing-module failure**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts
```

Expected: FAIL because `reaction-policy.ts` and `reaction-catalog.ts` do not exist.

- [ ] **Step 6: Implement the frontend policy, recent store, and drift guard**

Create `src/features/im/reaction-policy.ts` with the same eight judgement values. Keep helpers pure so both the action sheet and room page use one rule:

```ts
export const IM_JUDGEMENT_REPLIES = [
  "OK", "NO", "Pending", "+1", "Done", "Cool", "Good", "Thanks"
] as const;
export type ImReactionCategory = "judgement" | "emoji";

export const getImReactionCategory = (value: string): ImReactionCategory =>
  (IM_JUDGEMENT_REPLIES as readonly string[]).includes(value) ? "judgement" : "emoji";
```

Implement `deriveCurrentUserReactionSlots`, `isImReactionChoiceDisabled`, and a stable `sortImReactionSummaries`.

Create `src/features/im/reaction-catalog.ts` as a tiny external-store module:

```ts
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { IM_COMMON_EMOJIS, loadRecentImEmojis } from "./emoji";
import { IM_JUDGEMENT_REPLIES } from "./reaction-policy";

export const IM_RECENT_REACTION_LIMIT = 8;
export const IM_RECENT_REACTION_STORAGE_KEY = "needo.im.recent-reactions.v2";

const allowed = new Set<string>([...IM_JUDGEMENT_REPLIES, ...IM_COMMON_EMOJIS]);
const listeners = new Set<() => void>();

const normalize = (values: readonly unknown[]) => {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && allowed.has(value) && !result.includes(value)) {
      result.push(value);
    }
    if (result.length === IM_RECENT_REACTION_LIMIT) break;
  }
  for (const fallback of loadRecentImEmojis()) {
    if (!result.includes(fallback)) result.push(fallback);
    if (result.length === IM_RECENT_REACTION_LIMIT) break;
  }
  return result;
};

const storedRecent = parseBrowserStorageJson<unknown[]>(
  IM_RECENT_REACTION_STORAGE_KEY,
  [],
  { removeOnError: true, silent: true }
);
let recent = normalize(storedRecent);
if (storedRecent.length === 0) {
  writeBrowserStorage(IM_RECENT_REACTION_STORAGE_KEY, JSON.stringify(recent), { silent: true });
}

export const getRecentImReactionSnapshot = () => recent;
export const subscribeRecentImReactions = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const recordRecentImReaction = (value: string) => {
  if (!allowed.has(value)) return recent;
  recent = normalize([value, ...recent.filter((item) => item !== value)]);
  writeBrowserStorage(IM_RECENT_REACTION_STORAGE_KEY, JSON.stringify(recent), { silent: true });
  listeners.forEach((listener) => listener());
  return recent;
};
```

Add a backend drift test that reads `src/features/im/reaction-policy.ts` and asserts all eight values exactly. This remains compile-independent because backend and frontend have separate TypeScript roots.

- [ ] **Step 7: Run the focused policy tests**

Run:

```bash
npm --prefix backend test -- --runInBand tests/message-reaction-policy.test.ts
npm test -- src/features/im/reaction-policy.test.ts src/features/im/reaction-catalog.test.ts
```

Working directory: repository root. Expected: both PASS.

- [ ] **Step 8: Commit the contract**

```bash
git add backend/src/constants/message-reaction.constants.ts backend/tests/message-reaction-policy.test.ts src/features/im/reaction-policy.ts src/features/im/reaction-policy.test.ts src/features/im/reaction-catalog.ts src/features/im/reaction-catalog.test.ts
git commit -m "feat: define IM reaction slot policy"
```

---

## Task 2: Enforce slots atomically in the repository

**Files:**

- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/tests/im-message-reaction.repository.test.ts`

**Interfaces:**

- Consumes: Task 1 backend category helpers.
- Produces: `MessageReactionMutationOutcome` for both PUT and DELETE service paths.

- [ ] **Step 1: Rewrite the repository test fixture for active, soft-deleted, and concurrent reactions**

Extend the fixture's `messageReaction` mock with `findMany`, make `updateMany` actually remove the exact active value from the committed snapshot, and model `message.findUnique` after the row lock. Replace the old expectation that two same-user emojis both survive.

Add failing tests for:

```ts
it("allows one judgement and one emoji for the same user");
it("returns slot_occupied for a second different emoji and preserves the first");
it("returns unchanged for the same-value PUT without incrementing reactionVersion");
it("allows a new same-category value after the selected value is removed");
it("lets only one of two concurrent same-category values occupy the slot");
it("keeps another user's reaction untouched");
```

The concurrency assertion must accept either contender as the winner but require exactly one `updated` and one `slot_occupied` outcome.

- [ ] **Step 2: Run the repository test and observe the old multiple-emoji behavior fail**

Run:

```bash
npm test -- --runInBand tests/im-message-reaction.repository.test.ts
```

Working directory: `backend`

Expected: FAIL because `setMessageReaction` still always upserts and returns `MessagePayload | null`.

- [ ] **Step 3: Add explicit repository mutation outcomes**

In `backend/src/repositories/realtime.repository.ts`, define and use:

```ts
export type MessageReactionMutationOutcome =
  | { status: "updated"; message: MessagePayload }
  | { status: "unchanged"; message: MessagePayload }
  | { status: "slot_occupied"; message: MessagePayload; activeEmoji: string }
  | { status: "not_found" };
```

Update both reaction methods in `RealtimeRepositoryPort` to return this outcome. Do not move business HTTP errors into the repository.

- [ ] **Step 4: Implement the locked slot check**

Inside the existing transaction and after `lockMessageForParticipant`:

```ts
const activeReactions = await tx.messageReaction.findMany({
  where: {
    messageId: input.messageId,
    userId: input.userId,
    deletedAt: null
  },
  select: { emoji: true },
  orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
});
const category = getMessageReactionCategory(input.emoji);
const activeInSlot = activeReactions.find(
  (reaction) => getMessageReactionCategory(reaction.emoji) === category
);
```

Then apply these exact branches:

- same value: load/map the current message and return `unchanged`; do not increment `reactionVersion`;
- different value in the same category: load/map the current message and return `slot_occupied`; do not write;
- empty category: revive/upsert the requested value, increment `reactionVersion`, return `updated`;
- exact DELETE with `updateMany.count === 0`: return `unchanged` without a version increment;
- exact DELETE with `count > 0`: increment `reactionVersion` and return `updated`.

Use the already locked transaction for every read and write. Never remove a different value just because it belongs to the same category.

- [ ] **Step 5: Make authoritative summaries judgement-first**

In `mapMessage`, sort the aggregated reaction entries with `compareMessageReactionCategories`. The comparator returns zero within a category, so the existing `id ASC` source order remains stable.

- [ ] **Step 6: Run the focused repository tests**

Run:

```bash
npm test -- --runInBand tests/im-message-reaction.repository.test.ts
```

Expected: PASS, including only one winner for concurrent same-category requests and two successes for different categories.

- [ ] **Step 7: Commit atomic repository enforcement**

```bash
git add backend/src/repositories/realtime.repository.ts backend/tests/im-message-reaction.repository.test.ts
git commit -m "feat: enforce per-message reaction slots"
```

---

## Task 3: Expose idempotence and occupied-slot errors through the formal API

**Files:**

- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`

**Interfaces:**

- Consumes: Task 2 `MessageReactionMutationOutcome`.
- Produces: formal 200/409 reaction API behavior and `error.im.reaction_slot_occupied`.

- [ ] **Step 1: Add failing service tests for all repository outcomes**

Update the reaction repository mock to return `MessageReactionMutationOutcome`. Assert:

- `updated` returns the message and publishes one `message.reaction.updated` event;
- `unchanged` returns the message and publishes no event;
- `slot_occupied` throws `AppError` with status 409, code `MESSAGE_REACTION_SLOT_OCCUPIED`, and message `error.im.reaction_slot_occupied`;
- `not_found` retains the existing 404 behavior.

- [ ] **Step 2: Add failing Supertest API cases**

Extend `backend/tests/realtime-api.test.ts` so a single real test user:

1. PUTs `OK` and `😂`, both 200;
2. PUTs `NO`, receives 409 with `{ code: 40946, message: "error.im.reaction_slot_occupied", data: null }`;
3. reloads messages and still has only `OK` plus `😂` for that user;
4. PUTs `OK` again, receives 200 without a version change;
5. DELETEs `OK`, PUTs `NO`, and receives the authoritative `NO` plus `😂` aggregate.

Keep the existing test proving that different users can use the same emoji.

- [ ] **Step 3: Run service/API tests and observe failures**

Run:

```bash
npm test -- --runInBand tests/realtime-service.test.ts tests/realtime-api.test.ts
```

Working directory: `backend`

Expected: FAIL because the service does not yet interpret repository outcomes.

- [ ] **Step 4: Add and map the 409 business error**

Add the next non-conflicting code to `backend/src/constants/error-codes.ts`:

```ts
MESSAGE_REACTION_SLOT_OCCUPIED: 40946,
```

Handle the repository result in `RealtimeService.setMessageReaction`:

```ts
if (outcome.status === "not_found") {
  throw this.notFoundError("error.realtime.message_not_found");
}
if (outcome.status === "slot_occupied") {
  throw new AppError({
    code: ERROR_CODES.MESSAGE_REACTION_SLOT_OCCUPIED,
    message: "error.im.reaction_slot_occupied",
    statusCode: 409
  });
}
if (outcome.status === "updated") {
  await this.publishToConversation(
    input.conversationId,
    "message.reaction.updated",
    outcome.message,
    auth.userId
  );
}
return outcome.message;
```

Use the same `updated`/`unchanged`/`not_found` handling for DELETE, without a slot-conflict branch.

- [ ] **Step 5: Document the two-slot contract and 409 response**

Change the PUT summary to “Set the current user's reaction in its IM reply category”. Document the judgement enum in the description, the one-judgement/one-emoji rule, idempotent same-value PUT, and a 409 response. Keep request validation at 1–32 characters and do not reject valid non-judgement emoji.

Update `backend/tests/openapi.test.ts` to assert the PUT responses include `200`, `400`, `401`, `403`, `404`, and `409`.

- [ ] **Step 6: Run focused service, API, and OpenAPI tests**

Run:

```bash
npm test -- --runInBand tests/realtime-service.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the API behavior**

```bash
git add backend/src/constants/error-codes.ts backend/src/services/realtime.service.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts backend/src/api/openapi.ts backend/tests/openapi.test.ts
git commit -m "feat: expose IM reaction slot conflicts"
```

---

## Task 4: Soft-clean historical duplicate slots and add a read-only checker

**Files:**

- Create: `backend/prisma/migrations/20260830090000_message_reaction_slots/migration.sql`
- Create: `backend/prisma/migrations/20260830090000_message_reaction_slots/rollback.sql`
- Create: `backend/tests/message-reaction-slots-migration.test.ts`
- Create: `backend/scripts/check-message-reaction-slots.ts`
- Modify: `backend/package.json`

**Interfaces:**

- Consumes: the exact eight-value classification from Task 1, duplicated literally in deploy SQL.
- Produces: deterministic soft cleanup, explicit rollback SQL, and read-only `check:message-reaction-slots`.

- [ ] **Step 1: Add a failing migration contract test**

The test must assert that the migration:

- partitions by `message_id`, `user_id`, and the category `CASE` expression;
- ranks by `updated_at DESC, id DESC`;
- targets only `deleted_at IS NULL` rows;
- sets `deleted_at` and `updated_at` rather than deleting rows;
- writes an `audit_logs` snapshot for every affected reaction ID before mutation;
- contains no `DELETE FROM message_reactions`.

- [ ] **Step 2: Run the migration test and confirm the missing-file failure**

Run:

```bash
npm test -- --runInBand tests/message-reaction-slots-migration.test.ts
```

Working directory: `backend`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write the data-only migration**

Create the migration with a MySQL 8 window query. First insert one recoverable audit snapshot per stale row:

```sql
SET @message_reaction_slot_cleanup_at = CURRENT_TIMESTAMP(3);

INSERT INTO `audit_logs` (
  `actor_id`, `action`, `target_type`, `target_id`,
  `ip`, `user_agent`, `metadata`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  NULL,
  'migration.im.reaction_slot_cleanup',
  'MessageReaction',
  stale.`id`,
  NULL,
  NULL,
  JSON_OBJECT(
    'migration', '20260830090000_message_reaction_slots',
    'previousUpdatedAt', DATE_FORMAT(stale.`updated_at`, '%Y-%m-%dT%H:%i:%s.%fZ')
  ),
  @message_reaction_slot_cleanup_at,
  @message_reaction_slot_cleanup_at,
  NULL
FROM (
  SELECT `id`, `updated_at`
  FROM (
    SELECT
      `id`,
      `updated_at`,
      ROW_NUMBER() OVER (
        PARTITION BY
          `message_id`,
          `user_id`,
          CASE
            WHEN `emoji` IN ('OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks') THEN 'judgement'
            ELSE 'emoji'
          END
        ORDER BY `updated_at` DESC, `id` DESC
      ) AS `reaction_rank`
    FROM `message_reactions`
    WHERE `deleted_at` IS NULL
  ) AS ranked_reactions
  WHERE `reaction_rank` > 1
) AS stale;
```

Then soft-delete exactly the IDs recorded by this migration:

```sql
UPDATE `message_reactions` AS duplicate
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = duplicate.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
SET
  duplicate.`deleted_at` = @message_reaction_slot_cleanup_at,
  duplicate.`updated_at` = @message_reaction_slot_cleanup_at;
```

This is intentionally a soft cleanup. Join the UPDATE back to the active audit rows with the exact migration name, so the audit snapshot is the rollback authority. Do not add a misleading exact-emoji unique constraint as a substitute for category enforcement; the existing exact-value uniqueness and application row lock serve different purposes.

- [ ] **Step 4: Add an exact rollback artifact**

Create `rollback.sql` in the same migration directory. It must use the audit timestamp guard so a reaction changed again after migration is not overwritten:

```sql
-- WARNING: run only while rolling back the matching application enforcement.
UPDATE `message_reactions` AS reaction
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = reaction.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
  AND reaction.`deleted_at` = cleanup.`created_at`
  AND reaction.`updated_at` = cleanup.`created_at`
SET
  reaction.`deleted_at` = NULL,
  reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  );

UPDATE `audit_logs` AS cleanup
JOIN `message_reactions` AS reaction
  ON reaction.`id` = cleanup.`target_id`
  AND reaction.`deleted_at` IS NULL
  AND reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  )
SET cleanup.`deleted_at` = CURRENT_TIMESTAMP(3),
    cleanup.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL;
```

It must:

1. restore only `message_reactions.id` values recorded under `migration.im.reaction_slot_cleanup` and migration name `20260830090000_message_reaction_slots`;
2. set `deleted_at = NULL` and restore the recorded `previousUpdatedAt` value;
3. soft-delete the consumed cleanup audit rows rather than deleting them;
4. include a warning that it reintroduces the pre-migration multi-reaction state and must be run only when the application enforcement is also rolled back.

The migration contract test must inspect both files and prove that the rollback scopes by action, migration name, and target ID. Prisma must not execute `rollback.sql` during deploy; it is an explicit operator recovery artifact.

- [ ] **Step 5: Add a read-only database checker**

Create `backend/scripts/check-message-reaction-slots.ts`. It must query active rows grouped by the same category expression and return non-zero if any `messageId + userId + category` count exceeds one:

```ts
const duplicates = await prisma.$queryRaw<Array<{
  messageId: number;
  userId: number;
  category: "judgement" | "emoji";
  activeCount: bigint;
}>>`
  SELECT
    message_id AS messageId,
    user_id AS userId,
    CASE WHEN emoji IN ('OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks') THEN 'judgement' ELSE 'emoji' END AS category,
    COUNT(*) AS activeCount
  FROM message_reactions
  WHERE deleted_at IS NULL
  GROUP BY message_id, user_id, category
  HAVING COUNT(*) > 1
`;
```

Print a compact JSON result and always disconnect Prisma. Add:

```json
"check:message-reaction-slots": "ENV_FILE=.env.dev tsx scripts/check-message-reaction-slots.ts"
```

- [ ] **Step 6: Run static tests, then audit migration safety before any local apply**

Run:

```bash
npm test -- --runInBand tests/message-reaction-slots-migration.test.ts
npm run prisma:status
npm run check:message-reaction-slots
```

Working directory: `backend`. The checker may intentionally return non-zero before cleanup if historical duplicate slots exist; record that baseline instead of masking it.

If and only if migration status, `_prisma_migrations`, actual tables, and the list of pending repository migrations are reconciled, apply through Prisma and rerun the read-only checker:

```bash
npm run prisma:migrate:deploy
npm run check:message-reaction-slots
```

Expected: the static test passes and, after a safe apply, the checker reports no duplicate active slots. Do **not** run `prisma migrate deploy` if repository migrations, `_prisma_migrations`, or actual schema are inconsistent, or if unrelated pending migrations would be applied. Stop and report that dependency instead of forcing this migration.

- [ ] **Step 7: Commit migration and checker**

```bash
git add backend/prisma/migrations/20260830090000_message_reaction_slots/migration.sql backend/prisma/migrations/20260830090000_message_reaction_slots/rollback.sql backend/tests/message-reaction-slots-migration.test.ts backend/scripts/check-message-reaction-slots.ts backend/package.json
git commit -m "feat: reconcile historical IM reaction slots"
```

---

## Task 5: Create the compact SVG judgement icon system

**Files:**

- Create: `src/assets/im/judgement-reactions/ok.svg`
- Create: `src/assets/im/judgement-reactions/no.svg`
- Create: `src/assets/im/judgement-reactions/pending.svg`
- Create: `src/assets/im/judgement-reactions/plus-one.svg`
- Create: `src/assets/im/judgement-reactions/done.svg`
- Create: `src/assets/im/judgement-reactions/cool.svg`
- Create: `src/assets/im/judgement-reactions/good.svg`
- Create: `src/assets/im/judgement-reactions/thanks.svg`
- Create: `src/features/im/JudgementReactionIcon.tsx`
- Create: `src/features/im/JudgementReactionIcon.test.tsx`

**Interfaces:**

- Consumes: `IM_JUDGEMENT_REPLIES` and `getImReactionCategory` from Task 1.
- Produces: `JudgementReactionIcon({ value, className? })` and `ImReactionValue({ value, className? })` for action buttons, composer buttons, and message summaries.

- [ ] **Step 1: Write failing SVG renderer tests**

Create `JudgementReactionIcon.test.tsx` and render all eight values. Assert each produces an `<img>` with an SVG URL, accessible label, compact class, and no black background. Assert `ImReactionValue` renders an SVG for `Thanks` but literal Unicode for `😂`:

```tsx
it.each(IM_JUDGEMENT_REPLIES)("renders the dedicated %s SVG", async (value) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<JudgementReactionIcon value={value} />));
  const image = container.querySelector("img");
  expect(image?.getAttribute("src")).toMatch(/\.svg/);
  expect(image?.getAttribute("alt")).toBe(value);
  expect(image?.className).toContain("max-h-[26px]");
  expect(container.innerHTML).not.toContain("bg-black");
  await act(async () => root.unmount());
});
```

- [ ] **Step 2: Run the renderer test and observe the missing module**

Run:

```bash
npm test -- src/features/im/JudgementReactionIcon.test.tsx
```

Expected: FAIL because the renderer and SVG files do not exist.

- [ ] **Step 3: Add eight explicit transparent SVG assets**

Each SVG uses `viewBox="0 0 WIDTH 28"`, transparent background, bold italic system text, a same-hue dark stroke, and a subtle same-hue shadow. Use these exact identities:

| File | Text | Width | Fill | Stroke |
|---|---:|---:|---|---|
| `ok.svg` | OK | 42 | `#22C55E` | `#15803D` |
| `no.svg` | NO | 42 | `#EF4444` | `#B91C1C` |
| `pending.svg` | Pending | 82 | `#F59E0B` | `#B45309` |
| `plus-one.svg` | +1 | 42 | `#3B82F6` | `#1D4ED8` |
| `done.svg` | Done | 58 | `#16A34A` | `#166534` |
| `cool.svg` | Cool | 54 | `#06B6D4` | `#0E7490` |
| `good.svg` | Good | 58 | `#A855F7` | `#7E22CE` |
| `thanks.svg` | Thanks | 74 | `#F97316` | `#C2410C` |

Use this complete structure for every file, substituting the table values and a unique filter id:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 28" role="img" aria-label="OK">
  <defs>
    <filter id="ok-shadow" x="-20%" y="-30%" width="150%" height="170%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="0.8" flood-color="#15803D" flood-opacity="0.52"/>
    </filter>
  </defs>
  <text x="50%" y="20" text-anchor="middle" fill="#22C55E" stroke="#15803D"
    stroke-width="0.65" paint-order="stroke" filter="url(#ok-shadow)"
    font-family="Arial Black, Arial, sans-serif" font-size="19" font-style="italic" font-weight="900">OK</text>
</svg>
```

The implementation must contain no raster screenshots, embedded script, external URL, or black rectangle.

- [ ] **Step 4: Implement the typed icon map and shared value renderer**

Create `JudgementReactionIcon.tsx` with eight static imports and this exhaustive map:

```tsx
const judgementIconUrl: Record<(typeof IM_JUDGEMENT_REPLIES)[number], string> = {
  OK: okIcon,
  NO: noIcon,
  Pending: pendingIcon,
  "+1": plusOneIcon,
  Done: doneIcon,
  Cool: coolIcon,
  Good: goodIcon,
  Thanks: thanksIcon
};

export function JudgementReactionIcon({ value, className }: {
  value: (typeof IM_JUDGEMENT_REPLIES)[number];
  className?: string;
}) {
  return <img alt={value} className={cn("block h-auto max-h-[26px] max-w-full", className)} src={judgementIconUrl[value]} />;
}

export function ImReactionValue({ value, className }: { value: string; className?: string }) {
  return getImReactionCategory(value) === "judgement"
    ? <JudgementReactionIcon className={className} value={value as (typeof IM_JUDGEMENT_REPLIES)[number]} />
    : <span className={className}>{value}</span>;
}
```

- [ ] **Step 5: Run renderer and asset-safety checks**

Run:

```bash
npm test -- src/features/im/JudgementReactionIcon.test.tsx
rg -L '<svg' src/assets/im/judgement-reactions/*.svg
rg -n 'script|https?://|<rect[^>]+fill="(#000|black)' src/assets/im/judgement-reactions/*.svg
```

Expected: test PASS; both asset scans print nothing.

- [ ] **Step 6: Commit the SVG system**

```bash
git add src/assets/im/judgement-reactions src/features/im/JudgementReactionIcon.tsx src/features/im/JudgementReactionIcon.test.tsx
git commit -m "feat: add compact IM judgement icons"
```

---

## Task 6: Build one recent-first catalog for action sheet and composer

**Files:**

- Create: `src/features/im/ReactionCatalog.tsx`
- Create: `src/features/im/ReactionCatalog.test.tsx`
- Modify: `src/features/im/components.tsx`
- Modify: `src/features/im/components.action-menu.test.tsx`
- Modify: `src/features/im/components.composer.test.tsx`

**Interfaces:**

- Consumes: Task 1 recent store/policy and Task 5 `ImReactionValue`.
- Produces: `ReactionCatalog` with compact/expanded variants, optional reaction-slot state, and `onSelect(value)`.

- [ ] **Step 1: Add failing shared catalog DOM tests**

Create `ReactionCatalog.test.tsx`. Render recent values `Thanks`, `😂`, and `OK`. Assert compact mode renders one mixed `data-im-reaction-section="common"` row in recent order with a more button at the end, but no judgement/general headings. Assert expanded mode renders headings in the exact order `常用表情`, `判断表情`, `一般表情`, includes all eight SVG judgement values, and filters every judgement value out of the general section.

Extend `components.action-menu.test.tsx` with a `MessageBubble` containing `Thanks` and `😂` summaries; assert the judgement summary uses the SVG renderer and the emoji summary remains literal Unicode.

Render `ImMessageActionSheet` with these new props:

```tsx
selectedJudgement="OK"
selectedEmoji="😂"
pendingCategory={undefined}
```

Assert `OK` and `😂` are selected but enabled; the other seven judgements and all other emojis are disabled in both common/full sections; a disabled click does not call `onReact`; and `pendingCategory="judgement"` disables all eight judgement values without disabling emoji values. Assert the action sheet delegates to compact/expanded catalog variants and no longer owns `imQuickReactions` or `imDefaultReactions` arrays.

- [ ] **Step 2: Add failing composer parity tests**

In `components.composer.test.tsx`, open the emoji panel and assert the same three headings and all eight SVG values. Click `Thanks` and expect `onDraftChange("existingThanks")`; click `😂` and expect `onDraftChange("existing😂")`. After each click, assert the value is first in `getRecentImReactionSnapshot()`.

- [ ] **Step 3: Run catalog, action-menu, and composer tests to verify RED**

Run:

```bash
npm test -- src/features/im/ReactionCatalog.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx
```

Expected: FAIL because `ReactionCatalog` and the unified sections do not exist.

- [ ] **Step 4: Implement the shared catalog with native disabled semantics**

Create `ReactionCatalog.tsx` with this exact interface:

```ts
export type ReactionCatalogProps = {
  disabled?: boolean;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSelect: (value: string) => void;
  pendingCategory?: ImReactionCategory;
  recentValues: readonly string[];
  selectedEmoji?: string;
  selectedJudgement?: string;
  visibleRecentCount?: number;
};
```

Every item derives its category and uses this native guard:

```ts
const category = getImReactionCategory(value);
const selectedValue = category === "judgement" ? selectedJudgement : selectedEmoji;
const itemDisabled = Boolean(disabled)
  || pendingCategory === category
  || isImReactionChoiceDisabled(value, selectedValue, false);
```

Default `visibleRecentCount` to 6 when the caller has not measured a compact width. Then render:

```tsx
<button
  aria-pressed={selected}
  data-im-reaction-selected={selected ? "true" : "false"}
  disabled={disabled}
  onClick={disabled ? undefined : onClick}
  type="button"
>
  <ImReactionValue value={value} />
</button>
```

Selected uses a light primary ring/tint, never black. Disabled uses grayscale, reduced opacity, and `cursor-not-allowed`. Compact mode renders `recentValues.slice(0, visibleRecentCount)` in one non-scrolling row and always appends more. Expanded mode renders all three sections and a collapse control only when `onExpandedChange` exists.

- [ ] **Step 5: Replace both existing catalog implementations**

Change `ImMessageActionSheet` props to include:

```ts
selectedJudgement?: string;
selectedEmoji?: string;
pendingCategory?: ImReactionCategory;
```

Use `useSyncExternalStore(subscribeRecentImReactions, getRecentImReactionSnapshot, getRecentImReactionSnapshot)` in both `ImMessageActionSheet` and `ImChatComposer`. The action sheet passes its measured visible count plus selection/pending props. The composer always renders the expanded three-section catalog and passes no selected/pending values because it inserts content rather than mutating a message.

Delete the old `imQuickReactions`, `imDefaultReactions`, duplicated “最近使用/所有表情” JSX, and local `recentEmojis` state. Keep `IM_COMMON_EMOJIS` in `emoji.ts` as the general-catalog authority.

Replace the message-summary `{reaction.emoji}` label in `MessageBubble` with `<ImReactionValue value={reaction.emoji} />`, preserving the existing click target and people label.

- [ ] **Step 6: Insert composer values and record usage**

Replace `selectEmoji` with:

```ts
const selectReactionValue = (value: string) => {
  onDraftChange(`${draft}${value}`);
  recordRecentImReaction(value);
};
```

The action sheet must not record directly because a reaction request can fail; Task 7 records only after a successful add response.

- [ ] **Step 7: Run shared catalog and both-entry tests**

Run:

```bash
npm test -- src/features/im/reaction-catalog.test.ts src/features/im/ReactionCatalog.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx
```

Expected: PASS, including compact-width counts, exact section order, SVG rendering, and composer insertion.

- [ ] **Step 8: Commit the unified catalog UI**

```bash
git add src/features/im/ReactionCatalog.tsx src/features/im/ReactionCatalog.test.tsx src/features/im/components.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx
git commit -m "feat: unify IM reaction and emoji catalogs"
```

---

## Task 7: Replace optimistic reaction flashes with authoritative request handling

**Files:**

- Modify: `src/features/im/reaction-policy.ts`
- Modify: `src/features/im/reaction-policy.test.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/features/im/pages.test.ts`
- Modify: `src/i18n/translations.ts`

**Interfaces:**

- Consumes: Task 1 category/recent functions and Task 6 action-sheet props.
- Produces: authoritative category-pending mutation flow and explicit localized failure notices.

- [ ] **Step 1: Add failing error-copy and authoritative-flow tests**

In `reaction-policy.test.ts`, construct `ApiClientError` values and assert:

```ts
expect(getImReactionFailureMessage(new ApiClientError(
  "error.im.reaction_slot_occupied", 40946, 409
))).toBe("请先取消已发送的同类回复");

expect(getImReactionFailureMessage(new ApiClientError(
  "error.rate_limit", 42903, 429
))).toBe("操作过于频繁，请稍后重试");

expect(getImReactionFailureMessage(new Error("network")))
  .toBe("回复操作失败，请稍后重试");
```

Update the page contract test to require a category key such as `${message.id}:${getImReactionCategory(reaction)}`, require `.catch((error) => setActionNotice(...))`, and forbid the old optimistic `setMessageReactions` block before the API call.

Add an async interaction assertion: a rejected add does not call `recordRecentImReaction`, while a resolved add calls it once with the added value. A successful DELETE does not need to reorder recent usage because the value was already used when added.

- [ ] **Step 2: Run the focused tests and observe failures**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/pages.test.ts
```

Expected: FAIL because errors are silently rolled back and pending is keyed by individual reaction value.

- [ ] **Step 3: Add category-pending state that rerenders the menu**

Retain a ref to suppress same-tick duplicate clicks, but also add render state so disabled props update:

```ts
const reactionPendingKeysRef = useRef(new Set<string>());
const [reactionPendingKeys, setReactionPendingKeys] = useState<Set<string>>(() => new Set());
```

Key by `message.id + category`, not by reaction value. A judgement and emoji request can proceed independently; two requests in the same category cannot.

- [ ] **Step 4: Derive selected values from the current user's authoritative summaries**

For `menuState.message.id`, pass the result of:

```ts
deriveCurrentUserReactionSlots(
  messageReactions[menuState.message.id] ?? {},
  currentReactionPerson.id
)
```

to the action sheet. This must use the current user only; another participant's reply never disables the current user's choices.

- [ ] **Step 5: Rewrite `toggleMessageReaction` without optimistic mutation**

The function must:

1. derive the category and category pending key;
2. return before store access when that category is pending;
3. determine whether the clicked value is the currently selected value;
4. mark only that category pending;
5. call `store.setMessageReaction(..., !reactedByMe)`;
6. replace local groups only from `savedMessage.reactions` on success;
7. call `recordRecentImReaction(reaction)` only when the operation was an add and succeeded;
8. close the action sheet after success when `closeAfter` is true;
9. preserve the existing groups and show mapped failure copy on rejection;
10. clear both the ref and render pending state in `finally`.

There must be no pre-request `setMessageReactions` call and no captured `previousState` rollback. The old confirmed summary remains visible throughout a cancellation request; a new summary appears only after a successful server response.

- [ ] **Step 6: Keep message-summary cancellation category-safe**

Sort `getMessageReactionSummaries` with `sortImReactionSummaries`. The existing selected summary click continues to call DELETE; pending prevents duplicate clicks. A judgement cancellation must not disable or remove the emoji summary, and vice versa.

- [ ] **Step 7: Add localized source strings**

Add translation entries for:

- `常用表情`
- `判断表情`
- `一般表情`
- `请先取消已发送的同类回复`
- `操作过于频繁，请稍后重试`
- `回复操作失败，请稍后重试`

Provide `zh-Hant`, `ja`, `en`, and `ko` values in `src/i18n/translations.ts`; keep all eight judgement values unchanged.

- [ ] **Step 8: Run focused frontend tests**

Run:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/reaction-catalog.test.ts src/features/im/JudgementReactionIcon.test.tsx src/features/im/ReactionCatalog.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx src/features/im/pages.test.ts src/features/im/store.test.ts src/features/im/formal-api.test.ts
```

Expected: PASS. Existing `reactionVersion` stale-snapshot tests must remain green.

- [ ] **Step 9: Commit authoritative frontend behavior**

```bash
git add src/features/im/reaction-policy.ts src/features/im/reaction-policy.test.ts src/features/im/pages.tsx src/features/im/pages.test.ts src/i18n/translations.ts
git commit -m "fix: keep IM reaction state server authoritative"
```

---

## Task 8: Update formal documentation and complete end-to-end verification

**Files:**

- Modify: `docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md`
- Modify only if current behavior is documented there: `README.md`
- Create: `docs/verification/2026-08-30-im-quick-response-slots.md`

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: formal contract documentation and reproducible automated/browser acceptance evidence.

- [ ] **Step 1: Update the formal IM contract documentation**

Document:

- judgement values `OK`, `NO`, `Pending`, `+1`, `Done`, `Cool`, `Good`, `Thanks`;
- one judgement plus one emoji per user/message;
- shared “常用表情 → 判断表情 → 一般表情” catalog structure, v2 recent storage migration, composer insertion behavior, and compact SVG asset contract;
- same-value PUT idempotence and different-value same-category 409;
- exact-value DELETE and `reactionVersion` SSE/REST ordering;
- historical soft-cleanup migration and read-only duplicate checker.

Do not describe the old unlimited same-user emoji behavior as supported.

- [ ] **Step 2: Run the complete backend verification**

Run from `backend`:

```bash
npm test -- --runInBand tests/message-reaction-policy.test.ts tests/im-message-reaction.repository.test.ts tests/message-reaction-slots-migration.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
npm run lint
npm run build
npm run check:message-reaction-slots
```

Expected: all focused tests, lint, and build pass; the read-only checker returns `ready: true` after the migration is safely applied, or the verification note explicitly records why local migration application remains blocked.

- [ ] **Step 3: Run the complete frontend verification**

Run from the repository root:

```bash
npm test -- src/features/im/reaction-policy.test.ts src/features/im/reaction-catalog.test.ts src/features/im/JudgementReactionIcon.test.tsx src/features/im/ReactionCatalog.test.tsx src/features/im/components.action-menu.test.tsx src/features/im/components.composer.test.tsx src/features/im/pages.test.ts src/features/im/store.test.ts src/features/im/formal-api.test.ts
npm run lint
npm run i18n:audit
npm run verify:production-build
```

Expected: tests, typecheck, i18n audit, formal build, and production-bundle audit pass.

- [ ] **Step 4: Verify the local formal runtime before UI acceptance**

Check listeners and health without changing data:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
lsof -nP -iTCP:3307 -sTCP:LISTEN
lsof -nP -iTCP:6379 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -I -s http://127.0.0.1:5180/user.html
```

Expected: backend health and readiness succeed and the formal frontend returns HTTP 200. Restart only the affected local service if necessary; do not switch to the legacy mock backend.

- [ ] **Step 5: Perform 5180 browser acceptance with two real test accounts**

Use the browser-control skill and a message whose original reaction state is recorded first. Prefer an existing message with no current-user reactions; after the test, remove only reactions created by this acceptance run and verify restoration.

For account A:

1. Open the message action sheet at mobile width and select `OK`.
2. Reopen the sheet and verify `OK` is selected/enabled while the other seven judgements are gray, have `disabled === true`, and clicking them creates no network request.
3. Select one emoji and verify a judgement plus an emoji are both visible below the message.
4. Reopen the sheet and verify the selected emoji is enabled while every other quick and expanded emoji is disabled.
5. Wait at least 1.2 seconds, reload, and verify both values persist.
6. Click the selected judgement summary to cancel; verify all judgement options re-enable and the emoji remains.
7. Click the selected emoji summary to cancel; verify all emoji options re-enable.
8. Trigger or simulate a controlled 409/429 only through safe local test setup; verify the confirmed UI remains unchanged and the explicit notice is shown. Do not spam the shared rate limiter.
9. Confirm the compact row shows newly used values in recent order with more at the end; expand it and verify `常用表情`, `判断表情`, `一般表情` order.
10. Open the composer emoji button, verify the same section order, insert `Thanks` as text and `😂` as Unicode, and confirm both update the common row.
11. Inspect all eight SVGs at mobile width: 22–26px visual height, transparent background, no black selected state, and no horizontal overflow.

For account B:

1. Observe account A's add/remove changes through SSE without reload.
2. Confirm account A's choices do not disable account B's controls.
3. Add its own judgement and emoji, reload, and confirm independent persistence.

At both desktop and mobile widths, inspect console errors, horizontal overflow, selected styling, and the expanded catalog.

- [ ] **Step 6: Record evidence and cleanup**

Create `docs/verification/2026-08-30-im-quick-response-slots.md` containing:

- commit(s) tested;
- test/build command results;
- local service/health results;
- conversation/message IDs used;
- before/after reaction snapshot and cleanup result;
- account A/account B outcomes;
- reload and SSE evidence;
- mobile viewport and console/overflow results;
- any migration application blocker, clearly separated from code verification.

- [ ] **Step 7: Commit documentation and verification evidence**

```bash
git add docs/13_REALTIME_IM_SOCIAL_NOTIFICATION.md docs/verification/2026-08-30-im-quick-response-slots.md
git add README.md  # only when Task 8 Step 1 actually changed it
git commit -m "docs: verify IM quick response slots"
```

---

## Final Acceptance Checklist

- [ ] One user can persist exactly one of the eight judgement values and one emoji on one message.
- [ ] A second different value in an occupied category never writes and returns 409.
- [ ] Same-value PUT is idempotent and click-again DELETE cancels the selected value.
- [ ] Unselected same-category controls are gray, natively disabled, and send no request.
- [ ] The selected control is highlighted, not black/gray, and remains clickable.
- [ ] Other users' controls and reactions remain independent.
- [ ] Compact mode mixes recently used values in one row; expanded action/composer catalogs use common, judgement, general order.
- [ ] All eight judgement values use the dedicated transparent SVGs in catalog controls and message summaries.
- [ ] Composer judgement clicks insert exact text, emoji clicks insert Unicode, and both update the shared v2 recent list.
- [ ] 409, 429, network, and 5xx failures do not create a transient reaction summary.
- [ ] Older REST/SSE `reactionVersion` snapshots cannot overwrite newer state.
- [ ] Historical duplicates are soft-deleted deterministically or migration application is explicitly blocked with evidence.
- [ ] Focused tests, lint, i18n audit, backend build, and formal production build pass.
- [ ] 5180 browser acceptance passes after delay, reload, two-account SSE observation, and cleanup.
- [ ] No unrelated files, production data, push, or deployment are included.
