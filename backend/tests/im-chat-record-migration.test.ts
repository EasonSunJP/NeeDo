import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "prisma/migrations/20260831160000_im_chat_records_translation/migration.sql"
  ),
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
    expect(migration).toContain(
      "UNIQUE INDEX `im_chat_record_bundles_created_by_identity_id_command_type_i_key`"
    );
    expect(migration).toContain("UNIQUE INDEX `im_chat_record_items_bundle_id_position_key`");
    expect(migration).toContain(
      "UNIQUE INDEX `im_message_translations_message_id_source_content_hash_targe_key`"
    );
    expect(migration).toContain(
      "UNIQUE INDEX `im_message_batch_delete_commands_owner_identity_id_idempoten_key`"
    );
  });

  it("does not apply destructive or mutating statements to existing IM tables", () => {
    [
      "messages",
      "message_user_deletions",
      "conversations",
      "conversation_participants",
      "message_reactions",
      "im_deletion_sync"
    ].forEach((table) => {
      expect(migration).not.toMatch(
        new RegExp(
          `(?:ALTER\\s+TABLE|CREATE\\s+TABLE|DROP\\s+TABLE|TRUNCATE\\s+TABLE|RENAME\\s+TABLE|DELETE\\s+FROM|UPDATE|INSERT\\s+INTO)\\s+\\\`${table}\\\``,
          "i"
        )
      );
    });
  });

  it("uses the planned foreign-key deletion policies", () => {
    [
      "ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_source_message_id_fkey` FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_created_by_identity_id_fkey` FOREIGN KEY (`created_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_source_conversation_id_fkey` FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_sender_identity_id_fkey` FOREIGN KEY (`sender_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_owner_identity_id_fkey` FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_message_translations` ADD CONSTRAINT `im_message_translations_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;",
      "ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_owner_identity_id_fkey` FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;"
    ].forEach((foreignKey) => expect(migration).toContain(foreignKey));
  });
});
