CREATE TABLE `pay_runs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `total_base_salary_jpy` INTEGER NOT NULL DEFAULT 0,
  `total_commission_jpy` INTEGER NOT NULL DEFAULT 0,
  `total_bonus_jpy` INTEGER NOT NULL DEFAULT 0,
  `total_allowance_jpy` INTEGER NOT NULL DEFAULT 0,
  `total_deduction_jpy` INTEGER NOT NULL DEFAULT 0,
  `total_net_pay_jpy` INTEGER NOT NULL DEFAULT 0,
  `paid_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `unpaid_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `generated_by_id` INTEGER NULL,
  `approved_by_id` INTEGER NULL,
  `locked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `pay_runs_shop_id_idx`(`shop_id`),
  INDEX `pay_runs_period_start_period_end_idx`(`period_start`, `period_end`),
  INDEX `pay_runs_status_idx`(`status`),
  INDEX `pay_runs_generated_by_id_idx`(`generated_by_id`),
  INDEX `pay_runs_approved_by_id_idx`(`approved_by_id`),
  INDEX `pay_runs_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payslips` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `pay_run_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `technician_user_id` INTEGER NULL,
  `compensation_profile_id` INTEGER NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `dispute_status` VARCHAR(40) NOT NULL DEFAULT 'none',
  `dispute_reason` VARCHAR(500) NULL,
  `base_salary_jpy` INTEGER NOT NULL DEFAULT 0,
  `annual_salary_prorated_jpy` INTEGER NOT NULL DEFAULT 0,
  `daily_wage_jpy` INTEGER NOT NULL DEFAULT 0,
  `hourly_wage_jpy` INTEGER NOT NULL DEFAULT 0,
  `commission_jpy` INTEGER NOT NULL DEFAULT 0,
  `guarantee_topup_jpy` INTEGER NOT NULL DEFAULT 0,
  `bonus_jpy` INTEGER NOT NULL DEFAULT 0,
  `allowance_jpy` INTEGER NOT NULL DEFAULT 0,
  `deduction_jpy` INTEGER NOT NULL DEFAULT 0,
  `platform_fee_share_deduction_jpy` INTEGER NOT NULL DEFAULT 0,
  `net_pay_jpy` INTEGER NOT NULL DEFAULT 0,
  `paid_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `unpaid_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `confirmed_at` DATETIME(3) NULL,
  `disputed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `payslips_pay_run_id_idx`(`pay_run_id`),
  INDEX `payslips_shop_id_idx`(`shop_id`),
  INDEX `payslips_technician_profile_id_idx`(`technician_profile_id`),
  INDEX `payslips_technician_user_id_idx`(`technician_user_id`),
  INDEX `payslips_compensation_profile_id_idx`(`compensation_profile_id`),
  INDEX `payslips_period_start_period_end_idx`(`period_start`, `period_end`),
  INDEX `payslips_status_idx`(`status`),
  INDEX `payslips_dispute_status_idx`(`dispute_status`),
  INDEX `payslips_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payslip_lines` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payslip_id` INTEGER NOT NULL,
  `line_type` VARCHAR(60) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `quantity` DECIMAL(10, 2) NOT NULL DEFAULT 1,
  `unit_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `formula_text` VARCHAR(255) NULL,
  `source_type` VARCHAR(60) NOT NULL DEFAULT 'manual',
  `source_id` INTEGER NULL,
  `rule_id` VARCHAR(120) NULL,
  `order_id` INTEGER NULL,
  `explanation` VARCHAR(500) NULL,
  `created_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `payslip_lines_payslip_id_idx`(`payslip_id`),
  INDEX `payslip_lines_line_type_idx`(`line_type`),
  INDEX `payslip_lines_source_type_source_id_idx`(`source_type`, `source_id`),
  INDEX `payslip_lines_order_id_idx`(`order_id`),
  INDEX `payslip_lines_created_by_id_idx`(`created_by_id`),
  INDEX `payslip_lines_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payout_records` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `payslip_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `payout_method` VARCHAR(60) NOT NULL,
  `payout_date` DATETIME(3) NOT NULL,
  `reference_no` VARCHAR(120) NULL,
  `proof_url` VARCHAR(500) NULL,
  `note` VARCHAR(500) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'completed',
  `confirmed_by_technician` BOOLEAN NOT NULL DEFAULT false,
  `created_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `payout_records_payslip_id_idx`(`payslip_id`),
  INDEX `payout_records_shop_id_idx`(`shop_id`),
  INDEX `payout_records_technician_profile_id_idx`(`technician_profile_id`),
  INDEX `payout_records_payout_date_idx`(`payout_date`),
  INDEX `payout_records_status_idx`(`status`),
  INDEX `payout_records_created_by_id_idx`(`created_by_id`),
  INDEX `payout_records_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_generated_by_id_fkey` FOREIGN KEY (`generated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `pay_runs` ADD CONSTRAINT `pay_runs_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payslips` ADD CONSTRAINT `payslips_pay_run_id_fkey` FOREIGN KEY (`pay_run_id`) REFERENCES `pay_runs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payslips` ADD CONSTRAINT `payslips_compensation_profile_id_fkey` FOREIGN KEY (`compensation_profile_id`) REFERENCES `technician_compensation_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payslip_lines` ADD CONSTRAINT `payslip_lines_payslip_id_fkey` FOREIGN KEY (`payslip_id`) REFERENCES `payslips`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payslip_lines` ADD CONSTRAINT `payslip_lines_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payout_records` ADD CONSTRAINT `payout_records_payslip_id_fkey` FOREIGN KEY (`payslip_id`) REFERENCES `payslips`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payout_records` ADD CONSTRAINT `payout_records_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payout_records` ADD CONSTRAINT `payout_records_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payout_records` ADD CONSTRAINT `payout_records_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
