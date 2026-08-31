# Technician Services and Contact Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a five-service technician portfolio across all shop contexts, make ordered public-eligible services the source of primary service, move the service editor beneath profile tags, and expose expanded technician information only to an active unblocked contact.

**Architecture:** Keep `TechnicianService` as the sole service source and retain each row's shop/pricing ownership. Add profile-scoped repository transactions for quota enforcement and complete-list reordering. Reuse the realtime directory profile endpoint as a discriminated response; it returns private technician contact details only after an exact `Contact` relation check. The shared technician information card renders the calculated acceptance rate from microstep 1 and embeds the existing service editor in the approved order.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Express 4, Zod 3, Prisma 7, MySQL 8, Jest 29, Supertest 7.

## Global Constraints

- Start after the order-performance and entity-engagement microsteps are merged and verified; work from an isolated worktree containing design commit `f33e7e99`.
- Do not add another service model, primary-service boolean, duplicate editor, client-only limit, or local service cache.
- The maximum is five non-deleted services per technician profile across every shop affiliation. Same-looking services in different shops still count separately.
- Preserve `TechnicianService.shopId`, pricing-mode ownership, booking references, review status, and current public shop-scoped routes.
- Public eligibility is exactly `deletedAt IS NULL`, `isActive = true`, and `reviewStatus = APPROVED`.
- Primary service is the first eligible row ordered by `sortOrder ASC, id ASC`; reordering is the only way to change it.
- Prices remain integer JPY and are exposed as tax-inclusive. Do not recalculate or append tax on the frontend.
- Expanded budget, payment, special tags, profile tags, and all eligible services require an active, non-deleted, unblocked owner-to-target `Contact` relation.
- Public profile visibility, a directory lookup, a pending friend request, or reverse-only contact relation is insufficient.
- Deleting or blocking the contact must remove expanded fields on the next read without waiting for cache expiry.
- Never return personal service-base coordinates introduced by microstep 2.
- Keep existing formal APIs, scope checks, audit, RBAC, Zod, OpenAPI, i18n, and no-new-mock policy.
- Every task follows RED → verify RED → GREEN → verify GREEN → commit.

---

## File map

### Service portfolio backend

- Create `backend/src/services/technician-service-policy.ts`.
- Create `backend/tests/technician-service-policy.test.ts`.
- Modify `backend/src/validators/pricing-mode.validator.ts`: global list and complete-order command.
- Modify `backend/src/repositories/pricing-mode.repository.ts`: profile-wide count/list/reorder and primary resolver.
- Modify `backend/src/services/pricing-mode.service.ts`: enforce profile ownership, five-item quota, and complete reorder.
- Modify `backend/src/controllers/pricing-mode.controller.ts`.
- Modify `backend/src/routes/pricing-mode.routes.ts`.
- Modify `backend/tests/pricing-mode-repository.test.ts`, `backend/tests/pricing-mode-service.test.ts`, and `backend/tests/pricing-mode-api.test.ts`.
- Modify `backend/src/api/openapi.ts`, `backend/tests/openapi.test.ts`, and `docs/api.md`.

### Expanded contact response

- Modify `backend/src/repositories/realtime.repository.ts`: contact-gated technician detail query and DTO.
- Modify `backend/src/services/realtime.service.ts`: preserve relationship scope and strip unauthorized data.
- Modify `backend/tests/realtime-repository-identity.test.ts`, `backend/tests/realtime-service.test.ts`, and `backend/tests/realtime-api.test.ts`.
- Modify `src/features/im/types.ts`: discriminated directory contact detail types.
- Modify `src/features/im/formal-api.ts` and its tests.
- Modify `src/features/im/pages.tsx`: pass formal technician details into the information card.

### Technician portal and shared information card

- Modify `src/features/pricing-mode/api.ts` and create `src/features/pricing-mode/api.test.ts`.
- Modify `src/pages/mobile/TechnicianPortalPage.tsx`.
- Modify `src/pages/mobile/TechnicianPortalPage.test.tsx`.
- Modify `src/shared/profile-card/TechnicianPublicInfoCard.tsx`.
- Create `src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx`.
- Modify `src/shared/profile-card/types.ts` and `src/shared/profile-card/index.ts` if required by the exported formal props.
- Modify `src/i18n/translations.ts` and its coverage test.

---

### Task 1: Define service eligibility, primary selection, and quota policy

**Files:**
- Create: `backend/src/services/technician-service-policy.ts`
- Create: `backend/tests/technician-service-policy.test.ts`

**Interfaces:**

```ts
export const TECHNICIAN_SERVICE_LIMIT = 5;

export type TechnicianServiceEligibilityInput = {
  id: number;
  isActive: boolean;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  sortOrder: number;
  deletedAt: Date | null;
};

export function isPublicEligibleTechnicianService(
  service: TechnicianServiceEligibilityInput
): boolean;

export function selectPrimaryTechnicianService<T extends TechnicianServiceEligibilityInput>(
  services: readonly T[]
): T | null;

export function assertTechnicianServiceQuota(nonDeletedCount: number): void;
export function assertCompleteServiceOrder(ownedIds: readonly number[], submittedIds: readonly number[]): void;
```

- [ ] **Step 1: Write failing pure policy tests**

Cover inactive/pending/rejected/deleted exclusion; `sortOrder` then ID primary tie-break; counts `0..5` accepted and `6` rejected; duplicate, missing, foreign, and extra reorder IDs rejected.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/technician-service-policy.test.ts
```

- [ ] **Step 3: Implement the pure policy**

Use a stable application error key `error.technician_service.limit_reached` for quota and `error.technician_service.invalid_order` for reorder set mismatch.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/technician-service-policy.test.ts
git add backend/src/services/technician-service-policy.ts backend/tests/technician-service-policy.test.ts
git commit -m "feat: define technician service portfolio policy"
```

---

### Task 2: Enforce five services across shops in repository transactions

**Files:**
- Modify: `backend/src/repositories/pricing-mode.repository.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/tests/pricing-mode-repository.test.ts`
- Modify: `backend/tests/pricing-mode-service.test.ts`

**Repository additions:**

```ts
export interface TechnicianServicePortfolioRepositoryPort {
  listTechnicianServicesByProfile(input: {
    technicianProfileId: number;
    includeInactive: boolean;
  }): Promise<TechnicianServicePayload[]>;
  reorderTechnicianServices(input: {
    technicianProfileId: number;
    orderedServiceIds: number[];
    actorUserId: number;
    auditLog: AuditLogCreateInput;
  }): Promise<TechnicianServicePayload[]>;
  findPrimaryTechnicianService(
    technicianProfileId: number
  ): Promise<TechnicianServicePayload | null>;
}
```

- [ ] **Step 1: Write failing transaction tests**

Prove create counts all non-deleted services across shop IDs; concurrent sixth creates cannot both pass; deleting one allows another; update does not consume an extra slot; current shop ownership/scope rules remain; quota and audit writes are transactional.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts
```

- [ ] **Step 3: Add a profile-scoped quota lock**

Inside create transaction, lock/read the technician profile, count `technicianId + deletedAt: null` across every shop, reject at five, then create. Do not rely on the page's currently selected shop or a preceding non-transactional count.

- [ ] **Step 4: Add primary resolver**

Query only eligible rows with `orderBy: [{ sortOrder: "asc" }, { id: "asc" }]` and `take: 1`. Include tax metadata as `taxIncluded: true` in mapped public/contact service payloads.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts
git add backend/src/repositories/pricing-mode.repository.ts backend/src/services/pricing-mode.service.ts backend/tests/pricing-mode-repository.test.ts backend/tests/pricing-mode-service.test.ts
git commit -m "feat: enforce technician service portfolio limit"
```

---

### Task 3: Add profile-wide list and complete reorder APIs

**Files:**
- Modify: `backend/src/validators/pricing-mode.validator.ts`
- Modify: `backend/src/controllers/pricing-mode.controller.ts`
- Modify: `backend/src/routes/pricing-mode.routes.ts`
- Modify: `backend/src/repositories/pricing-mode.repository.ts`
- Modify: `backend/src/services/pricing-mode.service.ts`
- Modify: `backend/tests/pricing-mode-api.test.ts`

**Routes:**

```text
GET /api/v1/technicians/me/services?page=1&pageSize=20&activeOnly=false
PUT /api/v1/technicians/me/services/order
```

Keep the existing `/technicians/me/shops/:shopId/services` create/update/delete/list routes for compatibility.

**Order body:**

```ts
export const technicianServiceOrderBodySchema = z.object({
  orderedServiceIds: z.array(z.number().int().positive()).max(5),
  idempotencyKey: z.string().trim().min(16).max(160)
}).strict();
```

- [ ] **Step 1: Write failing API tests**

Prove the global list includes all owned shop contexts and remains paginated; reorder requires every non-deleted owned service exactly once; foreign/missing/duplicate IDs return `400` or `403` by existing error policy; the same key replays without duplicate audit; only technician own scope may call it.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-api.test.ts
```

- [ ] **Step 3: Implement contiguous transactional order values**

Assign `sortOrder = index` for the submitted list inside one transaction and update `updatedBy`. Return the fully ordered portfolio with shop context fields.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/pricing-mode-api.test.ts
git add backend/src/validators/pricing-mode.validator.ts backend/src/controllers/pricing-mode.controller.ts backend/src/routes/pricing-mode.routes.ts backend/src/repositories/pricing-mode.repository.ts backend/src/services/pricing-mode.service.ts backend/tests/pricing-mode-api.test.ts
git commit -m "feat: reorder technician services across shops"
```

---

### Task 4: Extend directory profile with relationship-gated technician details

**Files:**
- Modify: `backend/src/repositories/realtime.repository.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/tests/realtime-repository-identity.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`
- Modify: `backend/tests/realtime-api.test.ts`

**Discriminated response:**

```ts
export type TechnicianContactServicePayload = {
  id: number;
  shopId: number;
  name: string;
  priceAmount: number;
  currency: string;
  durationMinutes: number;
  taxIncluded: true;
  sortOrder: number;
};

export type TechnicianContactDetailsPayload = {
  bidBudgetMinJpy: number | null;
  bidBudgetMaxJpy: number | null;
  paymentMethods: string[];
  specialTags: string[];
  profileTags: string[];
  services: TechnicianContactServicePayload[];
  completedOrderCount: number;
  acceptanceRateBps: number;
};

export type DirectoryProfilePayload =
  | { identityCard: DirectoryIdentityCardPayload & { entityType: "technician" }; technicianContactDetails?: TechnicianContactDetailsPayload; /* existing fields */ }
  | { identityCard: DirectoryIdentityCardPayload & { entityType: "user" | "shop" | "account" }; /* existing fields */ };
```

- [ ] **Step 1: Write failing privacy-matrix tests**

Cover owner-to-target active contact returns details; reverse-only contact, pending request, deleted contact, blocked contact, self lookup without contact, and public lookup omit the entire `technicianContactDetails` key. Verify unblocking restores access and deleting removes it immediately.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix backend test -- --runInBand tests/realtime-repository-identity.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts
```

- [ ] **Step 3: Add one scoped repository query**

The contact predicate is:

```ts
{
  ownerIdentityId: viewerIdentityId,
  contactIdentityId: technicianIdentityId,
  deletedAt: null,
  blockedAt: null
}
```

Load the technician profile, active special tags, performance summary, and at most five eligible services only after that relation is true. Sort services by `sortOrder`, then ID. Never select `baseLatitude` or `baseLongitude`.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm --prefix backend test -- --runInBand tests/realtime-repository-identity.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts
git add backend/src/repositories/realtime.repository.ts backend/src/services/realtime.service.ts backend/tests/realtime-repository-identity.test.ts backend/tests/realtime-service.test.ts backend/tests/realtime-api.test.ts
git commit -m "feat: expose technician details to active contacts"
```

---

### Task 5: Type the formal contact response on the frontend

**Files:**
- Modify: `src/features/im/types.ts`
- Modify: `src/features/im/formal-api.ts`
- Modify or create: `src/features/im/formal-api.test.ts`
- Modify: `src/features/im/pages.tsx`

- [ ] **Step 1: Write failing adapter tests**

Prove technician responses retain `technicianContactDetails`, non-technician responses cannot expose it through types/mapping, missing details remain absent rather than filled from legacy contacts, and integer JPY/duration/acceptance basis points survive mapping exactly.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/features/im/formal-api.test.ts
```

- [ ] **Step 3: Implement the discriminated mapper**

Do not hydrate private fields from `src/data`, local contact tags, or legacy `Technician` objects. Pass the formal optional details into the shared information card from directory and conversation-info routes.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- --run src/features/im/formal-api.test.ts
git add src/features/im/types.ts src/features/im/formal-api.ts src/features/im/formal-api.test.ts src/features/im/pages.tsx
git commit -m "feat: map formal technician contact details"
```

---

### Task 6: Move the service editor below technician tags

**Files:**
- Modify: `src/features/pricing-mode/api.ts`
- Create: `src/features/pricing-mode/api.test.ts`
- Modify: `src/pages/mobile/TechnicianPortalPage.tsx`
- Modify: `src/pages/mobile/TechnicianPortalPage.test.tsx`

- [ ] **Step 1: Write failing API and layout tests**

Prove the editor loads profile-wide services, shows usage `n/5`, rejects local sixth-submit before request while retaining server error handling, saves reorder through the global order endpoint, and appears after special tags and normal tags inside the information-card section.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/features/pricing-mode/api.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx
```

- [ ] **Step 3: Update the service API adapter**

Add `listMyTechnicianServices` and `reorderMyTechnicianServices`. Keep shop-scoped mutations because each service retains a shop/pricing context.

- [ ] **Step 4: Embed the existing editor once**

Move `FormalTechnicianServicesPanel` under the tags in the information-card render path. It receives the full portfolio plus available active shop contexts. Remove the standalone rendered editor.

- [ ] **Step 5: Preserve old service-entry navigation**

When an existing caller opens the previous `services` tab/query, normalize to the information tab and focus/scroll the `technician-service-information` anchor. Do not keep two mounted editors.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npm test -- --run src/features/pricing-mode/api.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx
git add src/features/pricing-mode/api.ts src/features/pricing-mode/api.test.ts src/pages/mobile/TechnicianPortalPage.tsx src/pages/mobile/TechnicianPortalPage.test.tsx
git commit -m "feat: move technician services into information card"
```

---

### Task 7: Render acceptance rate and authorized expanded fields

**Files:**
- Modify: `src/shared/profile-card/TechnicianPublicInfoCard.tsx`
- Create: `src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx`
- Modify: `src/shared/profile-card/types.ts`
- Modify: `src/shared/profile-card/index.ts`
- Modify: `src/features/im/pages.tsx`
- Modify: `src/i18n/translations.ts`

**Formal props:**

```ts
type TechnicianFormalMetrics = {
  completedOrderCount: number;
  ratingAverage: string;
  reviewCount: number;
  acceptanceRateBps: number;
};

type TechnicianFormalContactCardData = {
  metrics: TechnicianFormalMetrics;
  contactDetails?: TechnicianContactDetails;
};
```

- [ ] **Step 1: Write failing render/privacy tests**

Assert completed orders remain left; right metric area contains rating plus acceptance rate; `10000` renders `100%`; private budget/payment/special tags/tags/services render only when details exist; services include tax-inclusive label and duration; empty authorized arrays show translated empty states; no coordinates render.

- [ ] **Step 2: Verify RED**

```bash
npm test -- --run src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx
```

- [ ] **Step 3: Implement the approved section order**

Render: identity/metrics → basic info → authorized budget/payment → introduction → special tags → normal tags → service information. The shared component must not synthesize private fields from its legacy `Technician` prop.

- [ ] **Step 4: Verify five-language copy, GREEN, and commit**

```bash
npm test -- --run src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx src/i18n/translations.test.ts
git add src/shared/profile-card/TechnicianPublicInfoCard.tsx src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx src/shared/profile-card/types.ts src/shared/profile-card/index.ts src/features/im/pages.tsx src/i18n/translations.ts
git commit -m "feat: render formal technician contact information"
```

---

### Task 8: Document service and privacy contracts

**Files:**
- Modify: `backend/src/api/openapi.ts`
- Modify: `backend/tests/openapi.test.ts`
- Modify: `docs/api.md`

- [ ] **Step 1: Write failing OpenAPI guards**

Guard global list/reorder paths, five-item maximum, complete-order semantics, tax-inclusive service fields, optional contact-only details, acceptance basis points, and explicit coordinate exclusion.

- [ ] **Step 2: Verify RED, implement, and verify GREEN**

```bash
npm --prefix backend test -- --runInBand tests/openapi.test.ts
```

- [ ] **Step 3: Commit documentation**

```bash
git add backend/src/api/openapi.ts backend/tests/openapi.test.ts docs/api.md
git commit -m "docs: define technician portfolio and contact privacy"
```

---

### Task 9: Run the complete microstep gate

- [ ] **Step 1: Run backend gates**

```bash
npm --prefix backend test -- --runInBand tests/technician-service-policy.test.ts tests/pricing-mode-repository.test.ts tests/pricing-mode-service.test.ts tests/pricing-mode-api.test.ts tests/realtime-repository-identity.test.ts tests/realtime-service.test.ts tests/realtime-api.test.ts tests/openapi.test.ts
npm --prefix backend run lint
npm --prefix backend run build
```

- [ ] **Step 2: Run frontend gates**

```bash
npm test -- --run src/features/pricing-mode/api.test.ts src/features/im/formal-api.test.ts src/pages/mobile/TechnicianPortalPage.test.tsx src/shared/profile-card/TechnicianPublicInfoCard.formal.test.tsx src/i18n/translations.test.ts
npm run lint
npm run verify:production-build
```

- [ ] **Step 3: Perform authenticated browser privacy acceptance**

Verify listeners/cwd/branch/proxy/origin first. At 390x844 and 440x956, prove service editor appears once below tags; sixth service is rejected by backend; reorder changes the first service; contact sees budget/payment/tags/all eligible services; non-contact, deleted contact, and blocked contact do not; acceptance rate is beside rating; no horizontal overflow, console errors, or private coordinate fields appear.

- [ ] **Step 4: Stop at the microstep boundary**

Do not implement taxonomy or final search cards in this branch. Local completion does not imply push, deployment, or production acceptance.
