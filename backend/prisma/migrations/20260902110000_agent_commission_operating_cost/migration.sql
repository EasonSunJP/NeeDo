CREATE TABLE `platform_partner_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `partner_type` ENUM('agent', 'franchisee', 'supplier') NOT NULL,
    `activated_at` DATETIME(3) NOT NULL,
    `marked_by_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `active_partner_key` VARCHAR(191) GENERATED ALWAYS AS (
      CASE
        WHEN `deleted_at` IS NULL THEN CONCAT(CAST(`user_id` AS CHAR), ':', `partner_type`)
        ELSE NULL
      END
    ) STORED,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `platform_partner_profiles_reason_chk`
      CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0),
    UNIQUE INDEX `platform_partner_profiles_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_partner_profiles_active_partner_key`(`active_partner_key`),
    INDEX `platform_partner_profiles_user_deleted_idx`(`user_id`, `deleted_at`),
    INDEX `platform_partner_profiles_type_activated_deleted_idx`(`partner_type`, `activated_at`, `deleted_at`),
    INDEX `platform_partner_profiles_marked_by_id_idx`(`marked_by_id`),
    INDEX `platform_partner_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `agent_shop_referrals` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `agent_profile_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `status` ENUM('active', 'qualified', 'revoked') NOT NULL DEFAULT 'active',
    `source` VARCHAR(100) NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL,
    `confirmed_by_id` INTEGER NOT NULL,
    `success_qualified_at` DATETIME(3) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `active_shop_key` VARCHAR(64) GENERATED ALWAYS AS (
      CASE
        WHEN `deleted_at` IS NULL AND `status` IN ('active', 'qualified') THEN CAST(`shop_id` AS CHAR)
        ELSE NULL
      END
    ) STORED,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `agent_shop_referrals_source_chk`
      CHECK (CHAR_LENGTH(TRIM(`source`)) > 0),
    CONSTRAINT `agent_shop_referrals_reason_chk`
      CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0),
    CONSTRAINT `agent_shop_referrals_qualification_time_chk`
      CHECK (`success_qualified_at` IS NULL OR `success_qualified_at` >= `confirmed_at`),
    UNIQUE INDEX `agent_shop_referrals_public_id_key`(`public_id`),
    UNIQUE INDEX `agent_shop_referrals_active_shop_key`(`active_shop_key`),
    INDEX `agent_shop_referrals_agent_status_confirmed_idx`(`agent_profile_id`, `status`, `confirmed_at`, `deleted_at`),
    INDEX `agent_shop_referrals_shop_status_deleted_idx`(`shop_id`, `status`, `deleted_at`),
    INDEX `agent_shop_referrals_confirmed_by_id_idx`(`confirmed_by_id`),
    INDEX `agent_shop_referrals_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `agent_commission_rule_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `agent_profile_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `fixed_success_reward_jpy` BIGINT NOT NULL,
    `profit_share_rate_bps` INTEGER NOT NULL,
    `payment_method` ENUM('bank_transfer', 'ndp', 'other') NOT NULL,
    `payment_details_json` JSON NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_to` DATETIME(3) NULL,
    `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `published_by_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `agent_commission_rule_versions_version_chk`
      CHECK (`version` > 0),
    CONSTRAINT `agent_commission_rule_versions_reward_chk`
      CHECK (`fixed_success_reward_jpy` >= 0),
    CONSTRAINT `agent_commission_rule_versions_rate_chk`
      CHECK (`profit_share_rate_bps` BETWEEN 0 AND 10000),
    CONSTRAINT `agent_commission_rule_versions_window_chk`
      CHECK (`effective_to` IS NULL OR `effective_to` > `effective_from`),
    CONSTRAINT `agent_commission_rule_versions_reason_chk`
      CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0),
    UNIQUE INDEX `agent_commission_rule_versions_public_id_key`(`public_id`),
    UNIQUE INDEX `agent_commission_rule_versions_agent_version_key`(`agent_profile_id`, `version`),
    INDEX `agent_commission_rule_versions_resolution_idx`(`agent_profile_id`, `effective_from`, `effective_to`, `deleted_at`),
    INDEX `agent_commission_rule_versions_published_by_id_idx`(`published_by_id`),
    INDEX `agent_commission_rule_versions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operating_cost_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `cost_code` VARCHAR(100) NOT NULL,
    `version` INTEGER NOT NULL,
    `category_code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `amount_jpy` BIGINT NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'JPY',
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `allocation_mode` ENUM('equal_active_shops', 'platform_income_proportional', 'direct_shops') NOT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `effective_at` DATETIME(3) NOT NULL,
    `published_at` DATETIME(3) NULL,
    `configured_by_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `configuration_snapshot_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `operating_cost_items_version_chk`
      CHECK (`version` > 0),
    CONSTRAINT `operating_cost_items_amount_chk`
      CHECK (`amount_jpy` >= 0),
    CONSTRAINT `operating_cost_items_currency_chk`
      CHECK (`currency` = 'JPY'),
    CONSTRAINT `operating_cost_items_period_chk`
      CHECK (`period_end` >= `period_start`),
    CONSTRAINT `operating_cost_items_code_chk`
      CHECK (CHAR_LENGTH(TRIM(`cost_code`)) > 0 AND CHAR_LENGTH(TRIM(`category_code`)) > 0),
    CONSTRAINT `operating_cost_items_reason_chk`
      CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0),
    UNIQUE INDEX `operating_cost_items_public_id_key`(`public_id`),
    UNIQUE INDEX `operating_cost_items_code_version_key`(`cost_code`, `version`),
    INDEX `operating_cost_items_status_period_idx`(`status`, `period_start`, `period_end`, `deleted_at`),
    INDEX `operating_cost_items_category_period_idx`(`category_code`, `period_start`, `period_end`, `deleted_at`),
    INDEX `operating_cost_items_configured_by_id_idx`(`configured_by_id`),
    INDEX `operating_cost_items_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operating_cost_allocations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operating_cost_item_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `amount_jpy` BIGINT NOT NULL,
    `allocation_weight` DECIMAL(20, 8) NULL,
    `calculation_snapshot_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `operating_cost_allocations_amount_chk`
      CHECK (`amount_jpy` >= 0),
    CONSTRAINT `operating_cost_allocations_weight_chk`
      CHECK (`allocation_weight` IS NULL OR `allocation_weight` >= 0),
    UNIQUE INDEX `operating_cost_allocations_item_shop_key`(`operating_cost_item_id`, `shop_id`),
    INDEX `operating_cost_allocations_shop_deleted_idx`(`shop_id`, `deleted_at`),
    INDEX `operating_cost_allocations_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `agent_settlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `agent_profile_id` INTEGER NOT NULL,
    `rule_version_id` INTEGER NOT NULL,
    `period_start` DATE NOT NULL,
    `period_end` DATE NOT NULL,
    `status` ENUM('confirmed', 'paid') NOT NULL DEFAULT 'confirmed',
    `currency` CHAR(3) NOT NULL DEFAULT 'JPY',
    `order_platform_fees_jpy` BIGINT NOT NULL,
    `saas_fees_jpy` BIGINT NOT NULL,
    `user_rebates_jpy` BIGINT NOT NULL,
    `refunds_and_reversals_jpy` BIGINT NOT NULL,
    `channel_fees_jpy` BIGINT NOT NULL,
    `consumption_tax_jpy` BIGINT NOT NULL,
    `allocated_operating_costs_jpy` BIGINT NOT NULL,
    `pure_profit_jpy` BIGINT NOT NULL,
    `fixed_success_reward_jpy` BIGINT NOT NULL,
    `profit_share_rate_bps` INTEGER NOT NULL,
    `profit_share_amount_jpy` BIGINT NOT NULL,
    `total_amount_jpy` BIGINT NOT NULL,
    `calculation_snapshot_json` JSON NOT NULL,
    `idempotency_key` VARCHAR(160) NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmed_by_id` INTEGER NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `paid_by_id` INTEGER NULL,
    `payment_method` ENUM('bank_transfer', 'ndp', 'other') NULL,
    `payment_reference` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `agent_settlements_period_chk`
      CHECK (`period_end` >= `period_start`),
    CONSTRAINT `agent_settlements_currency_chk`
      CHECK (`currency` = 'JPY'),
    CONSTRAINT `agent_settlements_rate_chk`
      CHECK (`profit_share_rate_bps` BETWEEN 0 AND 10000),
    CONSTRAINT `agent_settlements_components_chk`
      CHECK (
        `order_platform_fees_jpy` >= 0
        AND `saas_fees_jpy` >= 0
        AND `user_rebates_jpy` >= 0
        AND `refunds_and_reversals_jpy` >= 0
        AND `channel_fees_jpy` >= 0
        AND `consumption_tax_jpy` >= 0
        AND `allocated_operating_costs_jpy` >= 0
        AND `fixed_success_reward_jpy` >= 0
        AND `profit_share_amount_jpy` >= 0
        AND `total_amount_jpy` >= 0
      ),
    CONSTRAINT `agent_settlements_payment_state_chk`
      CHECK (
        (`status` = 'confirmed' AND `paid_at` IS NULL AND `paid_by_id` IS NULL AND `payment_method` IS NULL AND `payment_reference` IS NULL)
        OR
        (`status` = 'paid' AND `paid_at` IS NOT NULL AND `paid_by_id` IS NOT NULL AND `payment_method` IS NOT NULL AND `payment_reference` IS NOT NULL)
      ),
    UNIQUE INDEX `agent_settlements_public_id_key`(`public_id`),
    UNIQUE INDEX `agent_settlements_agent_period_key`(`agent_profile_id`, `period_start`, `period_end`),
    UNIQUE INDEX `agent_settlements_agent_idempotency_key`(`agent_profile_id`, `idempotency_key`),
    INDEX `agent_settlements_status_period_idx`(`status`, `period_start`, `period_end`, `deleted_at`),
    INDEX `agent_settlements_rule_version_id_idx`(`rule_version_id`),
    INDEX `agent_settlements_confirmed_by_id_idx`(`confirmed_by_id`),
    INDEX `agent_settlements_paid_by_id_idx`(`paid_by_id`),
    INDEX `agent_settlements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `agent_settlement_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `settlement_id` INTEGER NOT NULL,
    `referral_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `line_type` ENUM('success_reward', 'profit_share') NOT NULL,
    `order_platform_fees_jpy` BIGINT NOT NULL,
    `saas_fees_jpy` BIGINT NOT NULL,
    `user_rebates_jpy` BIGINT NOT NULL,
    `refunds_and_reversals_jpy` BIGINT NOT NULL,
    `channel_fees_jpy` BIGINT NOT NULL,
    `consumption_tax_jpy` BIGINT NOT NULL,
    `allocated_operating_costs_jpy` BIGINT NOT NULL,
    `shop_pure_profit_jpy` BIGINT NOT NULL,
    `fixed_success_reward_jpy` BIGINT NOT NULL,
    `profit_share_rate_bps` INTEGER NOT NULL,
    `amount_jpy` BIGINT NOT NULL,
    `calculation_snapshot_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `agent_settlement_lines_rate_chk`
      CHECK (`profit_share_rate_bps` BETWEEN 0 AND 10000),
    CONSTRAINT `agent_settlement_lines_components_chk`
      CHECK (
        `order_platform_fees_jpy` >= 0
        AND `saas_fees_jpy` >= 0
        AND `user_rebates_jpy` >= 0
        AND `refunds_and_reversals_jpy` >= 0
        AND `channel_fees_jpy` >= 0
        AND `consumption_tax_jpy` >= 0
        AND `allocated_operating_costs_jpy` >= 0
        AND `fixed_success_reward_jpy` >= 0
        AND `amount_jpy` >= 0
      ),
    UNIQUE INDEX `agent_settlement_lines_settlement_referral_type_key`(`settlement_id`, `referral_id`, `line_type`),
    INDEX `agent_settlement_lines_shop_type_idx`(`shop_id`, `line_type`),
    INDEX `agent_settlement_lines_referral_id_idx`(`referral_id`),
    INDEX `agent_settlement_lines_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `platform_partner_profiles`
    ADD CONSTRAINT `platform_partner_profiles_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_partner_profiles_marked_by_id_fkey`
    FOREIGN KEY (`marked_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_shop_referrals`
    ADD CONSTRAINT `agent_shop_referrals_agent_profile_id_fkey`
    FOREIGN KEY (`agent_profile_id`) REFERENCES `platform_partner_profiles`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_shop_referrals_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_shop_referrals_confirmed_by_id_fkey`
    FOREIGN KEY (`confirmed_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_commission_rule_versions`
    ADD CONSTRAINT `agent_commission_rule_versions_agent_profile_id_fkey`
    FOREIGN KEY (`agent_profile_id`) REFERENCES `platform_partner_profiles`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_commission_rule_versions_published_by_id_fkey`
    FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `operating_cost_items`
    ADD CONSTRAINT `operating_cost_items_configured_by_id_fkey`
    FOREIGN KEY (`configured_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `operating_cost_allocations`
    ADD CONSTRAINT `operating_cost_allocations_item_id_fkey`
    FOREIGN KEY (`operating_cost_item_id`) REFERENCES `operating_cost_items`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `operating_cost_allocations_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_settlements`
    ADD CONSTRAINT `agent_settlements_agent_profile_id_fkey`
    FOREIGN KEY (`agent_profile_id`) REFERENCES `platform_partner_profiles`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_settlements_rule_version_id_fkey`
    FOREIGN KEY (`rule_version_id`) REFERENCES `agent_commission_rule_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_settlements_confirmed_by_id_fkey`
    FOREIGN KEY (`confirmed_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_settlements_paid_by_id_fkey`
    FOREIGN KEY (`paid_by_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `agent_settlement_lines`
    ADD CONSTRAINT `agent_settlement_lines_settlement_id_fkey`
    FOREIGN KEY (`settlement_id`) REFERENCES `agent_settlements`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_settlement_lines_referral_id_fkey`
    FOREIGN KEY (`referral_id`) REFERENCES `agent_shop_referrals`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `agent_settlement_lines_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
