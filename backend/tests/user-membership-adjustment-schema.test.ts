import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260906090000_user_membership_multiplier_adjustments/migration.sql"
  ),
  "utf8"
);

describe("UserMembershipAdjustment schema", () => {
  it("stores append-only, reasoned membership overrides", () => {
    expect(schema).toContain("model UserMembershipAdjustment");
    expect(schema).toContain("multiplierBps");
    expect(schema).toContain("reason");
    expect(schema).toContain("supersededAt");
    expect(schema).toContain("createdById");
    expect(schema).toContain("expectedLockVersion");
    expect(schema).toContain("lockVersion");
    expect(schema).toContain('@@map("user_membership_adjustments")');
  });

  it("preserves the immutable multiplier snapshot on experience entries", () => {
    expect(schema).toMatch(
      /model UserExperienceEntry \{[\s\S]*membershipMultiplierBps\s+Int[\s\S]*@@map\("user_experience_entries"\)/,
    );
  });

  it("keeps the tier foreign key non-cascading so MySQL can enforce the value check", () => {
    expect(migration).toContain(
      "user_membership_adjustments_tier_version_id_fkey` FOREIGN KEY (`tier_version_id`) REFERENCES `platform_membership_tier_versions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT"
    );
    expect(schema).toMatch(
      /tierVersion\s+PlatformMembershipTierVersion\?[\s\S]*onDelete: Restrict, onUpdate: Restrict/
    );
  });
});
