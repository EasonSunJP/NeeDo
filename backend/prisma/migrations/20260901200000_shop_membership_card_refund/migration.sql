ALTER TABLE `ledger_transactions`
  MODIFY `type` ENUM(
    'booking_accept_freeze',
    'booking_cancel_unfreeze',
    'booking_complete_settlement',
    'booking_merchant_cancel_compensation',
    'manual_topup_approved',
    'manual_withdrawal_approved',
    'seed_credit',
    'affiliate_task_budget_freeze',
    'affiliate_task_budget_release',
    'affiliate_reward_settlement',
    'affiliate_reward_reversal',
    'affiliate_reward_recovery',
    'test_balance_calibration',
    'exchange_request_publication_freeze',
    'exchange_request_publication_capture',
    'exchange_request_publication_release',
    'shop_membership_reward_settlement',
    'shop_membership_reward_reversal'
  ) NOT NULL;

CREATE TABLE `shop_membership_card_redemption_refunds` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `redemption_id` INTEGER NOT NULL,
  `card_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `booking_order_id` INTEGER NOT NULL,
  `customer_user_id` INTEGER NOT NULL,
  `refunded_by_id` INTEGER NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `order_payment_refunded_at` DATETIME(3) NOT NULL,
  `order_payment_refund_reference` VARCHAR(120) NULL,
  `redemption_status_before` ENUM('applied', 'refunded') NOT NULL,
  `reward_status_before` ENUM('none', 'pending_funds', 'paid', 'reversed') NOT NULL,
  `restored_principal_jpy` INTEGER NOT NULL DEFAULT 0,
  `restored_uses` INTEGER NOT NULL DEFAULT 0,
  `principal_balance_before_jpy` INTEGER NULL,
  `principal_balance_after_jpy` INTEGER NULL,
  `remaining_uses_before` INTEGER NULL,
  `remaining_uses_after` INTEGER NULL,
  `card_lock_version_before` INTEGER NOT NULL,
  `reversal_mode` ENUM('none', 'cancelled_pending', 'ledger_reversed') NOT NULL,
  `customer_reward_reversed_ndp` INTEGER NOT NULL DEFAULT 0,
  `platform_fee_reversed_ndp` INTEGER NOT NULL DEFAULT 0,
  `total_shop_credit_ndp` INTEGER NOT NULL DEFAULT 0,
  `shop_wallet_id` INTEGER NULL,
  `customer_wallet_id` INTEGER NULL,
  `platform_wallet_id` INTEGER NULL,
  `customer_balance_before_ndp` INTEGER NULL,
  `customer_balance_after_ndp` INTEGER NULL,
  `reversal_ledger_transaction_id` INTEGER NULL,
  `status` ENUM('applied') NOT NULL DEFAULT 'applied',
  `refunded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `shop_membership_card_refunds_restoration_nonnegative`
    CHECK (`restored_principal_jpy` >= 0 AND `restored_uses` >= 0),
  CONSTRAINT `shop_membership_card_refunds_restoration_mode`
    CHECK (
      (`restored_principal_jpy` > 0 AND `restored_uses` = 0
        AND `principal_balance_before_jpy` IS NOT NULL AND `principal_balance_after_jpy` IS NOT NULL
        AND `principal_balance_after_jpy` = `principal_balance_before_jpy` + `restored_principal_jpy`
        AND `remaining_uses_before` IS NULL AND `remaining_uses_after` IS NULL)
      OR
      (`restored_principal_jpy` = 0 AND `restored_uses` > 0
        AND `remaining_uses_before` IS NOT NULL AND `remaining_uses_after` IS NOT NULL
        AND `remaining_uses_after` = `remaining_uses_before` + `restored_uses`
        AND `principal_balance_before_jpy` IS NULL AND `principal_balance_after_jpy` IS NULL)
      OR
      (`restored_principal_jpy` = 0 AND `restored_uses` = 0
        AND `principal_balance_before_jpy` IS NULL AND `principal_balance_after_jpy` IS NULL
        AND `remaining_uses_before` IS NULL AND `remaining_uses_after` IS NULL)
    ),
  CONSTRAINT `shop_membership_card_refunds_lock_version_positive`
    CHECK (`card_lock_version_before` > 0),
  CONSTRAINT `shop_membership_card_refunds_reward_nonnegative`
    CHECK (
      `customer_reward_reversed_ndp` >= 0
      AND `platform_fee_reversed_ndp` >= 0
      AND `total_shop_credit_ndp` >= 0
    ),
  CONSTRAINT `shop_membership_card_refunds_reward_conservation`
    CHECK (`total_shop_credit_ndp` = `customer_reward_reversed_ndp` + `platform_fee_reversed_ndp`),
  CONSTRAINT `shop_membership_card_refunds_reversal_state`
    CHECK (
      (`reversal_mode` = 'none' AND `reward_status_before` = 'none'
        AND `customer_reward_reversed_ndp` = 0 AND `platform_fee_reversed_ndp` = 0
        AND `total_shop_credit_ndp` = 0 AND `shop_wallet_id` IS NULL
        AND `customer_wallet_id` IS NULL AND `platform_wallet_id` IS NULL
        AND `customer_balance_before_ndp` IS NULL AND `customer_balance_after_ndp` IS NULL
        AND `reversal_ledger_transaction_id` IS NULL)
      OR
      (`reversal_mode` = 'cancelled_pending' AND `reward_status_before` = 'pending_funds'
        AND `customer_reward_reversed_ndp` = 0 AND `platform_fee_reversed_ndp` = 0
        AND `total_shop_credit_ndp` = 0 AND `shop_wallet_id` IS NULL
        AND `customer_wallet_id` IS NULL AND `platform_wallet_id` IS NULL
        AND `customer_balance_before_ndp` IS NULL AND `customer_balance_after_ndp` IS NULL
        AND `reversal_ledger_transaction_id` IS NULL)
      OR
      (`reversal_mode` = 'ledger_reversed' AND `reward_status_before` = 'paid'
        AND `customer_reward_reversed_ndp` > 0 AND `total_shop_credit_ndp` > 0
        AND `shop_wallet_id` IS NOT NULL AND `customer_wallet_id` IS NOT NULL
        AND `customer_balance_before_ndp` IS NOT NULL AND `customer_balance_after_ndp` IS NOT NULL
        AND `customer_balance_after_ndp` = `customer_balance_before_ndp` - `customer_reward_reversed_ndp`
        AND `reversal_ledger_transaction_id` IS NOT NULL
        AND ((`platform_fee_reversed_ndp` = 0 AND `platform_wallet_id` IS NULL)
          OR (`platform_fee_reversed_ndp` > 0 AND `platform_wallet_id` IS NOT NULL)))
    )
);

CREATE UNIQUE INDEX `shop_membership_card_redemption_refunds_public_id_key`
  ON `shop_membership_card_redemption_refunds`(`public_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemption_refunds_redemption_id_key`
  ON `shop_membership_card_redemption_refunds`(`redemption_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemption_refunds_booking_order_id_key`
  ON `shop_membership_card_redemption_refunds`(`booking_order_id`);
CREATE UNIQUE INDEX `shop_membership_card_refund_reversal_ledger_tx_key`
  ON `shop_membership_card_redemption_refunds`(`reversal_ledger_transaction_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemption_refunds_idempotency_key`
  ON `shop_membership_card_redemption_refunds`(`idempotency_key`);
CREATE INDEX `shop_membership_card_redemption_refunds_card_idx`
  ON `shop_membership_card_redemption_refunds`(`card_id`, `refunded_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemption_refunds_shop_idx`
  ON `shop_membership_card_redemption_refunds`(`shop_id`, `refunded_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemption_refunds_customer_idx`
  ON `shop_membership_card_redemption_refunds`(`customer_user_id`, `refunded_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemption_refunds_refunded_by_idx`
  ON `shop_membership_card_redemption_refunds`(`refunded_by_id`);
CREATE INDEX `shop_membership_card_redemption_refunds_shop_wallet_idx`
  ON `shop_membership_card_redemption_refunds`(`shop_wallet_id`);
CREATE INDEX `shop_membership_card_redemption_refunds_customer_wallet_idx`
  ON `shop_membership_card_redemption_refunds`(`customer_wallet_id`);
CREATE INDEX `shop_membership_card_redemption_refunds_platform_wallet_idx`
  ON `shop_membership_card_redemption_refunds`(`platform_wallet_id`);
CREATE INDEX `shop_membership_card_redemption_refunds_status_idx`
  ON `shop_membership_card_redemption_refunds`(`status`, `refunded_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemption_refunds_deleted_idx`
  ON `shop_membership_card_redemption_refunds`(`deleted_at`);

ALTER TABLE `shop_membership_card_redemption_refunds`
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_redemption_id_fkey`
    FOREIGN KEY (`redemption_id`) REFERENCES `shop_membership_card_redemptions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_card_id_fkey`
    FOREIGN KEY (`card_id`) REFERENCES `shop_membership_cards`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_customer_user_id_fkey`
    FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_refunded_by_id_fkey`
    FOREIGN KEY (`refunded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_shop_wallet_id_fkey`
    FOREIGN KEY (`shop_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_customer_wallet_id_fkey`
    FOREIGN KEY (`customer_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_redemption_refunds_platform_wallet_id_fkey`
    FOREIGN KEY (`platform_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_membership_card_refund_reversal_ledger_tx_fkey`
    FOREIGN KEY (`reversal_ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '店铺会员卡核销退款', 'shop.member.card.refund', 'api', 'shop-membership',
  '在正式订单退款后恢复会员卡核销并冲正已发放的客户返点和平台费', TRUE,
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
  ON `permissions`.`code` = 'shop.member.card.refund'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
