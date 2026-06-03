ALTER TABLE `payslips`
  ADD COLUMN `dispute_resolved_at` DATETIME(3) NULL,
  ADD COLUMN `dispute_resolved_by_id` INTEGER NULL,
  ADD COLUMN `dispute_resolution_note` VARCHAR(500) NULL;

CREATE INDEX `payslips_dispute_resolved_by_id_idx`
  ON `payslips`(`dispute_resolved_by_id`);

CREATE INDEX `payslips_dispute_resolved_at_idx`
  ON `payslips`(`dispute_resolved_at`);

ALTER TABLE `payout_records`
  ADD COLUMN `technician_confirmed_at` DATETIME(3) NULL;

CREATE INDEX `payout_records_technician_confirmed_at_idx`
  ON `payout_records`(`technician_confirmed_at`);
