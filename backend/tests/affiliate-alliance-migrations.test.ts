import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate alliance migrations", () => {
  const foundationPath = join(
    process.cwd(),
    "prisma/migrations/20260828203000_affiliate_alliance_foundation/migration.sql"
  );
  const permissionsPath = join(
    process.cwd(),
    "prisma/migrations/20260828204500_affiliate_alliance_permissions/migration.sql"
  );
  const foundation = existsSync(foundationPath) ? readFileSync(foundationPath, "utf8") : "";
  const permissions = existsSync(permissionsPath)
    ? readFileSync(permissionsPath, "utf8")
    : "";

  it("creates the alliance aggregate and expands wallet ownership additively", () => {
    expect(existsSync(foundationPath)).toBe(true);
    expect(foundation).toContain("CREATE TABLE `affiliate_alliances`");
    expect(foundation).toContain("CREATE TABLE `affiliate_alliance_members`");
    expect(foundation).toContain("CREATE TABLE `affiliate_alliance_permissions`");
    expect(foundation).toContain("'alliance'");
    expect(foundation).toContain("REFERENCES `users`(`id`)");
    expect(foundation).toContain("REFERENCES `affiliate_alliances`(`id`)");
    expect(foundation).toContain("REFERENCES `affiliate_alliance_members`(`id`)");
  });

  it("enforces both commission ratios at the database boundary", () => {
    expect(foundation).toMatch(
      /CHECK\s*\(`default_promoter_share_bps`\s+BETWEEN\s+0\s+AND\s+10000\)/i
    );
    expect(foundation).toMatch(
      /CHECK\s*\(`promoter_share_bps_override`\s+IS\s+NULL\s+OR\s+`promoter_share_bps_override`\s+BETWEEN\s+0\s+AND\s+10000\)/i
    );
  });

  it("does not delete or rewrite existing affiliate business data", () => {
    expect(foundation).not.toMatch(
      /\b(?:DELETE\s+FROM|UPDATE)\s+`affiliate_(?:profiles|profile_channels|tasks|claims|touches|attributions|rewards|risk_events)`/i
    );
    expect(foundation).not.toContain("DROP TABLE");
  });

  it("deploys alliance read/create permissions only to admin and activated affiliates", () => {
    expect(existsSync(permissionsPath)).toBe(true);
    expect(permissions).toContain("page:affiliate-alliance");
    expect(permissions).toContain("button:affiliate-alliance-create");
    expect(permissions).toContain("ON DUPLICATE KEY UPDATE");
    expect(permissions).toContain("`roles`.`code` IN ('admin', 'scout')");
    expect(permissions).toContain(
      "'operator', 'finance', 'support', 'merchant_owner', 'merchant_staff', 'technician', 'customer', 'broker', 'viewer'"
    );
    expect(permissions).toContain("`role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)");
  });
});
