-- Formal post-issuance membership-card correction requests. Card values remain
-- unchanged until the owning customer approves an unexpired current snapshot.
ALTER TABLE `shop_membership_cards`
  ADD COLUMN `lock_version` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `shop_membership_card_adjustment_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `card_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `requested_by_id` INTEGER NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired', 'invalidated') NOT NULL DEFAULT 'pending',
  `pending_key` VARCHAR(191) NULL,
  `reason` VARCHAR(500) NOT NULL,
  `before_principal_balance_jpy` INTEGER NULL,
  `target_principal_balance_jpy` INTEGER NULL,
  `before_remaining_uses` INTEGER NULL,
  `target_remaining_uses` INTEGER NULL,
  `card_lock_version_before` INTEGER NOT NULL,
  `request_idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `decision_idempotency_key` VARCHAR(160) NULL,
  `decision_fingerprint` CHAR(64) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `decided_at` DATETIME(3) NULL,
  `decided_by_id` INTEGER NULL,
  `cancelled_at` DATETIME(3) NULL,
  `cancelled_by_id` INTEGER NULL,
  `invalidated_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `shop_membership_card_adjustments_values_nonnegative`
    CHECK (
      (`before_principal_balance_jpy` IS NULL OR `before_principal_balance_jpy` >= 0)
      AND (`target_principal_balance_jpy` IS NULL OR `target_principal_balance_jpy` >= 0)
      AND (`before_remaining_uses` IS NULL OR `before_remaining_uses` >= 0)
      AND (`target_remaining_uses` IS NULL OR `target_remaining_uses` >= 0)
    ),
  CONSTRAINT `shop_membership_card_adjustments_value_pair`
    CHECK (
      (`before_principal_balance_jpy` IS NOT NULL AND `target_principal_balance_jpy` IS NOT NULL AND `before_remaining_uses` IS NULL AND `target_remaining_uses` IS NULL)
      OR
      (`before_principal_balance_jpy` IS NULL AND `target_principal_balance_jpy` IS NULL AND `before_remaining_uses` IS NOT NULL AND `target_remaining_uses` IS NOT NULL)
    )
);

CREATE UNIQUE INDEX `shop_membership_card_adjustments_public_id_key`
  ON `shop_membership_card_adjustment_requests`(`public_id`);
CREATE UNIQUE INDEX `shop_membership_card_adjustments_pending_key`
  ON `shop_membership_card_adjustment_requests`(`pending_key`);
CREATE UNIQUE INDEX `shop_membership_card_adjustments_request_idempotency_key`
  ON `shop_membership_card_adjustment_requests`(`request_idempotency_key`);
CREATE UNIQUE INDEX `shop_membership_card_adjustments_decision_idempotency_key`
  ON `shop_membership_card_adjustment_requests`(`decision_idempotency_key`);
CREATE INDEX `shop_membership_card_adjustments_card_status_idx`
  ON `shop_membership_card_adjustment_requests`(`card_id`, `status`, `created_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_adjustments_shop_status_idx`
  ON `shop_membership_card_adjustment_requests`(`shop_id`, `status`, `created_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_adjustments_status_expiry_idx`
  ON `shop_membership_card_adjustment_requests`(`status`, `expires_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_adjustments_requested_by_idx`
  ON `shop_membership_card_adjustment_requests`(`requested_by_id`);
CREATE INDEX `shop_membership_card_adjustments_decided_by_idx`
  ON `shop_membership_card_adjustment_requests`(`decided_by_id`);
CREATE INDEX `shop_membership_card_adjustments_cancelled_by_idx`
  ON `shop_membership_card_adjustment_requests`(`cancelled_by_id`);
CREATE INDEX `shop_membership_card_adjustments_deleted_idx`
  ON `shop_membership_card_adjustment_requests`(`deleted_at`);

ALTER TABLE `shop_membership_card_adjustment_requests`
  ADD CONSTRAINT `shop_membership_card_adjustments_card_id_fkey`
    FOREIGN KEY (`card_id`) REFERENCES `shop_membership_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_adjustments_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_adjustments_requested_by_id_fkey`
    FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_adjustments_decided_by_id_fkey`
    FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_adjustments_cancelled_by_id_fkey`
    FOREIGN KEY (`cancelled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '店铺会员卡调整申请', 'shop.member.card.adjust.request', 'api', 'shop-membership',
  '为当前店铺会员卡提交需要客户确认的本金或次数调整申请', TRUE,
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
  ON `permissions`.`code` = 'shop.member.card.adjust.request'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
