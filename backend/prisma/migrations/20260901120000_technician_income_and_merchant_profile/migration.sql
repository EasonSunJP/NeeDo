ALTER TABLE `shop_finance_rule_sets`
  ADD COLUMN `extension_commission_rate_bps` INTEGER NOT NULL DEFAULT 6000 AFTER `commission_rate_bps`,
  ADD COLUMN `nomination_fee_jpy` INTEGER NOT NULL DEFAULT 0 AFTER `extension_commission_rate_bps`;

UPDATE `shop_finance_rule_sets`
SET `extension_commission_rate_bps` = `commission_rate_bps`;

ALTER TABLE `technician_compensation_profiles`
  ADD COLUMN `extension_commission_rate_bps` INTEGER NOT NULL DEFAULT 6000 AFTER `commission_rate_bps`,
  ADD COLUMN `nomination_fee_jpy` INTEGER NOT NULL DEFAULT 0 AFTER `extension_commission_rate_bps`;

UPDATE `technician_compensation_profiles`
SET `extension_commission_rate_bps` = `commission_rate_bps`;

ALTER TABLE `order_financials`
  ADD COLUMN `base_service_amount_jpy` INTEGER NULL AFTER `service_amount_jpy`,
  ADD COLUMN `extension_amount_jpy` INTEGER NULL AFTER `base_service_amount_jpy`,
  ADD COLUMN `nomination_charge_amount_jpy` INTEGER NULL AFTER `extension_amount_jpy`,
  ADD COLUMN `was_technician_nominated` BOOLEAN NULL AFTER `nomination_charge_amount_jpy`,
  ADD COLUMN `compensation_basis_version` VARCHAR(80) NULL AFTER `was_technician_nominated`;

CREATE TABLE `merchant_identity_profiles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `identity_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `gender` VARCHAR(20) NOT NULL DEFAULT 'private',
  `age` INTEGER NULL,
  `height_cm` DECIMAL(5, 2) NULL,
  `languages` JSON NULL,
  `bio` TEXT NULL,
  `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `merchant_identity_profiles_identity_id_key`(`identity_id`),
  INDEX `merchant_identity_profiles_user_id_idx`(`user_id`),
  INDEX `merchant_identity_profiles_visibility_idx`(`visibility`),
  INDEX `merchant_identity_profiles_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `merchant_identity_profiles`
  ADD CONSTRAINT `merchant_identity_profiles_identity_id_fkey`
  FOREIGN KEY (`identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `merchant_identity_profiles`
  ADD CONSTRAINT `merchant_identity_profiles_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
