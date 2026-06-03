CREATE TABLE `payroll_adjustment_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `period_start` DATETIME(3) NOT NULL,
  `period_end` DATETIME(3) NOT NULL,
  `adjustment_type` VARCHAR(40) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `reason` VARCHAR(500) NOT NULL,
  `proof_url` VARCHAR(500) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `requested_by_id` INTEGER NOT NULL,
  `submitted_at` DATETIME(3) NULL,
  `approved_by_id` INTEGER NULL,
  `approved_at` DATETIME(3) NULL,
  `rejected_by_id` INTEGER NULL,
  `rejected_at` DATETIME(3) NULL,
  `rejection_reason` VARCHAR(500) NULL,
  `applied_pay_run_id` INTEGER NULL,
  `applied_payslip_line_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `payroll_adjustment_requests_shop_id_idx`(`shop_id`),
  INDEX `payroll_adjustment_requests_technician_profile_id_idx`(`technician_profile_id`),
  INDEX `payroll_adjustment_requests_period_start_period_end_idx`(`period_start`, `period_end`),
  INDEX `payroll_adjustment_requests_adjustment_type_idx`(`adjustment_type`),
  INDEX `payroll_adjustment_requests_status_idx`(`status`),
  INDEX `payroll_adjustment_requests_requested_by_id_idx`(`requested_by_id`),
  INDEX `payroll_adjustment_requests_approved_by_id_idx`(`approved_by_id`),
  INDEX `payroll_adjustment_requests_rejected_by_id_idx`(`rejected_by_id`),
  INDEX `payroll_adjustment_requests_applied_pay_run_id_idx`(`applied_pay_run_id`),
  INDEX `payroll_adjustment_requests_applied_payslip_line_id_idx`(`applied_payslip_line_id`),
  INDEX `payroll_adjustment_requests_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_rejected_by_id_fkey` FOREIGN KEY (`rejected_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_applied_pay_run_id_fkey` FOREIGN KEY (`applied_pay_run_id`) REFERENCES `pay_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `payroll_adjustment_requests` ADD CONSTRAINT `payroll_adjustment_requests_applied_payslip_line_id_fkey` FOREIGN KEY (`applied_payslip_line_id`) REFERENCES `payslip_lines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
