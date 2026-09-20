-- Persist service prepayment separately from platform and dispatch fees.
UPDATE `technician_automation_settings`
SET `rules` = JSON_SET(`rules`, '$.minimumPrepaymentPercent', 0)
WHERE JSON_EXTRACT(`rules`, '$.minimumPrepaymentPercent') IS NULL;

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
    'shop_membership_reward_reversal',
    'service_consumption_settlement',
    'product_consumption_settlement',
    'platform_membership_purchase',
    'booking_consumption_refund',
    'service_consumption_refund',
    'product_consumption_refund',
    'service_prepayment_freeze',
    'service_prepayment_capture',
    'service_prepayment_release'
  ) NOT NULL;

ALTER TABLE `wallet_holds`
  DROP INDEX `wallet_holds_exchange_post_id_key`,
  ADD INDEX `wallet_holds_exchange_post_id_idx` (`exchange_post_id`);

CREATE TABLE `service_prepayments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NULL,
  `exchange_post_id` INTEGER NULL,
  `base_amount_jpy` INTEGER NOT NULL,
  `percent` INTEGER NOT NULL,
  `amount_jpy` INTEGER NOT NULL,
  `confirmed_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
  `payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NOT NULL,
  `status` ENUM('pending', 'confirmed', 'captured', 'released', 'refund_pending', 'refunded') NOT NULL DEFAULT 'pending',
  `wallet_hold_id` INTEGER NULL,
  `external_reference` VARCHAR(191) NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_by_identity_id` INTEGER NOT NULL,
  `confirmed_at` DATETIME(3) NULL,
  `captured_at` DATETIME(3) NULL,
  `released_at` DATETIME(3) NULL,
  `refund_pending_at` DATETIME(3) NULL,
  `refunded_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `service_prepayments_booking_order_key` (`booking_order_id`),
  UNIQUE INDEX `service_prepayments_exchange_post_key` (`exchange_post_id`),
  UNIQUE INDEX `service_prepayments_wallet_hold_key` (`wallet_hold_id`),
  UNIQUE INDEX `service_prepayments_idempotency_key` (`idempotency_key`),
  INDEX `service_prepayments_creator_created_idx` (`created_by_identity_id`, `created_at`),
  INDEX `service_prepayments_status_created_idx` (`status`, `created_at`),
  INDEX `service_prepayments_deleted_idx` (`deleted_at`),
  CONSTRAINT `service_prepayments_exactly_one_subject` CHECK ((`booking_order_id` IS NULL) <> (`exchange_post_id` IS NULL)),
  CONSTRAINT `service_prepayments_percent_check` CHECK (`percent` = 0 OR `percent` BETWEEN 10 AND 100),
  CONSTRAINT `service_prepayments_amount_check` CHECK (`base_amount_jpy` >= 0 AND `amount_jpy` >= 0 AND `confirmed_amount_jpy` >= 0 AND `confirmed_amount_jpy` <= `amount_jpy`),
  CONSTRAINT `service_prepayments_booking_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `service_prepayments_exchange_post_fkey` FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `service_prepayments_wallet_hold_fkey` FOREIGN KEY (`wallet_hold_id`) REFERENCES `wallet_holds` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `service_prepayments_creator_identity_fkey` FOREIGN KEY (`created_by_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `service_prepayment_allocations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `source_prepayment_id` INTEGER NOT NULL,
  `booking_prepayment_id` INTEGER NOT NULL,
  `exchange_match_participant_id` INTEGER NOT NULL,
  `amount_jpy` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `service_prepayment_allocations_booking_key` (`booking_prepayment_id`),
  UNIQUE INDEX `service_prepayment_allocations_participant_key` (`exchange_match_participant_id`),
  UNIQUE INDEX `service_prepayment_allocations_idempotency_key` (`idempotency_key`),
  INDEX `service_prepayment_allocations_source_idx` (`source_prepayment_id`),
  INDEX `service_prepayment_allocations_deleted_idx` (`deleted_at`),
  CONSTRAINT `service_prepayment_allocations_amount_check` CHECK (`amount_jpy` > 0),
  CONSTRAINT `service_prepayment_allocations_source_fkey` FOREIGN KEY (`source_prepayment_id`) REFERENCES `service_prepayments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `service_prepayment_allocations_booking_fkey` FOREIGN KEY (`booking_prepayment_id`) REFERENCES `service_prepayments` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `service_prepayment_allocations_participant_fkey` FOREIGN KEY (`exchange_match_participant_id`) REFERENCES `exchange_match_participants` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
