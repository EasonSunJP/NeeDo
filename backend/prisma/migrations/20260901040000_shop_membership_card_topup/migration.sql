-- Formal stored-value membership-card top-ups recorded after confirmed offline
-- payment. This table is a card-value journal and does not touch NDP wallets.
CREATE TABLE `shop_membership_card_topups` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `card_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `created_by_id` INTEGER NOT NULL,
  `amount_jpy` INTEGER NOT NULL,
  `payment_method` ENUM('cash', 'card', 'paypay', 'bank_transfer', 'other') NOT NULL,
  `payment_reference` VARCHAR(160) NULL,
  `note` VARCHAR(500) NULL,
  `principal_balance_before_jpy` INTEGER NOT NULL,
  `principal_balance_after_jpy` INTEGER NOT NULL,
  `card_lock_version_before` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `shop_membership_card_topups_amount_positive`
    CHECK (`amount_jpy` > 0),
  CONSTRAINT `shop_membership_card_topups_snapshot_nonnegative`
    CHECK (`principal_balance_before_jpy` >= 0 AND `principal_balance_after_jpy` >= 0),
  CONSTRAINT `shop_membership_card_topups_balance_conservation`
    CHECK (`principal_balance_after_jpy` = `principal_balance_before_jpy` + `amount_jpy`),
  CONSTRAINT `shop_membership_card_topups_lock_version_positive`
    CHECK (`card_lock_version_before` > 0)
);

CREATE UNIQUE INDEX `shop_membership_card_topups_public_id_key`
  ON `shop_membership_card_topups`(`public_id`);
CREATE UNIQUE INDEX `shop_membership_card_topups_idempotency_key`
  ON `shop_membership_card_topups`(`idempotency_key`);
CREATE INDEX `shop_membership_card_topups_card_created_idx`
  ON `shop_membership_card_topups`(`card_id`, `created_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_topups_shop_created_idx`
  ON `shop_membership_card_topups`(`shop_id`, `created_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_topups_created_by_idx`
  ON `shop_membership_card_topups`(`created_by_id`);
CREATE INDEX `shop_membership_card_topups_deleted_idx`
  ON `shop_membership_card_topups`(`deleted_at`);

ALTER TABLE `shop_membership_card_topups`
  ADD CONSTRAINT `shop_membership_card_topups_card_id_fkey`
    FOREIGN KEY (`card_id`) REFERENCES `shop_membership_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_topups_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_topups_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '店铺会员卡充值', 'shop.member.card.topup.create', 'api', 'shop-membership',
  '为当前店铺有效储值会员卡登记已确认的线下充值', TRUE,
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
  ON `permissions`.`code` = 'shop.member.card.topup.create'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
