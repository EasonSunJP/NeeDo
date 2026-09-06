import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260907020000_order_refund_cases/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const idempotencyLengthMigrationPath = join(
  process.cwd(),
  "prisma/migrations/20260907030000_order_refund_idempotency_key_length/migration.sql"
);
const idempotencyLengthMigration = existsSync(idempotencyLengthMigrationPath)
  ? readFileSync(idempotencyLengthMigrationPath, "utf8")
  : "";

describe("completed-order refund case schema", () => {
  const names = [
    "enum OrderRefundCaseStatus",
    "enum OrderRefundCaseAction",
    "enum OrderRefundDisputeStatus",
    "enum OrderRefundDisputeResolution",
    "model OrderRefundCase",
    "model OrderRefundCaseEvent",
    "model OrderRefundDispute",
    "model OrderRefundDisputeRevision"
  ];

  it.each(names)("declares %s", (name) => expect(schema).toContain(name));

  it("keeps the database guards for active cases, shop responsibility, amounts, and versions", () => {
    expect(migration).toContain("order_refund_cases_active_key_key");
    expect(migration).toContain("order_refund_disputes_active_key_key");
    expect(migration).toContain("CHECK (responsibility = 'shop')");
    expect(migration).toContain("CHECK (refund_amount_jpy > 0)");
    expect(migration).toContain("CHECK (version > 0)");
  });

  it("widens both persisted refund idempotency authorities to the 160-character API contract with a forward migration", () => {
    expect(schema).toMatch(
      /model OrderRefundCaseEvent[\s\S]*?idempotencyKey\s+String[\s\S]*?@db\.VarChar\(160\)/u
    );
    expect(schema).toMatch(
      /model OrderRefundDisputeRevision[\s\S]*?idempotencyKey\s+String[\s\S]*?@db\.VarChar\(160\)/u
    );
    expect(migration).toContain("`idempotency_key` VARCHAR(128) NOT NULL");
    expect(idempotencyLengthMigration).toMatch(
      /ALTER TABLE `order_refund_case_events`\s+MODIFY `idempotency_key` VARCHAR\(160\) NOT NULL/iu
    );
    expect(idempotencyLengthMigration).toMatch(
      /ALTER TABLE `order_refund_dispute_revisions`\s+MODIFY `idempotency_key` VARCHAR\(160\) NOT NULL/iu
    );
  });
});
