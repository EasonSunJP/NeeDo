import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260909090000_technician_order_automation/migration.sql"
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const modelSource = (name: string): string =>
  schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`, "m"))?.[0] ?? "";

describe("technician order automation schema", () => {
  it("stores one versioned server-authoritative setting per technician and automation kind", () => {
    const source = modelSource("TechnicianAutomationSetting");
    expect(source).toContain("technicianProfileId Int                      @map(\"technician_profile_id\")");
    expect(source).toContain("kind                TechnicianAutomationKind");
    expect(source).toContain("enabled             Boolean                  @default(false)");
    expect(source).toContain("rules               Json");
    expect(source).toContain("version             Int                      @default(1)");
    expect(source).toContain("deletedAt           DateTime?                @map(\"deleted_at\")");
    expect(source).toContain("@@unique([technicianProfileId, kind], map: \"technician_automation_settings_owner_kind_key\")");
  });

  it("keeps an append-only idempotent decision record with the exact rule version", () => {
    const source = modelSource("TechnicianAutomationDecisionLog");
    expect(source).toMatch(/ruleVersion\s+Int\s+@map\("rule_version"\)/);
    expect(source).toMatch(/matchedConditions\s+Json\s+@map\("matched_conditions"\)/);
    expect(source).toMatch(/failedReasons\s+Json\s+@map\("failed_reasons"\)/);
    expect(source).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(source).toMatch(/executedAt\s+DateTime\?\s+@map\("executed_at"\)/);
    expect(source).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/);
  });

  it("ships an additive migration with owner, lookup, and idempotency indexes", () => {
    expect(migration).toContain("CREATE TABLE `technician_automation_settings`");
    expect(migration).toContain("CREATE TABLE `technician_automation_decision_logs`");
    expect(migration).toContain("technician_automation_settings_owner_kind_key");
    expect(migration).toContain("technician_automation_decision_logs_idempotency_key_key");
    expect(migration).toContain("technician_automation_decision_logs_target_idx");
    expect(migration).not.toMatch(/(?:^|\n)\s*(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
  });
});
