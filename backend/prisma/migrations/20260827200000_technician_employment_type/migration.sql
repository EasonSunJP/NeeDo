ALTER TABLE `technician_profiles`
  ADD COLUMN `employment_type` ENUM('INDEPENDENT', 'FULL_TIME', 'TEMPORARY') NOT NULL DEFAULT 'INDEPENDENT',
  ADD COLUMN `employment_started_at` DATETIME(3) NULL;

CREATE INDEX `technician_profiles_shop_id_employment_type_idx`
  ON `technician_profiles`(`shop_id`, `employment_type`);
