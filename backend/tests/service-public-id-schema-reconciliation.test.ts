import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Service public ID schema reconciliation", () => {
  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829090000_localized_carousel_publication/migration.sql"
  );

  it("tracks the already-applied non-null Service public ID migration in source control", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const service = schema.match(/model Service \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(service).toMatch(
      /publicId\s+String\s+@unique\s+@default\(uuid\(\)\)\s+@map\("public_id"\)\s+@db\.Char\(36\)/
    );
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ADD COLUMN `public_id` CHAR(36) NULL");
    expect(migration).toContain("MODIFY `public_id` CHAR(36) NOT NULL");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `services_public_id_key` ON `services`(`public_id`)"
    );
  });
});
