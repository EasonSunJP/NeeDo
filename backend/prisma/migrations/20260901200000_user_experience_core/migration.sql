CREATE TABLE `user_experience_entries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `account_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `event_type` ENUM(
        'member_sign_in',
        'service_completed',
        'social_post_liked',
        'ndp_consumed',
        'membership_renewed',
        'adjustment',
        'reversal'
    ) NOT NULL,
    `source_type` VARCHAR(80) NOT NULL,
    `source_public_id` VARCHAR(96) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `base_units` BIGINT NOT NULL,
    `campaign_factor_bps` INTEGER NOT NULL DEFAULT 10000,
    `membership_multiplier_bps` INTEGER NOT NULL DEFAULT 10000,
    `extra_units` BIGINT NOT NULL DEFAULT 0,
    `final_units` BIGINT NOT NULL,
    `membership_tier_code` ENUM('free', 'silver', 'gold', 'black_diamond') NULL,
    `membership_tier_version_id` CHAR(36) NULL,
    `policy_version_id` CHAR(36) NULL,
    `campaign_version_id` CHAR(36) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `reversal_of_entry_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `user_experience_entries_factor_range_chk`
      CHECK (`campaign_factor_bps` > 0 AND `membership_multiplier_bps` > 0),
    UNIQUE INDEX `user_experience_entries_public_id_key`(`public_id`),
    UNIQUE INDEX `user_experience_entries_idempotency_key_key`(`idempotency_key`),
    INDEX `user_experience_entries_user_occurred_idx`(`user_id`, `occurred_at`, `id`),
    INDEX `user_experience_entries_source_idx`(`source_type`, `source_public_id`),
    INDEX `user_experience_entries_account_occurred_idx`(`account_id`, `occurred_at`, `id`),
    INDEX `user_experience_entries_reversal_idx`(`reversal_of_entry_id`),
    INDEX `user_experience_entries_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `user_experience_accounts` (
    `public_id`,
    `user_id`,
    `current_level`,
    `total_exp_units`,
    `lock_version`,
    `created_at`,
    `updated_at`,
    `deleted_at`
)
SELECT
    UUID(),
    `customer_profiles`.`user_id`,
    1,
    0,
    1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
FROM `customer_profiles`
INNER JOIN `users`
    ON `users`.`id` = `customer_profiles`.`user_id`
    AND `users`.`deleted_at` IS NULL
WHERE `customer_profiles`.`deleted_at` IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM `user_experience_accounts`
      WHERE `user_experience_accounts`.`user_id` = `customer_profiles`.`user_id`
  );

ALTER TABLE `user_experience_entries`
    ADD CONSTRAINT `user_experience_entries_account_id_fkey`
    FOREIGN KEY (`account_id`) REFERENCES `user_experience_accounts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_experience_entries_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_experience_entries_reversal_of_entry_id_fkey`
    FOREIGN KEY (`reversal_of_entry_id`) REFERENCES `user_experience_entries`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
