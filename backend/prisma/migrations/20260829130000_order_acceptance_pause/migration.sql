-- CreateTable
CREATE TABLE `order_acceptance_pauses` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `subject_type` ENUM('MERCHANT_ACCOUNT', 'SHOP') NOT NULL,
  `merchant_account_id` INTEGER NULL,
  `shop_id` INTEGER NULL,
  `authority_type` ENUM('OPERATIONS', 'MERCHANT', 'SHOP') NOT NULL,
  `status` ENUM('ACTIVE', 'RELEASED') NOT NULL DEFAULT 'ACTIVE',
  `reason_code` VARCHAR(80) NOT NULL,
  `reason_detail` VARCHAR(500) NOT NULL,
  `created_by_id` INTEGER NOT NULL,
  `released_by_id` INTEGER NULL,
  `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `released_at` DATETIME(3) NULL,
  `release_reason` VARCHAR(500) NULL,
  `active_key` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `order_acceptance_pauses_active_key_key`(`active_key`),
  INDEX `order_acceptance_pauses_subject_active_idx`(`subject_type`, `merchant_account_id`, `shop_id`, `status`, `deleted_at`),
  INDEX `order_acceptance_pauses_authority_active_idx`(`authority_type`, `status`, `deleted_at`),
  INDEX `order_acceptance_pauses_created_by_idx`(`created_by_id`),
  INDEX `order_acceptance_pauses_released_by_idx`(`released_by_id`),
  INDEX `order_acceptance_pauses_starts_at_idx`(`starts_at`),
  INDEX `order_acceptance_pauses_released_at_idx`(`released_at`),
  INDEX `order_acceptance_pauses_deleted_idx`(`deleted_at`),
  CONSTRAINT `order_acceptance_pauses_subject_shape_chk` CHECK (
    (`subject_type` = 'MERCHANT_ACCOUNT' AND `merchant_account_id` IS NOT NULL AND `shop_id` IS NULL)
    OR
    (`subject_type` = 'SHOP' AND `merchant_account_id` IS NULL AND `shop_id` IS NOT NULL)
  ),
  CONSTRAINT `order_acceptance_pauses_authority_shape_chk` CHECK (
    `authority_type` <> 'SHOP' OR `subject_type` = 'SHOP'
  ),
  CONSTRAINT `order_acceptance_pauses_release_shape_chk` CHECK (
    (
      `status` = 'ACTIVE'
      AND `active_key` IS NOT NULL
      AND `released_by_id` IS NULL
      AND `released_at` IS NULL
      AND `release_reason` IS NULL
    )
    OR
    (
      `status` = 'RELEASED'
      AND `active_key` IS NULL
      AND `released_by_id` IS NOT NULL
      AND `released_at` IS NOT NULL
      AND CHAR_LENGTH(TRIM(`release_reason`)) > 0
    )
  ),
  CONSTRAINT `order_acceptance_pauses_reason_chk` CHECK (
    CHAR_LENGTH(TRIM(`reason_code`)) > 0 AND CHAR_LENGTH(TRIM(`reason_detail`)) > 0
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_acceptance_pauses`
  ADD CONSTRAINT `order_acceptance_pauses_merchant_account_id_fkey`
  FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `order_acceptance_pauses`
  ADD CONSTRAINT `order_acceptance_pauses_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `order_acceptance_pauses`
  ADD CONSTRAINT `order_acceptance_pauses_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_acceptance_pauses`
  ADD CONSTRAINT `order_acceptance_pauses_released_by_id_fkey`
  FOREIGN KEY (`released_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Keep protected pause routes deployable when migrations run without the full seed.
INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('运营接单暂停读取', 'backoffice:order-acceptance-pause:read', 'api', 'backoffice', '分页读取集团和店铺接单暂停记录', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营接单暂停管理', 'backoffice:order-acceptance-pause:write', 'api', 'backoffice', '创建或解除集团和店铺接单暂停', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户接单暂停读取', 'merchant-admin:order-acceptance-pause:read', 'api', 'merchant-admin', '读取当前商户或店铺身份可见的接单暂停记录', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户接单暂停管理', 'merchant-admin:order-acceptance-pause:write', 'api', 'merchant-admin', '在当前商户或店铺身份范围内创建或解除接单暂停', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Admin and operator can control platform pauses. Merchant roles are still
-- constrained by the active identity and membership checks in the service/repository.
INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON (
    (`roles`.`code` IN ('admin', 'operator') AND `permissions`.`code` IN (
      'backoffice:order-acceptance-pause:read',
      'backoffice:order-acceptance-pause:write'
    ))
    OR
    (`roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff') AND `permissions`.`code` IN (
      'merchant-admin:order-acceptance-pause:read',
      'merchant-admin:order-acceptance-pause:write'
    ))
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
