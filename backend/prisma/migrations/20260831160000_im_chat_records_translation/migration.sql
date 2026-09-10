-- CreateTable
CREATE TABLE `im_chat_record_bundles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `command_type` VARCHAR(24) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `created_by_identity_id` INTEGER NOT NULL,
    `source_conversation_id` INTEGER NOT NULL,
    `sender_count` INTEGER NOT NULL,
    `item_count` INTEGER NOT NULL,
    `sender_names_snapshot` JSON NOT NULL,
    `title_snapshot` VARCHAR(255) NOT NULL,
    `preview_snapshot` VARCHAR(500) NOT NULL,
    `content_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `im_chat_record_bundles_public_id_key`(`public_id`),
    INDEX `im_chat_record_bundles_source_conversation_id_deleted_at_idx`(`source_conversation_id`, `deleted_at`),
    INDEX `im_chat_record_bundles_created_by_user_id_deleted_at_idx`(`created_by_user_id`, `deleted_at`),
    INDEX `im_chat_record_bundles_created_by_identity_id_deleted_at_idx`(`created_by_identity_id`, `deleted_at`),
    UNIQUE INDEX `im_chat_record_bundles_created_by_identity_id_command_type_i_key`(`created_by_identity_id`, `command_type`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `im_chat_record_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bundle_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `source_message_id` INTEGER NULL,
    `sender_user_id` INTEGER NULL,
    `sender_identity_id` INTEGER NULL,
    `sender_display_name_snapshot` VARCHAR(160) NOT NULL,
    `sender_avatar_snapshot` VARCHAR(500) NULL,
    `message_type` VARCHAR(40) NOT NULL,
    `content_snapshot` TEXT NULL,
    `metadata_snapshot` JSON NULL,
    `sent_at_snapshot` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `im_chat_record_items_source_message_id_idx`(`source_message_id`),
    INDEX `im_chat_record_items_sender_user_id_idx`(`sender_user_id`),
    INDEX `im_chat_record_items_sender_identity_id_idx`(`sender_identity_id`),
    INDEX `im_chat_record_items_bundle_id_deleted_at_idx`(`bundle_id`, `deleted_at`),
    UNIQUE INDEX `im_chat_record_items_bundle_id_position_key`(`bundle_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `im_chat_record_deliveries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bundle_id` INTEGER NOT NULL,
    `message_id` INTEGER NOT NULL,
    `conversation_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `im_chat_record_deliveries_message_id_key`(`message_id`),
    INDEX `im_chat_record_deliveries_bundle_id_deleted_at_idx`(`bundle_id`, `deleted_at`),
    INDEX `im_chat_record_deliveries_conversation_id_deleted_at_idx`(`conversation_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `im_chat_record_favorites` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bundle_id` INTEGER NOT NULL,
    `owner_user_id` INTEGER NOT NULL,
    `owner_identity_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `im_chat_record_favorites_owner_user_id_deleted_at_idx`(`owner_user_id`, `deleted_at`),
    INDEX `im_chat_record_favorites_owner_identity_id_created_at_delete_idx`(`owner_identity_id`, `created_at`, `deleted_at`),
    INDEX `im_chat_record_favorites_bundle_id_deleted_at_idx`(`bundle_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `im_message_translations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message_id` INTEGER NOT NULL,
    `source_content_hash` CHAR(64) NOT NULL,
    `source_language` VARCHAR(16) NULL,
    `target_language` VARCHAR(16) NOT NULL,
    `translated_content` TEXT NOT NULL,
    `provider_key` VARCHAR(40) NOT NULL,
    `provider_request_id` VARCHAR(191) NULL,
    `translated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `im_message_translations_message_id_target_language_deleted_a_idx`(`message_id`, `target_language`, `deleted_at`),
    INDEX `im_message_translations_translated_at_deleted_at_idx`(`translated_at`, `deleted_at`),
    UNIQUE INDEX `im_message_translations_message_id_source_content_hash_targe_key`(`message_id`, `source_content_hash`, `target_language`, `provider_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `im_message_batch_delete_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `owner_user_id` INTEGER NOT NULL,
    `owner_identity_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `result_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `im_message_batch_delete_commands_conversation_id_owner_ident_idx`(`conversation_id`, `owner_identity_id`, `deleted_at`),
    INDEX `im_message_batch_delete_commands_owner_user_id_deleted_at_idx`(`owner_user_id`, `deleted_at`),
    UNIQUE INDEX `im_message_batch_delete_commands_owner_identity_id_idempoten_key`(`owner_identity_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_created_by_identity_id_fkey` FOREIGN KEY (`created_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_bundles` ADD CONSTRAINT `im_chat_record_bundles_source_conversation_id_fkey` FOREIGN KEY (`source_conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_source_message_id_fkey` FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_items` ADD CONSTRAINT `im_chat_record_items_sender_identity_id_fkey` FOREIGN KEY (`sender_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_deliveries` ADD CONSTRAINT `im_chat_record_deliveries_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `im_chat_record_bundles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_chat_record_favorites` ADD CONSTRAINT `im_chat_record_favorites_owner_identity_id_fkey` FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_message_translations` ADD CONSTRAINT `im_message_translations_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `im_message_batch_delete_commands` ADD CONSTRAINT `im_message_batch_delete_commands_owner_identity_id_fkey` FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the formal IM permission bundle deployable on existing databases that
-- apply migrations without running the complete User Management seed afterwards.
INSERT INTO `permissions` (
  `name`,
  `code`,
  `type`,
  `module`,
  `description`,
  `is_system`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES
  ('转发聊天记录', 'message:forward', 'api', 'im', '创建并投递正式聊天记录包', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('收藏聊天记录', 'message:favorite', 'api', 'im', '创建、查看和移除自己的聊天记录收藏', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('翻译消息', 'message:translate', 'api', 'im', '翻译当前身份可见的 IM 消息', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- These assignments match buildRolePermissionAssignments for every role that
-- receives the formal realtime user permission bundle.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('message:forward', 'message:favorite', 'message:translate')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
