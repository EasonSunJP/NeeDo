CREATE TABLE `platform_setting_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `active_key` VARCHAR(20) NULL,
  `site_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `self_registration_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `google_login_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `password_login_otp_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `password_login_otp_rule` ENUM('first_login', 'monthly_first', 'every_login') NOT NULL DEFAULT 'first_login',
  `password_login_otp_on_new_ip` BOOLEAN NOT NULL DEFAULT FALSE,
  `login_logo_media_asset_id` INTEGER NULL,
  `request_button_media_asset_id` INTEGER NULL,
  `offline_payment_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `ndp_payment_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_by_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `platform_setting_versions_version_chk` CHECK (`version` > 0),
  CONSTRAINT `platform_setting_versions_active_key_chk` CHECK (`active_key` IS NULL OR `active_key` = 'active'),
  UNIQUE INDEX `platform_setting_versions_public_id_key`(`public_id`),
  UNIQUE INDEX `platform_setting_versions_version_key`(`version`),
  UNIQUE INDEX `platform_setting_versions_active_key`(`active_key`),
  INDEX `platform_setting_versions_login_logo_idx`(`login_logo_media_asset_id`),
  INDEX `platform_setting_versions_request_button_idx`(`request_button_media_asset_id`),
  INDEX `platform_setting_versions_created_by_idx`(`created_by_user_id`),
  INDEX `platform_setting_versions_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `legal_documents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `internal_path` VARCHAR(500) NOT NULL,
  `display_locations` JSON NOT NULL,
  `is_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `created_by_user_id` INTEGER NULL,
  `updated_by_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `legal_documents_lock_version_chk` CHECK (`lock_version` > 0),
  UNIQUE INDEX `legal_documents_public_id_key`(`public_id`),
  UNIQUE INDEX `legal_documents_slug_key`(`slug`),
  INDEX `legal_documents_list_idx`(`is_enabled`, `name`, `deleted_at`),
  INDEX `legal_documents_created_by_idx`(`created_by_user_id`),
  INDEX `legal_documents_updated_by_idx`(`updated_by_user_id`),
  INDEX `legal_documents_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `legal_document_drafts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `title` VARCHAR(240) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `updated_by_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `legal_document_drafts_lock_version_chk` CHECK (`lock_version` > 0),
  UNIQUE INDEX `legal_document_drafts_document_locale_key`(`document_id`, `locale`),
  INDEX `legal_document_drafts_lookup_idx`(`document_id`, `locale`, `deleted_at`),
  INDEX `legal_document_drafts_updated_by_idx`(`updated_by_user_id`),
  INDEX `legal_document_drafts_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `legal_document_releases` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `document_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `version` INTEGER NOT NULL,
  `active_key` VARCHAR(20) NULL,
  `title` VARCHAR(240) NOT NULL,
  `body` LONGTEXT NOT NULL,
  `content_hash` CHAR(64) NOT NULL,
  `published_at` DATETIME(3) NOT NULL,
  `published_by_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `legal_document_releases_version_chk` CHECK (`version` > 0),
  CONSTRAINT `legal_document_releases_active_key_chk` CHECK (`active_key` IS NULL OR `active_key` = 'active'),
  UNIQUE INDEX `legal_document_releases_public_id_key`(`public_id`),
  UNIQUE INDEX `legal_document_releases_version_key`(`document_id`, `locale`, `version`),
  UNIQUE INDEX `legal_document_releases_active_key`(`document_id`, `locale`, `active_key`),
  INDEX `legal_document_releases_history_idx`(`document_id`, `locale`, `published_at`, `deleted_at`),
  INDEX `legal_document_releases_published_by_idx`(`published_by_user_id`),
  INDEX `legal_document_releases_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `platform_setting_versions`
  ADD CONSTRAINT `platform_setting_versions_login_logo_fkey`
    FOREIGN KEY (`login_logo_media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `platform_setting_versions_request_button_fkey`
    FOREIGN KEY (`request_button_media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `platform_setting_versions_created_by_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `legal_documents`
  ADD CONSTRAINT `legal_documents_created_by_fkey`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `legal_documents_updated_by_fkey`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `legal_document_drafts`
  ADD CONSTRAINT `legal_document_drafts_document_fkey`
    FOREIGN KEY (`document_id`) REFERENCES `legal_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `legal_document_drafts_updated_by_fkey`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `legal_document_releases`
  ADD CONSTRAINT `legal_document_releases_document_fkey`
    FOREIGN KEY (`document_id`) REFERENCES `legal_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `legal_document_releases_published_by_fkey`
    FOREIGN KEY (`published_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `platform_setting_versions` (
  `public_id`, `version`, `active_key`, `site_enabled`, `self_registration_enabled`,
  `google_login_enabled`, `password_login_otp_enabled`, `password_login_otp_rule`,
  `password_login_otp_on_new_ip`, `login_logo_media_asset_id`,
  `request_button_media_asset_id`, `offline_payment_enabled`, `ndp_payment_enabled`,
  `created_by_user_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT UUID(), 1, 'active', TRUE, TRUE, TRUE, FALSE, 'first_login', FALSE,
  NULL, NULL, TRUE, TRUE, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `platform_setting_versions`
  WHERE `version` = 1 OR `active_key` = 'active'
);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('系统设置读取', 'backoffice:system-settings:read', 'api', 'backoffice', '读取当前平台基础设置与能力状态', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('系统设置管理', 'backoffice:system-settings:write', 'api', 'backoffice', '创建经过版本与审计保护的平台基础设置', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('系统品牌媒体启用', 'backoffice:system-brand-media:activate', 'api', 'backoffice', '将经过验证的公开媒体设为登录 LOGO 或 Request 按钮图片', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('IM 保留策略读取', 'backoffice:im-retention:read', 'api', 'backoffice', '读取服务器端 IM 消息与媒体保留策略', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('IM 保留策略管理', 'backoffice:im-retention:write', 'api', 'backoffice', '发布仅对新内容生效的服务器端 IM 保留策略', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('政策协议读取', 'backoffice:legal-documents:read', 'api', 'backoffice', '分页读取政策协议目录、语言草稿与发布历史', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('政策协议编辑', 'backoffice:legal-documents:write', 'api', 'backoffice', '创建政策协议目录并分别保存各语言草稿', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('政策协议发布', 'backoffice:legal-documents:publish', 'api', 'backoffice', '将指定语言草稿发布为不可变版本', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('支付设置读取', 'backoffice:payment-settings:read', 'api', 'backoffice', '读取平台支持与未配置的支付能力状态', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  ('支付设置管理', 'backoffice:payment-settings:write', 'api', 'backoffice', '启用或停用已正式支持的线下与 NDP 支付', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT `roles`.`id`, `permissions`.`id`, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:system-settings:read',
    'backoffice:system-settings:write',
    'backoffice:system-brand-media:activate',
    'backoffice:im-retention:read',
    'backoffice:im-retention:write',
    'backoffice:legal-documents:read',
    'backoffice:legal-documents:write',
    'backoffice:legal-documents:publish',
    'backoffice:payment-settings:read',
    'backoffice:payment-settings:write'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT `roles`.`id`, `permissions`.`id`, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:system-settings:read',
    'backoffice:im-retention:read',
    'backoffice:legal-documents:read',
    'backoffice:payment-settings:read'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
