import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("shop employee foundation schema", () => {
  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260903130000_shop_employee_foundation/migration.sql"
  );
  const schema = readFileSync(schemaPath, "utf8");
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const enumBlock = (name: string): string => {
    const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing enum ${name}`);
    return match[1];
  };

  it("defines a user-level shop employee authority linked to technician affiliation", () => {
    const model = modelBlock("ShopEmployee");

    expect(model).toMatch(/shopId\s+Int\s+@map\("shop_id"\)/);
    expect(model).toMatch(/userId\s+Int\s+@map\("user_id"\)/);
    expect(model).toMatch(/status\s+ShopEmployeeStatus\s+@default\(ACTIVE\)/);
    expect(model).toMatch(
      /technicianShopAffiliationId\s+Int\?\s+@unique\(map: "shop_employees_tech_affiliation_key"\)/
    );
    expect(model).toMatch(
      /activeKey\s+String\?\s+@unique\(map: "shop_employees_active_key_key"\)/
    );
    expect(model).toMatch(
      /@@index\(\[shopId, status, deletedAt\], map: "shop_employees_shop_status_deleted_idx"\)/
    );
    expect(model).toMatch(
      /@@index\(\[userId, status, deletedAt\], map: "shop_employees_user_status_deleted_idx"\)/
    );
    for (const field of [
      "startsAt",
      "endsAt",
      "createdById",
      "updatedById",
      "createdAt",
      "updatedAt",
      "deletedAt"
    ]) {
      expect(model).toContain(field);
    }
  });

  it("defines localized system and custom roles plus time-bounded assignments", () => {
    const role = modelBlock("ShopEmployeeRole");
    const assignment = modelBlock("ShopEmployeeRoleAssignment");

    expect(role).toMatch(/shopId\s+Int\?/);
    expect(role).toMatch(/code\s+String/);
    for (const field of ["nameZhHans", "nameZhHant", "nameJa", "nameEn", "nameKo"]) {
      expect(role).toContain(field);
    }
    expect(role).toMatch(/isSystem\s+Boolean\s+@default\(false\)/);
    expect(role).toMatch(/isTechnicianRole\s+Boolean\s+@default\(false\)/);
    expect(role).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(role).toMatch(/@@index\(\[shopId, deletedAt\]/);

    expect(assignment).toMatch(/shopEmployeeId\s+Int\s+@map\("shop_employee_id"\)/);
    expect(assignment).toMatch(/shopEmployeeRoleId\s+Int\s+@map\("shop_employee_role_id"\)/);
    expect(assignment).toContain("startsAt");
    expect(assignment).toContain("endsAt");
    expect(assignment).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(assignment).toMatch(
      /@@index\(\[shopEmployeeId, startsAt, endsAt, deletedAt\], map: "shop_employee_role_assignments_employee_range_idx"\)/
    );
  });

  it("maps stable lowercase employment states", () => {
    const status = enumBlock("ShopEmployeeStatus");

    expect(status).toMatch(/ACTIVE\s+@map\("active"\)/);
    expect(status).toMatch(/ON_LEAVE\s+@map\("on_leave"\)/);
    expect(status).toMatch(/SUSPENDED\s+@map\("suspended"\)/);
    expect(status).toMatch(/ENDED\s+@map\("ended"\)/);
  });

  it("ships additive tables, eight localized system roles, and restrictive foreign keys", () => {
    expect(migration).toContain("CREATE TABLE `shop_employees`");
    expect(migration).toContain("CREATE TABLE `shop_employee_roles`");
    expect(migration).toContain("CREATE TABLE `shop_employee_role_assignments`");
    for (const roleCode of [
      "OWNER",
      "ADMINISTRATOR",
      "STAFF",
      "TECHNICIAN",
      "ACCOUNTANT",
      "DRIVER",
      "GENERAL_AFFAIRS",
      "CHEF"
    ]) {
      expect(migration).toContain(`'${roleCode}'`);
    }
    expect(migration).toContain("`name_zh_hans`");
    expect(migration).toContain("`name_zh_hant`");
    expect(migration).toContain("`name_ja`");
    expect(migration).toContain("`name_en`");
    expect(migration).toContain("`name_ko`");
    expect(migration).toMatch(/FOREIGN KEY \(`shop_id`\).*REFERENCES `shops`\(`id`\).*ON DELETE RESTRICT/);
    expect(migration).toMatch(/FOREIGN KEY \(`user_id`\).*REFERENCES `users`\(`id`\).*ON DELETE RESTRICT/);
    expect(migration).toMatch(
      /FOREIGN KEY \(`technician_shop_affiliation_id`\).*REFERENCES `technician_shop_affiliations`\(`id`\).*ON DELETE RESTRICT/
    );
    expect(migration).not.toMatch(/DROP\s+(?:COLUMN|TABLE)/i);
  });

  it("backfills only formal owner, merchant identity, merchant account, and technician evidence", () => {
    expect(migration).toContain("shop-owner-backfill");
    expect(migration).toContain("shop-identity-backfill");
    expect(migration).toContain("merchant-account-backfill");
    expect(migration).toContain("technician-affiliation-backfill");
    expect(migration).toContain("FROM `technician_shop_affiliations`");
    expect(migration).toContain("FROM `user_identities`");
    expect(migration).toContain("FROM `merchant_shop_memberships`");
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).not.toContain("manual-employees");
    expect(migration).not.toContain("localStorage");
  });
});
