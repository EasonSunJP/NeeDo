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
    'shop_membership_reward_settlement'
  ) NOT NULL;

CREATE TABLE `shop_membership_card_redemptions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `card_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `customer_user_id` INTEGER NOT NULL,
  `booking_order_id` INTEGER NOT NULL,
  `plan_version_id` INTEGER NOT NULL,
  `redeemed_by_id` INTEGER NOT NULL,
  `order_no_snapshot` VARCHAR(40) NOT NULL,
  `service_name_snapshot` VARCHAR(160) NOT NULL,
  `service_public_id` CHAR(36) NULL,
  `service_category_code` VARCHAR(80) NULL,
  `service_started_at` DATETIME(3) NOT NULL,
  `service_completed_at` DATETIME(3) NOT NULL,
  `eligible_amount_jpy` INTEGER NOT NULL,
  `consumed_principal_jpy` INTEGER NOT NULL DEFAULT 0,
  `consumed_uses` INTEGER NOT NULL DEFAULT 0,
  `principal_balance_before_jpy` INTEGER NULL,
  `principal_balance_after_jpy` INTEGER NULL,
  `remaining_uses_before` INTEGER NULL,
  `remaining_uses_after` INTEGER NULL,
  `card_lock_version_before` INTEGER NOT NULL,
  `reward_facts` JSON NOT NULL,
  `reward_hits` JSON NOT NULL,
  `raw_reward_ndp` INTEGER NOT NULL DEFAULT 0,
  `customer_reward_ndp` INTEGER NOT NULL DEFAULT 0,
  `platform_fee_rate_bps` INTEGER NOT NULL,
  `platform_fee_ndp` INTEGER NOT NULL DEFAULT 0,
  `total_shop_debit_ndp` INTEGER NOT NULL DEFAULT 0,
  `reward_capped` BOOLEAN NOT NULL DEFAULT FALSE,
  `reward_status` ENUM('none', 'pending_funds', 'paid', 'reversed') NOT NULL DEFAULT 'none',
  `outstanding_reward_ndp` INTEGER NOT NULL DEFAULT 0,
  `shop_wallet_id` INTEGER NULL,
  `customer_wallet_id` INTEGER NULL,
  `platform_wallet_id` INTEGER NULL,
  `ledger_transaction_id` INTEGER NULL,
  `status` ENUM('applied', 'refunded') NOT NULL DEFAULT 'applied',
  `redeemed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reward_settled_at` DATETIME(3) NULL,
  `refunded_at` DATETIME(3) NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `shop_membership_card_redemptions_eligible_amount_positive`
    CHECK (`eligible_amount_jpy` > 0),
  CONSTRAINT `shop_membership_card_redemptions_card_consumption_nonnegative`
    CHECK (`consumed_principal_jpy` >= 0 AND `consumed_uses` >= 0),
  CONSTRAINT `shop_membership_card_redemptions_card_consumption_mode`
    CHECK (
      (`consumed_principal_jpy` > 0 AND `consumed_uses` = 0
        AND `principal_balance_before_jpy` IS NOT NULL AND `principal_balance_after_jpy` IS NOT NULL
        AND `remaining_uses_before` IS NULL AND `remaining_uses_after` IS NULL)
      OR (`consumed_principal_jpy` = 0 AND `consumed_uses` = 1
        AND `principal_balance_before_jpy` IS NULL AND `principal_balance_after_jpy` IS NULL
        AND `remaining_uses_before` IS NOT NULL AND `remaining_uses_after` IS NOT NULL)
      OR (`consumed_principal_jpy` = 0 AND `consumed_uses` = 0
        AND `principal_balance_before_jpy` IS NULL AND `principal_balance_after_jpy` IS NULL
        AND `remaining_uses_before` IS NULL AND `remaining_uses_after` IS NULL)
    ),
  CONSTRAINT `shop_membership_card_redemptions_principal_conservation`
    CHECK (
      (`principal_balance_before_jpy` IS NULL AND `principal_balance_after_jpy` IS NULL)
      OR (`principal_balance_before_jpy` >= 0 AND `principal_balance_after_jpy` >= 0
        AND `principal_balance_after_jpy` = `principal_balance_before_jpy` - `consumed_principal_jpy`)
    ),
  CONSTRAINT `shop_membership_card_redemptions_uses_conservation`
    CHECK (
      (`remaining_uses_before` IS NULL AND `remaining_uses_after` IS NULL)
      OR (`remaining_uses_before` >= 1 AND `remaining_uses_after` >= 0
        AND `remaining_uses_after` = `remaining_uses_before` - `consumed_uses`)
    ),
  CONSTRAINT `shop_membership_card_redemptions_lock_version_positive`
    CHECK (`card_lock_version_before` > 0),
  CONSTRAINT `shop_membership_card_redemptions_reward_nonnegative`
    CHECK (
      `raw_reward_ndp` >= 0 AND `customer_reward_ndp` >= 0
      AND `platform_fee_rate_bps` >= 0 AND `platform_fee_rate_bps` <= 10000
      AND `platform_fee_ndp` >= 0 AND `total_shop_debit_ndp` >= 0
      AND `outstanding_reward_ndp` >= 0
    ),
  CONSTRAINT `shop_membership_card_redemptions_reward_conservation`
    CHECK (`total_shop_debit_ndp` = `customer_reward_ndp` + `platform_fee_ndp`),
  CONSTRAINT `shop_membership_card_redemptions_reward_state`
    CHECK (
      (`reward_status` = 'none' AND `total_shop_debit_ndp` = 0
        AND `outstanding_reward_ndp` = 0 AND `ledger_transaction_id` IS NULL
        AND `shop_wallet_id` IS NULL AND `customer_wallet_id` IS NULL
        AND `platform_wallet_id` IS NULL AND `reward_settled_at` IS NULL)
      OR (`reward_status` = 'pending_funds' AND `outstanding_reward_ndp` = `total_shop_debit_ndp`
        AND `total_shop_debit_ndp` > 0 AND `ledger_transaction_id` IS NULL
        AND `reward_settled_at` IS NULL)
      OR (`reward_status` = 'paid' AND `outstanding_reward_ndp` = 0 AND `ledger_transaction_id` IS NOT NULL
        AND `shop_wallet_id` IS NOT NULL AND `customer_wallet_id` IS NOT NULL
        AND `platform_wallet_id` IS NOT NULL AND `reward_settled_at` IS NOT NULL)
      OR (`reward_status` = 'reversed' AND `outstanding_reward_ndp` = 0
        AND `ledger_transaction_id` IS NOT NULL AND `reward_settled_at` IS NOT NULL)
    ),
  CONSTRAINT `shop_membership_card_redemptions_lifecycle_state`
    CHECK (
      (`status` = 'applied' AND `refunded_at` IS NULL)
      OR (`status` = 'refunded' AND `refunded_at` IS NOT NULL)
    )
);

CREATE UNIQUE INDEX `shop_membership_card_redemptions_public_id_key`
  ON `shop_membership_card_redemptions`(`public_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemptions_booking_order_id_key`
  ON `shop_membership_card_redemptions`(`booking_order_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemptions_ledger_transaction_id_key`
  ON `shop_membership_card_redemptions`(`ledger_transaction_id`);
CREATE UNIQUE INDEX `shop_membership_card_redemptions_idempotency_key`
  ON `shop_membership_card_redemptions`(`idempotency_key`);
CREATE INDEX `shop_membership_card_redemptions_card_redeemed_idx`
  ON `shop_membership_card_redemptions`(`card_id`, `redeemed_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemptions_shop_redeemed_idx`
  ON `shop_membership_card_redemptions`(`shop_id`, `redeemed_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemptions_customer_redeemed_idx`
  ON `shop_membership_card_redemptions`(`customer_user_id`, `redeemed_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemptions_plan_version_idx`
  ON `shop_membership_card_redemptions`(`plan_version_id`);
CREATE INDEX `shop_membership_card_redemptions_redeemed_by_idx`
  ON `shop_membership_card_redemptions`(`redeemed_by_id`);
CREATE INDEX `shop_membership_card_redemptions_reward_status_idx`
  ON `shop_membership_card_redemptions`(`reward_status`, `redeemed_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemptions_shop_wallet_idx`
  ON `shop_membership_card_redemptions`(`shop_wallet_id`);
CREATE INDEX `shop_membership_card_redemptions_customer_wallet_idx`
  ON `shop_membership_card_redemptions`(`customer_wallet_id`);
CREATE INDEX `shop_membership_card_redemptions_platform_wallet_idx`
  ON `shop_membership_card_redemptions`(`platform_wallet_id`);
CREATE INDEX `shop_membership_card_redemptions_status_idx`
  ON `shop_membership_card_redemptions`(`status`, `redeemed_at`, `deleted_at`);
CREATE INDEX `shop_membership_card_redemptions_deleted_idx`
  ON `shop_membership_card_redemptions`(`deleted_at`);

ALTER TABLE `shop_membership_card_redemptions`
  ADD CONSTRAINT `shop_membership_card_redemptions_card_id_fkey`
    FOREIGN KEY (`card_id`) REFERENCES `shop_membership_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_customer_user_id_fkey`
    FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_plan_version_id_fkey`
    FOREIGN KEY (`plan_version_id`) REFERENCES `shop_membership_card_plan_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_redeemed_by_id_fkey`
    FOREIGN KEY (`redeemed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_shop_wallet_id_fkey`
    FOREIGN KEY (`shop_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_customer_wallet_id_fkey`
    FOREIGN KEY (`customer_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_platform_wallet_id_fkey`
    FOREIGN KEY (`platform_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_redemptions_ledger_transaction_id_fkey`
    FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '店铺会员卡核销', 'shop.member.card.redeem', 'api', 'shop-membership',
  '用当前店铺有效会员卡核销同一客户已完成的正式订单并执行 NDP 返点', TRUE,
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
  ON `permissions`.`code` = 'shop.member.card.redeem'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
