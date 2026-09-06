import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260906100000_operations_system_settings/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const modelBlock = (name: string): string => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`missing model ${name}`);
  return match[1];
};

const expectedPermissions = [
  "backoffice:system-settings:read",
  "backoffice:system-settings:write",
  "backoffice:system-brand-media:activate",
  "backoffice:im-retention:read",
  "backoffice:im-retention:write",
  "backoffice:legal-documents:read",
  "backoffice:legal-documents:write",
  "backoffice:legal-documents:publish",
  "backoffice:payment-settings:read",
  "backoffice:payment-settings:write"
] as const;

const readPermissions = [
  "backoffice:system-settings:read",
  "backoffice:im-retention:read",
  "backoffice:legal-documents:read",
  "backoffice:payment-settings:read"
] as const;

describe("operations system settings schema", () => {
  it("defines an immutable active platform settings aggregate", () => {
    const block = modelBlock("PlatformSettingVersion");

    expect(block).toContain("publicId");
    expect(block).toContain("activeKey");
    expect(block).toContain("siteEnabled");
    expect(block).toContain("selfRegistrationEnabled");
    expect(block).toContain("googleLoginEnabled");
    expect(block).toContain("passwordLoginOtpEnabled");
    expect(block).toContain("passwordLoginOtpRule");
    expect(block).toContain("passwordLoginOtpOnNewIp");
    expect(block).toContain("loginLogoMediaAssetId");
    expect(block).toContain("requestButtonMediaAssetId");
    expect(block).toContain("offlinePaymentEnabled");
    expect(block).toContain("ndpPaymentEnabled");
    expect(block).toContain("createdByUserId");
    expect(block).toContain('@@map("platform_setting_versions")');
  });

  it("defines language-specific drafts and immutable releases", () => {
    const document = modelBlock("LegalDocument");
    const draft = modelBlock("LegalDocumentDraft");
    const release = modelBlock("LegalDocumentRelease");

    expect(document).toContain("slug");
    expect(document).toContain("internalPath");
    expect(document).toContain("displayLocations");
    expect(document).toContain("isEnabled");
    expect(document).toContain("lockVersion");
    expect(draft).toContain("locale");
    expect(draft).toContain("body");
    expect(draft).toContain("lockVersion");
    expect(draft).toContain("@@unique([documentId, locale]");
    expect(release).toContain("contentHash");
    expect(release).toContain("publishedAt");
    expect(release).toContain("@@unique([documentId, locale, version]");
    expect(release).toContain("@@unique([documentId, locale, activeKey]");
  });

  it("ships additive SQL with defaults, indexes, foreign keys, and grants", () => {
    expect(migration).toContain("CREATE TABLE `platform_setting_versions`");
    expect(migration).toContain("CREATE TABLE `legal_documents`");
    expect(migration).toContain("CREATE TABLE `legal_document_drafts`");
    expect(migration).toContain("CREATE TABLE `legal_document_releases`");
    expect(migration).toContain("'first_login'");
    expect(migration).toContain("'backoffice:system-settings:read'");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'operator')");
    expect(migration).toContain("WHERE `roles`.`code` = 'viewer'");
    expect(migration).toContain("FOREIGN KEY (`login_logo_media_asset_id`)");
    expect(migration).toContain("FOREIGN KEY (`document_id`)");
  });

  it("registers exact permissions and least-privilege role assignments", () => {
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(expectedPermissions));

    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toEqual(expect.arrayContaining(expectedPermissions));
    expect(assignments.operator).toEqual(expect.arrayContaining(expectedPermissions));
    expect(assignments.viewer).toEqual(expect.arrayContaining(readPermissions));

    for (const writePermission of expectedPermissions.filter(
      (permission) => !readPermissions.includes(permission as (typeof readPermissions)[number])
    )) {
      expect(assignments.viewer).not.toContain(writePermission);
    }
  });
});
