import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("personal display-name storage capacity", () => {
  it("keeps every synchronized account field aligned with the 120-character profile contract", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260910130000_personal_display_name_capacity/migration.sql"
    );
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
    const userModel = schema.match(/model User \{[\s\S]*?\n\}/)?.[0] ?? "";
    const identityModel = schema.match(/model UserIdentity \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(userModel).toMatch(/username\s+String\s+@db\.VarChar\(120\)/);
    expect(identityModel).toMatch(
      /displayName\s+String\?\s+@map\("display_name"\)\s+@db\.VarChar\(120\)/
    );
    expect(migration).toContain("MODIFY `username` VARCHAR(120) NOT NULL");
    expect(migration).toContain("MODIFY `display_name` VARCHAR(120) NULL");
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DROP COLUMN");
  });
});
