import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260829210000_customer_membership_grants/migration.sql"),
  "utf8"
);

describe("customer membership grant schema", () => {
  it("stores complimentary duration, dates, and the granting operations user", () => {
    for (const field of [
      "membershipGrantMode",
      "membershipDurationUnit",
      "membershipDurationValue",
      "membershipStartsAt",
      "membershipExpiresAt",
      "membershipGrantedById"
    ]) {
      expect(schema).toContain(field);
    }
    expect(schema).toContain('@relation("CustomerMembershipGrantedBy"');
    expect(schema).toContain("customer_profiles_membership_status_idx");
  });

  it("migrates existing users to self-service without inventing paid grants", () => {
    expect(migration).toContain("DEFAULT 'self_service'");
    expect(migration).toContain("FOREIGN KEY (`membership_granted_by_id`)");
    expect(migration).not.toContain("INSERT INTO");
  });
});
