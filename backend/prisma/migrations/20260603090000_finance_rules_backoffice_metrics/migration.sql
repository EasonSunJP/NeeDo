-- CreateTable
CREATE TABLE `platform_fee_rule_sets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `description` VARCHAR(500) NULL,
    `scope_type` VARCHAR(40) NOT NULL DEFAULT 'platform',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `effective_from` DATETIME(3) NULL,
    `effective_to` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `platform_fee_rule_sets_status_idx`(`status`),
    INDEX `platform_fee_rule_sets_priority_idx`(`priority`),
    INDEX `platform_fee_rule_sets_effective_from_effective_to_idx`(`effective_from`, `effective_to`),
    INDEX `platform_fee_rule_sets_created_by_id_idx`(`created_by_id`),
    INDEX `platform_fee_rule_sets_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_fee_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_set_id` INTEGER NOT NULL,
    `fee_type` VARCHAR(60) NOT NULL,
    `order_type` VARCHAR(40) NOT NULL DEFAULT 'all',
    `payer_type` VARCHAR(40) NOT NULL DEFAULT 'shop',
    `base_amount_ndp` INTEGER NOT NULL DEFAULT 0,
    `calculation_mode` VARCHAR(40) NOT NULL DEFAULT 'fixed',
    `hold_strategy` VARCHAR(40) NOT NULL DEFAULT 'exact_estimate',
    `pricing_lock_mode` VARCHAR(40) NOT NULL DEFAULT 'recalculate_at_complete',
    `stacking_mode` VARCHAR(40) NOT NULL DEFAULT 'sum',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `condition_json` JSON NULL,
    `formula_json` JSON NULL,
    `cap_json` JSON NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `effective_from` DATETIME(3) NULL,
    `effective_to` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `platform_fee_rules_rule_set_id_idx`(`rule_set_id`),
    INDEX `platform_fee_rules_fee_type_idx`(`fee_type`),
    INDEX `platform_fee_rules_order_type_idx`(`order_type`),
    INDEX `platform_fee_rules_payer_type_idx`(`payer_type`),
    INDEX `platform_fee_rules_status_idx`(`status`),
    INDEX `platform_fee_rules_priority_idx`(`priority`),
    INDEX `platform_fee_rules_effective_from_effective_to_idx`(`effective_from`, `effective_to`),
    INDEX `platform_fee_rules_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_fee_tiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_id` INTEGER NOT NULL,
    `tier_basis` VARCHAR(60) NOT NULL DEFAULT 'monthly_completed_orders',
    `tier_mode` VARCHAR(40) NOT NULL DEFAULT 'progressive',
    `min_value` INTEGER NOT NULL DEFAULT 0,
    `max_value` INTEGER NULL,
    `fee_amount_ndp` INTEGER NULL,
    `adjustment_amount_ndp` INTEGER NULL,
    `adjustment_percent` DECIMAL(8, 4) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `platform_fee_tiers_rule_id_idx`(`rule_id`),
    INDEX `platform_fee_tiers_tier_basis_idx`(`tier_basis`),
    INDEX `platform_fee_tiers_tier_mode_idx`(`tier_mode`),
    INDEX `platform_fee_tiers_min_value_max_value_idx`(`min_value`, `max_value`),
    INDEX `platform_fee_tiers_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_fee_time_windows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rule_id` INTEGER NOT NULL,
    `time_basis` VARCHAR(60) NOT NULL DEFAULT 'scheduled_start_at',
    `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Tokyo',
    `day_of_week_mask` VARCHAR(40) NULL,
    `holiday_calendar_id` VARCHAR(80) NULL,
    `start_time` VARCHAR(5) NOT NULL,
    `end_time` VARCHAR(5) NOT NULL,
    `cross_day` BOOLEAN NOT NULL DEFAULT false,
    `adjustment_type` VARCHAR(40) NOT NULL DEFAULT 'fixed_amount',
    `adjustment_value_ndp` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `platform_fee_time_windows_rule_id_idx`(`rule_id`),
    INDEX `platform_fee_time_windows_time_basis_idx`(`time_basis`),
    INDEX `platform_fee_time_windows_timezone_idx`(`timezone`),
    INDEX `platform_fee_time_windows_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(160) NOT NULL,
    `campaign_type` VARCHAR(40) NOT NULL DEFAULT 'free',
    `target_fee_type` VARCHAR(60) NOT NULL DEFAULT 'b_platform_fee',
    `waive_scope` VARCHAR(40) NOT NULL DEFAULT 'all',
    `discount_type` VARCHAR(40) NOT NULL DEFAULT 'set_to_amount',
    `discount_value_ndp` INTEGER NOT NULL DEFAULT 0,
    `max_discount_ndp` INTEGER NULL,
    `budget_limit_ndp` INTEGER NULL,
    `used_budget_ndp` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Tokyo',
    `target_condition_json` JSON NULL,
    `on_budget_exhausted` VARCHAR(60) NOT NULL DEFAULT 'continue_with_alert',
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `priority` INTEGER NOT NULL DEFAULT 100,
    `created_by_id` INTEGER NULL,
    `approved_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `fee_campaigns_campaign_type_idx`(`campaign_type`),
    INDEX `fee_campaigns_target_fee_type_idx`(`target_fee_type`),
    INDEX `fee_campaigns_status_idx`(`status`),
    INDEX `fee_campaigns_priority_idx`(`priority`),
    INDEX `fee_campaigns_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `fee_campaigns_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fee_calculation_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NULL,
    `calculation_stage` VARCHAR(40) NOT NULL,
    `fee_type` VARCHAR(60) NOT NULL,
    `payer_type` VARCHAR(40) NOT NULL,
    `payer_id` INTEGER NULL,
    `base_fee_ndp` INTEGER NOT NULL DEFAULT 0,
    `tier_adjustment_ndp` INTEGER NOT NULL DEFAULT 0,
    `time_adjustment_ndp` INTEGER NOT NULL DEFAULT 0,
    `campaign_discount_ndp` INTEGER NOT NULL DEFAULT 0,
    `final_fee_ndp` INTEGER NOT NULL DEFAULT 0,
    `hold_amount_ndp` INTEGER NOT NULL DEFAULT 0,
    `applied_rule_ids_json` JSON NULL,
    `explanation_json` JSON NULL,
    `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `fee_calculation_logs_booking_order_id_idx`(`booking_order_id`),
    INDEX `fee_calculation_logs_calculation_stage_idx`(`calculation_stage`),
    INDEX `fee_calculation_logs_fee_type_idx`(`fee_type`),
    INDEX `fee_calculation_logs_payer_type_payer_id_idx`(`payer_type`, `payer_id`),
    INDEX `fee_calculation_logs_calculated_at_idx`(`calculated_at`),
    INDEX `fee_calculation_logs_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_holds` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_type` ENUM('user', 'shop', 'platform') NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `fee_type` VARCHAR(60) NOT NULL,
    `hold_amount_ndp` INTEGER NOT NULL DEFAULT 0,
    `captured_amount_ndp` INTEGER NOT NULL DEFAULT 0,
    `released_amount_ndp` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `idempotency_key` VARCHAR(180) NOT NULL,
    `calculation_log_id` INTEGER NULL,
    `metadata` JSON NULL,
    `captured_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `wallet_holds_idempotency_key_key`(`idempotency_key`),
    INDEX `wallet_holds_owner_type_owner_id_idx`(`owner_type`, `owner_id`),
    INDEX `wallet_holds_booking_order_id_idx`(`booking_order_id`),
    INDEX `wallet_holds_fee_type_idx`(`fee_type`),
    INDEX `wallet_holds_status_idx`(`status`),
    INDEX `wallet_holds_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_financials` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NOT NULL,
    `order_type` VARCHAR(40) NOT NULL DEFAULT 'booking',
    `customer_user_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `technician_profile_id` INTEGER NULL,
    `service_amount_jpy` INTEGER NOT NULL DEFAULT 0,
    `platform_collected_service_amount_jpy` INTEGER NOT NULL DEFAULT 0,
    `offline_reported_service_amount_jpy` INTEGER NOT NULL DEFAULT 0,
    `unknown_or_unreported_service_amount_jpy` INTEGER NOT NULL DEFAULT 0,
    `payment_channel` VARCHAR(60) NOT NULL DEFAULT 'unknown',
    `service_income_status` VARCHAR(60) NOT NULL DEFAULT 'unreported',
    `b_platform_fee_hold_ndp` INTEGER NOT NULL DEFAULT 0,
    `b_platform_fee_actual_ndp` INTEGER NOT NULL DEFAULT 0,
    `c_request_fee_hold_ndp` INTEGER NOT NULL DEFAULT 0,
    `c_request_fee_actual_ndp` INTEGER NOT NULL DEFAULT 0,
    `user_reward_ndp` INTEGER NOT NULL DEFAULT 0,
    `penalty_ndp` INTEGER NOT NULL DEFAULT 0,
    `compensation_to_user_ndp` INTEGER NOT NULL DEFAULT 0,
    `campaign_discount_ndp` INTEGER NOT NULL DEFAULT 0,
    `released_ndp` INTEGER NOT NULL DEFAULT 0,
    `platform_fee_payer_type` VARCHAR(40) NULL,
    `platform_fee_payer_id` INTEGER NULL,
    `platform_fee_bearer_for_payroll` VARCHAR(40) NULL,
    `completed_order_ordinal_in_period` INTEGER NULL,
    `applied_fee_rule_ids_json` JSON NULL,
    `money_timeline_json` JSON NULL,
    `settlement_status` VARCHAR(40) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_financials_booking_order_id_key`(`booking_order_id`),
    INDEX `order_financials_order_type_idx`(`order_type`),
    INDEX `order_financials_customer_user_id_idx`(`customer_user_id`),
    INDEX `order_financials_shop_id_idx`(`shop_id`),
    INDEX `order_financials_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `order_financials_payment_channel_idx`(`payment_channel`),
    INDEX `order_financials_service_income_status_idx`(`service_income_status`),
    INDEX `order_financials_settlement_status_idx`(`settlement_status`),
    INDEX `order_financials_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_fee_rules` ADD CONSTRAINT `platform_fee_rules_rule_set_id_fkey` FOREIGN KEY (`rule_set_id`) REFERENCES `platform_fee_rule_sets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_fee_tiers` ADD CONSTRAINT `platform_fee_tiers_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `platform_fee_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_fee_time_windows` ADD CONSTRAINT `platform_fee_time_windows_rule_id_fkey` FOREIGN KEY (`rule_id`) REFERENCES `platform_fee_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fee_calculation_logs` ADD CONSTRAINT `fee_calculation_logs_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_holds` ADD CONSTRAINT `wallet_holds_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_financials` ADD CONSTRAINT `order_financials_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
