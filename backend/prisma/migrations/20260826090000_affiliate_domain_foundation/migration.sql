-- AlterTable
ALTER TABLE `wallets` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account') NOT NULL;

-- AlterTable
ALTER TABLE `ledger_transactions` MODIFY `type` ENUM('booking_accept_freeze', 'booking_cancel_unfreeze', 'booking_complete_settlement', 'booking_merchant_cancel_compensation', 'manual_topup_approved', 'manual_withdrawal_approved', 'seed_credit', 'affiliate_task_budget_freeze', 'affiliate_task_budget_release', 'affiliate_reward_settlement', 'affiliate_reward_reversal', 'affiliate_reward_recovery') NOT NULL;

-- AlterTable
ALTER TABLE `wallet_adjustment_requests` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account') NOT NULL;

-- AlterTable
ALTER TABLE `wallet_ledgers` MODIFY `direction` ENUM('available_credit', 'available_debit', 'freeze', 'unfreeze', 'frozen_debit', 'frozen_credit') NOT NULL;

-- AlterTable
ALTER TABLE `wallet_holds` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account') NOT NULL;

-- CreateTable
CREATE TABLE `affiliate_tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_code` VARCHAR(80) NOT NULL,
    `lineage_key` VARCHAR(80) NOT NULL,
    `parent_task_id` INTEGER NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `publisher_type` ENUM('merchant_account', 'shop') NOT NULL,
    `publisher_merchant_account_id` INTEGER NULL,
    `publisher_shop_id` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `cover_media_asset_id` INTEGER NULL,
    `reward_ndp_per_completed_order` INTEGER NOT NULL,
    `total_budget_ndp` INTEGER NOT NULL,
    `reserved_budget_ndp` INTEGER NOT NULL DEFAULT 0,
    `allocated_budget_ndp` INTEGER NOT NULL DEFAULT 0,
    `settled_budget_ndp` INTEGER NOT NULL DEFAULT 0,
    `released_budget_ndp` INTEGER NOT NULL DEFAULT 0,
    `customer_discount_type` ENUM('none', 'fixed_jpy', 'percent') NOT NULL DEFAULT 'none',
    `fixed_discount_jpy` INTEGER NOT NULL DEFAULT 0,
    `discount_rate_bps` INTEGER NOT NULL DEFAULT 0,
    `discount_cap_jpy` INTEGER NOT NULL DEFAULT 0,
    `minimum_order_amount_jpy` INTEGER NOT NULL DEFAULT 0,
    `claim_starts_at` DATETIME(3) NOT NULL,
    `claim_ends_at` DATETIME(3) NOT NULL,
    `task_starts_at` DATETIME(3) NOT NULL,
    `task_ends_at` DATETIME(3) NOT NULL,
    `attribution_window_days` INTEGER NOT NULL,
    `max_completed_orders_per_claim` INTEGER NULL,
    `max_completed_orders_per_customer` INTEGER NULL,
    `service_scope_mode` ENUM('all_current_services', 'selected_services') NOT NULL,
    `status` ENUM('draft', 'pending_review', 'scheduled', 'active', 'paused', 'budget_exhausted', 'ended', 'cancelled', 'rejected') NOT NULL DEFAULT 'draft',
    `reviewed_by_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `rejection_reason` VARCHAR(500) NULL,
    `submitted_at` DATETIME(3) NULL,
    `activated_at` DATETIME(3) NULL,
    `paused_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_tasks_task_code_key`(`task_code`),
    INDEX `affiliate_tasks_parent_task_id_idx`(`parent_task_id`),
    INDEX `affiliate_tasks_publisher_type_publisher_merchant_account_id_idx`(`publisher_type`, `publisher_merchant_account_id`, `publisher_shop_id`),
    INDEX `affiliate_tasks_cover_media_asset_id_idx`(`cover_media_asset_id`),
    INDEX `affiliate_tasks_status_task_starts_at_task_ends_at_idx`(`status`, `task_starts_at`, `task_ends_at`),
    INDEX `affiliate_tasks_reviewed_by_id_idx`(`reviewed_by_id`),
    INDEX `affiliate_tasks_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `affiliate_tasks_lineage_key_version_key`(`lineage_key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_task_shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `shop_name_snapshot` VARCHAR(160) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_task_shops_shop_id_idx`(`shop_id`),
    INDEX `affiliate_task_shops_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `affiliate_task_shops_task_id_shop_id_key`(`task_id`, `shop_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_task_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `service_name_snapshot` VARCHAR(160) NOT NULL,
    `service_price_jpy_snapshot` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_task_services_shop_id_idx`(`shop_id`),
    INDEX `affiliate_task_services_service_id_idx`(`service_id`),
    INDEX `affiliate_task_services_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `affiliate_task_services_task_id_service_id_key`(`task_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_claims` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `active_key` VARCHAR(160) NULL,
    `public_code` VARCHAR(40) NOT NULL,
    `public_token_id` VARCHAR(80) NOT NULL,
    `token_hash` VARCHAR(128) NOT NULL,
    `status` ENUM('active', 'expired', 'revoked') NOT NULL DEFAULT 'active',
    `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `click_count` INTEGER NOT NULL DEFAULT 0,
    `code_use_count` INTEGER NOT NULL DEFAULT 0,
    `attributed_order_count` INTEGER NOT NULL DEFAULT 0,
    `completed_order_count` INTEGER NOT NULL DEFAULT 0,
    `settled_reward_ndp` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_claims_active_key_key`(`active_key`),
    UNIQUE INDEX `affiliate_claims_public_code_key`(`public_code`),
    UNIQUE INDEX `affiliate_claims_public_token_id_key`(`public_token_id`),
    INDEX `affiliate_claims_task_id_status_idx`(`task_id`, `status`),
    INDEX `affiliate_claims_user_id_status_idx`(`user_id`, `status`),
    INDEX `affiliate_claims_expires_at_idx`(`expires_at`),
    INDEX `affiliate_claims_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_touches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `claim_id` INTEGER NOT NULL,
    `claimant_user_id` INTEGER NOT NULL,
    `customer_user_id` INTEGER NULL,
    `anonymous_visitor_hash` VARCHAR(128) NULL,
    `source` ENUM('url', 'code') NOT NULL,
    `shop_id` INTEGER NULL,
    `service_id` INTEGER NULL,
    `request_fingerprint_hash` VARCHAR(128) NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_touches_task_id_occurred_at_idx`(`task_id`, `occurred_at`),
    INDEX `affiliate_touches_claim_id_occurred_at_idx`(`claim_id`, `occurred_at`),
    INDEX `affiliate_touches_claimant_user_id_idx`(`claimant_user_id`),
    INDEX `affiliate_touches_customer_user_id_idx`(`customer_user_id`),
    INDEX `affiliate_touches_shop_id_idx`(`shop_id`),
    INDEX `affiliate_touches_service_id_idx`(`service_id`),
    INDEX `affiliate_touches_expires_at_idx`(`expires_at`),
    INDEX `affiliate_touches_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_attributions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `claim_id` INTEGER NOT NULL,
    `touch_id` INTEGER NULL,
    `booking_order_id` INTEGER NOT NULL,
    `active_key` VARCHAR(120) NULL,
    `claimant_user_id` INTEGER NOT NULL,
    `customer_user_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `source` ENUM('url', 'code') NOT NULL,
    `original_price_jpy` INTEGER NOT NULL,
    `customer_discount_jpy` INTEGER NOT NULL DEFAULT 0,
    `final_price_jpy` INTEGER NOT NULL,
    `reward_allocated_ndp` INTEGER NOT NULL,
    `status` ENUM('attributed', 'qualified', 'settled', 'invalidated', 'reversed') NOT NULL DEFAULT 'attributed',
    `attributed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `qualified_at` DATETIME(3) NULL,
    `settled_at` DATETIME(3) NULL,
    `invalidated_at` DATETIME(3) NULL,
    `invalidation_reason` VARCHAR(500) NULL,
    `reversed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_attributions_active_key_key`(`active_key`),
    INDEX `affiliate_attributions_task_id_status_idx`(`task_id`, `status`),
    INDEX `affiliate_attributions_claim_id_status_idx`(`claim_id`, `status`),
    INDEX `affiliate_attributions_booking_order_id_status_idx`(`booking_order_id`, `status`),
    INDEX `affiliate_attributions_touch_id_idx`(`touch_id`),
    INDEX `affiliate_attributions_claimant_user_id_idx`(`claimant_user_id`),
    INDEX `affiliate_attributions_customer_user_id_idx`(`customer_user_id`),
    INDEX `affiliate_attributions_shop_id_service_id_idx`(`shop_id`, `service_id`),
    INDEX `affiliate_attributions_expires_at_idx`(`expires_at`),
    INDEX `affiliate_attributions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_rewards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attribution_id` INTEGER NOT NULL,
    `task_id` INTEGER NOT NULL,
    `claim_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `publisher_wallet_id` INTEGER NOT NULL,
    `claimant_wallet_id` INTEGER NOT NULL,
    `reward_ndp` INTEGER NOT NULL,
    `reversal_required_ndp` INTEGER NOT NULL DEFAULT 0,
    `reversed_ndp` INTEGER NOT NULL DEFAULT 0,
    `outstanding_recovery_ndp` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('pending', 'settled', 'reversed', 'reversal_pending') NOT NULL DEFAULT 'pending',
    `settled_at` DATETIME(3) NULL,
    `reversed_at` DATETIME(3) NULL,
    `reversal_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_rewards_attribution_id_key`(`attribution_id`),
    INDEX `affiliate_rewards_task_id_status_idx`(`task_id`, `status`),
    INDEX `affiliate_rewards_claim_id_status_idx`(`claim_id`, `status`),
    INDEX `affiliate_rewards_booking_order_id_idx`(`booking_order_id`),
    INDEX `affiliate_rewards_publisher_wallet_id_idx`(`publisher_wallet_id`),
    INDEX `affiliate_rewards_claimant_wallet_id_idx`(`claimant_wallet_id`),
    INDEX `affiliate_rewards_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_reward_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reward_id` INTEGER NOT NULL,
    `ledger_transaction_id` INTEGER NOT NULL,
    `kind` ENUM('freeze', 'release', 'settlement', 'reversal', 'recovery') NOT NULL,
    `amount_ndp` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_reward_transactions_ledger_transaction_id_key`(`ledger_transaction_id`),
    INDEX `affiliate_reward_transactions_reward_id_kind_idx`(`reward_id`, `kind`),
    INDEX `affiliate_reward_transactions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_budget_reservations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `wallet_id` INTEGER NOT NULL,
    `total_frozen_ndp` INTEGER NOT NULL,
    `allocated_ndp` INTEGER NOT NULL DEFAULT 0,
    `captured_ndp` INTEGER NOT NULL DEFAULT 0,
    `released_ndp` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'exhausted', 'released') NOT NULL DEFAULT 'active',
    `idempotency_key` VARCHAR(180) NOT NULL,
    `frozen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `released_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_budget_reservations_task_id_key`(`task_id`),
    UNIQUE INDEX `affiliate_budget_reservations_idempotency_key_key`(`idempotency_key`),
    INDEX `affiliate_budget_reservations_wallet_id_status_idx`(`wallet_id`, `status`),
    INDEX `affiliate_budget_reservations_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_budget_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `budget_reservation_id` INTEGER NOT NULL,
    `ledger_transaction_id` INTEGER NOT NULL,
    `kind` ENUM('freeze', 'release', 'settlement', 'reversal', 'recovery') NOT NULL,
    `amount_ndp` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_budget_transactions_ledger_transaction_id_key`(`ledger_transaction_id`),
    INDEX `affiliate_budget_transactions_budget_reservation_id_kind_idx`(`budget_reservation_id`, `kind`),
    INDEX `affiliate_budget_transactions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_risk_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NULL,
    `claim_id` INTEGER NULL,
    `attribution_id` INTEGER NULL,
    `reward_id` INTEGER NULL,
    `rule_code` VARCHAR(100) NOT NULL,
    `subject_type` VARCHAR(60) NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    `status` ENUM('open', 'reviewing', 'released', 'rejected') NOT NULL DEFAULT 'open',
    `evidence` JSON NULL,
    `frozen_ndp` INTEGER NOT NULL DEFAULT 0,
    `reviewed_by_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `resolution_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_risk_events_task_id_idx`(`task_id`),
    INDEX `affiliate_risk_events_claim_id_idx`(`claim_id`),
    INDEX `affiliate_risk_events_attribution_id_idx`(`attribution_id`),
    INDEX `affiliate_risk_events_reward_id_idx`(`reward_id`),
    INDEX `affiliate_risk_events_rule_code_status_idx`(`rule_code`, `status`),
    INDEX `affiliate_risk_events_subject_type_subject_id_idx`(`subject_type`, `subject_id`),
    INDEX `affiliate_risk_events_severity_status_idx`(`severity`, `status`),
    INDEX `affiliate_risk_events_reviewed_by_id_idx`(`reviewed_by_id`),
    INDEX `affiliate_risk_events_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `affiliate_tasks` ADD CONSTRAINT `affiliate_tasks_parent_task_id_fkey` FOREIGN KEY (`parent_task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_tasks` ADD CONSTRAINT `affiliate_tasks_publisher_merchant_account_id_fkey` FOREIGN KEY (`publisher_merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_tasks` ADD CONSTRAINT `affiliate_tasks_publisher_shop_id_fkey` FOREIGN KEY (`publisher_shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `affiliate_tasks` ADD CONSTRAINT `affiliate_tasks_cover_media_asset_id_fkey` FOREIGN KEY (`cover_media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_tasks` ADD CONSTRAINT `affiliate_tasks_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_task_shops` ADD CONSTRAINT `affiliate_task_shops_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_task_shops` ADD CONSTRAINT `affiliate_task_shops_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_task_services` ADD CONSTRAINT `affiliate_task_services_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_task_services` ADD CONSTRAINT `affiliate_task_services_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_task_services` ADD CONSTRAINT `affiliate_task_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_claims` ADD CONSTRAINT `affiliate_claims_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_claims` ADD CONSTRAINT `affiliate_claims_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `affiliate_claims`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_claimant_user_id_fkey` FOREIGN KEY (`claimant_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_touches` ADD CONSTRAINT `affiliate_touches_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `affiliate_claims`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_touch_id_fkey` FOREIGN KEY (`touch_id`) REFERENCES `affiliate_touches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_claimant_user_id_fkey` FOREIGN KEY (`claimant_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_attributions` ADD CONSTRAINT `affiliate_attributions_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_attribution_id_fkey` FOREIGN KEY (`attribution_id`) REFERENCES `affiliate_attributions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `affiliate_claims`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_publisher_wallet_id_fkey` FOREIGN KEY (`publisher_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_rewards` ADD CONSTRAINT `affiliate_rewards_claimant_wallet_id_fkey` FOREIGN KEY (`claimant_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_reward_transactions` ADD CONSTRAINT `affiliate_reward_transactions_reward_id_fkey` FOREIGN KEY (`reward_id`) REFERENCES `affiliate_rewards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_reward_transactions` ADD CONSTRAINT `affiliate_reward_transactions_ledger_transaction_id_fkey` FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_budget_reservations` ADD CONSTRAINT `affiliate_budget_reservations_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_budget_reservations` ADD CONSTRAINT `affiliate_budget_reservations_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_budget_transactions` ADD CONSTRAINT `affiliate_budget_transactions_budget_reservation_id_fkey` FOREIGN KEY (`budget_reservation_id`) REFERENCES `affiliate_budget_reservations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_budget_transactions` ADD CONSTRAINT `affiliate_budget_transactions_ledger_transaction_id_fkey` FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_risk_events` ADD CONSTRAINT `affiliate_risk_events_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_risk_events` ADD CONSTRAINT `affiliate_risk_events_claim_id_fkey` FOREIGN KEY (`claim_id`) REFERENCES `affiliate_claims`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_risk_events` ADD CONSTRAINT `affiliate_risk_events_attribution_id_fkey` FOREIGN KEY (`attribution_id`) REFERENCES `affiliate_attributions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_risk_events` ADD CONSTRAINT `affiliate_risk_events_reward_id_fkey` FOREIGN KEY (`reward_id`) REFERENCES `affiliate_rewards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_risk_events` ADD CONSTRAINT `affiliate_risk_events_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `affiliate_tasks`
  ADD CONSTRAINT `affiliate_tasks_publisher_check`
  CHECK (
    (`publisher_type` = 'merchant_account' AND `publisher_merchant_account_id` IS NOT NULL AND `publisher_shop_id` IS NULL)
    OR
    (`publisher_type` = 'shop' AND `publisher_shop_id` IS NOT NULL AND `publisher_merchant_account_id` IS NULL)
  ),
  ADD CONSTRAINT `affiliate_tasks_budget_check`
  CHECK (
    `reward_ndp_per_completed_order` > 0
    AND `total_budget_ndp` > 0
    AND `total_budget_ndp` >= `reward_ndp_per_completed_order`
    AND `reserved_budget_ndp` >= 0
    AND `allocated_budget_ndp` >= 0
    AND `settled_budget_ndp` >= 0
    AND `released_budget_ndp` >= 0
    AND `allocated_budget_ndp` + `settled_budget_ndp` + `released_budget_ndp` <= `reserved_budget_ndp`
    AND `reserved_budget_ndp` <= `total_budget_ndp`
  ),
  ADD CONSTRAINT `affiliate_tasks_time_check`
  CHECK (`claim_starts_at` < `claim_ends_at` AND `task_starts_at` < `task_ends_at`),
  ADD CONSTRAINT `affiliate_tasks_discount_check`
  CHECK (
    `fixed_discount_jpy` >= 0
    AND `discount_rate_bps` BETWEEN 0 AND 10000
    AND `discount_cap_jpy` >= 0
    AND `minimum_order_amount_jpy` >= 0
  );

ALTER TABLE `affiliate_budget_reservations`
  ADD CONSTRAINT `affiliate_budget_reservation_amount_check`
  CHECK (
    `total_frozen_ndp` > 0
    AND `allocated_ndp` >= 0
    AND `captured_ndp` >= 0
    AND `released_ndp` >= 0
    AND `allocated_ndp` + `captured_ndp` + `released_ndp` <= `total_frozen_ndp`
  );

ALTER TABLE `affiliate_rewards`
  ADD CONSTRAINT `affiliate_rewards_amount_check`
  CHECK (
    `reward_ndp` > 0
    AND `reversal_required_ndp` >= 0
    AND `reversed_ndp` >= 0
    AND `outstanding_recovery_ndp` >= 0
    AND `reversed_ndp` + `outstanding_recovery_ndp` <= `reversal_required_ndp`
  );
