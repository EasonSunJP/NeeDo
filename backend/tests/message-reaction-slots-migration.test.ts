import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationDirectory = resolve(
  __dirname,
  "../prisma/migrations/20260830090000_message_reaction_slots"
);

describe("message reaction slot reconciliation migration", () => {
  it("audits and soft-deletes only older active rows in each user slot", () => {
    const migration = readFileSync(resolve(migrationDirectory, "migration.sql"), "utf8");
    const categoryExpression =
      "'OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks'";

    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toMatch(
      /PARTITION BY\s+`message_id`,\s+`user_id`,\s+CASE[\s\S]+END/
    );
    expect(migration).toContain(categoryExpression);
    expect(migration).toContain("ORDER BY `updated_at` DESC, `id` DESC");
    expect(migration).toContain("WHERE `deleted_at` IS NULL");
    expect(migration).toContain("WHERE `reaction_rank` > 1");
    expect(migration).toContain("INSERT INTO `audit_logs`");
    expect(migration).toContain("migration.im.reaction_slot_cleanup");
    expect(migration).toContain("20260830090000_message_reaction_slots");
    expect(migration).toContain("previousUpdatedAt");
    expect(migration.indexOf("INSERT INTO `audit_logs`")).toBeLessThan(
      migration.indexOf("UPDATE `message_reactions`")
    );
    expect(migration).toMatch(/SET\s+\w+\.`deleted_at`\s*=\s*@message_reaction_slot_cleanup_at/);
    expect(migration).toMatch(/\w+\.`updated_at`\s*=\s*@message_reaction_slot_cleanup_at/);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+`?message_reactions`?/i);
  });

  it("provides a guarded exact rollback and consumes audit rows by soft deletion", () => {
    const rollback = readFileSync(resolve(migrationDirectory, "rollback.sql"), "utf8");

    expect(rollback).toContain("WARNING");
    expect(rollback).toContain("reintroduces the pre-migration multi-reaction state");
    expect(rollback).toContain("application enforcement is also rolled back");
    expect(rollback).toContain("migration.im.reaction_slot_cleanup");
    expect(rollback).toContain("20260830090000_message_reaction_slots");
    expect(rollback).toContain("reaction.`id` = cleanup.`target_id`");
    expect(rollback).toContain("reaction.`deleted_at` = cleanup.`created_at`");
    expect(rollback).toContain("reaction.`updated_at` = cleanup.`created_at`");
    expect(rollback).toContain("reaction.`deleted_at` = NULL");
    expect(rollback).toContain("$.previousUpdatedAt");
    expect(rollback).toMatch(/UPDATE\s+`audit_logs`[\s\S]+cleanup\.`deleted_at`\s*=\s*CURRENT_TIMESTAMP\(3\)/);
    expect(rollback).not.toMatch(/DELETE\s+FROM\s+`?audit_logs`?/i);
  });

  it("ships a read-only checker with the identical category contract", () => {
    const checker = readFileSync(
      resolve(__dirname, "../scripts/check-message-reaction-slots.ts"),
      "utf8"
    );
    const packageJson = readFileSync(resolve(__dirname, "../package.json"), "utf8");

    expect(checker).toContain(
      "'OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks'"
    );
    expect(checker).toContain("WHERE deleted_at IS NULL");
    expect(checker).toContain("GROUP BY message_id, identity_id, category");
    expect(checker).toContain("HAVING COUNT(*) > 1");
    expect(checker).not.toMatch(/\$executeRaw|\b(?:INSERT|UPDATE|DELETE)\b/i);
    expect(packageJson).toContain('"check:message-reaction-slots"');
  });
});
