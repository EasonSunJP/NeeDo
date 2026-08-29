-- CreateTable
CREATE TABLE `shop_payroll_schedule_policies` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `cadence` VARCHAR(20) NOT NULL,
  `weekly_settlement_weekday` INTEGER NULL,
  `monthly_settlement_day` INTEGER NULL,
  `holiday_adjustment` VARCHAR(40) NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Tokyo',
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `version` INTEGER NOT NULL DEFAULT 1,
  `active_key` VARCHAR(191) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_payroll_schedule_policy_active_key_key`(`active_key`),
  UNIQUE INDEX `shop_payroll_schedule_policy_shop_version_key`(`shop_id`, `version`),
  INDEX `shop_payroll_schedule_policy_effective_idx`(`shop_id`, `status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `shop_payroll_schedule_policy_created_by_idx`(`created_by_id`),
  INDEX `shop_payroll_schedule_policy_updated_by_idx`(`updated_by_id`),
  INDEX `shop_payroll_schedule_policy_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_payroll_schedule_overrides` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `technician_shop_affiliation_id` INTEGER NOT NULL,
  `inherit_shop_policy` BOOLEAN NOT NULL DEFAULT true,
  `cadence` VARCHAR(20) NULL,
  `weekly_settlement_weekday` INTEGER NULL,
  `monthly_settlement_day` INTEGER NULL,
  `holiday_adjustment` VARCHAR(40) NULL,
  `timezone` VARCHAR(64) NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `version` INTEGER NOT NULL DEFAULT 1,
  `active_key` VARCHAR(191) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `technician_payroll_schedule_override_active_key_key`(`active_key`),
  UNIQUE INDEX `technician_payroll_schedule_override_affiliation_version_key`(`technician_shop_affiliation_id`, `version`),
  INDEX `technician_payroll_schedule_override_effective_idx`(`technician_shop_affiliation_id`, `status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `technician_payroll_schedule_override_created_by_idx`(`created_by_id`),
  INDEX `technician_payroll_schedule_override_updated_by_idx`(`updated_by_id`),
  INDEX `technician_payroll_schedule_override_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `business_calendar_dates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `country_code` CHAR(2) NOT NULL,
  `calendar_date` DATE NOT NULL,
  `is_public_holiday` BOOLEAN NOT NULL DEFAULT false,
  `is_business_day` BOOLEAN NOT NULL DEFAULT true,
  `holiday_name` VARCHAR(160) NULL,
  `source_version` VARCHAR(120) NOT NULL,
  `source_url` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `business_calendar_country_date_key`(`country_code`, `calendar_date`),
  INDEX `business_calendar_business_date_idx`(`country_code`, `is_business_day`, `calendar_date`, `deleted_at`),
  INDEX `business_calendar_source_version_idx`(`source_version`),
  INDEX `business_calendar_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shop_payroll_schedule_policies`
  ADD CONSTRAINT `shop_payroll_schedule_policies_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_payroll_schedule_policies`
  ADD CONSTRAINT `shop_payroll_schedule_policies_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_payroll_schedule_policies`
  ADD CONSTRAINT `shop_payroll_schedule_policies_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_payroll_schedule_overrides`
  ADD CONSTRAINT `tech_payroll_schedule_override_affiliation_fkey`
  FOREIGN KEY (`technician_shop_affiliation_id`) REFERENCES `technician_shop_affiliations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_payroll_schedule_overrides`
  ADD CONSTRAINT `technician_payroll_schedule_overrides_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_payroll_schedule_overrides`
  ADD CONSTRAINT `technician_payroll_schedule_overrides_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedOfficialJapanHolidays
-- Source: Cabinet Office, Government of Japan, official holiday CSV retrieved 2026-08-29.
-- https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
INSERT INTO `business_calendar_dates`
  (`country_code`, `calendar_date`, `is_public_holiday`, `is_business_day`, `holiday_name`, `source_version`, `source_url`, `updated_at`)
VALUES
  ('JP', '2025-01-01', true, false, '元日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-01-13', true, false, '成人の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-02-11', true, false, '建国記念の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-02-23', true, false, '天皇誕生日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-02-24', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-03-20', true, false, '春分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-04-29', true, false, '昭和の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-05-03', true, false, '憲法記念日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-05-04', true, false, 'みどりの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-05-05', true, false, 'こどもの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-05-06', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-07-21', true, false, '海の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-08-11', true, false, '山の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-09-15', true, false, '敬老の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-09-23', true, false, '秋分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-10-13', true, false, 'スポーツの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-11-03', true, false, '文化の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-11-23', true, false, '勤労感謝の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2025-11-24', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-01-01', true, false, '元日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-01-12', true, false, '成人の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-02-11', true, false, '建国記念の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-02-23', true, false, '天皇誕生日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-03-20', true, false, '春分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-04-29', true, false, '昭和の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-05-03', true, false, '憲法記念日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-05-04', true, false, 'みどりの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-05-05', true, false, 'こどもの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-05-06', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-07-20', true, false, '海の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-08-11', true, false, '山の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-09-21', true, false, '敬老の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-09-22', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-09-23', true, false, '秋分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-10-12', true, false, 'スポーツの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-11-03', true, false, '文化の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2026-11-23', true, false, '勤労感謝の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-01-01', true, false, '元日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-01-11', true, false, '成人の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-02-11', true, false, '建国記念の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-02-23', true, false, '天皇誕生日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-03-21', true, false, '春分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-03-22', true, false, '休日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-04-29', true, false, '昭和の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-05-03', true, false, '憲法記念日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-05-04', true, false, 'みどりの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-05-05', true, false, 'こどもの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-07-19', true, false, '海の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-08-11', true, false, '山の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-09-20', true, false, '敬老の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-09-23', true, false, '秋分の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-10-11', true, false, 'スポーツの日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-11-03', true, false, '文化の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3)),
  ('JP', '2027-11-23', true, false, '勤労感謝の日', 'cabinet-office-2026-08-29', 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', CURRENT_TIMESTAMP(3));
