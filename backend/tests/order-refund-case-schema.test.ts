import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260907020000_order_refund_cases/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

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
});
