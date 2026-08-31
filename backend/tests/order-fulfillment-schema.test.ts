import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schemaPath = join(process.cwd(), "prisma/schema.prisma");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260901090000_order_fulfillment_checkout/migration.sql"
);

const schema = readFileSync(schemaPath, "utf8");

const modelBlock = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) {
    throw new Error(`missing model ${name}`);
  }
  return match[1];
};

describe("order fulfillment persistence schema", () => {
  it("defines immutable service, add-on, checkout and rate evidence", () => {
    for (const token of [
      "AWAITING_CHECKOUT",
      "AWAITING_PAYMENT_CONFIRMATION",
      "model OrderServiceSession",
      "model OrderServiceEvent",
      "model OrderAddOn",
      "model OrderCheckout",
      "model NdpExchangeRateRule",
      "idempotencyKey",
      "rateSnapshotJson",
      "checkoutAmountJpy"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("keeps historical payment methods and models every fulfillment relation", () => {
    expect(schema).toMatch(
      /enum ServicePaymentMethod \{[\s\S]*ONSITE[\s\S]*BANK_TRANSFER[\s\S]*CASH[\s\S]*NDP[\s\S]*OTHER[\s\S]*\}/
    );

    for (const modelName of [
      "OrderServiceSession",
      "OrderServiceEvent",
      "OrderAddOn",
      "OrderCheckout",
      "NdpExchangeRateRule"
    ]) {
      const model = modelBlock(modelName);
      expect(model).toContain("id");
      expect(model).toContain("createdAt");
      expect(model).toContain("updatedAt");
      expect(model).toContain("deletedAt");
      expect(model).toMatch(/@@map\("[a-z0-9_]+"\)/);
      expect(model).toMatch(/@@index\(\[deletedAt\]/);
    }

    expect(modelBlock("OrderServiceSession")).toMatch(
      /bookingOrderId\s+Int\s+@unique\(map: "order_service_sessions_booking_order_key"\)/
    );
    expect(modelBlock("OrderServiceEvent")).toMatch(
      /idempotencyKey\s+String\s+@unique\(map: "order_service_events_idempotency_key"\)/
    );
    expect(modelBlock("OrderAddOn")).toEqual(expect.stringContaining("serviceNameSnapshot"));
    expect(modelBlock("OrderAddOn")).toEqual(expect.stringContaining("priceAmountJpy"));
    expect(modelBlock("OrderAddOn")).toEqual(expect.stringContaining("durationMinutes"));
    expect(modelBlock("OrderAddOn")).toEqual(expect.stringContaining("serviceSnapshotJson"));
    expect(modelBlock("OrderCheckout")).toEqual(expect.stringContaining("otherMethodCode"));
    expect(modelBlock("OrderCheckout")).toEqual(expect.stringContaining("receiptConfirmationReason"));
    expect(modelBlock("NdpExchangeRateRule")).toEqual(expect.stringContaining("activeKey"));
    expect(modelBlock("NdpExchangeRateRule")).toMatch(
      /idempotencyKey\s+String\s+@unique\(map: "ndp_exchange_rate_rules_idempotency_key"\)/
    );

    expect(modelBlock("BookingOrder")).toEqual(expect.stringContaining("serviceSession"));
    expect(modelBlock("BookingOrder")).toEqual(expect.stringContaining("serviceEvents"));
    expect(modelBlock("BookingOrder")).toEqual(expect.stringContaining("addOns"));
    expect(modelBlock("BookingOrder")).toEqual(expect.stringContaining("checkout"));
    expect(modelBlock("LedgerTransaction")).toEqual(expect.stringContaining("orderCheckout"));
  });

  it("ships an additive, indexed migration with one idempotent initial 1:1 rate", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain(
      "ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', 'awaiting_payment_confirmation', 'completed', 'cancelled')"
    );
    expect(migration).toContain("ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other')");

    for (const table of [
      "order_service_sessions",
      "order_service_events",
      "order_add_ons",
      "order_checkouts",
      "ndp_exchange_rate_rules"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
      expect(migration).toMatch(
        new RegExp("CREATE TABLE `" + table + "` \\([\\s\\S]*?`deleted_at` DATETIME\\(3\\) NULL")
      );
    }

    expect(migration).toContain(
      "UNIQUE INDEX `order_service_events_idempotency_key`(`idempotency_key`)"
    );
    expect(migration).toContain(
      "UNIQUE INDEX `ndp_exchange_rate_rules_idempotency_key`(`idempotency_key`)"
    );
    expect(migration).toContain("FOREIGN KEY (`ledger_transaction_id`)");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(migration).toContain("'ndp-rate-bootstrap-1-to-1'");
    expect(migration).toContain("SELECT UUID(), 1, 1, 1, 'active'");
    expect(migration).toContain("WHERE NOT EXISTS");
    expect(migration).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE)\b/im);

    const identifiers = Array.from(
      migration.matchAll(/(?:CONSTRAINT|(?:UNIQUE )?INDEX)\s+`([^`]+)`/g),
      (match) => match[1]
    );
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers.filter((identifier) => identifier.length > 64)).toEqual([]);
  });
});
