import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate task localization schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829223000_affiliate_task_translations/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  it("stores one soft-deletable translation per task and locale", () => {
    expect(schema).toMatch(
      /model AffiliateTaskTranslation \{[\s\S]*taskId\s+Int[\s\S]*locale\s+ContentLocale[\s\S]*name\s+String[\s\S]*description\s+String\?[\s\S]*sourceLocale\s+ContentLocale[\s\S]*isInitialCopy\s+Boolean[\s\S]*createdAt[\s\S]*updatedAt[\s\S]*deletedAt/
    );
    expect(schema).toMatch(
      /model AffiliateTaskTranslation \{[\s\S]*@@unique\(\[taskId, locale\]\)[\s\S]*@@index\(\[locale, deletedAt\]\)[\s\S]*@@index\(\[deletedAt\]\)/
    );
    expect(schema).toMatch(/model AffiliateTask \{[\s\S]*translations\s+AffiliateTaskTranslation\[\]/);
  });

  it("creates and backfills all five locale rows without rewriting tasks", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("CREATE TABLE `affiliate_task_translations`");
    expect(migration).toContain("INSERT INTO `affiliate_task_translations`");
    for (const locale of ["zh-CN", "zh-TW", "en", "ja", "ko"]) {
      expect(migration).toContain(`'${locale}'`);
    }
    expect(migration).toContain("Affiliate task translation backfill is incomplete");
    expect(migration).not.toMatch(/UPDATE\s+`affiliate_tasks`/i);
    expect(migration).toContain(
      "FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE"
    );
  });
});
