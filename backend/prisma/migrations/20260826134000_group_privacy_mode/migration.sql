-- AlterTable
ALTER TABLE `conversations`
    ADD COLUMN `privacy_mode_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `disappearing_ttl_seconds` INTEGER NULL,
    ADD COLUMN `privacy_policy_version` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `privacy_updated_at` DATETIME(3) NULL,
    ADD COLUMN `privacy_updated_by_user_id` INTEGER NULL;

-- Existing direct and group conversations intentionally remain outside privacy mode.
UPDATE `conversations`
SET `privacy_mode_enabled` = false,
    `disappearing_ttl_seconds` = NULL,
    `privacy_policy_version` = 0,
    `privacy_updated_at` = NULL,
    `privacy_updated_by_user_id` = NULL;

CREATE INDEX `conversations_privacy_updated_by_user_id_idx`
    ON `conversations`(`privacy_updated_by_user_id`);
CREATE INDEX `conversations_privacy_mode_enabled_deleted_at_idx`
    ON `conversations`(`privacy_mode_enabled`, `deleted_at`);

-- AddForeignKey
ALTER TABLE `conversations`
    ADD CONSTRAINT `conversations_privacy_updated_by_user_id_fkey`
    FOREIGN KEY (`privacy_updated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `messages`
    ADD COLUMN `privacy_policy_version_at_send` INTEGER NULL;

CREATE INDEX `messages_privacy_expiry_source_idx`
    ON `messages`(`privacy_policy_version_at_send`, `expires_at`, `expired_at`, `deleted_at`);
