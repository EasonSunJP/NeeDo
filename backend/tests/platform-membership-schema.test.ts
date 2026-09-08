import { existsSync, readFileSync } from "node:fs";
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

  it("locks the approved four tiers and eight benefit codes", () => {
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
      "BIRTHDAY_GIFT",
      "TRACELESS_RECALL"
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
      "detailSurfaceMiddleColor",
      "detailSurfaceBottomColor",
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

  it("backfills two additive detailed-card gradient stops and constrains all three", () => {
    const gradientPath = resolve(
      process.cwd(),
      "prisma/migrations/20260906130000_platform_membership_three_color_detail_surface/migration.sql"
    );
    const gradientMigration = existsSync(gradientPath)
      ? readFileSync(gradientPath, "utf8")
      : "";

    expect(schema).toContain("detailSurfaceMiddleColor");
    expect(schema).toContain("detailSurfaceBottomColor");
    expect(gradientMigration).toContain(
      "ADD COLUMN `detail_surface_middle_color` CHAR(7) NULL"
    );
    expect(gradientMigration).toContain(
      "ADD COLUMN `detail_surface_bottom_color` CHAR(7) NULL"
    );
    expect(gradientMigration).toContain(
      "`detail_surface_middle_color` = `detail_surface_color`"
    );
    expect(gradientMigration).toContain(
      "`detail_surface_bottom_color` = `detail_surface_color`"
    );
    expect(gradientMigration).toContain(
      "MODIFY COLUMN `detail_surface_middle_color` CHAR(7) NOT NULL"
    );
    expect(gradientMigration).toContain(
      "MODIFY COLUMN `detail_surface_bottom_color` CHAR(7) NOT NULL"
    );
    expect(gradientMigration).toContain("DROP CHECK `platform_membership_tier_versions_colors_chk`");
    expect(gradientMigration).toMatch(
      /`detail_surface_middle_color` REGEXP '\^#\[0-9A-Fa-f\]\{6\}\$'/
    );
    expect(gradientMigration).toMatch(
      /`detail_surface_bottom_color` REGEXP '\^#\[0-9A-Fa-f\]\{6\}\$'/
    );
  });

  it("provides an opt-in disposable database migration check", () => {
    const checkerPath = resolve(
      process.cwd(),
      "scripts/check-membership-gradient-migration.ts"
    );
    const checker = existsSync(checkerPath) ? readFileSync(checkerPath, "utf8") : "";
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["check:membership-gradient-migration"]).toBe(
      "tsx scripts/check-membership-gradient-migration.ts"
    );
    expect(checker).toContain("ALLOW_MEMBERSHIP_GRADIENT_MIGRATION_CHECK");
    expect(checker).toContain("needo_membership_gradient_");
    expect(checker).toContain("DROP DATABASE");
    expect(checker).toContain("existingDatabaseModified: false");
  });

  it("seeds four fixed V1 tiers and supports the additive eighth benefit without granting paid access", () => {
    for (const table of [
      "platform_membership_tiers",
      "platform_membership_tier_versions",
      "platform_membership_benefits",
      "platform_membership_tier_benefits",
      "platform_membership_entitlements"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }

    expect(migration).toMatch(
      /WHEN 'free' THEN 0 WHEN 'silver' THEN 300 WHEN 'gold' THEN 1999 ELSE 4999/
    );
    expect(migration).toMatch(
      /WHEN 'free' THEN 1\.0000 WHEN 'silver' THEN 2\.0000 WHEN 'gold' THEN 5\.0000 ELSE 10\.0000/
    );
    expect(migration).toContain("`benefit`.`code` IN ('ndp_experience', 'member_sign_in')");
    expect(migration).not.toContain("INSERT INTO `platform_membership_entitlements`");
  });

  it("uses an additive lock migration for concurrent entitlement changes", () => {
    const entitlementModel = schema.match(
      /model PlatformMembershipEntitlement \{([\s\S]*?)\n\}/
    )?.[1];
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
    expect(lockMigration).toContain(
      "ADD COLUMN `platform_membership_lock_version` INTEGER NOT NULL DEFAULT 1"
    );
    expect(lockMigration).toContain("ADD COLUMN `experience_value_ndp` INTEGER NOT NULL DEFAULT 0");
    expect(lockMigration).toContain("platform_membership_entitlements_lock_version_chk");
  });

  it("normalizes future bootstrap membership versions to UTC without rewriting active history", () => {
    const correctionPath = resolve(
      process.cwd(),
      "prisma/migrations/20260901231000_platform_membership_utc_bootstrap/migration.sql"
    );
    const correction = existsSync(correctionPath) ? readFileSync(correctionPath, "utf8") : "";

    expect(correction).toContain("UPDATE `platform_membership_tier_versions`");
    expect(correction).toContain("`effective_from` = UTC_TIMESTAMP(3)");
    expect(correction).toContain("`published_at` = LEAST(`published_at`, UTC_TIMESTAMP(3))");
    expect(correction).toContain("`version` = 1");
    expect(correction).toContain("`status` = 'published'");
    expect(correction).toContain("`deleted_at` IS NULL");
    expect(correction).toContain("`effective_from` > UTC_TIMESTAMP(3)");
  });
});
