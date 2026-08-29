import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("carousel localized media and none target schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829213000_carousel_locale_media_none_target/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("adds an explicit none target without rewriting the original carousel migration", () => {
    expect(schema).toMatch(/enum CarouselTargetType[\s\S]*NONE\s+@map\("none"\)/);
    expect(migration).toContain(
      "ALTER TABLE `carousel_slides` MODIFY `target_type` ENUM('shop', 'technician', 'service', 'affiliate_announcement', 'none') NOT NULL"
    );
  });

  it("links optional translation media with a restrictive foreign key and index", () => {
    expect(schema).toMatch(
      /model CarouselSlideTranslation[\s\S]*mediaAssetId\s+Int\?\s+@map\("media_asset_id"\)/
    );
    expect(schema).toMatch(/mediaAsset\s+MediaAsset\?[^\n]*onDelete: Restrict/);
    expect(schema).toMatch(/@@index\(\[mediaAssetId\]\)/);
    expect(migration).toContain("ADD COLUMN `media_asset_id` INTEGER NULL");
    expect(migration).toContain("carousel_slide_translations_media_asset_id_idx");
    expect(migration).toContain("carousel_slide_translations_media_asset_id_fkey");
  });
});
