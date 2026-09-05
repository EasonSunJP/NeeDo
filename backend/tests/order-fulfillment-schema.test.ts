import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260901090000_order_fulfillment_checkout/migration.sql"),
  "utf8"
);

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();

const namedBlock = (source: string, kind: "model" | "enum", name: string): string => {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing ${kind} ${name}`);
  return match[1];
};

const modelBlock = (name: string, source = schema): string => namedBlock(source, "model", name);

const prismaEnumMembers = (name: string, source = schema): string[] =>
  namedBlock(source, "enum", name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("@@"))
    .map(normalize);

const prismaEnumDirectives = (name: string, source = schema): string[] =>
  namedBlock(source, "enum", name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("@@"))
    .map(normalize);

const scalarFieldDefinitions = (name: string, source = schema): string[] =>
  modelBlock(name, source)
    .trim()
    .split(/\n\s*\n/)[0]
    .split("\n")
    .map(normalize);

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

const modelDirectives = (name: string, source = schema): string[] =>
  modelBlock(name, source)
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

const compositeChildIndexes = [
  {
    model: "OrderAddOn",
    table: "order_add_ons",
    prisma: '@@index([serviceSessionId, bookingOrderId], map: "order_add_ons_session_order_idx")',
    sql: "INDEX `order_add_ons_session_order_idx`(`service_session_id`, `booking_order_id`)"
  },
  {
    model: "OrderServiceEvent",
    table: "order_service_events",
    prisma:
      '@@index([serviceSessionId, bookingOrderId], map: "order_service_events_session_order_idx")',
    sql: "INDEX `order_service_events_session_order_idx`(`service_session_id`, `booking_order_id`)"
  },
  {
    model: "OrderServiceEvent",
    table: "order_service_events",
    prisma:
      '@@index([orderAddOnId, bookingOrderId, serviceSessionId], map: "order_service_events_add_on_order_session_idx")',
    sql: "INDEX `order_service_events_add_on_order_session_idx`(`order_add_on_id`, `booking_order_id`, `service_session_id`)"
  },
  {
    model: "OrderServiceEvent",
    table: "order_service_events",
    prisma:
      '@@index([orderCheckoutId, bookingOrderId], map: "order_service_events_checkout_order_idx")',
    sql: "INDEX `order_service_events_checkout_order_idx`(`order_checkout_id`, `booking_order_id`)"
  }
] as const;

const assertCompositeChildIndexes = (prismaSource: string, sqlSource: string): void => {
  for (const index of compositeChildIndexes) {
    if (!modelDirectives(index.model, prismaSource).includes(index.prisma)) {
      throw new Error(`missing Prisma composite child index: ${index.prisma}`);
    }
    assertSqlCompositeChildIndex(sqlSource, index);
  }
};

const assertSqlCompositeChildIndex = (
  source: string,
  index: (typeof compositeChildIndexes)[number]
): void => {
  if (!indexDefinitions(source, index.table).includes(index.sql)) {
    throw new Error(`missing SQL composite child index: ${index.sql}`);
  }
};

const ensureTableDefinition = (source: string, table: string, definition: string): string => {
  if (normalize(tableBlock(source, table)).includes(normalize(definition))) return source;
  const block = tableBlock(source, table);
  const augmented = block.replace(/\n {2}PRIMARY KEY /, `\n  ${definition},\n  PRIMARY KEY `);
  if (augmented === block) throw new Error(`cannot augment table ${table}`);
  return source.replace(block, augmented);
};

const checkExpression = (source: string, name: string): string => {
  const constraint = checkConstraint(source, name);
  const prefix = `CONSTRAINT \`${name}\` CHECK (`;
  return normalize(constraint.slice(prefix.length, -1));
};

const replaceCheckExpression = (source: string, name: string, expression: string): string => {
  const constraint = checkConstraint(source, name);
  return source.replace(constraint, `CONSTRAINT \`${name}\` CHECK (${expression})`);
};

const expectedCheckExpressions: Record<string, string> = {
  ndp_exchange_rate_rules_ndp_units_chk: "`ndp_units` > 0",
  ndp_exchange_rate_rules_jpy_units_chk: "`jpy_units` > 0",
  ndp_exchange_rate_rules_version_chk: "`version` > 0",
  ndp_exchange_rate_rules_window_chk: "`effective_to` IS NULL OR `effective_to` > `effective_from`",
  ndp_exchange_rate_rules_active_sentinel_chk:
    "(`status` = 'active' AND `active_key` IS NOT NULL AND `active_key` = 'ndp_exchange_rate') OR (`status` = 'superseded' AND `active_key` IS NULL)",
  order_service_sessions_ended_chronology_chk:
    "`ended_at` IS NULL OR (`started_at` IS NOT NULL AND `ended_at` >= `started_at`)",
  order_service_sessions_expected_chronology_chk:
    "`expected_ends_at` IS NULL OR `started_at` IS NULL OR `expected_ends_at` >= `started_at`",
  order_add_ons_price_chk: "`price_amount_jpy` >= 0",
  order_add_ons_currency_chk: "BINARY `currency` = 'JPY'",
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
    "`ledger_transaction_id` IS NULL OR (`payment_method` IS NOT NULL AND `payment_method` = 'ndp' AND `receipt_confirmed_by_id` IS NULL AND `receipt_confirmed_at` IS NULL AND `receipt_confirmation_reason` IS NULL)",
  order_checkouts_receipt_evidence_chk:
    "(`receipt_confirmed_by_id` IS NULL AND `receipt_confirmed_at` IS NULL AND `receipt_confirmation_reason` IS NULL) OR (`payment_method` IS NOT NULL AND `payment_method` IN ('cash', 'other') AND `ledger_transaction_id` IS NULL AND `receipt_confirmed_by_id` IS NOT NULL AND `receipt_confirmed_at` IS NOT NULL AND `receipt_confirmation_reason` IS NOT NULL)",
  order_service_events_shape_chk:
    "(`event_type` IN ('service_started', 'service_ended') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NULL) OR (`event_type` IN ('add_on_proposed', 'add_on_accepted', 'add_on_rejected') AND `order_add_on_id` IS NOT NULL AND `order_checkout_id` IS NULL) OR (`event_type` IN ('checkout_created', 'payment_method_selected', 'ndp_payment_applied', 'receipt_confirmed') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NOT NULL)"
};

const assertExactCheck = (source: string, name: string): void => {
  const expected = expectedCheckExpressions[name];
  if (!expected) throw new Error(`missing expected CHECK contract ${name}`);
  if (checkExpression(source, name) !== normalize(expected)) {
    throw new Error(`${name} drift`);
  }
};

const assertAddOnCurrencyCheck = (source: string): void => {
  assertExactCheck(source, "order_add_ons_currency_chk");
};

const assertEventShapeCheck = (source: string): void => {
  assertExactCheck(source, "order_service_events_shape_chk");
};

const assertEvidenceChecks = (source: string): void => {
  for (const name of Object.keys(expectedCheckExpressions)) assertExactCheck(source, name);
};

const splitSqlList = (source: string): string[] => {
  const values: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote && source[index + 1] === quote) index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      values.push(normalize(source.slice(start, index)));
      start = index + 1;
    }
  }
  values.push(normalize(source.slice(start)));
  return values;
};

const rateSeedDefinition = (
  source: string
): { columns: string[]; values: string[]; guard: string } => {
  const match = source.match(
    /INSERT INTO `ndp_exchange_rate_rules`\s*\(([\s\S]*?)\)\s*SELECT\s+([\s\S]*?)\s+WHERE NOT EXISTS\s*\(\s*SELECT 1\s+FROM `ndp_exchange_rate_rules`\s+WHERE\s+([\s\S]*?)\s*\);/
  );
  if (!match) throw new Error("missing formal NDP rate seed");
  return {
    columns: Array.from(match[1].matchAll(/`([^`]+)`/g), (column) => column[1]),
    values: splitSqlList(match[2]),
    guard: normalize(match[3])
  };
};

const expectedRateSeed = {
  columns: [
    "public_id",
    "version",
    "ndp_units",
    "jpy_units",
    "status",
    "effective_from",
    "effective_to",
    "active_key",
    "idempotency_key",
    "reason",
    "created_by_id",
    "created_at",
    "updated_at",
    "deleted_at"
  ],
  values: [
    "UUID()",
    "1",
    "1",
    "1",
    "'active'",
    "UTC_TIMESTAMP(3)",
    "NULL",
    "'ndp_exchange_rate'",
    "'ndp-rate-bootstrap-1-to-1'",
    "'Initial formal 1 NDP = 1 JPY rate'",
    "NULL",
    "UTC_TIMESTAMP(3)",
    "UTC_TIMESTAMP(3)",
    "NULL"
  ],
  guard: "`version` = 1 OR `active_key` = 'ndp_exchange_rate'"
};

const assertRateSeed = (source: string): void => {
  const actual = rateSeedDefinition(source);
  if (JSON.stringify(actual.columns) !== JSON.stringify(expectedRateSeed.columns)) {
    throw new Error("rate seed column order drift");
  }
  if (JSON.stringify(actual.values) !== JSON.stringify(expectedRateSeed.values)) {
    throw new Error("rate seed value order drift");
  }
  if (actual.guard !== expectedRateSeed.guard) throw new Error("rate seed guard drift");
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
    "INDEX `order_add_ons_session_order_idx`(`service_session_id`, `booking_order_id`)",
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
    "INDEX `order_service_events_session_order_idx`(`service_session_id`, `booking_order_id`)",
    "INDEX `order_service_events_add_on_order_session_idx`(`order_add_on_id`, `booking_order_id`, `service_session_id`)",
    "INDEX `order_service_events_checkout_order_idx`(`order_checkout_id`, `booking_order_id`)",
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

const expectedPrismaEnums: Record<string, { members: string[]; directives: string[] }> = {
  BookingOrderStatus: {
    members: [
      'PENDING @map("pending")',
      'CONFIRMED @map("confirmed")',
      'IN_SERVICE @map("in_service")',
      'AWAITING_CHECKOUT @map("awaiting_checkout")',
      'AWAITING_PAYMENT_CONFIRMATION @map("awaiting_payment_confirmation")',
      'COMPLETED @map("completed")',
      'CANCELLED @map("cancelled")'
    ],
    directives: ['@@map("booking_order_status")']
  },
  ServicePaymentMethod: {
    members: [
      'ONSITE @map("onsite")',
      'BANK_TRANSFER @map("bank_transfer")',
      'CASH @map("cash")',
      'NDP @map("ndp")',
      'OTHER @map("other")'
    ],
    directives: ['@@map("service_payment_method")']
  },
  OrderServiceEventType: {
    members: [
      'SERVICE_STARTED @map("service_started")',
      'ADD_ON_PROPOSED @map("add_on_proposed")',
      'ADD_ON_ACCEPTED @map("add_on_accepted")',
      'ADD_ON_REJECTED @map("add_on_rejected")',
      'SERVICE_ENDED @map("service_ended")',
      'CHECKOUT_CREATED @map("checkout_created")',
      'PAYMENT_METHOD_SELECTED @map("payment_method_selected")',
      'NDP_PAYMENT_APPLIED @map("ndp_payment_applied")',
      'RECEIPT_CONFIRMED @map("receipt_confirmed")'
    ],
    directives: ['@@map("order_service_event_type")']
  },
  OrderAddOnStatus: {
    members: [
      'PROPOSED @map("proposed")',
      'ACCEPTED @map("accepted")',
      'REJECTED @map("rejected")'
    ],
    directives: ['@@map("order_add_on_status")']
  },
  NdpExchangeRateRuleStatus: {
    members: ['ACTIVE @map("active")', 'SUPERSEDED @map("superseded")'],
    directives: ['@@map("ndp_exchange_rate_rule_status")']
  }
};

const expectedPrismaScalarFields: Record<string, string[]> = {
  OrderServiceSession: [
    "id Int @id @default(autoincrement())",
    'bookingOrderId Int @unique(map: "order_service_sessions_booking_order_key") @map("booking_order_id")',
    'verificationHash String @map("verification_hash") @db.VarChar(255)',
    'startedByUserId Int? @map("started_by_user_id")',
    'startedAt DateTime? @map("started_at")',
    'expectedEndsAt DateTime? @map("expected_ends_at")',
    'endedByUserId Int? @map("ended_by_user_id")',
    'endedAt DateTime? @map("ended_at")',
    'createdAt DateTime @default(now()) @map("created_at")',
    'updatedAt DateTime @updatedAt @map("updated_at")',
    'deletedAt DateTime? @map("deleted_at")'
  ],
  OrderServiceEvent: [
    "id Int @id @default(autoincrement())",
    'bookingOrderId Int @map("booking_order_id")',
    'serviceSessionId Int @map("service_session_id")',
    'orderAddOnId Int? @map("order_add_on_id")',
    'orderCheckoutId Int? @map("order_checkout_id")',
    'eventType OrderServiceEventType @map("event_type")',
    'actorUserId Int? @map("actor_user_id")',
    'idempotencyKey String @unique(map: "order_service_events_idempotency_key") @map("idempotency_key") @db.VarChar(160)',
    "reason String? @db.VarChar(500)",
    "metadata Json?",
    'occurredAt DateTime @default(now()) @map("occurred_at")',
    'createdAt DateTime @default(now()) @map("created_at")',
    'updatedAt DateTime @updatedAt @map("updated_at")',
    'deletedAt DateTime? @map("deleted_at")'
  ],
  OrderAddOn: [
    "id Int @id @default(autoincrement())",
    'bookingOrderId Int @map("booking_order_id")',
    'serviceSessionId Int @map("service_session_id")',
    'serviceId Int @map("service_id")',
    "status OrderAddOnStatus @default(PROPOSED)",
    'serviceNameSnapshot String @map("service_name_snapshot") @db.VarChar(160)',
    'priceAmountJpy Int @map("price_amount_jpy")',
    'currency String @default("JPY") @db.VarChar(3)',
    'durationMinutes Int @map("duration_minutes")',
    'serviceSnapshotJson Json @map("service_snapshot_json")',
    'proposedByUserId Int @map("proposed_by_user_id")',
    'proposedAt DateTime @default(now()) @map("proposed_at")',
    'acceptedByUserId Int? @map("accepted_by_user_id")',
    'acceptedAt DateTime? @map("accepted_at")',
    'rejectedByUserId Int? @map("rejected_by_user_id")',
    'rejectedAt DateTime? @map("rejected_at")',
    'resolutionReason String? @map("resolution_reason") @db.VarChar(500)',
    'createdAt DateTime @default(now()) @map("created_at")',
    'updatedAt DateTime @updatedAt @map("updated_at")',
    'deletedAt DateTime? @map("deleted_at")'
  ],
  OrderCheckout: [
    "id Int @id @default(autoincrement())",
    'bookingOrderId Int @unique(map: "order_checkouts_booking_order_key") @map("booking_order_id")',
    'baseAmountJpy Int @map("base_amount_jpy")',
    'addOnAmountJpy Int @default(0) @map("add_on_amount_jpy")',
    'discountAmountJpy Int @default(0) @map("discount_amount_jpy")',
    'checkoutAmountJpy Int @map("checkout_amount_jpy")',
    'payableNdp Int @map("payable_ndp")',
    'ndpRateRuleId Int @map("ndp_rate_rule_id")',
    'rateSnapshotJson Json @map("rate_snapshot_json")',
    'calculationSnapshotJson Json @map("calculation_snapshot_json")',
    'paymentMethod ServicePaymentMethod? @map("payment_method")',
    'paymentSelectedAt DateTime? @map("payment_selected_at")',
    'otherMethodCode String? @map("other_method_code") @db.VarChar(40)',
    'otherMethodLabel String? @map("other_method_label") @db.VarChar(80)',
    'otherPaymentReference String? @map("other_payment_reference") @db.VarChar(120)',
    'ledgerTransactionId Int? @unique(map: "order_checkouts_ledger_transaction_key") @map("ledger_transaction_id")',
    'receiptConfirmedById Int? @map("receipt_confirmed_by_id")',
    'receiptConfirmedAt DateTime? @map("receipt_confirmed_at")',
    'receiptConfirmationReason String? @map("receipt_confirmation_reason") @db.VarChar(500)',
    'createdAt DateTime @default(now()) @map("created_at")',
    'updatedAt DateTime @updatedAt @map("updated_at")',
    'deletedAt DateTime? @map("deleted_at")'
  ],
  NdpExchangeRateRule: [
    "id Int @id @default(autoincrement())",
    'publicId String @unique(map: "ndp_exchange_rate_rules_public_id_key") @default(uuid()) @map("public_id") @db.Char(36)',
    'version Int @unique(map: "ndp_exchange_rate_rules_version_key")',
    'ndpUnits Int @map("ndp_units")',
    'jpyUnits Int @map("jpy_units")',
    "status NdpExchangeRateRuleStatus",
    'effectiveFrom DateTime @map("effective_from")',
    'effectiveTo DateTime? @map("effective_to")',
    'activeKey String? @unique(map: "ndp_exchange_rate_rules_active_key") @map("active_key") @db.VarChar(80)',
    'idempotencyKey String @unique(map: "ndp_exchange_rate_rules_idempotency_key") @map("idempotency_key") @db.VarChar(160)',
    "reason String @db.VarChar(500)",
    'createdById Int? @map("created_by_id")',
    'createdAt DateTime @default(now()) @map("created_at")',
    'updatedAt DateTime @updatedAt @map("updated_at")',
    'deletedAt DateTime? @map("deleted_at")'
  ]
};

const assertPrismaContracts = (source: string): void => {
  for (const [name, contract] of Object.entries(expectedPrismaEnums)) {
    if (JSON.stringify(prismaEnumMembers(name, source)) !== JSON.stringify(contract.members)) {
      throw new Error(`Prisma enum member contract drift: ${name}`);
    }
    if (
      JSON.stringify(prismaEnumDirectives(name, source)) !== JSON.stringify(contract.directives)
    ) {
      throw new Error(`Prisma enum directive contract drift: ${name}`);
    }
  }
  for (const [name, fields] of Object.entries(expectedPrismaScalarFields)) {
    if (JSON.stringify(scalarFieldDefinitions(name, source)) !== JSON.stringify(fields)) {
      throw new Error(`Prisma scalar field contract drift: ${name}`);
    }
  }
};

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
    '@@index([serviceSessionId, bookingOrderId], map: "order_service_events_session_order_idx")',
    '@@index([orderAddOnId, bookingOrderId, serviceSessionId], map: "order_service_events_add_on_order_session_idx")',
    '@@index([orderCheckoutId, bookingOrderId], map: "order_service_events_checkout_order_idx")',
    '@@index([eventType, occurredAt, deletedAt], map: "order_service_events_type_time_idx")',
    '@@index([actorUserId], map: "order_service_events_actor_idx")',
    '@@index([deletedAt], map: "order_service_events_deleted_idx")',
    '@@map("order_service_events")'
  ],
  OrderAddOn: [
    '@@unique([id, bookingOrderId, serviceSessionId], map: "order_add_ons_id_order_session_key")',
    '@@index([serviceSessionId, bookingOrderId], map: "order_add_ons_session_order_idx")',
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
    expect(() => assertPrismaContracts(schema)).not.toThrow();

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
    expect(() => assertCompositeChildIndexes(schema, migration)).not.toThrow();

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
    expect(() => assertRateSeed(migration)).not.toThrow();
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
    expect(() => assertCompositeOwnershipFks(mutated)).toThrow("missing composite ownership FK");
  });

  it("detects a missing event-shape CHECK independently", () => {
    const eventShape = checkConstraint(migration, "order_service_events_shape_chk");
    const mutated = migration.replace(eventShape, "");
    expect(() => assertEventShapeCheck(mutated)).toThrow(
      "missing CHECK order_service_events_shape_chk"
    );
  });

  it("detects every missing composite child index independently", () => {
    for (const target of compositeChildIndexes) {
      const fixture = ensureTableDefinition(migration, target.table, target.sql);
      const mutated = fixture.replace(target.sql, "");
      expect(mutated).not.toBe(fixture);
      expect(() => assertSqlCompositeChildIndex(mutated, target)).toThrow(
        "missing SQL composite child index"
      );
    }
  });

  it("detects Prisma scalar type or nullability drift without SQL changes", () => {
    const mutated = schema.replace(
      /(\n\s*paymentMethod\s+)ServicePaymentMethod\?(\s+@map\("payment_method"\))/,
      "$1ServicePaymentMethod$2"
    );
    expect(mutated).not.toBe(schema);
    expect(() => assertPrismaContracts(mutated)).toThrow(
      "Prisma scalar field contract drift: OrderCheckout"
    );
  });

  it("detects Prisma enum database-map drift without SQL changes", () => {
    const mutated = schema.replace(/(\n\s*CASH\s+)@map\("cash"\)/, '$1@map("currency_cash")');
    expect(mutated).not.toBe(schema);
    expect(() => assertPrismaContracts(mutated)).toThrow(
      "Prisma enum member contract drift: ServicePaymentMethod"
    );
  });

  it("detects a missing immutable JPY currency CHECK independently", () => {
    const fixture = replaceCheckExpression(
      migration,
      "order_add_ons_currency_chk",
      expectedCheckExpressions.order_add_ons_currency_chk
    );
    const currencyCheck = checkConstraint(fixture, "order_add_ons_currency_chk");
    const mutated = fixture.replace(currencyCheck, "");
    expect(() => assertAddOnCurrencyCheck(mutated)).toThrow(
      "missing CHECK order_add_ons_currency_chk"
    );
  });

  it("detects lowercase JPY currency drift independently", () => {
    const fixture = replaceCheckExpression(
      migration,
      "order_add_ons_currency_chk",
      expectedCheckExpressions.order_add_ons_currency_chk
    );
    const mutated = replaceCheckExpression(
      fixture,
      "order_add_ons_currency_chk",
      "BINARY `currency` = 'jpy'"
    );
    expect(() => assertAddOnCurrencyCheck(mutated)).toThrow("order_add_ons_currency_chk drift");
  });

  it("detects the nullable active-rate sentinel regression independently", () => {
    const fixture = replaceCheckExpression(
      migration,
      "ndp_exchange_rate_rules_active_sentinel_chk",
      expectedCheckExpressions.ndp_exchange_rate_rules_active_sentinel_chk
    );
    const mutated = replaceCheckExpression(
      fixture,
      "ndp_exchange_rate_rules_active_sentinel_chk",
      "(`status` = 'active' AND `active_key` = 'ndp_exchange_rate') OR (`status` = 'superseded' AND `active_key` IS NULL)"
    );
    expect(() => assertExactCheck(mutated, "ndp_exchange_rate_rules_active_sentinel_chk")).toThrow(
      "ndp_exchange_rate_rules_active_sentinel_chk drift"
    );
  });

  it("detects NULL payment method with ledger evidence independently", () => {
    const name = "order_checkouts_ledger_method_chk";
    const fixture = replaceCheckExpression(migration, name, expectedCheckExpressions[name]);
    const weakened = expectedCheckExpressions[name].replace(
      "`payment_method` IS NOT NULL AND ",
      ""
    );
    const mutated = replaceCheckExpression(fixture, name, weakened);
    expect(() => assertExactCheck(mutated, name)).toThrow(`${name} drift`);
  });

  it("detects NULL payment method with receipt evidence independently", () => {
    const name = "order_checkouts_receipt_evidence_chk";
    const fixture = replaceCheckExpression(migration, name, expectedCheckExpressions[name]);
    const weakened = expectedCheckExpressions[name].replace(
      "`payment_method` IS NOT NULL AND ",
      ""
    );
    const mutated = replaceCheckExpression(fixture, name, weakened);
    expect(() => assertExactCheck(mutated, name)).toThrow(`${name} drift`);
  });

  it("detects a weaker but still present CHECK independently", () => {
    const name = "order_checkouts_total_chk";
    const fixture = replaceCheckExpression(migration, name, expectedCheckExpressions[name]);
    const mutated = replaceCheckExpression(
      fixture,
      name,
      `(${expectedCheckExpressions[name]}) OR TRUE`
    );
    expect(() => assertExactCheck(mutated, name)).toThrow(`${name} drift`);
  });

  it("detects a weakened rate-seed guard independently", () => {
    const mutated = migration.replace(expectedRateSeed.guard, `${expectedRateSeed.guard} OR 1 = 1`);
    expect(mutated).not.toBe(migration);
    expect(() => assertRateSeed(mutated)).toThrow("rate seed guard drift");
  });
});
