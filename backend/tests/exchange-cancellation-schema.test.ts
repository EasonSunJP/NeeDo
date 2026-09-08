import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange bilateral cancellation persistence contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260905120000_exchange_bilateral_cancellation/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  const model = (name: string) =>
    schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

  it("retains one request record per attempt with immutable initiator facts and versions", () => {
    const request = model("ExchangeBookingCancellation");
    for (const field of [
      "bookingOrderId",
      "initiatedByUserId",
      "initiatedByIdentityId",
      "initiatorParty",
      "reason",
      "status",
      "requestedVersion",
      "version",
      "resolvedByUserId",
      "resolvedByIdentityId",
      "resolverParty",
      "resolvedAt",
      "createdAt",
      "updatedAt",
      "deletedAt"
    ]) {
      expect(request).toMatch(new RegExp(`\\b${field}\\s+`));
    }
    expect(request).toMatch(/activeOrderId\s+Int\?\s+@unique/);
    expect(request).toContain("@@unique([bookingOrderId, requestedVersion]");
    expect(request).toContain("@@unique([id, bookingOrderId]");
    expect(request).toContain("references: [bookingOrderId]");
  });

  it("keeps command events with exact order linkage and globally unique idempotency keys", () => {
    const event = model("ExchangeBookingCancellationEvent");
    expect(event).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(event).toMatch(/payloadFingerprint\s+String.*@db.Char\(64\)/);
    expect(event).toMatch(/resultSnapshot\s+Json/);
    expect(event).toContain(
      "fields: [cancellationId, bookingOrderId], references: [id, bookingOrderId]"
    );
    expect(event).toContain("@@unique([bookingOrderId, versionAfter]");
    expect(event).toContain("@@index([cancellationId]");
    expect(event).toContain("@@index([actorUserId, createdAt]");
    expect(event).toContain("@@index([actorIdentityId, createdAt]");
  });

  it("provides MySQL active-key, resolution, version and foreign-key constraints", () => {
    for (const table of [
      "exchange_booking_cancellations",
      "exchange_booking_cancellation_events"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    for (const name of [
      "exchange_cancel_active_chk",
      "exchange_cancel_resolution_chk",
      "exchange_cancel_party_chk",
      "exchange_cancel_version_chk",
      "exchange_cancel_event_version_chk",
      "exchange_cancel_reason_chk",
      "exchange_cancel_event_key_chk"
    ]) {
      expect(migration).toContain(name);
    }
    expect(migration).toContain("REFERENCES `exchange_match_participants`(`booking_order_id`)");
    expect(migration).toContain("FOREIGN KEY (`cancellation_id`, `booking_order_id`)");
    expect(migration).toContain("ON DELETE RESTRICT ON UPDATE RESTRICT");
    expect(migration).not.toMatch(
      /ON DELETE CASCADE|DROP TABLE|UPDATE `(?:booking_orders|wallets|affiliate)/
    );
  });
});
