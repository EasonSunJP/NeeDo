# Exchange Matched Booking Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert one matched Exchange Demand into one formal `PENDING` Request `BookingOrder` per matched participant in a single idempotent transaction, expose the persisted result to the owner and each matched provider, verify it against real local MySQL and browsers, merge it into local `main`, and stop before payment or cancellation work.

**Architecture:** Add one forward Prisma migration and a focused Exchange booking-conversion Service/Repository boundary. The repository owns the cross-domain transaction over Match, Participant, ScheduleSlot, BookingOrder, status history, notifications, audit, and pre-existing ordinary pending replacement; existing Booking remains authoritative for later acceptance and fulfillment. The React Exchange detail page calls one batch endpoint and only renders persisted API state.

**Tech Stack:** Node.js 22, TypeScript strict mode, Express, Zod, Prisma 7, MySQL 8, Jest/Supertest, React 19, Vite 7, Vitest, Tailwind CSS.

## Global Constraints

- Execute only this microstep: matched Exchange result to formal `PENDING` Request bookings.
- Preserve React/TSX/Vite, `/api/v1`, Prisma/MySQL, RBAC, audit, five-language i18n, and the existing Booking/Schedule/Order Fulfillment systems.
- Do not add mocks, fake APIs, client-side orders, localStorage state, hard-coded authority, or a parallel booking/payment model.
- One participant creates one independent order; the whole batch commits or rolls back.
- Same-batch orders coexist even for non-Black customers; existing ordinary unprotected `PENDING` orders keep the current replacement behavior.
- Exchange-linked orders are excluded from later ordinary pending replacement and reject ordinary cancellation with `error.exchange.match_cancellation_required`.
- Booking prices use immutable participant quotes and service snapshots; home service stores the published address snapshot.
- Conversion must not mutate service-payment, publication-fee hold, wallet, ledger, reconciliation, checkout, or external-payment records.
- Do not implement quick matching, unmatched close, bilateral cancellation, publication-fee capture/release, service payment, IM creation, push, deploy, or production migration.
- Apply only the task migration after reconciling pending migration state; never use blanket migration deployment to bypass unrelated drift.
- Real-data checkers must reject production flags, remote MySQL, and production-like database names, own every fixture by a unique marker, and prove exact rollback or cleanup.
- Keep unrelated dirty files in the main checkout untouched.
- After verified local merge into `main`, report local merge, remote push, deployment, database migration, and browser acceptance as separate states, then pause.

---

## File Map

### Database and immutable matching projection

- Create `backend/prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql`: additive columns, snapshot backfill, indexes, checks, Restrict FK, and `bookings_created` enum value.
- Modify `backend/prisma/schema.prisma`: model the participant/order one-to-one link, participant snapshots, nullable reservation key, address snapshot, and event enum.
- Modify `backend/src/repositories/exchange-matching.repository.ts`: persist service snapshots at selection, read snapshots rather than mutable catalog values, expose only viewer-scoped order links, and treat only non-null reservation keys as active conflicts.
- Modify `backend/src/repositories/exchange-claim.repository.ts`: ignore converted participants in claim-time participant overlap checks.
- Modify `backend/src/types/exchange-matching.types.ts`: add participant booking summary and `viewer.canCreateBookings`.
- Modify `backend/src/types/exchange.types.ts` and `backend/src/repositories/exchange.repository.ts`: expose `viewer.canViewMatching` to the owner and matched participant only.

### Conversion boundary and HTTP surface

- Create `backend/src/types/exchange-booking-conversion.types.ts`: stable command response and committed-notification types.
- Create `backend/src/repositories/exchange-booking-conversion.repository.ts`: the single atomic conversion transaction and replay lookup.
- Create `backend/src/services/exchange-booking-conversion.service.ts`: identity, E-KYC, fingerprint, outcome-to-AppError mapping, affiliate invalidation, and post-commit realtime publication.
- Create `backend/src/validators/exchange-booking-conversion.validators.ts`: positive post id and expected matching version.
- Create `backend/src/controllers/exchange-booking-conversion.controller.ts`: request-context adaptation only.
- Create `backend/src/routes/exchange-booking-conversion.routes.ts`: authentication, `exchange:matching:book-own`, validation, idempotency middleware, and dependency construction.
- Create `backend/src/middlewares/exchange-idempotency-key.middleware.ts`: shared parsed `Idempotency-Key` middleware.
- Modify `backend/src/routes/exchange-matching.routes.ts`: reuse the shared idempotency middleware.
- Modify `backend/src/services/realtime.service.ts`: publish already-committed notification payloads without inserting duplicate rows.
- Modify `backend/src/constants/error-codes.ts`, `backend/src/constants/permissions.constants.ts`, `backend/src/app.ts`, and `backend/src/api/openapi.ts`: stable errors, permission seeding, dependency wiring, route mounting, and OpenAPI.

### Booking protection

- Modify `backend/src/repositories/booking.repository.ts`: exclude linked orders from ordinary replacement, ignore converted participants as temporary conflicts, and return an Exchange cancellation guard outcome.
- Modify `backend/src/services/booking.service.ts`: route both confirm and cancel through the guarded repository result and map the Exchange cancellation error.

### Frontend

- Modify `src/features/exchange/types.ts`: mirror booking conversion, participant booking, and viewer capability contracts.
- Modify `src/features/exchange/api.ts`: issue the one batch conversion command.
- Modify `src/features/exchange/i18n.ts`: complete Simplified Chinese, Traditional Chinese, Japanese, English, and Korean copy.
- Modify `src/features/exchange/ExchangeReceivedClaims.tsx`: owner conversion/retry/success/order-link states.
- Create `src/features/exchange/ExchangeMatchedBookingCard.tsx`: matched-provider own result and order link.
- Modify `src/features/exchange/ExchangePostDetailPage.tsx`: render the provider card from `viewer.canViewMatching` without revealing other participants.
- Reuse `src/lib/scheduleDetailTarget.ts`: create identity-context order links for user, merchant, and technician routes.

### Verification and documentation

- Create `backend/scripts/check-exchange-booking-conversion-flow.ts`: rollback-contained formal main-flow proof.
- Create `backend/tests/exchange-booking-conversion.repository.integration.test.ts`: guarded, committed, independent-connection concurrency proof.
- Create `backend/tests/exchange-booking-conversion-flow-script.test.ts`: static safety/coverage contract for the checker.
- Modify `backend/package.json`: register the checker command.
- Modify `README.md`: document the endpoint, invariant boundary, checker, migration state, and local acceptance evidence.
- Add or modify the focused Jest/Vitest tests named in each task below.

---

### Task 1: Add the Forward Schema and Snapshot Foundation

**Files:**
- Create: `backend/prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/tests/exchange-booking-conversion-schema.test.ts`
- Modify: `backend/tests/exchange-matching-schema.test.ts`

**Interfaces:**
- Consumes: existing `ExchangeMatchParticipant`, `BookingOrder`, `ExchangeMatchEvent`, `Service`, and `TechnicianService` tables.
- Produces: `ExchangeMatchParticipant.bookingOrderId`, `bookedAt`, `serviceNameSnapshot`, `serviceDurationSnapshot`, nullable `activeReservationKey`, `BookingOrder.fulfillmentAddressSnapshot`, reverse `BookingOrder.exchangeMatchParticipant`, and `ExchangeMatchEventType.BOOKINGS_CREATED`.

- [ ] **Step 1: Write the failing schema contract**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange matched booking conversion schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql"
    ),
    "utf8"
  );

  it("links one participant to one booking with immutable snapshots", () => {
    expect(schema).toContain("BOOKINGS_CREATED  @map(\"bookings_created\")");
    expect(schema).toContain("bookingOrderId         Int?      @unique");
    expect(schema).toContain("serviceNameSnapshot    String");
    expect(schema).toContain("serviceDurationSnapshot Int");
    expect(schema).toContain("activeReservationKey  String?");
    expect(schema).toContain("fulfillmentAddressSnapshot Json?");
    expect(migration).toContain("exchange_match_participants_booking_state_chk");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(migration).toContain("UPDATE `exchange_match_participants` AS `participant`");
    expect(migration).toContain("exchange:matching:book-own");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'technician', 'merchant_staff')");
  });
});
```

- [ ] **Step 2: Run the schema test and verify the missing migration failure**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion-schema.test.ts`

Expected: FAIL because the migration file and new schema fields do not exist.

- [ ] **Step 3: Add the Prisma model changes**

```prisma
enum ExchangeMatchEventType {
  OPENED            @map("opened")
  CLAIM_ADDED       @map("claim_added")
  CLAIM_WITHDRAWN   @map("claim_withdrawn")
  BUDGET_INCREASED  @map("budget_increased")
  TARGET_REDUCED    @map("target_reduced")
  SELECTIVE_MATCHED @map("selective_matched")
  BOOKINGS_CREATED  @map("bookings_created")
  QUICK_MATCHED     @map("quick_matched")
  CLOSED            @map("closed")

  @@map("exchange_match_event_type")
}

model ExchangeMatchParticipant {
  serviceNameSnapshot     String        @map("service_name_snapshot") @db.VarChar(160)
  serviceDurationSnapshot Int           @map("service_duration_snapshot")
  bookingOrderId          Int?          @unique(map: "exchange_match_participants_booking_order_key") @map("booking_order_id")
  bookedAt                DateTime?     @map("booked_at")
  activeReservationKey    String?       @unique(map: "exchange_match_participants_reservation_key") @map("active_reservation_key") @db.VarChar(191)
  bookingOrder            BookingOrder? @relation(fields: [bookingOrderId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@index([bookingOrderId], map: "exchange_match_participants_booking_order_idx")
}

model BookingOrder {
  fulfillmentAddressSnapshot Json?                     @map("fulfillment_address_snapshot")
  exchangeMatchParticipant    ExchangeMatchParticipant?
}
```

- [ ] **Step 4: Add the forward SQL with deterministic backfill and database constraints**

```sql
ALTER TABLE `exchange_match_events`
  MODIFY `type` ENUM(
    'opened', 'claim_added', 'claim_withdrawn', 'budget_increased',
    'target_reduced', 'selective_matched', 'bookings_created',
    'quick_matched', 'closed'
  ) NOT NULL;

ALTER TABLE `booking_orders`
  ADD COLUMN `fulfillment_address_snapshot` JSON NULL;

ALTER TABLE `exchange_match_participants`
  MODIFY `active_reservation_key` VARCHAR(191) NULL,
  ADD COLUMN `service_name_snapshot` VARCHAR(160) NULL,
  ADD COLUMN `service_duration_snapshot` INTEGER NULL,
  ADD COLUMN `booking_order_id` INTEGER NULL,
  ADD COLUMN `booked_at` DATETIME(3) NULL;

UPDATE `exchange_match_participants` AS `participant`
LEFT JOIN `services` AS `service`
  ON `service`.`id` = `participant`.`service_id`
LEFT JOIN `technician_services` AS `technician_service`
  ON `technician_service`.`id` = `participant`.`technician_service_id`
SET
  `participant`.`service_name_snapshot` = COALESCE(`service`.`name`, `technician_service`.`name`),
  `participant`.`service_duration_snapshot` = COALESCE(
    `service`.`duration_minutes`,
    `technician_service`.`duration_minutes`
  );

ALTER TABLE `exchange_match_participants`
  MODIFY `service_name_snapshot` VARCHAR(160) NOT NULL,
  MODIFY `service_duration_snapshot` INTEGER NOT NULL,
  ADD UNIQUE INDEX `exchange_match_participants_booking_order_key` (`booking_order_id`),
  ADD INDEX `exchange_match_participants_booking_order_idx` (`booking_order_id`),
  ADD CONSTRAINT `exchange_match_participants_booking_state_chk`
    CHECK (
      (`booking_order_id` IS NULL AND `booked_at` IS NULL AND `active_reservation_key` IS NOT NULL)
      OR
      (`booking_order_id` IS NOT NULL AND `booked_at` IS NOT NULL AND `active_reservation_key` IS NULL)
    ),
  ADD CONSTRAINT `exchange_match_participants_booking_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '创建匹配预约',
  'exchange:matching:book-own',
  'api',
  'exchange',
  '将本人发布需求的正式匹配结果转换为预约',
  TRUE,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'exchange:matching:book-own'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'exchange:matching:read-own'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'technician', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
```

- [ ] **Step 5: Validate the Prisma schema and tests**

Run: `cd backend && npx prisma validate --schema prisma/schema.prisma && npm run prisma:generate && npm test -- --runInBand tests/exchange-booking-conversion-schema.test.ts tests/exchange-matching-schema.test.ts`

Expected: Prisma validation and client generation succeed and both suites PASS.

- [ ] **Step 6: Commit the schema foundation**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql backend/tests/exchange-booking-conversion-schema.test.ts backend/tests/exchange-matching-schema.test.ts
git commit -m "feat(exchange): add matched booking schema"
```

---

### Task 2: Persist and Project Immutable Matching Data

**Files:**
- Modify: `backend/src/types/exchange-matching.types.ts`
- Modify: `backend/src/types/exchange.types.ts`
- Modify: `backend/src/repositories/exchange-matching.repository.ts`
- Modify: `backend/src/repositories/exchange-claim.repository.ts`
- Modify: `backend/src/repositories/exchange.repository.ts`
- Modify: `backend/tests/exchange-matching.repository.test.ts`
- Modify: `backend/tests/exchange-claim.repository.test.ts`
- Modify: `backend/tests/exchange.repository.test.ts`

**Interfaces:**
- Consumes: Task 1 participant snapshots and optional `bookingOrder` relation.
- Produces: `ExchangeMatchParticipantPayload.booking`, `ExchangeMatchingPayload.viewer.canCreateBookings`, and `ExchangeViewerState.canViewMatching`.

- [ ] **Step 1: Write failing projection and conflict tests**

```ts
expect(payload.participants[0]).toMatchObject({
  service: { name: "matched snapshot", durationMinutes: 90 },
  booking: { orderId: 501, orderNo: "ND501", status: "pending" }
});
expect(payload.viewer.canCreateBookings).toBe(false);
expect(providerPayload.participants).toHaveLength(1);
expect(providerPayload.participants[0].exchangeClaimId).toBe(providerClaimId);
expect(nonSelectedPayload).toBeNull();
expect(participantConflictWhere.activeReservationKey).toEqual({ not: null });
expect(postPayload.viewer.canViewMatching).toBe(true);
```

- [ ] **Step 2: Run the focused tests and verify contract failures**

Run: `cd backend && npm test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts`

Expected: FAIL on missing snapshots, booking projection, active-key filtering, and `canViewMatching`.

- [ ] **Step 3: Extend the matching and post payload types**

```ts
export type ExchangeMatchingBookingStatus =
  | "pending"
  | "confirmed"
  | "inService"
  | "awaitingCheckout"
  | "awaitingPaymentConfirmation"
  | "completed"
  | "cancelled";

export interface ExchangeMatchParticipantPayload {
  booking: {
    orderId: number;
    orderNo: string;
    status: ExchangeMatchingBookingStatus;
  } | null;
}

export interface ExchangeMatchingPayload {
  viewer: {
    canSelect: boolean;
    canCreateBookings: boolean;
  };
}

export interface ExchangeViewerState {
  liked: boolean;
  canWithdraw: boolean;
  canClaim: boolean;
  canViewClaims: boolean;
  canViewMatching: boolean;
}
```

- [ ] **Step 4: Persist snapshots and filter temporary reservations by active key**

```ts
export interface ExchangeMatchingSelectionClaim {
  id: number;
  exchangePostId: number;
  claimantUserId: number;
  claimantIdentityId: number;
  shopId: number;
  technicianProfileId: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceName: string;
  serviceDurationMinutes: number;
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  status: "active";
  estimatedStartsAt: Date;
  estimatedEndsAt: Date;
}

await this.client.exchangeMatchParticipant.createMany({
  data: input.selectedClaims.map((claim) => ({
    matchingId: input.matchingId,
    exchangePostId: input.exchangePostId,
    exchangeClaimId: claim.id,
    participantUserId: claim.claimantUserId,
    participantIdentityId: claim.claimantIdentityId,
    shopId: claim.shopId,
    technicianProfileId: claim.technicianProfileId,
    serviceId: claim.serviceId,
    technicianServiceId: claim.technicianServiceId,
    scheduleSlotId: claim.scheduleSlotId,
    serviceNameSnapshot: claim.serviceName,
    serviceDurationSnapshot: claim.serviceDurationMinutes,
    quoteAmountJpy: claim.quoteAmountJpy,
    estimatedStartsAt: claim.estimatedStartsAt,
    estimatedEndsAt: claim.estimatedEndsAt,
    activeReservationKey: `${claim.technicianProfileId}:${claim.estimatedStartsAt.toISOString()}:${claim.estimatedEndsAt.toISOString()}`,
    matchedAt: input.at
  }))
});

const activeParticipantWhere = {
  activeReservationKey: { not: null },
  deletedAt: null
} as const;
```

Apply `activeParticipantWhere` to participant-overlap queries in both matching and claim repositories. Extend the matching include with `bookingOrder: { select: { id: true, orderNo: true, status: true } }`; map service name/duration from participant snapshots and map `booking` from the linked order.

In `lockActiveClaims`, include both service relations and resolve the new fields with:

```ts
serviceName: claim.service?.name ?? claim.technicianService!.name,
serviceDurationMinutes:
  claim.service?.durationMinutes ?? claim.technicianService!.durationMinutes
```

Map linked order status with an exhaustive helper rather than `toLowerCase()`:

```ts
private bookingStatus(value: string): ExchangeMatchingBookingStatus {
  if (value === "CONFIRMED") return "confirmed";
  if (value === "IN_SERVICE") return "inService";
  if (value === "AWAITING_CHECKOUT") return "awaitingCheckout";
  if (value === "AWAITING_PAYMENT_CONFIRMATION") return "awaitingPaymentConfirmation";
  if (value === "COMPLETED") return "completed";
  if (value === "CANCELLED") return "cancelled";
  return "pending";
}
```

- [ ] **Step 5: Enforce owner/provider privacy in both projections**

```ts
const isOwner = row.exchangePost.ownerIdentityId === viewerIdentityId;
const visibleParticipants = isOwner
  ? row.participants
  : row.participants.filter(
      (participant) => participant.participantIdentityId === viewerIdentityId
    );
const canCreateBookings =
  isOwner &&
  row.status === "MATCHED" &&
  visibleParticipants.length > 0 &&
  visibleParticipants.every((participant) => participant.bookingOrderId === null);

viewer: {
  canSelect: isOwner && row.status === "OPEN",
  canCreateBookings
}
```

In `ExchangePostRepository.mapPost`, set `canViewMatching: ownerView || matchedParticipantView`; retain the current private address and publisher rules.

- [ ] **Step 6: Run the focused repository suites**

Run: `cd backend && npm test -- --runInBand tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts`

Expected: PASS, including one-participant provider projection and no unselected access.

- [ ] **Step 7: Commit immutable matching projection**

```bash
git add backend/src/types/exchange-matching.types.ts backend/src/types/exchange.types.ts backend/src/repositories/exchange-matching.repository.ts backend/src/repositories/exchange-claim.repository.ts backend/src/repositories/exchange.repository.ts backend/tests/exchange-matching.repository.test.ts backend/tests/exchange-claim.repository.test.ts backend/tests/exchange.repository.test.ts
git commit -m "feat(exchange): persist matched service snapshots"
```

---

### Task 3: Define the Conversion Contracts, Permission, and Validation

**Files:**
- Create: `backend/src/types/exchange-booking-conversion.types.ts`
- Create: `backend/src/validators/exchange-booking-conversion.validators.ts`
- Create: `backend/src/middlewares/exchange-idempotency-key.middleware.ts`
- Modify: `backend/src/routes/exchange-matching.routes.ts`
- Modify: `backend/src/constants/error-codes.ts`
- Modify: `backend/src/constants/permissions.constants.ts`
- Create: `backend/tests/exchange-booking-conversion.validators.test.ts`
- Modify: `backend/tests/exchange-matching.validators.test.ts`
- Modify: `backend/tests/exchange-matching.routes.test.ts`
- Modify: `backend/tests/exchange-permissions.test.ts`

**Interfaces:**
- Consumes: existing auth context, `exchangeIdempotencyKeySchema`, audit input, and ledger transaction client type.
- Produces: stable response types, committed-notification type, repository outcome types, validator schemas, parsed idempotency key middleware, eight unique error constants, owner-only `EXCHANGE_PERMISSIONS.matchingBookOwn`, and participant-readable `matchingReadOwn` role grants.

- [ ] **Step 1: Write failing validator, middleware, and permission tests**

```ts
expect(exchangeBookingConversionBodySchema.parse({ expectedVersion: 7 })).toEqual({
  expectedVersion: 7
});
expect(() => exchangeBookingConversionBodySchema.parse({ expectedVersion: 0 })).toThrow();
expect(EXCHANGE_PERMISSIONS.matchingBookOwn).toBe("exchange:matching:book-own");
const assignments = buildRolePermissionAssignments();
expect(assignments.customer).toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
expect(assignments.merchant_owner).toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
expect(assignments.merchant_staff).not.toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
expect(assignments.technician).not.toContain(EXCHANGE_PERMISSIONS.matchingBookOwn);
expect(assignments.merchant_staff).toContain(EXCHANGE_PERMISSIONS.matchingReadOwn);
expect(assignments.technician).toContain(EXCHANGE_PERMISSIONS.matchingReadOwn);
expect(assignments.merchant_staff).not.toContain(EXCHANGE_PERMISSIONS.matchingSelectOwn);
expect(assignments.technician).not.toContain(EXCHANGE_PERMISSIONS.matchingSelectOwn);
```

- [ ] **Step 2: Run focused tests and verify failures**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.validators.test.ts tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/exchange-permissions.test.ts`

Expected: FAIL because the validator, middleware, permission, and errors are absent.

- [ ] **Step 3: Add exact API and transaction types**

```ts
import type { LedgerTransactionClient } from "../repositories/ledger.repository";
import type { NotificationPayload } from "../repositories/realtime.repository";

export type ExchangeCommittedNotification = Pick<
  NotificationPayload,
  | "id"
  | "recipientUserId"
  | "recipientIdentityId"
  | "actorUserId"
  | "actorIdentityId"
  | "type"
  | "title"
  | "body"
  | "payload"
  | "readAt"
  | "createdAt"
>;

export interface ExchangeBookingConversionOrderPayload {
  exchangeClaimId: number;
  orderId: number;
  orderNo: string;
  status: "pending";
  providerPublicId: string;
  quoteAmountJpy: number;
  startsAt: string;
  endsAt: string;
}

export interface ExchangeBookingConversionPayload {
  exchangePostId: number;
  matchingVersion: number;
  bookedAt: string;
  orders: ExchangeBookingConversionOrderPayload[];
}

export interface ExchangeBookingConversionInput {
  exchangePostId: number;
  actorUserId: number;
  actorIdentityId: number;
  expectedVersion: number;
  idempotencyKey: string;
  payloadFingerprint: string;
  occurredAt: Date;
  audit: {
    actorId: number;
    action: string;
    targetType: string;
    targetId: number | null;
    ip: string;
    userAgent?: string;
    metadata?: unknown;
  };
}

export interface ExchangeBookingConversionRepositoryOptions {
  invalidateSupersededAffiliate?: (input: {
    transactionClient: LedgerTransactionClient;
    bookingOrderId: number;
    actorUserId: number;
  }) => Promise<void>;
}

export type ExchangeBookingConversionRepositoryResult =
  | {
      outcome: "created" | "replayed";
      payload: ExchangeBookingConversionPayload;
      notifications: ExchangeCommittedNotification[];
    }
  | {
      outcome:
        | "not_found"
        | "not_allowed"
        | "invalid_state"
        | "version_conflict"
        | "already_created"
        | "slot_unavailable"
        | "idempotency_conflict";
      currentVersion?: number;
    };
```

- [ ] **Step 4: Add schemas and shared idempotency middleware**

```ts
import { z } from "zod";

export const exchangeBookingConversionPostIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const exchangeBookingConversionBodySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export type ExchangeBookingConversionBody = z.infer<
  typeof exchangeBookingConversionBodySchema
>;
```

```ts
export const validateExchangeIdempotencyKey: RequestHandler = (request, response, next) => {
  try {
    response.locals.exchangeIdempotencyKey = exchangeIdempotencyKeySchema.parse(
      request.get("Idempotency-Key")
    );
    next();
  } catch (error) {
    next(
      error instanceof ZodError
        ? new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.validation",
            statusCode: 400,
            cause: error
          })
        : error
    );
  }
};
```

Update the existing matching controller/route local name to read `response.locals.exchangeIdempotencyKey`.

- [ ] **Step 5: Register stable errors and owner permission**

Use unoccupied values above the current `41008` range after re-running `rg -n "4100[9-9]|4101[0-6]" backend/src/constants/error-codes.ts`:

```ts
EXCHANGE_MATCH_BOOKING_NOT_ALLOWED: 40313,
EXCHANGE_MATCH_BOOKING_NOT_FOUND: 40430,
EXCHANGE_MATCH_BOOKING_INVALID_STATE: 41010,
EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT: 41011,
EXCHANGE_MATCH_BOOKING_ALREADY_CREATED: 41012,
EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE: 41013,
EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT: 41014,
EXCHANGE_MATCH_CANCELLATION_REQUIRED: 41015,
```

```ts
export const EXCHANGE_PERMISSIONS = {
  matchingBookOwn: "exchange:matching:book-own"
} as const;
```

Add a `SYSTEM_PERMISSIONS` entry named “创建匹配预约”. Split the current owner-only matching list so the role assignment is explicit:

```ts
const EXCHANGE_MATCHING_READER_PERMISSION_CODES = [
  EXCHANGE_PERMISSIONS.matchingReadOwn
] as const satisfies readonly SystemPermissionCode[];

const EXCHANGE_DEMAND_OWNER_CLAIM_PERMISSION_CODES = [
  EXCHANGE_PERMISSIONS.claimListOwnedRequest,
  ...EXCHANGE_MATCHING_READER_PERMISSION_CODES,
  EXCHANGE_PERMISSIONS.matchingSelectOwn,
  EXCHANGE_PERMISSIONS.matchingBookOwn
] as const satisfies readonly SystemPermissionCode[];
```

Append `EXCHANGE_MATCHING_READER_PERMISSION_CODES` to the technician and merchant-staff role assignments, while `customer` and `merchant_owner` retain the full owner list. The repository remains the selected-participant privacy gate, so read permission alone never reveals an unrelated match.

- [ ] **Step 6: Run focused contract tests**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.validators.test.ts tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/exchange-permissions.test.ts`

Expected: PASS and the old select endpoint still validates the same header.

- [ ] **Step 7: Commit contracts and RBAC**

```bash
git add backend/src/types/exchange-booking-conversion.types.ts backend/src/validators/exchange-booking-conversion.validators.ts backend/src/middlewares/exchange-idempotency-key.middleware.ts backend/src/routes/exchange-matching.routes.ts backend/src/constants/error-codes.ts backend/src/constants/permissions.constants.ts backend/tests/exchange-booking-conversion.validators.test.ts backend/tests/exchange-matching.validators.test.ts backend/tests/exchange-matching.routes.test.ts backend/tests/exchange-permissions.test.ts
git commit -m "feat(exchange): define booking conversion contract"
```

---

### Task 4: Implement the Atomic Conversion Repository

**Files:**
- Create: `backend/src/repositories/exchange-booking-conversion.repository.ts`
- Create: `backend/tests/exchange-booking-conversion.repository.test.ts`

**Interfaces:**
- Consumes: `ExchangeBookingConversionInput`, `ExchangeBookingConversionRepositoryOptions`, Task 1 schema, the existing `ND<UTC timestamp><4 digits>` order-number format, `toAuditLogCreateData`, and `runWithTransactionConflictRetry`.
- Produces: `ExchangeBookingConversionRepository.findOwnerContext(postId, identityId)` and `convert(input, options): Promise<ExchangeBookingConversionRepositoryResult>`.

- [ ] **Step 1: Write failing transaction-order and success tests**

```ts
const result = await repository.convert(input, {
  invalidateSupersededAffiliate
});

expect(result).toMatchObject({
  outcome: "created",
  payload: {
    exchangePostId: 42,
    matchingVersion: 8,
    orders: [
      { exchangeClaimId: 101, quoteAmountJpy: 12_000, status: "pending" },
      { exchangeClaimId: 102, quoteAmountJpy: 15_000, status: "pending" }
    ]
  }
});
expect(lockOrder).toEqual([
  "customer:9",
  "post:42",
  "matching:77",
  "participants:11,12",
  "technicians:20,21",
  "slots:30,31"
]);
expect(createdOrders).toHaveLength(2);
expect(createdOrders.map((order) => order.orderType)).toEqual(["REQUEST", "REQUEST"]);
expect(createdOrders.map((order) => order.priceAmount)).toEqual(["12000", "15000"]);
expect(createdParticipants.every((participant) => participant.activeReservationKey === null)).toBe(true);
```

- [ ] **Step 2: Write failing rollback, replay, privacy, and finance-boundary tests**

```ts
expect(await repository.convert(staleInput)).toEqual({
  outcome: "version_conflict",
  currentVersion: 8
});
expect(await repository.convert(differentKeyAfterSuccess)).toEqual({
  outcome: "already_created"
});
expect(await repository.convert(sameKeyDifferentFingerprint)).toEqual({
  outcome: "idempotency_conflict"
});
expect(await repository.convert(secondSlotFullInput)).toEqual({
  outcome: "slot_unavailable"
});
expect(transactionWritesAfterAbort).toEqual([]);
expect(financeWrites).toEqual([]);
expect(eventPayload).not.toEqual(
  expect.objectContaining({ address: expect.anything(), phone: expect.anything() })
);
```

- [ ] **Step 3: Run the repository test and verify it fails**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts`

Expected: FAIL because the repository does not exist.

- [ ] **Step 4: Add owner context and replay lookup**

```ts
export interface ExchangeBookingOwnerContext {
  ownerUserId: number;
  ownerIdentityId: number;
  serviceMode: "home" | "store";
}

public async findOwnerContext(
  exchangePostId: number,
  viewerIdentityId: number
): Promise<ExchangeBookingOwnerContext | null> {
  const row = await this.client.exchangePost.findFirst({
    where: {
      id: exchangePostId,
      type: "DEMAND",
      deletedAt: null,
      OR: [
        { ownerIdentityId: viewerIdentityId },
        { matchParticipants: { some: { participantIdentityId: viewerIdentityId, deletedAt: null } } }
      ]
    },
    select: {
      authorUserId: true,
      ownerIdentityId: true,
      demand: { select: { serviceMode: true } }
    }
  });
  if (!row?.ownerIdentityId || !row.demand) return null;
  return {
    ownerUserId: row.authorUserId,
    ownerIdentityId: row.ownerIdentityId,
    serviceMode: row.demand.serviceMode === "HOME" ? "home" : "store"
  };
}
```

Inside the transaction, find `BOOKINGS_CREATED` by `idempotencyKey`; compare `payloadFingerprint`, reconstruct the response from participant/order rows, and return `replayed` without any writes.

Wrap the operation in the repository’s established retry boundary:

```ts
public convert(
  input: ExchangeBookingConversionInput,
  options: ExchangeBookingConversionRepositoryOptions = {}
): Promise<ExchangeBookingConversionRepositoryResult> {
  if (!("$transaction" in this.client)) {
    return this.convertInTransaction(input, options);
  }
  return runWithTransactionConflictRetry(() =>
    this.client.$transaction(
      (transaction) =>
        new ExchangeBookingConversionRepository(transaction).convertInTransaction(
          input,
          options
        ),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    )
  );
}
```

- [ ] **Step 5: Implement the ordered-lock validation phase**

Use raw `SELECT ... FOR UPDATE` only for locking existing row ids; use Prisma for all mutation and projection:

```ts
await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.actorUserId} FOR UPDATE`;
await tx.$queryRaw`SELECT id FROM exchange_posts WHERE id = ${input.exchangePostId} FOR UPDATE`;
await tx.$queryRaw`SELECT id FROM exchange_request_matchings WHERE exchange_post_id = ${input.exchangePostId} FOR UPDATE`;
await tx.$queryRaw(
  Prisma.sql`
    SELECT \`id\`
    FROM \`exchange_match_participants\`
    WHERE \`id\` IN (${Prisma.join(participantIds)})
      AND \`deleted_at\` IS NULL
    ORDER BY \`id\`
    FOR UPDATE
  `
);
```

Then lock sorted unique technician and slot ids. Require owner identity, Demand/post/matching `MATCHED`, exact version, at least one participant, all `bookingOrderId === null`, all non-null reservation keys, unique technicians, future active slots, matching shop/technician/service refs and times, published shop/service state, capacity, no technician hard-lock booking overlap outside the conversion set, and no active participant overlap outside the conversion set. Apply the existing customer rule once against pre-existing orders: all customers reject overlap with hard-lock statuses; Black members additionally reject overlapping pre-existing `PENDING`; do not compare participants in this same conversion batch against one another.

- [ ] **Step 6: Implement one-time ordinary pending replacement**

```ts
const superseded = isBlackMember
  ? []
  : await tx.bookingOrder.findMany({
      where: {
        customerUserId: matching.exchangePost.authorUserId,
        status: "PENDING",
        deletedAt: null,
        exchangeMatchParticipant: { is: null }
      },
      orderBy: { id: "asc" },
      include: orderInclude
    });
```

Conditionally update only those ids still `PENDING` and still unlinked; write `CANCELLED` histories, decrement each old slot by its exact count, set status to `AVAILABLE`, and call `options.invalidateSupersededAffiliate` once per old order inside the same transaction. Any count mismatch throws the repository’s abort marker and returns `slot_unavailable` after rollback.

- [ ] **Step 7: Create each order from participant authority**

```ts
const order = await tx.bookingOrder.create({
  data: {
    orderNo: this.createOrderNo(input.occurredAt),
    orderType: "REQUEST",
    customerUserId: matching.exchangePost.authorUserId,
    serviceId: participant.serviceId,
    technicianServiceId: participant.technicianServiceId,
    shopId: participant.shopId,
    technicianProfileId: participant.technicianProfileId,
    scheduleSlotId: participant.scheduleSlotId,
    status: "PENDING",
    fulfillmentMode: serviceMode,
    fulfillmentAddressSnapshot:
      serviceMode === "home"
        ? {
            line1: matching.exchangePost.demand.addressLine1,
            line2: matching.exchangePost.demand.addressLine2,
            line3: matching.exchangePost.demand.addressLine3
          }
        : null,
    priceAmount: participant.quoteAmountJpy,
    currency: "JPY",
    pricingModeSnapshot: participant.serviceId ? "MERCHANT" : "TECHNICIAN",
    serviceOwnerType: participant.serviceId ? "SHOP" : "TECHNICIAN",
    serviceOwnerId: participant.serviceId ?? participant.technicianProfileId,
    serviceNameSnapshot: participant.serviceNameSnapshot,
    servicePriceSnapshot: participant.quoteAmountJpy,
    serviceDurationSnapshot: participant.serviceDurationSnapshot,
    serviceSnapshotJson: {
      entityType: participant.serviceId ? "service" : "technician_service",
      serviceId: participant.serviceId,
      technicianServiceId: participant.technicianServiceId,
      technicianProfileId: participant.technicianProfileId,
      exchangeClaimId: participant.exchangeClaimId,
      name: participant.serviceNameSnapshot,
      priceAmount: participant.quoteAmountJpy,
      currency: "JPY",
      durationMinutes: participant.serviceDurationSnapshot
    },
    startsAt: participant.estimatedStartsAt,
    endsAt: participant.estimatedEndsAt,
    paymentMethod: "ONSITE",
    paymentStatus: "PENDING",
    paymentAmountJpy: participant.quoteAmountJpy
  }
});
```

Keep the established order-number shape with a private helper defined in this repository:

```ts
private createOrderNo(at: Date): string {
  const timestamp = [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, "0"),
    String(at.getUTCDate()).padStart(2, "0"),
    String(at.getUTCHours()).padStart(2, "0"),
    String(at.getUTCMinutes()).padStart(2, "0"),
    String(at.getUTCSeconds()).padStart(2, "0")
  ].join("");
  return `ND${timestamp}${String(randomInt(1000, 10_000))}`;
}
```

For each participant, conditionally increment one slot, create initial history `{ fromStatus: null, toStatus: "PENDING" }`, and update the participant by `id`, `bookingOrderId: null`, and `activeReservationKey: { not: null }` to `{ bookingOrderId: order.id, bookedAt, activeReservationKey: null }`.

- [ ] **Step 8: Finalize matching, event, notifications, and audit**

```ts
const versionAfter = matching.version + 1;
const updated = await tx.exchangeRequestMatching.updateMany({
  where: { id: matching.id, version: matching.version, status: "MATCHED", deletedAt: null },
  data: { version: versionAfter }
});
if (updated.count !== 1) throw new ConversionAbort("version_conflict");

await tx.exchangeMatchEvent.create({
  data: {
    matchingId: matching.id,
    sequence: versionAfter,
    type: "BOOKINGS_CREATED",
    actorUserId: input.actorUserId,
    actorIdentityId: input.actorIdentityId,
    versionBefore: matching.version,
    versionAfter,
    idempotencyKey: input.idempotencyKey,
    payloadFingerprint: input.payloadFingerprint,
    payload: {
      exchangePostId: input.exchangePostId,
      participantBookingIds: created.map(({ participantId, orderId }) => ({ participantId, orderId })),
      count: created.length,
      quoteTotalJpy: created.reduce((sum, item) => sum + item.quoteAmountJpy, 0)
    }
  }
});
```

Create one `SYSTEM` notification per provider with title/body keys `exchange.booking.created.title/body` and payload `{ exchangePostId, exchangeClaimId, orderId, orderNo, status: "pending" }`. Create one batch audit `exchange.matching.bookings.create` with ids/count/quote total/version only. Return orders sorted by participant id plus the created notification rows.

```ts
const notifications = await Promise.all(
  created.map(async (item) => {
    const row = await tx.notification.create({
      data: {
        recipientUserId: item.participantUserId,
        recipientIdentityId: item.participantIdentityId,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        type: "SYSTEM",
        title: "exchange.booking.created.title",
        body: "exchange.booking.created.body",
        payload: {
          exchangePostId: input.exchangePostId,
          exchangeClaimId: item.exchangeClaimId,
          orderId: item.orderId,
          orderNo: item.orderNo,
          status: "pending"
        },
        createdAt: input.occurredAt
      }
    });
    return {
      ...row,
      type: "system" as const
    };
  })
);

await tx.auditLog.create({
  data: toAuditLogCreateData({
    ...input.audit,
    targetId: matching.id,
    metadata: {
      exchangePostId: input.exchangePostId,
      participantBookingIds: created.map(({ participantId, orderId }) => ({
        participantId,
        orderId
      })),
      count: created.length,
      quoteTotalJpy: created.reduce((sum, item) => sum + item.quoteAmountJpy, 0),
      versionBefore: matching.version,
      versionAfter
    }
  })
});
```

- [ ] **Step 9: Run repository tests**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts`

Expected: PASS for success, same-key replay, different-key repeat, same-key conflict, full rollback, capacity, replacement, snapshots, notification/audit privacy, and zero finance calls.

- [ ] **Step 10: Commit the repository transaction**

```bash
git add backend/src/repositories/exchange-booking-conversion.repository.ts backend/tests/exchange-booking-conversion.repository.test.ts
git commit -m "feat(exchange): create matched booking batch"
```

---

### Task 5: Expose the Service, Route, OpenAPI, and Realtime Event

**Files:**
- Create: `backend/src/services/exchange-booking-conversion.service.ts`
- Create: `backend/src/controllers/exchange-booking-conversion.controller.ts`
- Create: `backend/src/routes/exchange-booking-conversion.routes.ts`
- Modify: `backend/src/services/realtime.service.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/api/openapi.ts`
- Create: `backend/tests/exchange-booking-conversion.service.test.ts`
- Create: `backend/tests/exchange-booking-conversion.routes.test.ts`
- Create: `backend/tests/exchange-booking-conversion.openapi.test.ts`
- Modify: `backend/tests/realtime-service.test.ts`

**Interfaces:**
- Consumes: Task 3 contracts, Task 4 repository, `UserPolicyEnforcementService.assertServiceEkyc`, `AffiliateCheckoutService.invalidateCancelledBooking`, `AuditLogService.createInput`, and committed notification rows.
- Produces: `ExchangeBookingConversionService.createBookings(...)`, `POST /exchange/posts/:id/matching/bookings`, and `RealtimeService.publishCommittedNotifications(...)`.

- [ ] **Step 1: Write failing service behavior tests**

```ts
await expect(
  service.createBookings(access, 42, { expectedVersion: 7 }, "idem-key-0000001", context)
).resolves.toMatchObject({ exchangePostId: 42, matchingVersion: 8 });
expect(policy.assertServiceEkyc).toHaveBeenCalledWith(access.userId, "home", now);
expect(repository.convert).toHaveBeenCalledWith(
  expect.objectContaining({
    exchangePostId: 42,
    actorIdentityId: access.currentIdentityId,
    expectedVersion: 7,
    idempotencyKey: "idem-key-0000001"
  }),
  expect.objectContaining({ invalidateSupersededAffiliate: expect.any(Function) })
);
expect(realtime.publishCommittedNotifications).toHaveBeenCalledTimes(1);
```

Use this table to assert every repository outcome maps to the exact public error:

```ts
it.each([
  ["not_found", ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND, "error.exchange.match_booking_not_found", 404],
  ["not_allowed", ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED, "error.exchange.match_booking_not_allowed", 403],
  ["invalid_state", ERROR_CODES.EXCHANGE_MATCH_BOOKING_INVALID_STATE, "error.exchange.match_booking_invalid_state", 409],
  ["version_conflict", ERROR_CODES.EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT, "error.exchange.match_booking_version_conflict", 409],
  ["already_created", ERROR_CODES.EXCHANGE_MATCH_BOOKING_ALREADY_CREATED, "error.exchange.match_booking_already_created", 409],
  ["slot_unavailable", ERROR_CODES.EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE, "error.exchange.match_booking_slot_unavailable", 409],
  ["idempotency_conflict", ERROR_CODES.EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT, "error.exchange.match_booking_idempotency_conflict", 409]
] as const)("maps %s", async (outcome, code, message, statusCode) => {
  repository.convert.mockResolvedValueOnce({ outcome });
  await expect(create()).rejects.toMatchObject({ code, message, statusCode });
});
```

Add a realtime failure test proving the created payload is returned and the failure is logged after commit; add a replay test proving `publishCommittedNotifications` is not called.

- [ ] **Step 2: Write failing route and OpenAPI tests**

```ts
await request(app)
  .post("/api/v1/exchange/posts/42/matching/bookings")
  .set("Authorization", "Bearer token")
  .set("Idempotency-Key", "idem-key-0000001")
  .send({ expectedVersion: 7 })
  .expect(200)
  .expect(({ body }) => expect(body).toMatchObject({ code: 0, message: "success" }));

expect(authorize).toHaveBeenCalledWith("exchange:matching:book-own");
expect(openapi.paths["/exchange/posts/{id}/matching/bookings"].post).toMatchObject({
  security: [{ bearerAuth: [] }]
});
```

- [ ] **Step 3: Run service, route, realtime, and OpenAPI tests**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts`

Expected: FAIL because the service and endpoint are absent.

- [ ] **Step 4: Implement the service orchestration and stable errors**

```ts
public async createBookings(
  access: AuthenticatedAccessContext,
  exchangePostId: number,
  input: ExchangeBookingConversionBody,
  rawIdempotencyKey: string,
  context: AuthRequestContext
): Promise<ExchangeBookingConversionPayload> {
  const actorIdentityId = access.currentIdentityId;
  if (!actorIdentityId) throw this.notAllowed();
  const owner = await this.repository.findOwnerContext(exchangePostId, actorIdentityId);
  if (!owner) throw this.notFound();
  if (owner.ownerIdentityId !== actorIdentityId || owner.ownerUserId !== access.userId) {
    throw this.notAllowed();
  }
  const occurredAt = this.now();
  await this.policy?.assertServiceEkyc(access.userId, owner.serviceMode, occurredAt);
  const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
  const payloadFingerprint = sha256StableJson({
    actorUserId: access.userId,
    actorIdentityId,
    exchangePostId,
    expectedVersion: input.expectedVersion
  });
  const result = await this.repository.convert(
    {
      exchangePostId,
      actorUserId: access.userId,
      actorIdentityId,
      expectedVersion: input.expectedVersion,
      idempotencyKey,
      payloadFingerprint,
      occurredAt,
      audit: this.audit.createInput({
        actor: access,
        action: "exchange.matching.bookings.create",
        targetType: "exchange_request_matching",
        context,
        metadata: { exchangePostId, expectedVersion: input.expectedVersion }
      })
    },
    this.affiliate
      ? {
          invalidateSupersededAffiliate: (value) =>
            this.affiliate!.invalidateCancelledBooking(value)
        }
      : {}
  );
  if (result.outcome !== "created" && result.outcome !== "replayed") {
    throw this.mapOutcome(result);
  }
  if (result.outcome === "created") {
    try {
      await this.realtime?.publishCommittedNotifications(result.notifications);
    } catch (error) {
      logger.error({ error, exchangePostId }, "Exchange booking realtime publish failed after commit");
    }
  }
  return result.payload;
}
```

Map the seven failure outcomes to the Task 3 error constants and design message keys. Return `data.currentVersion` for version conflicts.

- [ ] **Step 5: Publish committed notifications without reinserting them**

```ts
public async publishCommittedNotifications(
  notifications: ExchangeCommittedNotification[]
): Promise<void> {
  for (const notification of notifications) {
    this.eventGateway.publish({
      id: this.createEventId(),
      type: "notification.created",
      recipientUserId: notification.recipientUserId,
      recipientIdentityId: notification.recipientIdentityId,
      payload: notification,
      createdAt: notification.createdAt.toISOString()
    });
  }
}
```

- [ ] **Step 6: Add the controller and route**

```ts
public createBookings = this.handle(async (request, response) => {
  const { id } = exchangeBookingConversionPostIdParamSchema.parse(request.params);
  response.status(200).json(
    successResponse(
      await this.service.createBookings(
        getAuthenticatedAccess(response),
        id,
        exchangeBookingConversionBodySchema.parse(request.body),
        response.locals.exchangeIdempotencyKey as string,
        getRequestContext(request)
      )
    )
  );
});
```

```ts
router.post(
  "/exchange/posts/:id/matching/bookings",
  authenticate(),
  createAuthorizeMiddleware(EXCHANGE_PERMISSIONS.matchingBookOwn),
  validateRequest({
    params: exchangeBookingConversionPostIdParamSchema,
    body: exchangeBookingConversionBodySchema
  }),
  validateExchangeIdempotencyKey,
  controller.createBookings
);
```

Construct the default repository, audit service, Affiliate checkout service with the existing link-token config, and policy/realtime dependencies exactly as `booking.routes.ts` does. Add `exchangeBookingConversionService?: ExchangeBookingConversionService` to `AppDependencies`, mount the route after matching routes, and preserve injection for route tests.

- [ ] **Step 7: Document the exact OpenAPI contract**

Add the path, required `Idempotency-Key`, `{ expectedVersion }` body, stable success schema, bearer security, `exchange:matching:book-own` permission extension, and 400/401/403/404/409 responses. Update matching schemas with participant `booking` and `viewer.canCreateBookings`.

```ts
"/exchange/posts/{id}/matching/bookings": {
  post: {
    tags: ["Exchange"],
    security: [{ bearerAuth: [] }],
    parameters: [
      { in: "path", name: "id", required: true, schema: { type: "integer", minimum: 1 } },
      {
        in: "header",
        name: "Idempotency-Key",
        required: true,
        schema: { type: "string", minLength: 16, maxLength: 191 }
      }
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["expectedVersion"],
            properties: { expectedVersion: { type: "integer", minimum: 1 } }
          }
        }
      }
    },
    responses: {
      "200": { description: "Matched bookings created or replayed" },
      "400": { description: "Validation failed" },
      "401": { description: "Authentication required" },
      "403": { description: "Owner identity or permission required" },
      "404": { description: "Matching is not visible" },
      "409": { description: "State, version, slot, repeat, or idempotency conflict" }
    }
  }
}
```

Extend the existing matching component schema with these exact members:

```ts
booking: {
  nullable: true,
  oneOf: [
    {
      type: "object",
      required: ["orderId", "orderNo", "status"],
      properties: {
        orderId: { type: "integer" },
        orderNo: { type: "string" },
        status: {
          type: "string",
          enum: [
            "pending",
            "confirmed",
            "inService",
            "awaitingCheckout",
            "awaitingPaymentConfirmation",
            "completed",
            "cancelled"
          ]
        }
      }
    }
  ]
},
viewer: {
  type: "object",
  required: ["canSelect", "canCreateBookings"],
  properties: {
    canSelect: { type: "boolean" },
    canCreateBookings: { type: "boolean" }
  }
}
```

- [ ] **Step 8: Run service, route, realtime, and OpenAPI tests**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts`

Expected: PASS, with one repository call on normal success and no second notification insert.

- [ ] **Step 9: Commit the HTTP surface**

```bash
git add backend/src/services/exchange-booking-conversion.service.ts backend/src/controllers/exchange-booking-conversion.controller.ts backend/src/routes/exchange-booking-conversion.routes.ts backend/src/services/realtime.service.ts backend/src/app.ts backend/src/api/openapi.ts backend/tests/exchange-booking-conversion.service.test.ts backend/tests/exchange-booking-conversion.routes.test.ts backend/tests/exchange-booking-conversion.openapi.test.ts backend/tests/realtime-service.test.ts
git commit -m "feat(exchange): expose matched booking conversion"
```

---

### Task 6: Protect Exchange Orders in Generic Booking Flows

**Files:**
- Modify: `backend/src/repositories/booking.repository.ts`
- Modify: `backend/src/services/booking.service.ts`
- Modify: `backend/tests/booking-pending-replacement-contract.test.ts`
- Modify: `backend/tests/booking-repository-scope.test.ts`
- Modify: `backend/tests/booking-service.test.ts`

**Interfaces:**
- Consumes: Task 1 reverse `BookingOrder.exchangeMatchParticipant` relation and nullable participant reservation key.
- Produces: `OrderTransitionGuardedResult` outcome `exchange_cancellation_required`, protected replacement filters, converted-participant conflict exclusion, and an authorized `fulfillmentAddressSnapshot` order projection.

- [ ] **Step 1: Write failing pending-replacement and conflict tests**

```ts
expect(pendingReplacementWhere).toMatchObject({
  customerUserId,
  status: "PENDING",
  deletedAt: null,
  exchangeMatchParticipant: { is: null }
});
expect(pendingReplacementUpdateWhere.exchangeMatchParticipant).toEqual({ is: null });
expect(exchangeOverlapWhere.activeReservationKey).toEqual({ not: null });
```

Add a normal-order regression showing an unlinked ordinary `PENDING` still cancels and releases capacity, while a linked Exchange order remains `PENDING` and retains capacity.

- [ ] **Step 2: Write failing cancellation guard tests**

```ts
expect(
  await repository.transitionOrderWithScheduleGuard({
    id: 501,
    actorUserId: 9,
    actor,
    fromStatus: "pending",
    toStatus: "cancelled",
    reason: "changed mind"
  })
).toEqual({ outcome: "exchange_cancellation_required" });
expect(orderUpdate).not.toHaveBeenCalled();
expect(slotUpdate).not.toHaveBeenCalled();
expect(historyCreate).not.toHaveBeenCalled();
```

```ts
await expect(service.cancelOrder(actor, 501, "changed mind", context)).rejects.toMatchObject({
  code: ERROR_CODES.EXCHANGE_MATCH_CANCELLATION_REQUIRED,
  message: "error.exchange.match_cancellation_required",
  statusCode: 409
});
```

- [ ] **Step 3: Run the focused Booking tests and verify failures**

Run: `cd backend && npm test -- --runInBand tests/booking-pending-replacement-contract.test.ts tests/booking-repository-scope.test.ts tests/booking-service.test.ts`

Expected: FAIL because linked orders are not protected and converted participants still conflict.

- [ ] **Step 4: Protect pending replacement and active conflict queries**

```ts
where: {
  customerUserId: input.customerUserId,
  status: "PENDING",
  deletedAt: null,
  exchangeMatchParticipant: { is: null }
}
```

Repeat the same relation predicate in the conditional `updateMany`, so a concurrent Exchange link prevents silent cancellation. Add `activeReservationKey: { not: null }` to every `hasExchangeMatchParticipantOverlap` query.

- [ ] **Step 5: Add the guarded cancellation outcome in the transaction**

```ts
export type OrderTransitionGuardedResult =
  | { outcome: "ok"; order: BookingOrderPayload }
  | { outcome: "acceptance_paused"; pauses: ActiveOrderAcceptancePauseSummary[] }
  | {
      outcome:
        | "invalid_state"
        | "schedule_conflict"
        | "exchange_cancellation_required";
    };
```

Extend `orderInclude()` with `exchangeMatchParticipant: { select: { id: true } }`. Immediately after loading the current order and checking `fromStatus`, return `exchange_cancellation_required` when `toStatus === "cancelled"` and the relation exists, before any order/slot/history/affiliate/finance write.

- [ ] **Step 6: Route confirm and cancel through the guarded result**

```ts
const guardedResult = await this.repository.transitionOrderWithScheduleGuard?.(
  transitionInput,
  transitionOptions
);
if (guardedResult?.outcome === "exchange_cancellation_required") {
  throw new AppError({
    code: ERROR_CODES.EXCHANGE_MATCH_CANCELLATION_REQUIRED,
    message: "error.exchange.match_cancellation_required",
    statusCode: 409
  });
}
```

Retain the existing fallback to `transitionOrder` only for injected repositories that do not implement `transitionOrderWithScheduleGuard`.

- [ ] **Step 7: Project the authorized home address snapshot**

```ts
export type FulfillmentAddressSnapshot = {
  line1: string;
  line2: string | null;
  line3: string | null;
};

export interface BookingOrderPayload {
  fulfillmentAddressSnapshot: FulfillmentAddressSnapshot | null;
}
```

Map only an object with a non-empty string `line1`; otherwise return null:

```ts
private fulfillmentAddressSnapshot(value: unknown): FulfillmentAddressSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.line1 !== "string" || record.line1.trim().length === 0) return null;
  return {
    line1: record.line1,
    line2: typeof record.line2 === "string" ? record.line2 : null,
    line3: typeof record.line3 === "string" ? record.line3 : null
  };
}
```

The existing Booking service identity checks remain the privacy boundary for `GET /orders/:id`. Add these repository/service assertions and keep the address out of matching/event/audit/notification payloads:

```ts
expect(await service.getOrder(ownerActor, 501)).toMatchObject({
  fulfillmentAddressSnapshot: { line1: "東京都渋谷区", line2: "神南1-2-3", line3: null }
});
expect(await service.getOrder(providerActor, 501)).toMatchObject({
  fulfillmentAddressSnapshot: { line1: "東京都渋谷区", line2: "神南1-2-3", line3: null }
});
await expect(service.getOrder(unrelatedActor, 501)).rejects.toMatchObject({ statusCode: 404 });
```

- [ ] **Step 8: Run the Booking regression suites**

Run: `cd backend && npm test -- --runInBand tests/booking-pending-replacement-contract.test.ts tests/booking-repository-scope.test.ts tests/booking-service.test.ts`

Expected: PASS for ordinary replacement, Exchange protection, converted participant exclusion, authorized address projection, normal cancellation, and Exchange cancellation zero-write behavior.

- [ ] **Step 9: Commit Booking protection**

```bash
git add backend/src/repositories/booking.repository.ts backend/src/services/booking.service.ts backend/tests/booking-pending-replacement-contract.test.ts backend/tests/booking-repository-scope.test.ts backend/tests/booking-service.test.ts
git commit -m "fix(booking): protect exchange matched orders"
```

---

### Task 7: Add the Owner and Matched-Provider UI

**Files:**
- Modify: `src/features/exchange/types.ts`
- Modify: `src/features/exchange/api.ts`
- Modify: `src/features/exchange/api.test.ts`
- Modify: `src/features/exchange/i18n.ts`
- Modify: `src/features/exchange/ExchangeReceivedClaims.tsx`
- Modify: `src/features/exchange/ExchangeReceivedClaims.test.tsx`
- Create: `src/features/exchange/ExchangeMatchedBookingCard.tsx`
- Create: `src/features/exchange/ExchangeMatchedBookingCard.test.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.tsx`
- Modify: `src/features/exchange/ExchangePostDetailPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 matching projection and Task 5 conversion endpoint.
- Produces: `createExchangeMatchingBookings(postId, input, key)`, owner conversion UI, provider-scoped order UI, persisted refresh behavior, and five-language copy.

- [ ] **Step 1: Write the failing API contract test**

```ts
await createExchangeMatchingBookings("42", { expectedVersion: 7 }, "idem-key-0000001");
expect(request).toHaveBeenCalledWith("/exchange/posts/42/matching/bookings", {
  body: { expectedVersion: 7 },
  headers: { "Idempotency-Key": "idem-key-0000001" },
  method: "POST"
});
```

- [ ] **Step 2: Write failing owner UI tests**

```tsx
expect(screen.getByRole("button", { name: "确认预约" })).toBeEnabled();
expect(screen.getByText("此操作会为每位入选服务者创建一张独立待接单预约。"))
  .toBeInTheDocument();
expect(screen.getByText("本步骤不会收取服务款。")).toBeInTheDocument();
expect(screen.getByText("2")).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "确认预约" }));
expect(createExchangeMatchingBookings).toHaveBeenCalledWith(
  "42",
  { expectedVersion: 7 },
  expect.any(String)
);
expect(getExchangeMatching).toHaveBeenCalledTimes(2);
expect(screen.queryByRole("button", { name: "确认预约" })).not.toBeInTheDocument();
expect(screen.getAllByRole("link", { name: "查看订单" })).toHaveLength(2);
```

Add retry assertions proving identical failed attempts reuse the idempotency key, a changed matching version rotates it, `409` version conflict triggers a persisted refresh, and replay renders the same order links.

- [ ] **Step 3: Write failing matched-provider and privacy tests**

```tsx
render(<ExchangeMatchedBookingCard context="technician" language="zh" postId="42" />);
expect(await screen.findByText("ND501")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "查看订单" })).toHaveAttribute(
  "href",
  "/technician/orders/501"
);
expect(screen.queryByText("ND502")).not.toBeInTheDocument();
expect(screen.queryByText("其他入选者")).not.toBeInTheDocument();
```

Verify the detail page renders this card when `viewer.canViewMatching === true` and `viewer.canViewClaims === false`, and renders neither panel for an unselected viewer.

- [ ] **Step 4: Run the frontend tests and verify failures**

Run: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx`

Expected: FAIL because the API method, booking states, provider card, and copy are absent.

- [ ] **Step 5: Add exact frontend contracts and API call**

```ts
export type ExchangeParticipantBooking = {
  orderId: number;
  orderNo: string;
  status:
    | "pending"
    | "confirmed"
    | "inService"
    | "awaitingCheckout"
    | "awaitingPaymentConfirmation"
    | "completed"
    | "cancelled";
};

export type ExchangeBookingConversion = {
  exchangePostId: number;
  matchingVersion: number;
  bookedAt: string;
  orders: Array<{
    exchangeClaimId: number;
    orderId: number;
    orderNo: string;
    status: "pending";
    providerPublicId: string;
    quoteAmountJpy: number;
    startsAt: string;
    endsAt: string;
  }>;
};

export function createExchangeMatchingBookings(
  postId: string,
  input: { expectedVersion: number },
  key: string
): Promise<ExchangeBookingConversion> {
  return httpClient.request<ExchangeBookingConversion>(
    `/exchange/posts/${postId}/matching/bookings`,
    { body: input, headers: idempotencyHeaders(key), method: "POST" }
  );
}
```

Add `booking` to each participant, `canCreateBookings` to matching viewer, and `canViewMatching` to post viewer.

- [ ] **Step 6: Add five-language booking copy**

Add keys for the heading, one/many order explanation, “this step does not charge”, confirm, pending, retry, stale refresh, created, order number, view order, and provider selected state. Define all five locales in the same change; keep `provider.displayName`, authored text, order number, and public id outside translation.

```ts
bookingTitle: {
  zh: "确认匹配预约",
  "zh-Hant": "確認配對預約",
  ja: "マッチした予約を確定",
  en: "Confirm matched bookings",
  ko: "매칭 예약 확정"
},
bookingBatchExplanation: {
  zh: "此操作会为每位入选服务者创建一张独立待接单预约。",
  "zh-Hant": "此操作會為每位入選服務者建立一張獨立待接單預約。",
  ja: "選ばれた提供者ごとに、個別の受付待ち予約を1件作成します。",
  en: "This creates one independent pending booking for each selected provider.",
  ko: "선정된 서비스 제공자마다 독립적인 접수 대기 예약을 하나씩 생성합니다."
},
bookingConfirm: {
  zh: "确认预约",
  "zh-Hant": "確認預約",
  ja: "予約を確定",
  en: "Confirm bookings",
  ko: "예약 확정"
},
bookingNoCharge: {
  zh: "本步骤不会收取服务款。",
  "zh-Hant": "此步驟不會收取服務款。",
  ja: "この手順ではサービス料金は請求されません。",
  en: "No service payment is charged at this step.",
  ko: "이 단계에서는 서비스 요금이 청구되지 않습니다."
},
bookingCreating: {
  zh: "正在创建预约…",
  "zh-Hant": "正在建立預約…",
  ja: "予約を作成しています…",
  en: "Creating bookings…",
  ko: "예약 생성 중…"
},
bookingPending: {
  zh: "待接单",
  "zh-Hant": "待接單",
  ja: "受付待ち",
  en: "Pending acceptance",
  ko: "접수 대기"
},
bookingCreated: {
  zh: "预约已创建",
  "zh-Hant": "預約已建立",
  ja: "予約を作成しました",
  en: "Bookings created",
  ko: "예약이 생성되었습니다"
},
bookingCreateFailed: {
  zh: "预约创建失败，请重试。",
  "zh-Hant": "預約建立失敗，請重試。",
  ja: "予約を作成できませんでした。再試行してください。",
  en: "Bookings could not be created. Try again.",
  ko: "예약을 생성하지 못했습니다. 다시 시도해 주세요."
},
bookingStaleRefreshed: {
  zh: "匹配状态已变化，已刷新正式数据。",
  "zh-Hant": "配對狀態已變更，已重新整理正式資料。",
  ja: "マッチング状態が変わったため、正式データを更新しました。",
  en: "Matching changed, so persisted data was refreshed.",
  ko: "매칭 상태가 변경되어 정식 데이터를 새로고침했습니다."
},
bookingRetry: {
  zh: "重试创建预约",
  "zh-Hant": "重試建立預約",
  ja: "予約作成を再試行",
  en: "Retry booking creation",
  ko: "예약 생성 다시 시도"
},
bookingOrderNumber: {
  zh: "订单编号",
  "zh-Hant": "訂單編號",
  ja: "注文番号",
  en: "Order number",
  ko: "주문 번호"
},
bookingViewOrder: {
  zh: "查看订单",
  "zh-Hant": "查看訂單",
  ja: "注文を見る",
  en: "View order",
  ko: "주문 보기"
},
bookingProviderSelected: {
  zh: "您已入选此需求",
  "zh-Hant": "您已入選此需求",
  ja: "この依頼の提供者に選ばれました",
  en: "You were selected for this request",
  ko: "이 요청의 서비스 제공자로 선정되었습니다"
},
bookingAwaitingOwner: {
  zh: "等待发布者确认预约",
  "zh-Hant": "等待發布者確認預約",
  ja: "投稿者の予約確定を待っています",
  en: "Waiting for the publisher to confirm bookings",
  ko: "게시자의 예약 확정을 기다리는 중입니다"
}
```

Cover every new key in the existing i18n completeness test.

- [ ] **Step 7: Implement owner conversion with stable retry identity**

```ts
const bookingAttemptRef = useRef<{ signature: string; key: string } | null>(null);

async function createBookings() {
  if (!matching?.viewer.canCreateBookings || bookingPending) return;
  const signature = JSON.stringify({ postId, expectedVersion: matching.version });
  const attempt =
    bookingAttemptRef.current?.signature === signature
      ? bookingAttemptRef.current
      : { signature, key: crypto.randomUUID() };
  bookingAttemptRef.current = attempt;
  setBookingPending(true);
  setBookingError(false);
  try {
    await createExchangeMatchingBookings(
      postId,
      { expectedVersion: matching.version },
      attempt.key
    );
    await refreshPersistedState();
  } catch (error) {
    setBookingError(true);
    if (error instanceof ApiClientError && error.status === 409) {
      await refreshPersistedState();
    }
  } finally {
    setBookingPending(false);
  }
}
```

Render the action only when `canCreateBookings`; render persisted participant `booking` rows and links produced by `getScheduleOrderDetailRoute(String(orderId), context)` after refresh. Do not store the conversion response as the final display authority.

- [ ] **Step 8: Implement the matched-provider card and page routing**

The card fetches `getExchangeMatching(postId)` with abort cleanup, displays the single returned participant, its quote/time/service/provider, and its own booking link. It renders accessible loading, error/retry, selected-without-order, and booked states. Both owner rows and provider card receive `context: MessageCenterContext` and call `getScheduleOrderDetailRoute(String(orderId), context)` so user, merchant, and technician links open their authorized formal route. In the detail page:

```tsx
{post.viewer.canViewClaims ? (
  <ExchangeReceivedClaims
    context={context}
    language={language}
    postId={post.id}
    onMatched={refreshPost}
  />
) : post.viewer.canViewMatching ? (
  <ExchangeMatchedBookingCard context={context} language={language} postId={post.id} />
) : null}
```

- [ ] **Step 9: Run frontend tests, type check, and i18n audit**

Run: `npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx && npm run lint && npm run i18n:audit`

Expected: all selected Vitest suites PASS, TypeScript passes, and the i18n audit reports no missing booking keys.

- [ ] **Step 10: Commit the frontend**

```bash
git add src/features/exchange/types.ts src/features/exchange/api.ts src/features/exchange/api.test.ts src/features/exchange/i18n.ts src/features/exchange/ExchangeReceivedClaims.tsx src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.tsx src/features/exchange/ExchangePostDetailPage.test.tsx
git commit -m "feat(exchange): confirm matched bookings in app"
```

---

### Task 8: Prove the Formal Flow Against Local MySQL

**Files:**
- Create: `backend/scripts/check-exchange-booking-conversion-flow.ts`
- Create: `backend/tests/exchange-booking-conversion-flow-script.test.ts`
- Create: `backend/tests/exchange-booking-conversion.repository.integration.test.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: the real Task 4 repository and Task 5 service plus the shared Exchange local database safety guard.
- Produces: `npm run check:exchange-booking-conversion-flow` and env-gated concurrency suite `RUN_EXCHANGE_BOOKING_CONVERSION_INTEGRATION=true`.

- [ ] **Step 1: Write the failing checker source contract**

```ts
for (const token of [
  "requireSafeExchangeClaimFlowEnvironment",
  "RollbackVerifiedExchangeBookingConversion",
  "ExchangeBookingConversionService",
  "ExchangeBookingConversionRepository",
  "participantOrderCountMatches",
  "ordinaryPendingReplaced",
  "sameBatchPendingCoexists",
  "idempotentReplay",
  "idempotencyConflictRejected",
  "staleVersionRejected",
  "slotFailureRolledBack",
  "publicationFinanceUnchanged",
  "walletLedgerReconciliationUnchanged",
  "cleanupVerified"
]) {
  expect(source).toContain(token);
}
expect(packageJson.scripts["check:exchange-booking-conversion-flow"]).toBe(
  "tsx scripts/check-exchange-booking-conversion-flow.ts"
);
```

- [ ] **Step 2: Write the guarded integration test shell**

```ts
const enabled = process.env.RUN_EXCHANGE_BOOKING_CONVERSION_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("Exchange booking conversion concurrency", () => {
  it("allows exactly one of two independent connections to commit", async () => {
    const results = await Promise.allSettled([
      serviceA.createBookings(ownerAccess, postId, { expectedVersion }, keyA, context),
      serviceB.createBookings(ownerAccess, postId, { expectedVersion }, keyB, context)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run static checker tests and verify failures**

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion-flow-script.test.ts tests/exchange-booking-conversion.repository.integration.test.ts`

Expected: the script-contract suite FAILS because the checker and package command are absent; the guarded integration suite is skipped without its flag.

- [ ] **Step 4: Build the rollback-contained main-flow checker**

Use `requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE)` before loading Prisma. Create marker-scoped customer/owner/provider identities, published services, technicians, two slots, one old ordinary pending order, a matched Exchange request, two participants, a publication financial record and hold, and baseline counts for wallet, hold, Exchange financial, ledger transaction, wallet ledger, finance reconciliation, order financial, booking, notification, audit, event, participant, and slot capacity.

Execute the real Service/Repository inside an outer transaction and assert:

```ts
const report = {
  participantOrderCountMatches:
    created.orders.length === participants.length && linkedCount === participants.length,
  ordinaryPendingReplaced: oldOrder.status === "CANCELLED" && oldSlot.bookedCount === 0,
  sameBatchPendingCoexists:
    createdOrders.every((order) => order.status === "PENDING") && createdOrders.length === 2,
  idempotentReplay: sameValue(created, replayed),
  idempotencyConflictRejected,
  staleVersionRejected,
  slotFailureRolledBack,
  publicationFinanceUnchanged,
  walletLedgerReconciliationUnchanged,
  cleanupVerified: false
};
```

Check exact quote/name/duration/address snapshots, one capacity increment per participant, cleared reservation keys, one batch event, provider notifications, redacted event/audit metadata, and no service-payment or Request dispatch-fee hold yet. Throw `RollbackVerifiedExchangeBookingConversion` to roll back. After the rollback, query from the root Prisma connection and set `cleanupVerified` only when every marker row is absent and all captured baseline counts/capacities match.

- [ ] **Step 5: Implement the committed concurrency proof with exact cleanup**

Create the fixture with one connection, race two services backed by independent Prisma clients, assert one success and one `already_created` or version-conflict AppError, then verify exactly one order per participant, one capacity increment per slot, one event, and no partial participant state. In `finally`, delete only captured notification/audit/event/history/participant/order/matching/claim/post/service/slot/identity/user ids in FK-safe order, restore captured pre-existing slot values, disconnect both clients, and query zero residual marker rows.

```ts
const clients = [new PrismaClient(), new PrismaClient()];
try {
  const results = await Promise.allSettled([
    createService(clients[0]).createBookings(ownerAccess, postId, { expectedVersion }, keyA, context),
    createService(clients[1]).createBookings(ownerAccess, postId, { expectedVersion }, keyB, context)
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.bookingOrder.count({ where: { id: { in: capturedOrderIds } } })).toBe(
    participantIds.length
  );
  expect(await prisma.exchangeMatchEvent.count({
    where: { matchingId, type: "BOOKINGS_CREATED" }
  })).toBe(1);
} finally {
  await cleanupCapturedIds(prisma, capturedIds);
  await Promise.all(clients.map((client) => client.$disconnect()));
  expect(await countMarkerRows(prisma, marker)).toBe(0);
}
```

- [ ] **Step 6: Register and run the static tests**

```json
"check:exchange-booking-conversion-flow": "tsx scripts/check-exchange-booking-conversion-flow.ts"
```

Run: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion-flow-script.test.ts tests/exchange-booking-conversion.repository.integration.test.ts`

Expected: static checker test PASS and integration suite SKIP without its explicit flag.

- [ ] **Step 7: Reconcile and apply only this migration locally**

Run: `cd backend && ENV_FILE=.env.dev npx prisma migrate status`

Expected: report identifies the exact pending set.

When this task migration is the only pending migration, run: `cd backend && ENV_FILE=.env.dev npx prisma migrate deploy`

Expected: only `20260903100000_exchange_matched_booking_conversion` is applied.

If an unrelated earlier migration is pending, do not run deploy. First prove this task migration has no dependency on that unrelated file, then run:

```bash
(cd backend && ENV_FILE=.env.dev npx prisma db execute --file prisma/migrations/20260903100000_exchange_matched_booking_conversion/migration.sql)
(cd backend && ENV_FILE=.env.dev npm run check:exchange-booking-conversion-flow)
(cd backend && ENV_FILE=.env.dev npx prisma migrate resolve --applied 20260903100000_exchange_matched_booking_conversion)
```

Expected: the task SQL succeeds, the checker’s physical and rollback assertions pass before migration history is marked, and Prisma records only this migration as applied; the unrelated migration remains pending and untouched.

Run: `cd backend && npm run prisma:generate`

Expected: Prisma Client generation succeeds.

- [ ] **Step 8: Run the real rollback checker and concurrency proof**

Run: `cd backend && ENV_FILE=.env.dev npm run check:exchange-booking-conversion-flow`

Expected: JSON evidence reports every named boolean `true`, ends with rollback/cleanup proof, and leaves no marker rows.

Run: `cd backend && ENV_FILE=.env.dev RUN_EXCHANGE_BOOKING_CONVERSION_INTEGRATION=true npm test -- --runInBand tests/exchange-booking-conversion.repository.integration.test.ts`

Expected: PASS with exactly one committed competitor followed by exact cleanup.

- [ ] **Step 9: Reconcile physical database evidence**

Query `INFORMATION_SCHEMA.COLUMNS`, `STATISTICS`, `REFERENTIAL_CONSTRAINTS`, and `CHECK_CONSTRAINTS` for the new columns/index/FK/check; query `_prisma_migrations` for the task migration; query permissions/role permissions for `exchange:matching:book-own`. Save the command output in the execution log, not as a generated repository artifact.

- [ ] **Step 10: Commit the formal checker**

```bash
git add backend/scripts/check-exchange-booking-conversion-flow.ts backend/tests/exchange-booking-conversion-flow-script.test.ts backend/tests/exchange-booking-conversion.repository.integration.test.ts backend/package.json
git commit -m "test(exchange): verify matched booking conversion"
```

---

### Task 9: Run Full Gates, Browser Acceptance, Document, Merge Locally, and Pause

**Files:**
- Modify: `README.md`
- Verify: all files changed since `main`

**Interfaces:**
- Consumes: all prior tasks and the formal local runtime on backend `3000`, frontend `5180`, MySQL, and Redis.
- Produces: repository-wide green gates, two-identity mobile browser evidence, a documented local migration, and one local `main` merge with no push/deploy.

- [ ] **Step 1: Document the completed formal boundary**

Add a README section containing:

```markdown
### Exchange matched booking conversion

`POST /api/v1/exchange/posts/:id/matching/bookings` converts every persisted matched participant into one independent `PENDING` Request order in one idempotent transaction. The command uses the matched quote/service/time snapshots, transfers each temporary participant reservation into formal slot capacity, replaces only ordinary unprotected pending orders for non-Black customers, and creates no service payment or Exchange publication-fee settlement.

Run the rollback-contained local proof with:

`cd backend && ENV_FILE=.env.dev npm run check:exchange-booking-conversion-flow`

Exchange-linked orders cannot use the generic cancel endpoint; bilateral cancellation and publication-fee handling remain a later microstep.
```

After database/browser acceptance, append the applied migration name, physical constraint reconciliation, tested identities, viewport sizes, runtime pid/cwd/branch/proxy evidence, and marker cleanup result.

- [ ] **Step 2: Run focused tests once as a complete slice**

Run:

```bash
cd backend && npm test -- --runInBand tests/exchange-booking-conversion-schema.test.ts tests/exchange-matching-schema.test.ts tests/exchange-matching.repository.test.ts tests/exchange-claim.repository.test.ts tests/exchange.repository.test.ts tests/exchange-booking-conversion.validators.test.ts tests/exchange-matching.validators.test.ts tests/exchange-matching.routes.test.ts tests/exchange-permissions.test.ts tests/exchange-booking-conversion.repository.test.ts tests/exchange-booking-conversion.service.test.ts tests/exchange-booking-conversion.routes.test.ts tests/exchange-booking-conversion.openapi.test.ts tests/realtime-service.test.ts tests/booking-pending-replacement-contract.test.ts tests/booking-repository-scope.test.ts tests/booking-service.test.ts tests/exchange-booking-conversion-flow-script.test.ts
```

Expected: all focused backend suites PASS.

Run:

```bash
npm test -- src/features/exchange/api.test.ts src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx
```

Expected: all focused frontend suites PASS.

- [ ] **Step 3: Run repository-wide automated gates**

Run: `cd backend && npm run lint && npm test -- --runInBand && npm run build && npx prisma validate --schema prisma/schema.prisma && npm run prisma:generate`

Expected: backend lint, complete Jest suite, TypeScript build, Prisma validation, and client generation all succeed.

Run: `npm run lint && npm test && npm run build && npm run i18n:audit && npm run i18n:quality`

Expected: frontend type check, complete Vitest suite, production build, and both i18n audits succeed.

- [ ] **Step 4: Audit scope and clean diff**

Run: `git diff --check && git status --short && git diff --stat main...HEAD && git log --oneline main..HEAD`

Expected: no whitespace errors, only the mapped Exchange/Booking/docs files are changed, and no checker marker or generated runtime artifact is tracked.

Run: `git diff --unified=0 main...HEAD -- backend/src backend/scripts src/features/exchange`

Expected: every added implementation line satisfies the prohibitions and completion checklist in `AGENTS.md` section 8; no newly added stub, fake data path, debug-only branch, or unfinished marker is present.

- [ ] **Step 5: Integrate the latest local main into the feature branch and rerun risk gates**

Run: `git fetch --all --prune` only if network access and remote refresh were explicitly authorized; otherwise use the current local `main` as the integration base.

Run: `git merge main`

Expected: merge succeeds without discarding either side. Resolve only task-owned overlaps; preserve unrelated main work.

Rerun: `cd backend && npm test -- --runInBand tests/exchange-booking-conversion.repository.test.ts tests/exchange-booking-conversion.service.test.ts tests/booking-service.test.ts && npm run build`

Rerun: `npm test -- src/features/exchange/ExchangeReceivedClaims.test.tsx src/features/exchange/ExchangeMatchedBookingCard.test.tsx src/features/exchange/ExchangePostDetailPage.test.tsx && npm run build`

Expected: all risk-focused tests and builds PASS after integration.

- [ ] **Step 6: Start the exact formal runtime and prove ownership before browser QA**

From this feature worktree run `npm run dev:formal`. Before using the browser, record:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
ps -o pid=,ppid=,command= -p <backend-pid>,<frontend-pid>
lsof -a -p <backend-pid> -d cwd -Fn
lsof -a -p <frontend-pid> -d cwd -Fn
git branch --show-current
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
curl -s http://127.0.0.1:5180/api/v1/health
```

Expected: both listeners belong to this exact worktree/branch, health and ready return code `0`, and the frontend proxy health response comes from the same backend origin. A reused listener from a different checkout is not acceptance evidence.

- [ ] **Step 7: Run owner browser acceptance at 440px and 320px**

Using a formal customer or merchant-owner identity and marker-scoped matched Demand:

1. Open the Exchange detail and prove matching count, quotes, provider summaries, and “this step does not charge” copy.
2. Click confirm once and prove exactly one request, accessible pending state, and one batch response.
3. Reload and prove the button stays absent and every order number/link comes from `GET .../matching`.
4. Open each order through the formal order route and prove `PENDING`, Request type, quote price, service/time snapshots, and home address visibility only to authorized order participants.
5. Retry the same command and prove replay creates no duplicate orders or slot increments.
6. Check console errors, failed network requests, focus visibility, loading/error/retry text, and `document.documentElement.scrollWidth <= window.innerWidth` at both widths.

Expected: no horizontal overflow, no unauthorized data, no duplicate mutation, and refresh persistence at 440×956 and 320×956.

- [ ] **Step 8: Run matched-provider and negative browser acceptance**

Switch to one matched provider identity, reopen the same post, and prove only that provider’s participant/order link is visible. Open the order through `GET /orders/:id`; verify another participant’s order id is absent from page source and matching response. Attempt ordinary cancel and prove `error.exchange.match_cancellation_required` with unchanged order, slot, participant, wallet, hold, and financial records. Switch to an unselected identity and prove the matching endpoint/detail card is unavailable.

- [ ] **Step 9: Commit documentation and final acceptance notes**

```bash
git add README.md
git commit -m "docs: record exchange booking acceptance"
```

Run: `git diff --check main...HEAD && git status --short`

Expected: clean task worktree and no whitespace errors.

- [ ] **Step 10: Merge into the local main checkout without touching unrelated dirty files**

Run:

```bash
git -C "/Users/eason/Documents/New project" status --short --branch
git -C "/Users/eason/Documents/New project" diff --name-only
git diff --name-only main...HEAD
```

If an unrelated main-checkout change overlaps a task-owned path, stop and ask the user before merging. Otherwise run:

```bash
git -C "/Users/eason/Documents/New project" merge --no-ff codex/exchange-matched-booking-conversion -m "Merge branch 'codex/exchange-matched-booking-conversion'"
```

Expected: local `main` contains the feature merge; unrelated dirty files remain byte-for-byte unchanged.

- [ ] **Step 11: Prove the merged main runtime and pause**

Restart formal backend/frontend from `/Users/eason/Documents/New project`, repeat PID/cwd/branch/proxy proof, run one owner refresh and one matched-provider refresh, then record:

- repository commit and local main merge commit;
- remote push: not performed;
- deployment: not performed;
- production migration: not performed;
- local MySQL migration: applied and reconciled;
- browser acceptance: owner/provider, 440px/320px, passed;
- deferred scope: matching cancellation agreement, publication-fee settlement, service payment, and external payment.

Stop. Do not begin the next Exchange payment or cancellation microstep.
