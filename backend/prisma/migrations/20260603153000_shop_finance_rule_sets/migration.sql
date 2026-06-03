CREATE TABLE `shop_finance_rule_sets` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'active',
  `wage_mode` VARCHAR(60) NOT NULL DEFAULT 'commission',
  `base_salary_jpy` INTEGER NOT NULL DEFAULT 0,
  `hourly_rate_jpy` INTEGER NOT NULL DEFAULT 0,
  `daily_rate_jpy` INTEGER NOT NULL DEFAULT 0,
  `fixed_order_pay_jpy` INTEGER NOT NULL DEFAULT 0,
  `commission_rate_bps` INTEGER NOT NULL DEFAULT 6000,
  `guaranteed_minimum_jpy` INTEGER NOT NULL DEFAULT 0,
  `ndp_fee_bearer` VARCHAR(40) NOT NULL DEFAULT 'shop',
  `technician_ndp_share_bps` INTEGER NOT NULL DEFAULT 0,
  `bonus_rules_json` JSON NULL,
  `deduction_rules_json` JSON NULL,
  `effective_from` DATETIME(3) NULL,
  `effective_to` DATETIME(3) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  INDEX `shop_finance_rule_sets_shop_id_idx`(`shop_id`),
  INDEX `shop_finance_rule_sets_status_idx`(`status`),
  INDEX `shop_finance_rule_sets_wage_mode_idx`(`wage_mode`),
  INDEX `shop_finance_rule_sets_ndp_fee_bearer_idx`(`ndp_fee_bearer`),
  INDEX `shop_finance_rule_sets_created_by_id_idx`(`created_by_id`),
  INDEX `shop_finance_rule_sets_updated_by_id_idx`(`updated_by_id`),
  INDEX `shop_finance_rule_sets_effective_from_effective_to_idx`(`effective_from`, `effective_to`),
  INDEX `shop_finance_rule_sets_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shop_finance_rule_sets`
  ADD CONSTRAINT `shop_finance_rule_sets_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
