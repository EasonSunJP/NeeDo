ALTER TABLE `customer_profiles`
  ADD COLUMN `membership_grant_mode` ENUM('self_service', 'operator_complimentary') NOT NULL DEFAULT 'self_service',
  ADD COLUMN `membership_duration_unit` ENUM('forever', 'day', 'month') NULL,
  ADD COLUMN `membership_duration_value` INTEGER NULL,
  ADD COLUMN `membership_starts_at` DATETIME(3) NULL,
  ADD COLUMN `membership_expires_at` DATETIME(3) NULL,
  ADD COLUMN `membership_granted_by_id` INTEGER NULL;

CREATE INDEX `customer_profiles_membership_status_idx`
  ON `customer_profiles`(`membership_grant_mode`, `membership_expires_at`, `deleted_at`);

CREATE INDEX `customer_profiles_membership_granted_by_idx`
  ON `customer_profiles`(`membership_granted_by_id`);

ALTER TABLE `customer_profiles`
  ADD CONSTRAINT `customer_profiles_membership_granted_by_id_fkey`
  FOREIGN KEY (`membership_granted_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
