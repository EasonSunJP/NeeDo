import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260831160000_im_chat_records_translation/migration.sql"),
  "utf8"
);

describe("IM chat-record deployment migration", () => {
  it.each([
    "im_chat_record_bundles",
    "im_chat_record_items",
    "im_chat_record_deliveries",
    "im_chat_record_favorites",
    "im_message_translations",
    "im_message_batch_delete_commands"
  ])("creates %s without replacing existing IM tables", (table) => {
    expect(migration).toContain(`CREATE TABLE \`${table}\``);
  });

  it("preserves the replay-safe and translation-cache unique constraints", () => {
    expect(migration).toContain("UNIQUE INDEX `im_chat_record_bundles_created_by_identity_id_command_type_i_key`");
    expect(migration).toContain("UNIQUE INDEX `im_chat_record_items_bundle_id_position_key`");
    expect(migration).toContain("UNIQUE INDEX `im_message_translations_message_id_source_content_hash_targe_key`");
    expect(migration).toContain("UNIQUE INDEX `im_message_batch_delete_commands_owner_identity_id_idempoten_key`");
  });
});
