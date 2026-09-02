CREATE TABLE `official_notices` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `level` ENUM('general', 'important', 'urgent') NOT NULL DEFAULT 'important',
  `status` ENUM('draft', 'pending_review', 'approved', 'scheduled', 'sending', 'sent', 'cancelled', 'archived') NOT NULL DEFAULT 'draft',
  `source_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `audience_type` ENUM('all', 'identity_types', 'exact_users') NOT NULL,
  `audience_criteria` JSON NOT NULL,
  `target_summary` VARCHAR(255) NOT NULL,
  `scheduled_at` DATETIME(3) NULL,
  `submitted_at` DATETIME(3) NULL,
  `approved_at` DATETIME(3) NULL,
  `sent_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_by_id` INTEGER NOT NULL,
  `updated_by_id` INTEGER NULL,
  `submitted_by_id` INTEGER NULL,
  `approved_by_id` INTEGER NULL,
  `cancelled_by_id` INTEGER NULL,
  `archived_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `official_notices_public_id_key` (`public_id`),
  UNIQUE INDEX `official_notices_idempotency_key_key` (`idempotency_key`),
  INDEX `official_notices_status_scheduled_at_deleted_at_idx` (`status`, `scheduled_at`, `deleted_at`),
  INDEX `official_notices_created_by_id_idx` (`created_by_id`),
  INDEX `official_notices_updated_by_id_idx` (`updated_by_id`),
  INDEX `official_notices_submitted_by_id_idx` (`submitted_by_id`),
  INDEX `official_notices_approved_by_id_idx` (`approved_by_id`),
  INDEX `official_notices_cancelled_by_id_idx` (`cancelled_by_id`),
  INDEX `official_notices_archived_by_id_idx` (`archived_by_id`),
  INDEX `official_notices_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `official_notices_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `official_notices_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `official_notices_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `official_notices_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `official_notices_cancelled_by_id_fkey` FOREIGN KEY (`cancelled_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `official_notices_archived_by_id_fkey` FOREIGN KEY (`archived_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `official_notice_translations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `notice_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `summary` VARCHAR(500) NOT NULL,
  `blocks` JSON NOT NULL,
  `source_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `is_initial_copy` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `official_notice_translations_notice_id_locale_key` (`notice_id`, `locale`),
  INDEX `official_notice_translations_locale_deleted_at_idx` (`locale`, `deleted_at`),
  INDEX `official_notice_translations_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `official_notice_translations_notice_id_fkey` FOREIGN KEY (`notice_id`) REFERENCES `official_notices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notice_audiences` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `notice_id` INTEGER NOT NULL,
  `recipient_user_id` INTEGER NOT NULL,
  `recipient_identity_id` INTEGER NOT NULL,
  `snapshot_needo_id` VARCHAR(32) NULL,
  `snapshot_identity_type` VARCHAR(50) NOT NULL,
  `snapshot_display_name` VARCHAR(100) NULL,
  `snapshot_scope_type` VARCHAR(50) NULL,
  `snapshot_scope_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `notice_audiences_notice_id_recipient_identity_id_key` (`notice_id`, `recipient_identity_id`),
  INDEX `notice_audiences_recipient_user_id_idx` (`recipient_user_id`),
  INDEX `notice_audiences_recipient_identity_id_idx` (`recipient_identity_id`),
  INDEX `notice_audiences_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `notice_audiences_notice_id_fkey` FOREIGN KEY (`notice_id`) REFERENCES `official_notices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_audiences_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_audiences_recipient_identity_id_fkey` FOREIGN KEY (`recipient_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notice_deliveries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `notice_id` INTEGER NOT NULL,
  `audience_id` INTEGER NOT NULL,
  `recipient_user_id` INTEGER NOT NULL,
  `recipient_identity_id` INTEGER NOT NULL,
  `notification_id` INTEGER NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `status` ENUM('pending', 'delivered', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  `attempt_count` INTEGER NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME(3) NULL,
  `last_attempt_at` DATETIME(3) NULL,
  `delivered_at` DATETIME(3) NULL,
  `failed_at` DATETIME(3) NULL,
  `read_at` DATETIME(3) NULL,
  `last_error` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `notice_deliveries_audience_id_key` (`audience_id`),
  UNIQUE INDEX `notice_deliveries_notification_id_key` (`notification_id`),
  UNIQUE INDEX `notice_deliveries_idempotency_key_key` (`idempotency_key`),
  INDEX `notice_deliveries_dispatch_idx` (`notice_id`, `status`, `next_attempt_at`, `deleted_at`),
  INDEX `notice_deliveries_recipient_user_id_idx` (`recipient_user_id`),
  INDEX `notice_deliveries_inbox_idx` (`recipient_identity_id`, `status`, `read_at`, `deleted_at`),
  INDEX `notice_deliveries_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `notice_deliveries_notice_id_fkey` FOREIGN KEY (`notice_id`) REFERENCES `official_notices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_deliveries_audience_id_fkey` FOREIGN KEY (`audience_id`) REFERENCES `notice_audiences` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_deliveries_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_deliveries_recipient_identity_id_fkey` FOREIGN KEY (`recipient_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `notice_deliveries_notification_id_fkey` FOREIGN KEY (`notification_id`) REFERENCES `notifications` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  ('官方通知读取', 'page:backoffice-official-notice', 'page', 'official-notice', '分页查看平台官方通知及投递回执', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('官方通知创建', 'button:backoffice-official-notice-create', 'button', 'official-notice', '创建官方通知草稿并选择正式受众', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('官方通知审核', 'button:backoffice-official-notice-review', 'button', 'official-notice', '审核、取消与归档平台官方通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('官方通知发送', 'button:backoffice-official-notice-send', 'button', 'official-notice', '立即或定时发送并重试失败的官方通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `type` = VALUES(`type`), `module` = VALUES(`module`),
  `description` = VALUES(`description`), `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` IN (
  'page:backoffice-official-notice',
  'button:backoffice-official-notice-create',
  'button:backoffice-official-notice-review',
  'button:backoffice-official-notice-send'
) AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
