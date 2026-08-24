ALTER TABLE `ledger_transactions`
  MODIFY COLUMN `type` ENUM(
    'booking_accept_freeze',
    'booking_cancel_unfreeze',
    'booking_complete_settlement',
    'booking_merchant_cancel_compensation',
    'manual_topup_approved',
    'manual_withdrawal_approved',
    'seed_credit'
  ) NOT NULL;

CREATE TABLE `wallet_adjustment_requests` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `type` ENUM('topup', 'withdrawal') NOT NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `owner_type` ENUM('user', 'shop', 'platform') NOT NULL,
  `owner_id` INTEGER NOT NULL,
  `wallet_id` INTEGER NOT NULL,
  `amount_ndp` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `bank_reference` VARCHAR(120) NULL,
  `note` VARCHAR(500) NULL,
  `requested_by_id` INTEGER NOT NULL,
  `reviewed_by_id` INTEGER NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` VARCHAR(500) NULL,
  `ledger_transaction_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `wallet_adjustment_requests_idempotency_key_key`(`idempotency_key`),
  UNIQUE INDEX `wallet_adjustment_requests_ledger_transaction_id_key`(`ledger_transaction_id`),
  INDEX `wallet_adjustment_requests_owner_type_owner_id_idx`(`owner_type`, `owner_id`),
  INDEX `wallet_adjustment_requests_wallet_id_idx`(`wallet_id`),
  INDEX `wallet_adjustment_requests_type_idx`(`type`),
  INDEX `wallet_adjustment_requests_status_idx`(`status`),
  INDEX `wallet_adjustment_requests_requested_by_id_idx`(`requested_by_id`),
  INDEX `wallet_adjustment_requests_reviewed_by_id_idx`(`reviewed_by_id`),
  INDEX `wallet_adjustment_requests_created_at_idx`(`created_at`),
  INDEX `wallet_adjustment_requests_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `wallet_adjustment_requests`
  ADD CONSTRAINT `wallet_adjustment_requests_wallet_id_fkey`
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `wallet_adjustment_requests_requested_by_id_fkey`
    FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `wallet_adjustment_requests_reviewed_by_id_fkey`
    FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `wallet_adjustment_requests_ledger_transaction_id_fkey`
    FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
