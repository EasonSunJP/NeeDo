import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("technician shop affiliation schema", () => {
  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260828100000_technician_shop_affiliation_foundation/migration.sql"
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

  it("defines one soft-deletable shop affiliation authority", () => {
    const model = modelBlock("TechnicianShopAffiliation");

    expect(model).toMatch(/technicianProfileId\s+Int\s+@map\("technician_profile_id"\)/);
    expect(model).toMatch(/shopId\s+Int\s+@map\("shop_id"\)/);
    expect(model).toMatch(/relationshipType\s+TechnicianShopRelationshipType/);
    expect(model).toMatch(/workStatus\s+TechnicianShopWorkStatus/);
    expect(model).toMatch(
      /activeKey\s+String\?\s+@unique\(map: "tech_shop_affiliation_active_key_key"\)/
    );
    expect(model).toMatch(
      /@@index\(\[technicianProfileId, workStatus, deletedAt\], map: "tech_shop_affiliation_profile_status_deleted_idx"\)/
    );
    expect(model).toMatch(
      /@@index\(\[shopId, workStatus, deletedAt\], map: "tech_shop_affiliation_shop_status_deleted_idx"\)/
    );
    expect(model).toMatch(
      /@@index\(\[shopId, technicianProfileId, deletedAt\], map: "tech_shop_affiliation_shop_profile_deleted_idx"\)/
    );
    for (const field of ["createdAt", "updatedAt", "deletedAt"]) {
      expect(model).toContain(field);
    }
  });

  it("maps stable lowercase relationship and work status values", () => {
    expect(enumBlock("TechnicianShopRelationshipType")).toMatch(/EXCLUSIVE\s+@map\("exclusive"\)/);
    expect(enumBlock("TechnicianShopRelationshipType")).toMatch(/PARTNER\s+@map\("partner"\)/);

    const status = enumBlock("TechnicianShopWorkStatus");
    expect(status).toMatch(/ACTIVE\s+@map\("active"\)/);
    expect(status).toMatch(/ON_LEAVE\s+@map\("on_leave"\)/);
    expect(status).toMatch(/SUSPENDED\s+@map\("suspended"\)/);
    expect(status).toMatch(/ENDED\s+@map\("ended"\)/);
  });

  it("adds only the affiliation table and preserves legacy technician columns", () => {
    expect(migration).toContain("CREATE TABLE `technician_shop_affiliations`");
    expect(migration).toContain("UNIQUE INDEX `tech_shop_affiliation_active_key_key`");
    expect(migration).toContain("tech_shop_affiliation_profile_status_deleted_idx");
    expect(migration).toContain("tech_shop_affiliation_shop_status_deleted_idx");
    expect(migration).toContain("tech_shop_affiliation_shop_profile_deleted_idx");
    expect(migration).toMatch(
      /FOREIGN KEY \(`technician_profile_id`\).*REFERENCES `technician_profiles`\(`id`\).*ON DELETE RESTRICT/
    );
    expect(migration).toMatch(
      /FOREIGN KEY \(`shop_id`\).*REFERENCES `shops`\(`id`\).*ON DELETE RESTRICT/
    );
    expect(migration).not.toMatch(/DROP\s+(?:COLUMN|TABLE)/i);
    expect(migration).not.toMatch(/ALTER TABLE `technician_profiles`/);
  });

  it("keeps legacy single-shop fields for compatibility during cutover", () => {
    const technician = modelBlock("TechnicianProfile");

    expect(technician).toMatch(/shopId\s+Int\?/);
    expect(technician).toMatch(/employmentType\s+TechnicianEmploymentType/);
    expect(technician).toMatch(/employmentStartedAt\s+DateTime\?/);
    expect(technician).toMatch(/technicianShopAffiliations\s+TechnicianShopAffiliation\[\]/);
  });
});
