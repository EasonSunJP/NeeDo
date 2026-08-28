-- Add the public Service identifier as a nullable column so every historical
-- live or soft-deleted row can be assigned a distinct UUID before enforcement.
ALTER TABLE `services` ADD COLUMN `public_id` CHAR(36) NULL;

UPDATE `services`
SET `public_id` = UUID()
WHERE `public_id` IS NULL;

-- Abort before the NOT NULL/unique contract if the backfill left any invalid
-- row instead of allowing a partially migrated public identifier surface.
SET @invalid_service_public_ids := (
  SELECT COUNT(*)
  FROM `services`
  WHERE `public_id` IS NULL
) + (
  SELECT COUNT(*)
  FROM (
    SELECT `public_id`
    FROM `services`
    WHERE `public_id` IS NOT NULL
    GROUP BY `public_id`
    HAVING COUNT(*) > 1
  ) AS duplicate_service_public_ids
);
SET @service_public_id_guard_sql := IF(
  @invalid_service_public_ids = 0,
  'SELECT 1',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Service public ID backfill produced null or duplicate values'''
);
PREPARE service_public_id_guard FROM @service_public_id_guard_sql;
EXECUTE service_public_id_guard;
DEALLOCATE PREPARE service_public_id_guard;

ALTER TABLE `services` MODIFY `public_id` CHAR(36) NOT NULL;
CREATE UNIQUE INDEX `services_public_id_key` ON `services`(`public_id`);

-- CreateTable
CREATE TABLE `official_announcements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `announcement_type` VARCHAR(40) NOT NULL DEFAULT 'affiliate_notice',
    `visibility_scope` VARCHAR(40) NOT NULL DEFAULT 'all_affiliates',
    `affiliate_task_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `official_announcements_public_id_key`(`public_id`),
    INDEX `official_announcements_affiliate_task_id_idx`(`affiliate_task_id`),
    INDEX `official_announcements_created_by_id_idx`(`created_by_id`),
    INDEX `official_announcements_visibility_scope_deleted_at_idx`(`visibility_scope`, `deleted_at`),
    INDEX `official_announcements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `official_announcement_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `announcement_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('draft', 'scheduled', 'published', 'disabled', 'archived') NOT NULL DEFAULT 'draft',
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `draft_slot_key` VARCHAR(80) NULL,
    `published_slot_key` VARCHAR(80) NULL,
    `scheduled_slot_key` VARCHAR(80) NULL,
    `publish_at` DATETIME(3) NULL,
    `visible_from` DATETIME(3) NULL,
    `visible_until` DATETIME(3) NULL,
    `activated_at` DATETIME(3) NULL,
    `disabled_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `activation_attempts` INTEGER NOT NULL DEFAULT 0,
    `last_activation_attempt_at` DATETIME(3) NULL,
    `last_activation_error` VARCHAR(160) NULL,
    `source_release_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `updated_by_id` INTEGER NULL,
    `published_by_id` INTEGER NULL,
    `disabled_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `official_announcement_releases_draft_slot_key_key`(`draft_slot_key`),
    UNIQUE INDEX `official_announcement_releases_published_slot_key_key`(`published_slot_key`),
    UNIQUE INDEX `official_announcement_releases_scheduled_slot_key_key`(`scheduled_slot_key`),
    INDEX `official_announcement_releases_status_publish_at_deleted_at_idx`(`status`, `publish_at`, `deleted_at`),
    INDEX `official_announcement_releases_source_release_id_idx`(`source_release_id`),
    INDEX `official_announcement_releases_created_by_id_idx`(`created_by_id`),
    INDEX `official_announcement_releases_updated_by_id_idx`(`updated_by_id`),
    INDEX `official_announcement_releases_published_by_id_idx`(`published_by_id`),
    INDEX `official_announcement_releases_disabled_by_id_idx`(`disabled_by_id`),
    INDEX `official_announcement_releases_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `official_announcement_releases_announcement_id_version_key`(`announcement_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `official_announcement_translations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `release_id` INTEGER NOT NULL,
    `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `summary` VARCHAR(500) NULL,
    `body` TEXT NOT NULL,
    `source_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `is_initial_copy` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `official_announcement_translations_locale_deleted_at_idx`(`locale`, `deleted_at`),
    UNIQUE INDEX `official_announcement_translations_release_id_locale_key`(`release_id`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carousel_releases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scene` ENUM('user_home', 'affiliate_home_notice') NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('draft', 'scheduled', 'published', 'disabled', 'archived') NOT NULL DEFAULT 'draft',
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `draft_slot_key` VARCHAR(80) NULL,
    `published_slot_key` VARCHAR(80) NULL,
    `scheduled_slot_key` VARCHAR(80) NULL,
    `publish_at` DATETIME(3) NULL,
    `activated_at` DATETIME(3) NULL,
    `disabled_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `activation_attempts` INTEGER NOT NULL DEFAULT 0,
    `last_activation_attempt_at` DATETIME(3) NULL,
    `last_activation_error` VARCHAR(160) NULL,
    `source_release_id` INTEGER NULL,
    `created_by_id` INTEGER NOT NULL,
    `updated_by_id` INTEGER NULL,
    `published_by_id` INTEGER NULL,
    `disabled_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `carousel_releases_draft_slot_key_key`(`draft_slot_key`),
    UNIQUE INDEX `carousel_releases_published_slot_key_key`(`published_slot_key`),
    UNIQUE INDEX `carousel_releases_scheduled_slot_key_key`(`scheduled_slot_key`),
    INDEX `carousel_releases_status_publish_at_deleted_at_idx`(`status`, `publish_at`, `deleted_at`),
    INDEX `carousel_releases_source_release_id_idx`(`source_release_id`),
    INDEX `carousel_releases_created_by_id_idx`(`created_by_id`),
    INDEX `carousel_releases_updated_by_id_idx`(`updated_by_id`),
    INDEX `carousel_releases_published_by_id_idx`(`published_by_id`),
    INDEX `carousel_releases_disabled_by_id_idx`(`disabled_by_id`),
    INDEX `carousel_releases_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `carousel_releases_scene_version_key`(`scene`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carousel_slides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `release_id` INTEGER NOT NULL,
    `media_asset_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `visible_from` DATETIME(3) NULL,
    `visible_until` DATETIME(3) NULL,
    `target_type` ENUM('shop', 'technician', 'service', 'affiliate_announcement') NOT NULL,
    `shop_id` INTEGER NULL,
    `technician_profile_id` INTEGER NULL,
    `service_id` INTEGER NULL,
    `announcement_id` INTEGER NULL,
    `affiliate_task_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `carousel_slides_public_id_key`(`public_id`),
    INDEX `carousel_slides_media_asset_id_idx`(`media_asset_id`),
    INDEX `carousel_slides_shop_id_idx`(`shop_id`),
    INDEX `carousel_slides_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `carousel_slides_service_id_idx`(`service_id`),
    INDEX `carousel_slides_announcement_id_idx`(`announcement_id`),
    INDEX `carousel_slides_affiliate_task_id_idx`(`affiliate_task_id`),
    INDEX `carousel_slides_release_id_is_enabled_deleted_at_idx`(`release_id`, `is_enabled`, `deleted_at`),
    INDEX `carousel_slides_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `carousel_slides_release_id_sort_order_key`(`release_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carousel_slide_translations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slide_id` INTEGER NOT NULL,
    `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `badge` VARCHAR(40) NULL,
    `title` VARCHAR(160) NOT NULL,
    `caption` VARCHAR(500) NULL,
    `cta_label` VARCHAR(60) NULL,
    `image_alt_text` VARCHAR(255) NOT NULL,
    `source_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `is_initial_copy` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `carousel_slide_translations_locale_deleted_at_idx`(`locale`, `deleted_at`),
    UNIQUE INDEX `carousel_slide_translations_slide_id_locale_key`(`slide_id`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_publication_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `aggregate_type` ENUM('official_announcement', 'carousel') NOT NULL,
    `aggregate_key` VARCHAR(80) NOT NULL,
    `release_id` INTEGER NULL,
    `action` VARCHAR(40) NOT NULL,
    `actor_user_id` INTEGER NULL,
    `result` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `content_publication_commands_idempotency_key_key`(`idempotency_key`),
    INDEX `content_publication_commands_aggregate_type_aggregate_key_ac_idx`(`aggregate_type`, `aggregate_key`, `action`),
    INDEX `content_publication_commands_actor_user_id_idx`(`actor_user_id`),
    INDEX `content_publication_commands_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `official_announcements` ADD CONSTRAINT `official_announcements_affiliate_task_id_fkey` FOREIGN KEY (`affiliate_task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcements` ADD CONSTRAINT `official_announcements_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `official_announcements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_source_release_id_fkey` FOREIGN KEY (`source_release_id`) REFERENCES `official_announcement_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_published_by_id_fkey` FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_releases` ADD CONSTRAINT `official_announcement_releases_disabled_by_id_fkey` FOREIGN KEY (`disabled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `official_announcement_translations` ADD CONSTRAINT `official_announcement_translations_release_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `official_announcement_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_releases` ADD CONSTRAINT `carousel_releases_source_release_id_fkey` FOREIGN KEY (`source_release_id`) REFERENCES `carousel_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_releases` ADD CONSTRAINT `carousel_releases_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_releases` ADD CONSTRAINT `carousel_releases_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_releases` ADD CONSTRAINT `carousel_releases_published_by_id_fkey` FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_releases` ADD CONSTRAINT `carousel_releases_disabled_by_id_fkey` FOREIGN KEY (`disabled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_release_id_fkey` FOREIGN KEY (`release_id`) REFERENCES `carousel_releases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_media_asset_id_fkey` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_announcement_id_fkey` FOREIGN KEY (`announcement_id`) REFERENCES `official_announcements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slides` ADD CONSTRAINT `carousel_slides_affiliate_task_id_fkey` FOREIGN KEY (`affiliate_task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carousel_slide_translations` ADD CONSTRAINT `carousel_slide_translations_slide_id_fkey` FOREIGN KEY (`slide_id`) REFERENCES `carousel_slides`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_publication_commands` ADD CONSTRAINT `content_publication_commands_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
