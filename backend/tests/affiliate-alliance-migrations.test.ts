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
  const permissions = existsSync(permissionsPath) ? readFileSync(permissionsPath, "utf8") : "";
  const invitationsPath = join(
    process.cwd(),
    "prisma/migrations/20260828210000_affiliate_alliance_invitations/migration.sql"
  );
  const invitations = existsSync(invitationsPath) ? readFileSync(invitationsPath, "utf8") : "";

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

  it("deploys alliance read/create permissions only to admin and scout roles", () => {
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

  it("creates audited 72-hour invitation persistence with all query constraints", () => {
    expect(existsSync(invitationsPath)).toBe(true);
    expect(invitations).toContain("CREATE TABLE `affiliate_alliance_invitations`");
    expect(invitations).toContain("`pending_key` VARCHAR(191) NULL");
    expect(invitations).toContain("UNIQUE INDEX `affiliate_alliance_invitations_pending_key_key`");
    expect(invitations).toContain("`responded_at` DATETIME(3) NULL");
    expect(invitations).toContain("`expired_at` DATETIME(3) NULL");
    expect(invitations).toContain("`deleted_at` DATETIME(3) NULL");
    expect(invitations).toContain("affiliate_alliance_invitations_role_parent_check");
    expect(invitations).toMatch(/`role` = 'partner'[\s\S]*`proposed_parent_member_id` IS NULL/i);
    expect(invitations).toMatch(
      /`role` = 'subordinate'[\s\S]*`proposed_parent_member_id` IS NOT NULL/i
    );
    expect(invitations).toContain("REFERENCES `affiliate_alliances`(`id`)");
    expect(invitations).toContain("REFERENCES `affiliate_alliance_members`(`id`)");
    expect(invitations).toContain("REFERENCES `users`(`id`)");
    expect(invitations).toContain("affiliate_alliance_invitations_status_expires_at_id_idx");
  });

  it("keeps every explicit invitation database identifier within the MySQL 64-character limit", () => {
    const identifiers = Array.from(
      invitations.matchAll(/(?:INDEX|CONSTRAINT)\s+`([^`]+)`/g),
      (match) => match[1]
    );
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers.filter((identifier) => identifier.length > 64)).toEqual([]);
  });

  it("does not combine the role-parent check with a cascading update action", () => {
    expect(invitations).toMatch(
      /affiliate_alliance_invitations_proposed_parent_member_id_fkey[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/
    );
  });

  it("deploys invitation permissions only to admin and scout roles", () => {
    for (const code of [
      "affiliate-alliance:members:list",
      "affiliate-alliance:candidates:list",
      "affiliate-alliance:invitations:list",
      "button:affiliate-alliance-invite",
      "button:affiliate-alliance-invitation-respond"
    ]) {
      expect(invitations).toContain(code);
    }
    expect(invitations).toContain("ON DUPLICATE KEY UPDATE");
    expect(invitations).toContain("`roles`.`code` IN ('admin', 'scout')");
    expect(invitations).toContain(
      "'operator', 'finance', 'support', 'merchant_owner', 'merchant_staff', 'technician', 'customer', 'broker', 'viewer'"
    );
    expect(invitations).toContain("`role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)");
    expect(invitations).not.toContain("DROP TABLE");
  });
});
