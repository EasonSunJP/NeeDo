-- AlterTable
ALTER TABLE `order_financials`
    ADD COLUMN `platform_fee_accepted_at` DATETIME(3) NULL,
    ADD COLUMN `platform_fee_amount_ndp_snapshot` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `platform_fee_debt_status` ENUM('none', 'outstanding', 'settled') NOT NULL DEFAULT 'none',
    ADD COLUMN `platform_fee_enabled_snapshot` BOOLEAN NULL,
    ADD COLUMN `platform_fee_global_version` INTEGER NULL,
    ADD COLUMN `platform_fee_outstanding_ndp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `platform_fee_overdraft_confirmation_key` VARCHAR(160) NULL,
    ADD COLUMN `platform_fee_policy_version` INTEGER NULL,
    ADD COLUMN `platform_fee_preview_version` VARCHAR(71) NULL,
    ADD COLUMN `platform_fee_shortfall_ndp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `platform_fee_wallet_id` INTEGER NULL,
    ADD COLUMN `platform_fee_wallet_owner_id` INTEGER NULL,
    ADD COLUMN `platform_fee_wallet_owner_type` ENUM('user', 'shop', 'platform', 'merchant_account') NULL,
    ADD COLUMN `user_reward_deadline_at` DATETIME(3) NULL,
    ADD COLUMN `user_reward_eligible_ndp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `user_reward_granted_at` DATETIME(3) NULL,
    ADD COLUMN `user_reward_status` ENUM('disabled', 'immediate', 'pending', 'paid', 'expired') NOT NULL DEFAULT 'disabled';

-- CreateIndex
CREATE UNIQUE INDEX `order_financials_overdraft_confirmation_key`
    ON `order_financials`(`platform_fee_overdraft_confirmation_key`);

-- CreateIndex
CREATE INDEX `order_financials_wallet_debt_accepted_idx`
    ON `order_financials`(`platform_fee_wallet_id`, `platform_fee_debt_status`, `platform_fee_accepted_at`, `id`);

-- CreateIndex
CREATE INDEX `order_financials_reward_deadline_idx`
    ON `order_financials`(`user_reward_status`, `user_reward_deadline_at`, `id`);
