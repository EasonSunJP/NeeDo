import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONTENT_PUBLICATION_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const allContentPermissions = [
  "page:backoffice-user-home-carousel",
  "button:backoffice-user-home-carousel-edit",
  "button:backoffice-user-home-carousel-publish",
  "page:backoffice-affiliate-announcement",
  "button:backoffice-affiliate-announcement-edit",
  "button:backoffice-affiliate-announcement-publish",
  "page:backoffice-affiliate-notice-carousel",
  "button:backoffice-affiliate-notice-carousel-edit",
  "button:backoffice-affiliate-notice-carousel-publish",
  "button:backoffice-content-media-upload"
] as const;

const readContentPermissions = [
  "page:backoffice-user-home-carousel",
  "page:backoffice-affiliate-announcement",
  "page:backoffice-affiliate-notice-carousel"
] as const;

const writeContentPermissions = allContentPermissions.filter(
  (permission) =>
    !readContentPermissions.includes(permission as (typeof readContentPermissions)[number])
);

describe("localized carousel publication RBAC", () => {
  const assignments = buildRolePermissionAssignments();

  it("exports the exact stable permission contract", () => {
    expect(CONTENT_PUBLICATION_PERMISSIONS).toEqual({
      userHomeRead: "page:backoffice-user-home-carousel",
      userHomeEdit: "button:backoffice-user-home-carousel-edit",
      userHomePublish: "button:backoffice-user-home-carousel-publish",
      affiliateAnnouncementRead: "page:backoffice-affiliate-announcement",
      affiliateAnnouncementEdit: "button:backoffice-affiliate-announcement-edit",
      affiliateAnnouncementPublish: "button:backoffice-affiliate-announcement-publish",
      affiliateNoticeRead: "page:backoffice-affiliate-notice-carousel",
      affiliateNoticeEdit: "button:backoffice-affiliate-notice-carousel-edit",
      affiliateNoticePublish: "button:backoffice-affiliate-notice-carousel-publish",
      contentMediaUpload: "button:backoffice-content-media-upload"
    });
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(allContentPermissions));
  });

  it("grants every content operation permission to admin and operator", () => {
    expect(assignments.admin).toEqual(expect.arrayContaining(allContentPermissions));
    expect(assignments.operator).toEqual(expect.arrayContaining(allContentPermissions));
  });

  it("grants viewer only the three backoffice read permissions", () => {
    expect(assignments.viewer).toEqual(expect.arrayContaining(readContentPermissions));
    for (const permission of writeContentPermissions) {
      expect(assignments.viewer).not.toContain(permission);
    }
  });

  it("keeps public Affiliate marketplace access on scout without backoffice content rights", () => {
    expect(assignments.scout).toContain("page:affiliate-marketplace");
    for (const permission of allContentPermissions) {
      expect(assignments.scout).not.toContain(permission);
    }
  });
});

describe("localized carousel publication permission migration", () => {
  const migrationPath = resolve(
    __dirname,
    "../prisma/migrations/20260829093000_localized_carousel_permissions/migration.sql"
  );
  const migration = readFileSync(migrationPath, "utf8");

  it("upserts every permission and restores role mappings without destructive deletes", () => {
    for (const permission of allContentPermissions) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toContain("ON DUPLICATE KEY UPDATE");
    expect(migration).toContain("INSERT INTO `role_permissions`");
    expect(migration).toContain("WHERE `roles`.`code` IN ('admin', 'operator')");
    expect(migration).toContain("WHERE `roles`.`code` = 'viewer'");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(
      /UPDATE\s+`role_permissions`[\s\S]*`deleted_at`\s*=\s*CURRENT_TIMESTAMP/i
    );
  });
});
