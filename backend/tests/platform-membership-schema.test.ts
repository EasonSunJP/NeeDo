import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("platform membership persistence schema", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "prisma/migrations/20260901180000_platform_membership_foundation/migration.sql"
    ),
    "utf8"
  );

  it("defines fixed, versioned membership tiers, benefits, and customer entitlements", () => {
    for (const token of [
      "model PlatformMembershipTier",
      "model PlatformMembershipTierVersion",
      "model PlatformMembershipBenefit",
      "model PlatformMembershipTierBenefit",
      "model PlatformMembershipEntitlement"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("locks the approved four tiers and seven benefit codes", () => {
    for (const token of [
      "FREE",
      "SILVER",
      "GOLD",
      "BLACK_DIAMOND",
      "NDP_EXPERIENCE",
      "MEMBER_SIGN_IN",
      "PRIORITY_REQUEST",
      "SUPPORT_SERVICE",
      "EXCLUSIVE_DISCOUNT",
      "MEMBER_DAY",
      "BIRTHDAY_GIFT"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("persists versioned pricing, experience, and both card theme contracts", () => {
    for (const token of [
      "monthlyValueNdp",
      "annualBillingMonths",
      "experienceMultiplier",
      "detailAccentColor",
      "detailSurfaceColor",
      "detailItemSurfaceColor",
      "detailOuterBorderColor",
      "detailItemBorderColor",
      "detailAvatarBorderColor",
      "simpleTopColor",
      "simpleBottomColor"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("seeds four fixed V1 tiers and seven fixed benefits without granting paid access", () => {
    for (const table of [
      "platform_membership_tiers",
      "platform_membership_tier_versions",
      "platform_membership_benefits",
      "platform_membership_tier_benefits",
      "platform_membership_entitlements"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }

    expect(migration).toMatch(/WHEN 'free' THEN 0 WHEN 'silver' THEN 300 WHEN 'gold' THEN 1999 ELSE 4999/);
    expect(migration).toMatch(/WHEN 'free' THEN 1\.0000 WHEN 'silver' THEN 2\.0000 WHEN 'gold' THEN 5\.0000 ELSE 10\.0000/);
    expect(migration).toContain("`benefit`.`code` IN ('ndp_experience', 'member_sign_in')");
    expect(migration).not.toContain("INSERT INTO `platform_membership_entitlements`");
  });

  it("uses an additive lock migration for concurrent entitlement changes", () => {
    const entitlementModel = schema.match(/model PlatformMembershipEntitlement \{([\s\S]*?)\n\}/)?.[1];
    const lockMigration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260901183000_platform_membership_entitlement_lock/migration.sql"
      ),
      "utf8"
    );

    expect(entitlementModel).toContain("lockVersion");
    expect(entitlementModel).toContain("changeKind");
    expect(entitlementModel).toContain("billingMonths");
    expect(entitlementModel).toContain("experienceValueNdp");
    expect(lockMigration).toContain("ADD COLUMN `lock_version` INTEGER NOT NULL DEFAULT 1");
    expect(schema).toContain("platformMembershipLockVersion");
    expect(lockMigration).toContain("ADD COLUMN `platform_membership_lock_version` INTEGER NOT NULL DEFAULT 1");
    expect(lockMigration).toContain("ADD COLUMN `experience_value_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(lockMigration).toContain("platform_membership_entitlements_lock_version_chk");
  });
});
