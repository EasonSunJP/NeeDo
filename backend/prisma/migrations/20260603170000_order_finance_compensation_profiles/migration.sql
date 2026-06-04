ALTER TABLE `order_financials`
  ADD COLUMN `service_income_reported_by_id` INTEGER NULL,
  ADD COLUMN `service_income_reported_at` DATETIME(3) NULL,
  ADD COLUMN `service_income_confirmed_by_id` INTEGER NULL,
  ADD COLUMN `service_income_confirmed_at` DATETIME(3) NULL,
  ADD COLUMN `service_income_note` VARCHAR(500) NULL,
  ADD COLUMN `service_income_proof_url` VARCHAR(500) NULL;

CREATE INDEX `order_financials_service_income_reported_by_id_idx`
  ON `order_financials`(`service_income_reported_by_id`);

CREATE INDEX `order_financials_service_income_confirmed_by_id_idx`
  ON `order_financials`(`service_income_confirmed_by_id`);

CREATE INDEX `order_financials_service_income_reported_at_idx`
  ON `order_financials`(`service_income_reported_at`);

CREATE INDEX `order_financials_service_income_confirmed_at_idx`
  ON `order_financials`(`service_income_confirmed_at`);

ALTER TABLE `order_financials`
  ADD CONSTRAINT `order_financials_service_income_reported_by_id_fkey`
  FOREIGN KEY (`service_income_reported_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_financials`
  ADD CONSTRAINT `order_financials_service_income_confirmed_by_id_fkey`
  FOREIGN KEY (`service_income_confirmed_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `technician_compensation_profiles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'active',
  `version` INTEGER NOT NULL DEFAULT 1,
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

  INDEX `technician_compensation_profiles_shop_id_idx`(`shop_id`),
  INDEX `technician_compensation_profiles_technician_profile_id_idx`(`technician_profile_id`),
  INDEX `tech_comp_profiles_shop_tech_status_idx`(`shop_id`, `technician_profile_id`, `status`),
  INDEX `technician_compensation_profiles_status_idx`(`status`),
  INDEX `technician_compensation_profiles_wage_mode_idx`(`wage_mode`),
  INDEX `technician_compensation_profiles_ndp_fee_bearer_idx`(`ndp_fee_bearer`),
  INDEX `technician_compensation_profiles_created_by_id_idx`(`created_by_id`),
  INDEX `technician_compensation_profiles_updated_by_id_idx`(`updated_by_id`),
  INDEX `technician_compensation_profiles_effective_from_effective_to_idx`(`effective_from`, `effective_to`),
  INDEX `technician_compensation_profiles_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `technician_compensation_profiles`
  ADD CONSTRAINT `technician_compensation_profiles_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `technician_compensation_profiles`
  ADD CONSTRAINT `technician_compensation_profiles_technician_profile_id_fkey`
  FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
