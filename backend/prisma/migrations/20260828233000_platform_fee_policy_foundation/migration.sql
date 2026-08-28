-- AlterTable
ALTER TABLE `platform_fee_rule_sets`
  ADD COLUMN `family_code` VARCHAR(80) NULL;

-- BackfillCanonicalBookingFamily
UPDATE `platform_fee_rule_sets`
SET `family_code` = 'booking_default'
WHERE `id` = (
  SELECT `id`
  FROM (
    SELECT `id`
    FROM `platform_fee_rule_sets`
    WHERE `name` = 'Default Booking NDP Rules'
      AND `deleted_at` IS NULL
    ORDER BY `id` ASC
    LIMIT 1
  ) AS `canonical_booking_default`
);

-- CreateTable
CREATE TABLE `shop_platform_fee_policies` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `fee_enabled` BOOLEAN NOT NULL DEFAULT true,
  `payer_type` ENUM('SHOP', 'TECHNICIAN') NOT NULL DEFAULT 'SHOP',
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_platform_fee_policies_shop_id_key`(`shop_id`),
  INDEX `shop_platform_fee_policies_enabled_deleted_idx`(`fee_enabled`, `deleted_at`),
  INDEX `shop_platform_fee_policies_payer_deleted_idx`(`payer_type`, `deleted_at`),
  INDEX `shop_platform_fee_policies_created_by_idx`(`created_by_id`),
  INDEX `shop_platform_fee_policies_updated_by_idx`(`updated_by_id`),
  INDEX `shop_platform_fee_policies_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `platform_fee_rule_sets_family_version_key`
  ON `platform_fee_rule_sets`(`family_code`, `version`);

-- CreateIndex
CREATE INDEX `platform_fee_rule_sets_family_effective_idx`
  ON `platform_fee_rule_sets`(`family_code`, `status`, `effective_from`, `effective_to`);

-- AddForeignKey
ALTER TABLE `shop_platform_fee_policies`
  ADD CONSTRAINT `shop_platform_fee_policies_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_platform_fee_policies`
  ADD CONSTRAINT `shop_platform_fee_policies_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_platform_fee_policies`
  ADD CONSTRAINT `shop_platform_fee_policies_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
