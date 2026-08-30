import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const schemaPath = join(__dirname, "../prisma/schema.prisma");
const migrationPath = join(
  __dirname,
  "../prisma/migrations/20260831120000_conversation_auto_translate_messages/migration.sql",
);

describe("conversation auto-translation schema contract", () => {
  it("persists a default-off participant preference with an additive migration", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";

    expect(schema).toContain(
      'autoTranslateMessages Boolean @default(false) @map("auto_translate_messages")',
    );
    expect(migration).toMatch(
      /ALTER TABLE `conversation_participants`[\s\S]*`auto_translate_messages` BOOLEAN NOT NULL DEFAULT FALSE/,
    );
    expect(migration).not.toMatch(/ALTER TABLE `(messages|contacts|conversations)`/i);
    expect(migration).not.toMatch(/UPDATE `(messages|contacts)`/i);
  });
});
