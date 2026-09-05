-- CreateTable
CREATE TABLE `user_membership_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `tier_version_id` INTEGER NULL,
    `multiplier_bps` INTEGER NULL,
    `reason` VARCHAR(500) NOT NULL,
    `expected_lock_version` INTEGER NULL,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `superseded_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_membership_adjustments_public_id_key`(`public_id`),
    INDEX `user_membership_adjustments_active_idx`(`user_id`, `effective_from`, `superseded_at`, `deleted_at`),
    INDEX `user_membership_adjustments_tier_version_id_idx`(`tier_version_id`),
    INDEX `user_membership_adjustments_created_by_id_idx`(`created_by_id`),
    INDEX `user_membership_adjustments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_membership_adjustments` ADD CONSTRAINT `user_membership_adjustments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_membership_adjustments` ADD CONSTRAINT `user_membership_adjustments_tier_version_id_fkey` FOREIGN KEY (`tier_version_id`) REFERENCES `platform_membership_tier_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_membership_adjustments` ADD CONSTRAINT `user_membership_adjustments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `user_membership_adjustments`
  ADD CONSTRAINT `user_membership_adjustments_value_chk` CHECK (`tier_version_id` IS NOT NULL OR `multiplier_bps` IS NOT NULL),
  ADD CONSTRAINT `user_membership_adjustments_multiplier_chk` CHECK (`multiplier_bps` IS NULL OR `multiplier_bps` BETWEEN 1 AND 1000000),
  ADD CONSTRAINT `user_membership_adjustments_reason_chk` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 500),
  ADD CONSTRAINT `user_membership_adjustments_version_chk` CHECK (
    (`expected_lock_version` IS NULL AND `lock_version` = 1)
    OR (`expected_lock_version` IS NOT NULL AND `lock_version` = `expected_lock_version` + 1)
  );
