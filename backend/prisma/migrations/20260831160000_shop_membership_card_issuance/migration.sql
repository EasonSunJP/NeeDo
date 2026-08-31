-- Formal shop-membership card issuance. Existing legacy cards remain readable;
-- only cards created by the formal issuance API populate every snapshot field.
ALTER TABLE `shop_membership_cards`
  ADD COLUMN `plan_id` INTEGER NULL,
  ADD COLUMN `plan_version_id` INTEGER NULL,
  ADD COLUMN `issued_by_id` INTEGER NULL,
  ADD COLUMN `issuance_source` ENUM('offline_paid', 'historical_replacement', 'manual_grant') NULL,
  ADD COLUMN `issuance_reference` VARCHAR(160) NULL,
  ADD COLUMN `issuance_note` VARCHAR(500) NULL,
  ADD COLUMN `initial_principal_jpy` INTEGER NULL,
  ADD COLUMN `initial_uses` INTEGER NULL,
  ADD COLUMN `platform_fee_rate_bps_snapshot` INTEGER NULL,
  ADD COLUMN `issuance_idempotency_key` VARCHAR(160) NULL,
  ADD COLUMN `issuance_fingerprint` CHAR(64) NULL,
  ADD CONSTRAINT `shop_membership_cards_initial_principal_nonnegative`
    CHECK (`initial_principal_jpy` IS NULL OR `initial_principal_jpy` >= 0),
  ADD CONSTRAINT `shop_membership_cards_initial_uses_nonnegative`
    CHECK (`initial_uses` IS NULL OR `initial_uses` >= 0),
  ADD CONSTRAINT `shop_membership_cards_fee_snapshot_range`
    CHECK (`platform_fee_rate_bps_snapshot` IS NULL OR `platform_fee_rate_bps_snapshot` BETWEEN 0 AND 10000);

CREATE UNIQUE INDEX `shop_membership_cards_issuance_idempotency_key`
  ON `shop_membership_cards`(`issuance_idempotency_key`);
CREATE INDEX `shop_membership_cards_plan_idx`
  ON `shop_membership_cards`(`plan_id`, `deleted_at`);
CREATE INDEX `shop_membership_cards_plan_version_idx`
  ON `shop_membership_cards`(`plan_version_id`, `deleted_at`);
CREATE INDEX `shop_membership_cards_issued_by_idx`
  ON `shop_membership_cards`(`issued_by_id`);

ALTER TABLE `shop_membership_cards`
  ADD CONSTRAINT `shop_membership_cards_plan_id_fkey`
    FOREIGN KEY (`plan_id`) REFERENCES `shop_membership_card_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_cards_plan_version_id_fkey`
    FOREIGN KEY (`plan_version_id`) REFERENCES `shop_membership_card_plan_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_cards_issued_by_id_fkey`
    FOREIGN KEY (`issued_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '店铺会员卡开卡', 'shop.member.card.issue', 'api', 'shop-membership',
  '按当前店铺的已发布卡方案为有效会员正式开卡', TRUE,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'shop.member.card.issue'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
