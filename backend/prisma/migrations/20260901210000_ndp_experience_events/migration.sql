CREATE TABLE `user_ndp_experience_accumulators` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `tier_benefit_id` INTEGER NOT NULL,
    `remainder_numerator` BIGINT NOT NULL DEFAULT 0,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_ndp_experience_accumulator_key`(`user_id`, `tier_benefit_id`),
    INDEX `user_ndp_experience_accumulators_tier_benefit_idx`(`tier_benefit_id`),
    INDEX `user_ndp_experience_accumulators_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ledger_transactions`
    MODIFY COLUMN `type` ENUM(
        'booking_accept_freeze',
        'booking_cancel_unfreeze',
        'booking_complete_settlement',
        'booking_merchant_cancel_compensation',
        'manual_topup_approved',
        'manual_withdrawal_approved',
        'seed_credit',
        'affiliate_task_budget_freeze',
        'affiliate_task_budget_release',
        'affiliate_reward_settlement',
        'affiliate_reward_reversal',
        'affiliate_reward_recovery',
        'test_balance_calibration',
        'exchange_request_publication_freeze',
        'exchange_request_publication_capture',
        'exchange_request_publication_release',
        'shop_membership_reward_settlement',
        'service_consumption_settlement',
        'product_consumption_settlement',
        'platform_membership_purchase',
        'booking_consumption_refund',
        'service_consumption_refund',
        'product_consumption_refund'
    ) NOT NULL;

ALTER TABLE `user_experience_entries`
    ADD COLUMN `ledger_transaction_id` INTEGER NULL,
    ADD COLUMN `entitlement_id` INTEGER NULL,
    ADD COLUMN `tier_benefit_id` INTEGER NULL,
    ADD COLUMN `ndp_amount` INTEGER NULL,
    ADD COLUMN `ndp_per_base_exp` INTEGER NULL,
    ADD COLUMN `extra_threshold_ndp` INTEGER NULL,
    ADD COLUMN `extra_award_units` BIGINT NULL,
    ADD COLUMN `accumulator_before_numerator` BIGINT NULL,
    ADD COLUMN `accumulator_after_numerator` BIGINT NULL,
    ADD UNIQUE INDEX `user_experience_entries_ledger_transaction_id_key`(`ledger_transaction_id`),
    ADD UNIQUE INDEX `user_experience_entries_entitlement_id_key`(`entitlement_id`);

CREATE INDEX `user_experience_entries_tier_benefit_idx`
    ON `user_experience_entries`(`tier_benefit_id`);

ALTER TABLE `user_ndp_experience_accumulators`
    ADD CONSTRAINT `user_ndp_experience_accumulators_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_ndp_experience_accumulators_tier_benefit_id_fkey`
    FOREIGN KEY (`tier_benefit_id`) REFERENCES `platform_membership_tier_benefits`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `user_experience_entries`
    ADD CONSTRAINT `user_experience_entries_ledger_transaction_id_fkey`
    FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_experience_entries_entitlement_id_fkey`
    FOREIGN KEY (`entitlement_id`) REFERENCES `platform_membership_entitlements`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `user_experience_entries_tier_benefit_id_fkey`
    FOREIGN KEY (`tier_benefit_id`) REFERENCES `platform_membership_tier_benefits`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
