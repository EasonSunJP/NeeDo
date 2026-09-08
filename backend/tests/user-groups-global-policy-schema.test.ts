import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("user groups and global policy persistence", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = resolve(
    process.cwd(),
    "prisma/migrations/20260901193000_user_groups_global_policy/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("defines custom groups, memberships, versioned policies, and NDP campaigns", () => {
    for (const token of [
      "model BackofficeUserGroup",
      "model BackofficeUserGroupMembership",
      "model UserGlobalPolicyVersion",
      "model NdpExperienceCampaign",
      "requirePhone",
      "requireEmail",
      "requireHomeServiceEkyc",
      "requireStoreServiceEkyc",
      "requireMerchantApplicationEkyc",
      "requireTechnicianApplicationEkyc",
      "ndpPerBaseExp",
      "baseExpUnitsPerThreshold",
      "effectiveFrom",
      "effectiveTo"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("persists only custom groups and protects active names and memberships", () => {
    expect(schema).toContain("enum BackofficeUserGroupKind");
    expect(schema).toContain("CUSTOM");
    expect(schema).toContain("activeNameKey");
    expect(schema).toContain("backoffice_user_group_active_name_key");
    expect(schema).toContain("backoffice_user_group_membership_key");
    expect(migration).not.toMatch(/INSERT INTO `backoffice_user_groups`/i);
    expect(migration).not.toMatch(/system:(free|silver|gold|black_diamond|operations)/i);
  });

  it("seeds one disabled-by-default V1 policy with the approved base NDP ratio", () => {
    expect(migration).toContain("INSERT INTO `user_global_policy_versions`");
    expect(migration).toMatch(
      /VALUES\s*\(UUID\(\), 1, 'published', FALSE, FALSE, FALSE, FALSE, 100, 10000/i
    );
    expect(migration).not.toContain("INSERT INTO `ndp_experience_campaigns`");
  });

  it("adds publication, range, and integer-value constraints", () => {
    for (const token of [
      "user_global_policy_version_key",
      "user_global_policy_resolution_idx",
      "ndp_experience_campaign_resolution_idx",
      "ndp_experience_campaign_window_chk",
      "user_global_policy_ndp_per_base_exp_chk",
      "user_global_policy_base_exp_units_chk"
    ]) {
      expect(migration).toContain(token);
    }
  });
});
