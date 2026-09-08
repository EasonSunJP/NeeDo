import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("traceless recall membership benefit persistence", () => {
  const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "prisma/migrations/20260906100000_platform_membership_traceless_recall/migration.sql"
    ),
    "utf8"
  );

  it("adds the stable benefit code to the persisted enum", () => {
    expect(schema).toContain("TRACELESS_RECALL");
    expect(migration).toContain("'traceless_recall'");
  });

  it("stores the approved five-language name and explanation", () => {
    for (const name of [
      "聊天无痕撤回",
      "聊天無痕撤回",
      "痕跡を残さない送信取消",
      "Traceless message recall",
      "흔적 없는 메시지 회수"
    ]) {
      expect(migration).toContain(name);
    }
    expect(migration).toContain("双方聊天窗口均不保留");
    expect(migration).toContain("Sender authorization");
    expect(migration).toContain("セキュリティ監査");
  });

  it("attaches the benefit idempotently with free off and all paid tiers on", () => {
    expect(migration).toContain("INSERT INTO `platform_membership_benefits`");
    expect(migration).toContain("INSERT INTO `platform_membership_tier_benefits`");
    expect(migration.match(/ON DUPLICATE KEY UPDATE/g)).toHaveLength(2);
    expect(migration).toContain("`deleted_at` = NULL");
    expect(migration).toMatch(/CASE\s+WHEN `tier`\.`code` = 'free' THEN FALSE\s+ELSE TRUE\s+END/);
    expect(migration).toContain("JSON_OBJECT()");
  });

  it("has a guarded disposable-database checker for migration and replay acceptance", () => {
    const checker = readFileSync(
      resolve(process.cwd(), "scripts/check-membership-traceless-benefit-migration.ts"),
      "utf8"
    );
    expect(checker).toContain("ALLOW_MEMBERSHIP_TRACELESS_MIGRATION_CHECK");
    expect(checker).toContain("needo_membership_traceless_");
    expect(checker).toContain("verifyExchangeCancellationSchemaSocketAdmin");
    expect(checker).toContain("existingDatabaseModified: false");
    expect(checker).toContain("await applySql(connection, traceless)");
  });
});
