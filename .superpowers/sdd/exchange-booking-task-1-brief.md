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
