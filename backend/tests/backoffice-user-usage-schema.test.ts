import fs from "fs";
import path from "path";
import { resolveUsagePeriod } from "../src/services/backoffice-user-usage-period";

describe("backoffice user usage schema", () => {
  it("stores refund corrections as append-only versions", () => {
    const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        "../prisma/migrations/20260906110000_order_refund_amendments/migration.sql"
      ),
      "utf8"
    );
    expect(schema).toContain("model OrderRefundAmendment");
    expect(schema).toContain("@@unique([bookingOrderId, version]");
    expect(migration).toContain("CREATE TABLE `order_refund_amendments`");
    expect(migration).not.toMatch(/ON DELETE CASCADE/i);
  });

  it("resolves Tokyo natural-day presets into half-open UTC bounds", () => {
    expect(resolveUsagePeriod("last7days", new Date("2026-09-07T03:00:00.000Z"))).toEqual({
      from: new Date("2026-08-31T15:00:00.000Z"),
      to: new Date("2026-09-07T15:00:00.000Z")
    });
  });
});
