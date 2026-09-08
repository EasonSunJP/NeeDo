import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const read = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("formal service taxonomy and search analytics schema", () => {
  const schema = read("prisma/schema.prisma");
  const migrationPath = "prisma/migrations/20260903160000_service_search_analytics/migration.sql";

  it("versions the formal taxonomy and stores aliases plus real search events", () => {
    expect(schema.replace(/\s+/gu, " ")).toContain(
      'configurationVersion Int @default(1) @map("configuration_version")'
    );
    expect(schema).toContain("model SearchKeywordAlias {");
    expect(schema).toContain("model SearchQueryEvent {");
    expect(schema).toContain('@@map("search_keyword_aliases")');
    expect(schema).toContain('@@map("search_query_events")');

    const migration = read(migrationPath);
    expect(migration).toContain("ALTER TABLE `categories`");
    expect(migration).toContain("ALTER TABLE `business_keywords`");
    expect(migration).toContain("CREATE TABLE `search_keyword_aliases`");
    expect(migration).toContain("CREATE TABLE `search_query_events`");
    expect(migration).not.toMatch(/ip_address|user_agent|access_token|raw_session/iu);
  });

  it("grants least-privilege taxonomy and analytics permissions", () => {
    const permissions = [
      "backoffice:service-taxonomy:read",
      "backoffice:service-taxonomy:write",
      "backoffice:search-analytics:read"
    ];
    const migration = read(migrationPath);
    const assignments = buildRolePermissionAssignments();

    for (const permission of permissions) {
      expect(SYSTEM_PERMISSION_CODES).toContain(permission);
      expect(migration).toContain(`'${permission}'`);
      expect(assignments.admin).toContain(permission);
      expect(assignments.operator).toContain(permission);
    }
    expect(assignments.viewer).toEqual(
      expect.arrayContaining([
        "backoffice:service-taxonomy:read",
        "backoffice:search-analytics:read"
      ])
    );
    expect(assignments.viewer).not.toContain("backoffice:service-taxonomy:write");
    for (const role of ["finance", "support", "merchant_owner", "customer"] as const) {
      expect(assignments[role]).not.toEqual(expect.arrayContaining(permissions));
    }
  });
});
