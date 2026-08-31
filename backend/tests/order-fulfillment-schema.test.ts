import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260901090000_order_fulfillment_checkout/migration.sql"
  ),
  "utf8"
);

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

const namedBlock = (source: string, kind: "model" | "enum", name: string): string => {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing ${kind} ${name}`);
  return match[1];
};

const modelBlock = (name: string): string => namedBlock(schema, "model", name);

const prismaEnumValues = (name: string): string[] =>
  namedBlock(schema, "enum", name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0]);

const tableBlock = (source: string, name: string): string => {
  const match = source.match(
    new RegExp(
      "CREATE TABLE `" +
        name +
        "` \\(([\\s\\S]*?)\\n\\) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    )
  );
  if (!match) throw new Error(`missing table ${name}`);
  return match[1];
};

const columnDefinitions = (source: string, table: string): Record<string, string> =>
  Object.fromEntries(
    tableBlock(source, table)
      .split("\n")
      .filter((line) => /^ {2}`[^`]+`/.test(line))
      .map((line) => {
        const match = line.match(/^ {2}`([^`]+)`\s+(.+?)(?:,)?$/);
        if (!match) throw new Error(`invalid column definition in ${table}: ${line}`);
        return [match[1], match[2].replace(/,$/, "")];
      })
  );

const indexDefinitions = (source: string, table: string): string[] =>
  tableBlock(source, table)
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => /^(?:UNIQUE )?INDEX /.test(line));

const modelDirectives = (name: string): string[] =>
  modelBlock(name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@@"));

const foreignKeyDefinitions = (source: string): string[] =>
  Array.from(
    source.matchAll(
      /ADD CONSTRAINT `[^`]+`\s+FOREIGN KEY \([^)]+\) REFERENCES `[^`]+`\([^)]+\) ON DELETE \w+ ON UPDATE \w+/g
    ),
    (match) => normalize(match[0])
  );

const checkConstraint = (source: string, name: string): string => {
  const marker = `CONSTRAINT \`${name}\` CHECK (`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing CHECK ${name}`);

  const opening = source.indexOf("(", start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated CHECK ${name}`);
};

const requireSql = (source: string, expected: string, message: string): void => {
  if (!normalize(source).includes(normalize(expected))) throw new Error(message);
};

const expectedPaymentMethods = ["onsite", "bank_transfer", "cash", "ndp", "other"];

const assertCheckoutPaymentEnum = (source: string): void => {
  const definition = columnDefinitions(source, "order_checkouts").payment_method;
  const actual = Array.from(definition.matchAll(/'([^']+)'/g), (match) => match[1]);
  if (JSON.stringify(actual) !== JSON.stringify(expectedPaymentMethods)) {
    throw new Error("checkout payment enum drift");
  }
};

const compositeOwnershipFks = [
  "FOREIGN KEY (`service_session_id`, `booking_order_id`) REFERENCES `order_service_sessions`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "FOREIGN KEY (`order_add_on_id`, `booking_order_id`, `service_session_id`) REFERENCES `order_add_ons`(`id`, `booking_order_id`, `service_session_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "FOREIGN KEY (`order_checkout_id`, `booking_order_id`) REFERENCES `order_checkouts`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT"
] as const;

const assertCompositeOwnershipFks = (source: string): void => {
  for (const foreignKey of compositeOwnershipFks) {
    requireSql(source, foreignKey, `missing composite ownership FK: ${foreignKey}`);
  }
};

const assertEvidenceChecks = (source: string): void => {
  for (const name of [
    "ndp_exchange_rate_rules_ndp_units_chk",
    "ndp_exchange_rate_rules_jpy_units_chk",
    "order_service_sessions_ended_chronology_chk",
    "order_service_sessions_expected_chronology_chk",
    "order_add_ons_price_chk",
    "order_add_ons_duration_chk",
    "order_add_ons_resolution_chk",
    "order_checkouts_base_amount_chk",
    "order_checkouts_add_on_amount_chk",
    "order_checkouts_discount_amount_chk",
    "order_checkouts_amount_chk",
    "order_checkouts_total_chk",
    "order_checkouts_other_method_chk",
    "order_checkouts_ledger_method_chk",
    "order_checkouts_receipt_evidence_chk",
    "order_service_events_shape_chk",
    "ndp_exchange_rate_rules_version_chk",
    "ndp_exchange_rate_rules_window_chk",
    "ndp_exchange_rate_rules_active_sentinel_chk"
  ]) {
    checkConstraint(source, name);
  }

  requireSql(
    checkConstraint(source, "order_service_sessions_ended_chronology_chk"),
    "`ended_at` IS NULL OR (`started_at` IS NOT NULL AND `ended_at` >= `started_at`)",
    "ended chronology drift"
  );
  requireSql(
    checkConstraint(source, "order_service_sessions_expected_chronology_chk"),
    "`expected_ends_at` IS NULL OR `started_at` IS NULL OR `expected_ends_at` >= `started_at`",
    "expected-end chronology drift"
  );
  const exactChecks: Record<string, string> = {
    ndp_exchange_rate_rules_ndp_units_chk: "`ndp_units` > 0",
    ndp_exchange_rate_rules_jpy_units_chk: "`jpy_units` > 0",
    ndp_exchange_rate_rules_version_chk: "`version` > 0",
    ndp_exchange_rate_rules_window_chk:
      "`effective_to` IS NULL OR `effective_to` > `effective_from`",
    order_add_ons_price_chk: "`price_amount_jpy` >= 0",
    order_add_ons_duration_chk: "`duration_minutes` > 0",
    order_add_ons_resolution_chk:
      "(`status` = 'proposed' AND `accepted_by_user_id` IS NULL AND `accepted_at` IS NULL AND `rejected_by_user_id` IS NULL AND `rejected_at` IS NULL) OR (`status` = 'accepted' AND `accepted_by_user_id` IS NOT NULL AND `accepted_at` IS NOT NULL AND `rejected_by_user_id` IS NULL AND `rejected_at` IS NULL) OR (`status` = 'rejected' AND `rejected_by_user_id` IS NOT NULL AND `rejected_at` IS NOT NULL AND `accepted_by_user_id` IS NULL AND `accepted_at` IS NULL)",
    order_checkouts_base_amount_chk: "`base_amount_jpy` >= 0",
    order_checkouts_add_on_amount_chk: "`add_on_amount_jpy` >= 0",
    order_checkouts_discount_amount_chk: "`discount_amount_jpy` >= 0",
    order_checkouts_amount_chk: "`checkout_amount_jpy` >= 0 AND `payable_ndp` >= 0",
    order_checkouts_total_chk:
      "`checkout_amount_jpy` = `base_amount_jpy` + `add_on_amount_jpy` - `discount_amount_jpy`",
    order_checkouts_other_method_chk:
      "`payment_method` <> 'other' OR (`other_method_code` IS NOT NULL AND `other_method_label` IS NOT NULL)",
    order_checkouts_ledger_method_chk:
      "`ledger_transaction_id` IS NULL OR `payment_method` = 'ndp'",
    order_checkouts_receipt_evidence_chk:
      "(`receipt_confirmed_by_id` IS NULL AND `receipt_confirmed_at` IS NULL AND `receipt_confirmation_reason` IS NULL) OR (`receipt_confirmed_by_id` IS NOT NULL AND `receipt_confirmed_at` IS NOT NULL AND `receipt_confirmation_reason` IS NOT NULL AND `payment_method` IN ('cash', 'other'))"
  };
  for (const [name, expression] of Object.entries(exactChecks)) {
    requireSql(checkConstraint(source, name), expression, `${name} drift`);
  }
  requireSql(
    checkConstraint(source, "order_service_events_shape_chk"),
    "`event_type` IN ('service_started', 'service_ended') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NULL",
    "service event shape drift"
  );
  requireSql(
    checkConstraint(source, "order_service_events_shape_chk"),
    "`event_type` IN ('add_on_proposed', 'add_on_accepted', 'add_on_rejected') AND `order_add_on_id` IS NOT NULL AND `order_checkout_id` IS NULL",
    "add-on event shape drift"
  );
  requireSql(
    checkConstraint(source, "order_service_events_shape_chk"),
    "`event_type` IN ('checkout_created', 'payment_method_selected', 'ndp_payment_applied', 'receipt_confirmed') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NOT NULL",
    "checkout event shape drift"
  );
  requireSql(
    checkConstraint(source, "ndp_exchange_rate_rules_active_sentinel_chk"),
    "(`status` = 'active' AND `active_key` = 'ndp_exchange_rate') OR (`status` = 'superseded' AND `active_key` IS NULL)",
    "active rate sentinel drift"
  );
};

const expectedColumns: Record<string, Record<string, string>> = {
  ndp_exchange_rate_rules: {
    id: "INTEGER NOT NULL AUTO_INCREMENT",
    public_id: "CHAR(36) NOT NULL",
    version: "INTEGER NOT NULL",
    ndp_units: "INTEGER NOT NULL",
    jpy_units: "INTEGER NOT NULL",
    status: "ENUM('active', 'superseded') NOT NULL",
    effective_from: "DATETIME(3) NOT NULL",
    effective_to: "DATETIME(3) NULL",
    active_key: "VARCHAR(80) NULL",
    idempotency_key: "VARCHAR(160) NOT NULL",
    reason: "VARCHAR(500) NOT NULL",
    created_by_id: "INTEGER NULL",
    created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    updated_at: "DATETIME(3) NOT NULL",
    deleted_at: "DATETIME(3) NULL"
  },
  order_service_sessions: {
    id: "INTEGER NOT NULL AUTO_INCREMENT",
    booking_order_id: "INTEGER NOT NULL",
    verification_hash: "VARCHAR(255) NOT NULL",
    started_by_user_id: "INTEGER NULL",
    started_at: "DATETIME(3) NULL",
    expected_ends_at: "DATETIME(3) NULL",
    ended_by_user_id: "INTEGER NULL",
    ended_at: "DATETIME(3) NULL",
    created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    updated_at: "DATETIME(3) NOT NULL",
    deleted_at: "DATETIME(3) NULL"
  },
  order_add_ons: {
    id: "INTEGER NOT NULL AUTO_INCREMENT",
    booking_order_id: "INTEGER NOT NULL",
    service_session_id: "INTEGER NOT NULL",
    service_id: "INTEGER NOT NULL",
    status: "ENUM('proposed', 'accepted', 'rejected') NOT NULL DEFAULT 'proposed'",
    service_name_snapshot: "VARCHAR(160) NOT NULL",
    price_amount_jpy: "INTEGER NOT NULL",
    currency: "VARCHAR(3) NOT NULL DEFAULT 'JPY'",
    duration_minutes: "INTEGER NOT NULL",
    service_snapshot_json: "JSON NOT NULL",
    proposed_by_user_id: "INTEGER NOT NULL",
    proposed_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    accepted_by_user_id: "INTEGER NULL",
    accepted_at: "DATETIME(3) NULL",
    rejected_by_user_id: "INTEGER NULL",
    rejected_at: "DATETIME(3) NULL",
    resolution_reason: "VARCHAR(500) NULL",
    created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    updated_at: "DATETIME(3) NOT NULL",
    deleted_at: "DATETIME(3) NULL"
  },
  order_checkouts: {
    id: "INTEGER NOT NULL AUTO_INCREMENT",
    booking_order_id: "INTEGER NOT NULL",
    base_amount_jpy: "INTEGER NOT NULL",
    add_on_amount_jpy: "INTEGER NOT NULL DEFAULT 0",
    discount_amount_jpy: "INTEGER NOT NULL DEFAULT 0",
    checkout_amount_jpy: "INTEGER NOT NULL",
    payable_ndp: "INTEGER NOT NULL",
    ndp_rate_rule_id: "INTEGER NOT NULL",
    rate_snapshot_json: "JSON NOT NULL",
    calculation_snapshot_json: "JSON NOT NULL",
    payment_method: "ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NULL",
    payment_selected_at: "DATETIME(3) NULL",
    other_method_code: "VARCHAR(40) NULL",
    other_method_label: "VARCHAR(80) NULL",
    other_payment_reference: "VARCHAR(120) NULL",
    ledger_transaction_id: "INTEGER NULL",
    receipt_confirmed_by_id: "INTEGER NULL",
    receipt_confirmed_at: "DATETIME(3) NULL",
    receipt_confirmation_reason: "VARCHAR(500) NULL",
    created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    updated_at: "DATETIME(3) NOT NULL",
    deleted_at: "DATETIME(3) NULL"
  },
  order_service_events: {
    id: "INTEGER NOT NULL AUTO_INCREMENT",
    booking_order_id: "INTEGER NOT NULL",
    service_session_id: "INTEGER NOT NULL",
    order_add_on_id: "INTEGER NULL",
    order_checkout_id: "INTEGER NULL",
    event_type:
      "ENUM('service_started', 'add_on_proposed', 'add_on_accepted', 'add_on_rejected', 'service_ended', 'checkout_created', 'payment_method_selected', 'ndp_payment_applied', 'receipt_confirmed') NOT NULL",
    actor_user_id: "INTEGER NULL",
    idempotency_key: "VARCHAR(160) NOT NULL",
    reason: "VARCHAR(500) NULL",
    metadata: "JSON NULL",
    occurred_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    updated_at: "DATETIME(3) NOT NULL",
    deleted_at: "DATETIME(3) NULL"
  }
};

const expectedIndexes: Record<string, string[]> = {
  ndp_exchange_rate_rules: [
    "UNIQUE INDEX `ndp_exchange_rate_rules_public_id_key`(`public_id`)",
    "UNIQUE INDEX `ndp_exchange_rate_rules_version_key`(`version`)",
    "UNIQUE INDEX `ndp_exchange_rate_rules_active_key`(`active_key`)",
    "UNIQUE INDEX `ndp_exchange_rate_rules_idempotency_key`(`idempotency_key`)",
    "INDEX `ndp_exchange_rate_rules_effective_idx`(`status`, `effective_from`, `effective_to`, `deleted_at`)",
    "INDEX `ndp_exchange_rate_rules_created_by_idx`(`created_by_id`)",
    "INDEX `ndp_exchange_rate_rules_deleted_idx`(`deleted_at`)"
  ],
  order_service_sessions: [
    "UNIQUE INDEX `order_service_sessions_booking_order_key`(`booking_order_id`)",
    "UNIQUE INDEX `order_service_sessions_id_order_key`(`id`, `booking_order_id`)",
    "INDEX `order_service_sessions_started_by_idx`(`started_by_user_id`)",
    "INDEX `order_service_sessions_ended_by_idx`(`ended_by_user_id`)",
    "INDEX `order_service_sessions_due_active_idx`(`expected_ends_at`, `ended_at`, `deleted_at`)",
    "INDEX `order_service_sessions_deleted_idx`(`deleted_at`)"
  ],
  order_add_ons: [
    "UNIQUE INDEX `order_add_ons_id_order_session_key`(`id`, `booking_order_id`, `service_session_id`)",
    "INDEX `order_add_ons_order_status_idx`(`booking_order_id`, `status`, `deleted_at`)",
    "INDEX `order_add_ons_session_status_idx`(`service_session_id`, `status`, `deleted_at`)",
    "INDEX `order_add_ons_service_idx`(`service_id`)",
    "INDEX `order_add_ons_proposed_by_idx`(`proposed_by_user_id`)",
    "INDEX `order_add_ons_accepted_by_idx`(`accepted_by_user_id`)",
    "INDEX `order_add_ons_rejected_by_idx`(`rejected_by_user_id`)",
    "INDEX `order_add_ons_deleted_idx`(`deleted_at`)"
  ],
  order_checkouts: [
    "UNIQUE INDEX `order_checkouts_booking_order_key`(`booking_order_id`)",
    "UNIQUE INDEX `order_checkouts_id_order_key`(`id`, `booking_order_id`)",
    "UNIQUE INDEX `order_checkouts_ledger_transaction_key`(`ledger_transaction_id`)",
    "INDEX `order_checkouts_rate_rule_idx`(`ndp_rate_rule_id`)",
    "INDEX `order_checkouts_receipt_actor_idx`(`receipt_confirmed_by_id`)",
    "INDEX `order_checkouts_payment_active_idx`(`payment_method`, `deleted_at`)",
    "INDEX `order_checkouts_created_active_idx`(`created_at`, `deleted_at`)",
    "INDEX `order_checkouts_deleted_idx`(`deleted_at`)"
  ],
  order_service_events: [
    "UNIQUE INDEX `order_service_events_idempotency_key`(`idempotency_key`)",
    "INDEX `order_service_events_order_time_idx`(`booking_order_id`, `occurred_at`, `deleted_at`)",
    "INDEX `order_service_events_session_time_idx`(`service_session_id`, `occurred_at`, `deleted_at`)",
    "INDEX `order_service_events_add_on_idx`(`order_add_on_id`)",
    "INDEX `order_service_events_checkout_idx`(`order_checkout_id`)",
    "INDEX `order_service_events_type_time_idx`(`event_type`, `occurred_at`, `deleted_at`)",
    "INDEX `order_service_events_actor_idx`(`actor_user_id`)",
    "INDEX `order_service_events_deleted_idx`(`deleted_at`)"
  ]
};

const expectedForeignKeys = [
  "ADD CONSTRAINT `ndp_exchange_rate_rules_created_by_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_sessions_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_sessions_started_by_fkey` FOREIGN KEY (`started_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_sessions_ended_by_fkey` FOREIGN KEY (`ended_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_session_fkey` FOREIGN KEY (`service_session_id`, `booking_order_id`) REFERENCES `order_service_sessions`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_service_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_proposed_by_fkey` FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_accepted_by_fkey` FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_add_ons_rejected_by_fkey` FOREIGN KEY (`rejected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_checkouts_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_checkouts_rate_rule_fkey` FOREIGN KEY (`ndp_rate_rule_id`) REFERENCES `ndp_exchange_rate_rules`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_checkouts_ledger_fkey` FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_checkouts_receipt_actor_fkey` FOREIGN KEY (`receipt_confirmed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_events_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_events_session_fkey` FOREIGN KEY (`service_session_id`, `booking_order_id`) REFERENCES `order_service_sessions`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_events_add_on_order_fkey` FOREIGN KEY (`order_add_on_id`, `booking_order_id`, `service_session_id`) REFERENCES `order_add_ons`(`id`, `booking_order_id`, `service_session_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_events_checkout_order_fkey` FOREIGN KEY (`order_checkout_id`, `booking_order_id`) REFERENCES `order_checkouts`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT",
  "ADD CONSTRAINT `order_service_events_actor_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT"
].map(normalize);

const expectedModelDirectives: Record<string, string[]> = {
  OrderServiceSession: [
    '@@unique([id, bookingOrderId], map: "order_service_sessions_id_order_key")',
    '@@index([startedByUserId], map: "order_service_sessions_started_by_idx")',
    '@@index([endedByUserId], map: "order_service_sessions_ended_by_idx")',
    '@@index([expectedEndsAt, endedAt, deletedAt], map: "order_service_sessions_due_active_idx")',
    '@@index([deletedAt], map: "order_service_sessions_deleted_idx")',
    '@@map("order_service_sessions")'
  ],
  OrderServiceEvent: [
    '@@index([bookingOrderId, occurredAt, deletedAt], map: "order_service_events_order_time_idx")',
    '@@index([serviceSessionId, occurredAt, deletedAt], map: "order_service_events_session_time_idx")',
    '@@index([orderAddOnId], map: "order_service_events_add_on_idx")',
    '@@index([orderCheckoutId], map: "order_service_events_checkout_idx")',
    '@@index([eventType, occurredAt, deletedAt], map: "order_service_events_type_time_idx")',
    '@@index([actorUserId], map: "order_service_events_actor_idx")',
    '@@index([deletedAt], map: "order_service_events_deleted_idx")',
    '@@map("order_service_events")'
  ],
  OrderAddOn: [
    '@@unique([id, bookingOrderId, serviceSessionId], map: "order_add_ons_id_order_session_key")',
    '@@index([bookingOrderId, status, deletedAt], map: "order_add_ons_order_status_idx")',
    '@@index([serviceSessionId, status, deletedAt], map: "order_add_ons_session_status_idx")',
    '@@index([serviceId], map: "order_add_ons_service_idx")',
    '@@index([proposedByUserId], map: "order_add_ons_proposed_by_idx")',
    '@@index([acceptedByUserId], map: "order_add_ons_accepted_by_idx")',
    '@@index([rejectedByUserId], map: "order_add_ons_rejected_by_idx")',
    '@@index([deletedAt], map: "order_add_ons_deleted_idx")',
    '@@map("order_add_ons")'
  ],
  OrderCheckout: [
    '@@unique([id, bookingOrderId], map: "order_checkouts_id_order_key")',
    '@@index([ndpRateRuleId], map: "order_checkouts_rate_rule_idx")',
    '@@index([receiptConfirmedById], map: "order_checkouts_receipt_actor_idx")',
    '@@index([paymentMethod, deletedAt], map: "order_checkouts_payment_active_idx")',
    '@@index([createdAt, deletedAt], map: "order_checkouts_created_active_idx")',
    '@@index([deletedAt], map: "order_checkouts_deleted_idx")',
    '@@map("order_checkouts")'
  ],
  NdpExchangeRateRule: [
    '@@index([status, effectiveFrom, effectiveTo, deletedAt], map: "ndp_exchange_rate_rules_effective_idx")',
    '@@index([createdById], map: "ndp_exchange_rate_rules_created_by_idx")',
    '@@index([deletedAt], map: "ndp_exchange_rate_rules_deleted_idx")',
    '@@map("ndp_exchange_rate_rules")'
  ]
};

describe("order fulfillment persistence schema", () => {
  it("defines exact Prisma enums, fields, composite ownership relations, and indexes", () => {
    expect(prismaEnumValues("BookingOrderStatus")).toEqual([
      "PENDING",
      "CONFIRMED",
      "IN_SERVICE",
      "AWAITING_CHECKOUT",
      "AWAITING_PAYMENT_CONFIRMATION",
      "COMPLETED",
      "CANCELLED"
    ]);
    expect(prismaEnumValues("ServicePaymentMethod")).toEqual([
      "ONSITE",
      "BANK_TRANSFER",
      "CASH",
      "NDP",
      "OTHER"
    ]);
    expect(prismaEnumValues("OrderServiceEventType")).toHaveLength(9);
    expect(prismaEnumValues("OrderAddOnStatus")).toEqual(["PROPOSED", "ACCEPTED", "REJECTED"]);
    expect(prismaEnumValues("NdpExchangeRateRuleStatus")).toEqual(["ACTIVE", "SUPERSEDED"]);

    const session = modelBlock("OrderServiceSession");
    const event = modelBlock("OrderServiceEvent");
    const addOn = modelBlock("OrderAddOn");
    const checkout = modelBlock("OrderCheckout");
    const rate = modelBlock("NdpExchangeRateRule");

    for (const model of [session, event, addOn, checkout, rate]) {
      for (const field of ["id", "createdAt", "updatedAt", "deletedAt"]) {
        expect(model).toMatch(new RegExp(`^\\s*${field}\\s+`, "m"));
      }
      expect(model).toMatch(/@@index\(\[deletedAt\]/);
      expect(model).toMatch(/@@map\("[a-z0-9_]+"\)/);
    }
    for (const [modelName, directives] of Object.entries(expectedModelDirectives)) {
      expect(modelDirectives(modelName)).toEqual(directives);
    }

    expect(session).toContain(
      '@@unique([id, bookingOrderId], map: "order_service_sessions_id_order_key")'
    );
    expect(addOn).toContain(
      '@relation(fields: [serviceSessionId, bookingOrderId], references: [id, bookingOrderId], onDelete: Restrict, onUpdate: Restrict, map: "order_add_ons_session_fkey")'
    );
    expect(addOn).toContain(
      '@@unique([id, bookingOrderId, serviceSessionId], map: "order_add_ons_id_order_session_key")'
    );
    expect(checkout).toContain(
      '@@unique([id, bookingOrderId], map: "order_checkouts_id_order_key")'
    );
    expect(event).toContain(
      '@relation(fields: [serviceSessionId, bookingOrderId], references: [id, bookingOrderId], onDelete: Restrict, onUpdate: Restrict, map: "order_service_events_session_fkey")'
    );
    expect(event).toContain(
      '@relation(fields: [orderAddOnId, bookingOrderId, serviceSessionId], references: [id, bookingOrderId, serviceSessionId], onDelete: Restrict, onUpdate: Restrict, map: "order_service_events_add_on_order_fkey")'
    );
    expect(event).toContain(
      '@relation(fields: [orderCheckoutId, bookingOrderId], references: [id, bookingOrderId], onDelete: Restrict, onUpdate: Restrict, map: "order_service_events_checkout_order_fkey")'
    );
    for (const [model, relationMaps] of [
      [
        session,
        [
          "order_service_sessions_order_fkey",
          "order_service_sessions_started_by_fkey",
          "order_service_sessions_ended_by_fkey"
        ]
      ],
      [
        event,
        [
          "order_service_events_order_fkey",
          "order_service_events_session_fkey",
          "order_service_events_add_on_order_fkey",
          "order_service_events_checkout_order_fkey",
          "order_service_events_actor_fkey"
        ]
      ],
      [
        addOn,
        [
          "order_add_ons_order_fkey",
          "order_add_ons_session_fkey",
          "order_add_ons_service_fkey",
          "order_add_ons_proposed_by_fkey",
          "order_add_ons_accepted_by_fkey",
          "order_add_ons_rejected_by_fkey"
        ]
      ],
      [
        checkout,
        [
          "order_checkouts_order_fkey",
          "order_checkouts_rate_rule_fkey",
          "order_checkouts_ledger_fkey",
          "order_checkouts_receipt_actor_fkey"
        ]
      ],
      [rate, ["ndp_exchange_rate_rules_created_by_fkey"]]
    ] as Array<[string, string[]]>) {
      for (const relationMap of relationMaps) expect(model).toContain(`map: "${relationMap}"`);
    }
    expect(rate).toMatch(/status\s+NdpExchangeRateRuleStatus\s*$/m);
    expect(rate).not.toMatch(/status\s+NdpExchangeRateRuleStatus\s+@default/);

    for (const token of [
      "serviceNameSnapshot",
      "priceAmountJpy",
      "durationMinutes",
      "serviceSnapshotJson"
    ]) {
      expect(addOn).toContain(token);
    }
    for (const token of [
      "checkoutAmountJpy",
      "payableNdp",
      "rateSnapshotJson",
      "calculationSnapshotJson",
      "ledgerTransactionId",
      "receiptConfirmationReason"
    ]) {
      expect(checkout).toContain(token);
    }
    expect(event).toMatch(
      /idempotencyKey\s+String\s+@unique\(map: "order_service_events_idempotency_key"\)/
    );
    expect(rate).toMatch(
      /idempotencyKey\s+String\s+@unique\(map: "ndp_exchange_rate_rules_idempotency_key"\)/
    );
  });

  it("keeps every migration table and enum column in exact lockstep with the contract", () => {
    expect(migration).toContain(
      "ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', 'awaiting_payment_confirmation', 'completed', 'cancelled')"
    );
    expect(migration).toContain(
      "MODIFY `payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NOT NULL DEFAULT 'onsite'"
    );
    for (const [table, columns] of Object.entries(expectedColumns)) {
      expect(columnDefinitions(migration, table)).toEqual(columns);
      expect(indexDefinitions(migration, table)).toEqual(expectedIndexes[table]);
    }
    expect(() => assertCheckoutPaymentEnum(migration)).not.toThrow();
  });

  it("binds every redundant order reference and uses only restrictive foreign keys", () => {
    expect(() => assertCompositeOwnershipFks(migration)).not.toThrow();
    expect(foreignKeyDefinitions(migration)).toEqual(expectedForeignKeys);
  });

  it("enforces event shape, evidence, arithmetic, active-rate, and chronology checks", () => {
    expect(() => assertEvidenceChecks(migration)).not.toThrow();
  });

  it("keeps exact unique and active-query indexes plus the guarded 1:1 seed", () => {
    expect(migration).toContain("SELECT UUID(), 1, 1, 1, 'active'");
    expect(migration).toContain("'ndp-rate-bootstrap-1-to-1'");
    expect(migration).toContain("WHERE NOT EXISTS");
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);

    const identifiers = Array.from(
      migration.matchAll(/(?:CONSTRAINT|(?:UNIQUE )?INDEX)\s+`([^`]+)`/g),
      (match) => match[1]
    );
    expect(identifiers.filter((identifier) => identifier.length > 64)).toEqual([]);
  });

  it("detects checkout payment enum drift independently", () => {
    const mutated = migration.replace(
      "`payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NULL",
      "`payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'wire') NULL"
    );
    expect(() => assertCheckoutPaymentEnum(mutated)).toThrow("checkout payment enum drift");
  });

  it("detects a missing composite ownership foreign key independently", () => {
    const mutated = migration.replace(compositeOwnershipFks[1], "");
    expect(() => assertCompositeOwnershipFks(mutated)).toThrow(
      "missing composite ownership FK"
    );
  });

  it("detects a missing event-shape CHECK independently", () => {
    const eventShape = checkConstraint(migration, "order_service_events_shape_chk");
    const mutated = migration.replace(eventShape, "");
    expect(() => assertEvidenceChecks(mutated)).toThrow(
      "missing CHECK order_service_events_shape_chk"
    );
  });
});
