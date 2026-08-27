-- CreateTable
CREATE TABLE `im_policies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `active_key` VARCHAR(20) NULL,
    `text_retention_seconds` INTEGER NULL,
    `image_retention_seconds` INTEGER NOT NULL DEFAULT 259200,
    `video_retention_seconds` INTEGER NOT NULL DEFAULT 259200,
    `recall_window_seconds` INTEGER NOT NULL DEFAULT 180,
    `traceless_recall_membership_levels` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `updated_by_user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `im_policies_active_key_key`(`active_key`),
    INDEX `im_policies_updated_by_user_id_idx`(`updated_by_user_id`),
    INDEX `im_policies_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `messages`
    ADD COLUMN `expires_at` DATETIME(3) NULL,
    ADD COLUMN `expired_at` DATETIME(3) NULL,
    ADD COLUMN `recall_deadline_at` DATETIME(3) NULL,
    ADD COLUMN `recalled_at` DATETIME(3) NULL,
    ADD COLUMN `recall_mode` ENUM('STANDARD', 'TRACELESS') NULL,
    ADD COLUMN `content_purged_at` DATETIME(3) NULL,
    ADD COLUMN `lifecycle_version` INTEGER NOT NULL DEFAULT 0;

-- Backfill existing messages before enforcing the lifecycle deadline.
UPDATE `messages`
SET `recall_deadline_at` = DATE_ADD(`created_at`, INTERVAL 180 SECOND)
WHERE `recall_deadline_at` IS NULL;

ALTER TABLE `messages`
    MODIFY `recall_deadline_at` DATETIME(3) NOT NULL;

CREATE INDEX `messages_expires_at_expired_at_deleted_at_idx`
    ON `messages`(`expires_at`, `expired_at`, `deleted_at`);
CREATE INDEX `messages_sender_user_id_recall_deadline_at_idx`
    ON `messages`(`sender_user_id`, `recall_deadline_at`);

-- AddForeignKey
ALTER TABLE `im_policies`
    ADD CONSTRAINT `im_policies_updated_by_user_id_fkey`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `im_policies` (
    `active_key`,
    `text_retention_seconds`,
    `image_retention_seconds`,
    `video_retention_seconds`,
    `recall_window_seconds`,
    `traceless_recall_membership_levels`,
    `version`,
    `created_at`,
    `updated_at`
) VALUES (
    'active',
    NULL,
    259200,
    259200,
    180,
    JSON_ARRAY('silver', 'gold'),
    1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
);
