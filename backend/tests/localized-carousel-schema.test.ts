import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("localized carousel publication schema", () => {
  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829090000_localized_carousel_publication/migration.sql"
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

  it("defines canonical locale, scene, release, target, and aggregate enums", () => {
    const locale = enumBlock("ContentLocale");
    for (const [value, mapped] of [
      ["ZH_CN", "zh-CN"],
      ["ZH_TW", "zh-TW"],
      ["EN", "en"],
      ["JA", "ja"],
      ["KO", "ko"]
    ]) {
      expect(locale).toMatch(new RegExp(`${value}\\s+@map\\("${mapped}"\\)`));
    }

    expect(enumBlock("CarouselScene")).toMatch(
      /USER_HOME\s+@map\("user_home"\)[\s\S]*AFFILIATE_HOME_NOTICE\s+@map\("affiliate_home_notice"\)/
    );
    expect(enumBlock("ContentReleaseStatus")).toMatch(
      /DRAFT\s+@map\("draft"\)[\s\S]*SCHEDULED\s+@map\("scheduled"\)[\s\S]*PUBLISHED\s+@map\("published"\)[\s\S]*DISABLED\s+@map\("disabled"\)[\s\S]*ARCHIVED\s+@map\("archived"\)/
    );
    expect(enumBlock("CarouselTargetType")).toMatch(
      /SHOP\s+@map\("shop"\)[\s\S]*TECHNICIAN\s+@map\("technician"\)[\s\S]*SERVICE\s+@map\("service"\)[\s\S]*AFFILIATE_ANNOUNCEMENT\s+@map\("affiliate_announcement"\)/
    );
    expect(enumBlock("ContentPublicationAggregateType")).toMatch(
      /OFFICIAL_ANNOUNCEMENT\s+@map\("official_announcement"\)[\s\S]*CAROUSEL\s+@map\("carousel"\)/
    );
  });

  it.each([
    "OfficialAnnouncement",
    "OfficialAnnouncementRelease",
    "OfficialAnnouncementTranslation",
    "CarouselRelease",
    "CarouselSlide",
    "CarouselSlideTranslation",
    "ContentPublicationCommand"
  ])("defines %s with shared identity and soft deletion fields", (name) => {
    const model = modelBlock(name);
    expect(model).toMatch(/id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
    expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
    expect(model).toMatch(/updatedAt\s+DateTime\s+@updatedAt\s+@map\("updated_at"\)/);
    expect(model).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
  });

  it("defines official announcement lineage, releases, translations, and current slots", () => {
    const announcement = modelBlock("OfficialAnnouncement");
    expect(announcement).toMatch(/publicId\s+String\s+@unique[\s\S]*@db\.Char\(36\)/);
    expect(announcement).toMatch(
      /announcementType\s+String\s+@default\("affiliate_notice"\)\s+@map\("announcement_type"\)\s+@db\.VarChar\(40\)/
    );
    expect(announcement).toMatch(
      /visibilityScope\s+String\s+@default\("all_affiliates"\)\s+@map\("visibility_scope"\)\s+@db\.VarChar\(40\)/
    );
    expect(announcement).toMatch(/affiliateTaskId\s+Int\?\s+@map\("affiliate_task_id"\)/);
    expect(announcement).toMatch(/createdById\s+Int\s+@map\("created_by_id"\)/);
    expect(announcement).toMatch(/@@index\(\[affiliateTaskId\]\)/);
    expect(announcement).toMatch(/@@index\(\[createdById\]\)/);
    expect(announcement).toMatch(/@@index\(\[visibilityScope, deletedAt\]\)/);
    expect(announcement).toMatch(/@@index\(\[deletedAt\]\)/);

    const release = modelBlock("OfficialAnnouncementRelease");
    expect(release).toMatch(/announcementId\s+Int\s+@map\("announcement_id"\)/);
    expect(release).toMatch(/version\s+Int/);
    expect(release).toMatch(/status\s+ContentReleaseStatus\s+@default\(DRAFT\)/);
    expect(release).toMatch(/lockVersion\s+Int\s+@default\(1\)\s+@map\("lock_version"\)/);
    for (const field of ["draftSlotKey", "publishedSlotKey", "scheduledSlotKey"]) {
      expect(release).toMatch(
        new RegExp(`${field}\\s+String\\?\\s+@unique[\\s\\S]*?@db\\.VarChar\\(80\\)`)
      );
    }
    for (const field of [
      "publishAt",
      "visibleFrom",
      "visibleUntil",
      "activatedAt",
      "disabledAt",
      "archivedAt",
      "lastActivationAttemptAt"
    ]) {
      expect(release).toMatch(new RegExp(`${field}\\s+DateTime\\?`));
    }
    expect(release).toMatch(/activationAttempts\s+Int\s+@default\(0\)/);
    expect(release).toMatch(/lastActivationError\s+String\?[\s\S]*@db\.VarChar\(160\)/);
    expect(release).toMatch(/sourceReleaseId\s+Int\?/);
    for (const field of ["createdById", "updatedById", "publishedById", "disabledById"]) {
      expect(release).toMatch(new RegExp(`${field}\\s+Int${field === "createdById" ? "" : "\\?"}`));
    }
    expect(release).toMatch(/@@unique\(\[announcementId, version\]\)/);
    expect(release).toMatch(/@@index\(\[status, publishAt, deletedAt\]\)/);
    expect(release).toMatch(/@@index\(\[sourceReleaseId\]\)/);
    expect(release).toMatch(/@@index\(\[createdById\]\)/);
    expect(release).toMatch(/@@index\(\[updatedById\]\)/);
    expect(release).toMatch(/@@index\(\[publishedById\]\)/);
    expect(release).toMatch(/@@index\(\[disabledById\]\)/);
    expect(release).toMatch(/@@index\(\[deletedAt\]\)/);

    const translation = modelBlock("OfficialAnnouncementTranslation");
    expect(translation).toMatch(/releaseId\s+Int\s+@map\("release_id"\)/);
    expect(translation).toMatch(/locale\s+ContentLocale/);
    expect(translation).toMatch(/title\s+String\s+@db\.VarChar\(160\)/);
    expect(translation).toMatch(/summary\s+String\?\s+@db\.VarChar\(500\)/);
    expect(translation).toMatch(/body\s+String\s+@db\.Text/);
    expect(translation).toMatch(/sourceLocale\s+ContentLocale\s+@map\("source_locale"\)/);
    expect(translation).toMatch(/isInitialCopy\s+Boolean\s+@default\(false\)/);
    expect(translation).toMatch(/@@unique\(\[releaseId, locale\]\)/);
    expect(translation).toMatch(/@@index\(\[locale, deletedAt\]\)/);
  });

  it("defines versioned carousel releases and localized target slides", () => {
    const release = modelBlock("CarouselRelease");
    expect(release).toMatch(/scene\s+CarouselScene/);
    expect(release).toMatch(/version\s+Int/);
    expect(release).toMatch(/status\s+ContentReleaseStatus\s+@default\(DRAFT\)/);
    expect(release).toMatch(/lockVersion\s+Int\s+@default\(1\)/);
    for (const field of ["draftSlotKey", "publishedSlotKey", "scheduledSlotKey"]) {
      expect(release).toMatch(
        new RegExp(`${field}\\s+String\\?\\s+@unique[\\s\\S]*?@db\\.VarChar\\(80\\)`)
      );
    }
    for (const field of [
      "publishAt",
      "activatedAt",
      "disabledAt",
      "archivedAt",
      "lastActivationAttemptAt"
    ]) {
      expect(release).toMatch(new RegExp(`${field}\\s+DateTime\\?`));
    }
    expect(release).toMatch(/activationAttempts\s+Int\s+@default\(0\)/);
    expect(release).toMatch(/lastActivationError\s+String\?[\s\S]*@db\.VarChar\(160\)/);
    expect(release).toMatch(/sourceReleaseId\s+Int\?/);
    for (const field of ["createdById", "updatedById", "publishedById", "disabledById"]) {
      expect(release).toMatch(new RegExp(`${field}\\s+Int${field === "createdById" ? "" : "\\?"}`));
    }
    expect(release).toMatch(/@@unique\(\[scene, version\]\)/);
    expect(release).toMatch(/@@index\(\[status, publishAt, deletedAt\]\)/);
    expect(release).toMatch(/@@index\(\[sourceReleaseId\]\)/);
    expect(release).toMatch(/@@index\(\[createdById\]\)/);
    expect(release).toMatch(/@@index\(\[updatedById\]\)/);
    expect(release).toMatch(/@@index\(\[publishedById\]\)/);
    expect(release).toMatch(/@@index\(\[disabledById\]\)/);
    expect(release).toMatch(/@@index\(\[deletedAt\]\)/);

    const slide = modelBlock("CarouselSlide");
    expect(slide).toMatch(/publicId\s+String\s+@unique[\s\S]*@db\.Char\(36\)/);
    expect(slide).toMatch(/releaseId\s+Int/);
    expect(slide).toMatch(/mediaAssetId\s+Int/);
    expect(slide).toMatch(/sortOrder\s+Int/);
    expect(slide).toMatch(/isEnabled\s+Boolean\s+@default\(true\)/);
    expect(slide).toMatch(/visibleFrom\s+DateTime\?/);
    expect(slide).toMatch(/visibleUntil\s+DateTime\?/);
    expect(slide).toMatch(/targetType\s+CarouselTargetType/);
    for (const field of [
      "shopId",
      "technicianProfileId",
      "serviceId",
      "announcementId",
      "affiliateTaskId"
    ]) {
      expect(slide).toMatch(new RegExp(`${field}\\s+Int\\?`));
      expect(slide).toMatch(new RegExp(`@@index\\(\\[${field}\\]\\)`));
    }
    expect(slide).toMatch(/@@unique\(\[releaseId, sortOrder\]\)/);
    expect(slide).toMatch(/@@index\(\[releaseId, isEnabled, deletedAt\]\)/);

    const translation = modelBlock("CarouselSlideTranslation");
    expect(translation).toMatch(/slideId\s+Int/);
    expect(translation).toMatch(/locale\s+ContentLocale/);
    expect(translation).toMatch(/badge\s+String\?\s+@db\.VarChar\(40\)/);
    expect(translation).toMatch(/title\s+String\s+@db\.VarChar\(160\)/);
    expect(translation).toMatch(/caption\s+String\?\s+@db\.VarChar\(500\)/);
    expect(translation).toMatch(/ctaLabel\s+String\?\s+@map\("cta_label"\)\s+@db\.VarChar\(60\)/);
    expect(translation).toMatch(
      /imageAltText\s+String\s+@map\("image_alt_text"\)\s+@db\.VarChar\(255\)/
    );
    expect(translation).toMatch(/sourceLocale\s+ContentLocale/);
    expect(translation).toMatch(/isInitialCopy\s+Boolean\s+@default\(false\)/);
    expect(translation).toMatch(/@@unique\(\[slideId, locale\]\)/);
    expect(translation).toMatch(/@@index\(\[locale, deletedAt\]\)/);
  });

  it("defines idempotent content publication commands", () => {
    const command = modelBlock("ContentPublicationCommand");
    expect(command).toMatch(
      /idempotencyKey\s+String\s+@unique\s+@map\("idempotency_key"\)\s+@db\.VarChar\(191\)/
    );
    expect(command).toMatch(
      /requestFingerprint\s+String\s+@map\("request_fingerprint"\)\s+@db\.Char\(64\)/
    );
    expect(command).toMatch(/aggregateType\s+ContentPublicationAggregateType/);
    expect(command).toMatch(/aggregateKey\s+String\s+@map\("aggregate_key"\)\s+@db\.VarChar\(80\)/);
    expect(command).toMatch(/releaseId\s+Int\?/);
    expect(command).toMatch(/action\s+String\s+@db\.VarChar\(40\)/);
    expect(command).toMatch(/actorUserId\s+Int\?/);
    expect(command).toMatch(/result\s+Json/);
    expect(command).toMatch(/@@index\(\[aggregateType, aggregateKey, action\]\)/);
    expect(command).toMatch(/@@index\(\[actorUserId\]\)/);
    expect(command).toMatch(/@@index\(\[deletedAt\]\)/);
  });

  it("connects all publication lineage and targets with restrictive deletes", () => {
    const announcement = modelBlock("OfficialAnnouncement");
    expect(announcement).toMatch(/affiliateTask\s+AffiliateTask\?[\s\S]*onDelete: Restrict/);
    expect(announcement).toMatch(/createdBy\s+User[\s\S]*onDelete: Restrict/);

    const announcementRelease = modelBlock("OfficialAnnouncementRelease");
    expect(announcementRelease).toMatch(
      /announcement\s+OfficialAnnouncement[\s\S]*onDelete: Restrict/
    );
    expect(announcementRelease).toMatch(
      /sourceRelease\s+OfficialAnnouncementRelease\?[\s\S]*onDelete: Restrict/
    );
    expect(announcementRelease).toMatch(/createdBy\s+User[\s\S]*onDelete: Restrict/);
    for (const relation of ["updatedBy", "publishedBy", "disabledBy"]) {
      expect(announcementRelease).toMatch(
        new RegExp(`${relation}\\s+User\\?[\\s\\S]*?onDelete: SetNull`)
      );
    }
    expect(modelBlock("OfficialAnnouncementTranslation")).toMatch(
      /release\s+OfficialAnnouncementRelease[\s\S]*onDelete: Restrict/
    );

    const carouselRelease = modelBlock("CarouselRelease");
    expect(carouselRelease).toMatch(/sourceRelease\s+CarouselRelease\?[\s\S]*onDelete: Restrict/);
    expect(carouselRelease).toMatch(/createdBy\s+User[\s\S]*onDelete: Restrict/);
    for (const relation of ["updatedBy", "publishedBy", "disabledBy"]) {
      expect(carouselRelease).toMatch(
        new RegExp(`${relation}\\s+User\\?[\\s\\S]*?onDelete: SetNull`)
      );
    }

    const slide = modelBlock("CarouselSlide");
    for (const relation of [
      "release",
      "mediaAsset",
      "shop",
      "technicianProfile",
      "service",
      "announcement",
      "affiliateTask"
    ]) {
      expect(slide).toMatch(
        new RegExp(`${relation}\\s+[A-Z][A-Za-z]+\\??[\\s\\S]*?onDelete: Restrict`)
      );
    }
    expect(modelBlock("CarouselSlideTranslation")).toMatch(
      /slide\s+CarouselSlide[\s\S]*onDelete: Restrict/
    );
    expect(modelBlock("ContentPublicationCommand")).toMatch(
      /actorUser\s+User\?[\s\S]*onDelete: SetNull/
    );
  });

  it("ships an additive migration with guarded Service UUID backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);
    for (const table of [
      "official_announcements",
      "official_announcement_releases",
      "official_announcement_translations",
      "carousel_releases",
      "carousel_slides",
      "carousel_slide_translations",
      "content_publication_commands"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).toContain("ADD COLUMN `public_id` CHAR(36) NULL");
    expect(migration).toMatch(
      /UPDATE `services`[\s\S]*SET `public_id` = UUID\(\)[\s\S]*WHERE `public_id` IS NULL/
    );
    expect(migration).toContain("SIGNAL SQLSTATE ''45000''");
    expect(migration).toMatch(/MODIFY `public_id` CHAR\(36\) NOT NULL/);
    expect(migration).toContain(
      "CREATE UNIQUE INDEX `services_public_id_key` ON `services`(`public_id`)"
    );
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)/i);
  });

  it("creates unique slots, query indexes, and non-cascading foreign keys", () => {
    for (const slot of ["draft_slot_key", "published_slot_key", "scheduled_slot_key"]) {
      expect(migration).toMatch(new RegExp("UNIQUE INDEX [^\\n]+\\(`" + slot + "`\\)"));
    }
    expect(migration).toContain("official_announcement_releases_status_publish_at_deleted_at_idx");
    expect(migration).toContain("carousel_releases_status_publish_at_deleted_at_idx");
    expect(migration).toContain("carousel_slides_release_id_is_enabled_deleted_at_idx");

    for (const target of [
      "users",
      "media_assets",
      "shops",
      "technician_profiles",
      "services",
      "affiliate_tasks",
      "official_announcements",
      "official_announcement_releases",
      "carousel_releases",
      "carousel_slides"
    ]) {
      expect(migration).toMatch(
        new RegExp("REFERENCES `" + target + "`\\(`id`\\) ON DELETE (?:RESTRICT|SET NULL)")
      );
    }
    expect(migration).not.toContain("ON DELETE CASCADE");
  });
});
