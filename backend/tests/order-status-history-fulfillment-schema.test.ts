import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migration = readFileSync(
  join(
    root,
    "prisma/migrations/20260902090000_order_status_history_fulfillment_statuses/migration.sql"
  ),
  "utf8"
);

const normalize = (value: string): string => value.replace(/\s+/g, " ").trim();
const fulfillmentStatuses =
  "ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', " +
  "'awaiting_payment_confirmation', 'completed', 'cancelled')";

describe("order status history fulfillment statuses migration", () => {
  it("keeps history from_status and to_status aligned with the booking lifecycle", () => {
    const sql = normalize(migration);

    expect(sql).toContain(normalize(`MODIFY \`from_status\` ${fulfillmentStatuses} NULL`));
    expect(sql).toContain(normalize(`MODIFY \`to_status\` ${fulfillmentStatuses} NOT NULL`));
  });
});
