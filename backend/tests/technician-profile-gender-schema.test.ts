import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("technician profile gender schema", () => {
  it("adds the persisted gender column through an additive migration", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260903120000_technician_profile_gender/migration.sql"
    );
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    const technicianProfileModel = schema.match(/model TechnicianProfile \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(technicianProfileModel).toMatch(
      /gender\s+String\s+@default\("private"\)\s+@db\.VarChar\(20\)/
    );
    expect(migration).toContain(
      "ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private'"
    );
    expect(migration).not.toContain("DROP TABLE");
  });
});
