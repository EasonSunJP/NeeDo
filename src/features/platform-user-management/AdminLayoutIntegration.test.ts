import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageFiles = [
  "UserListPage.tsx",
  "UserGroupsPage.tsx",
  "UserGlobalSettingsPage.tsx",
  "MembershipTiersPage.tsx",
  "MembershipBenefitsPage.tsx"
] as const;

describe("platform user-management admin layout integration", () => {
  it.each(pageFiles)("keeps %s inside the operations admin shell", (fileName) => {
    const source = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8");

    expect(source).toContain('import { AdminLayout } from "../../components/admin/AdminLayout";');
    expect(source).toMatch(/return\s*(?:\(|)\s*<AdminLayout>/u);
    expect(source).toMatch(/<\/ModuleShell>\s*<\/AdminLayout>/u);
  });
});
