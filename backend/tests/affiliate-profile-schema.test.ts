import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate profile schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260828110000_affiliate_profile_channels/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("keeps one versioned profile on the canonical user", () => {
    expect(schema).toMatch(/model AffiliateProfile[\s\S]*userId\s+Int[\s\S]*@unique/);
    expect(schema).toMatch(/model AffiliateProfile[\s\S]*version\s+Int[\s\S]*deletedAt/);
    expect(schema).toMatch(/affiliateProfile\s+AffiliateProfile\?/);
  });

  it("stores soft-deletable external homepage channels", () => {
    expect(schema).toMatch(/model AffiliateProfileChannel[\s\S]*homepageUrl[\s\S]*activeKey/);
    expect(schema).toMatch(
      /model AffiliateProfileChannel[\s\S]*@@index\(\[profileId, sortOrder\]\)/
    );
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("CREATE TABLE `affiliate_profiles`");
    expect(migration).toContain("CREATE TABLE `affiliate_profile_channels`");
  });
});
