-- CreateTable
CREATE TABLE `wallets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_type` ENUM('user', 'shop', 'platform') NOT NULL,
    `owner_id` INTEGER NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
    `available_balance` INTEGER NOT NULL DEFAULT 0,
    `frozen_balance` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `wallets_owner_type_owner_id_currency_key`(`owner_type`, `owner_id`, `currency`),
    INDEX `wallets_owner_type_owner_id_idx`(`owner_type`, `owner_id`),
    INDEX `wallets_currency_idx`(`currency`),
    INDEX `wallets_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledger_transactions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_no` VARCHAR(40) NOT NULL,
    `idempotency_key` VARCHAR(160) NOT NULL,
    `type` ENUM('booking_accept_freeze', 'booking_cancel_unfreeze', 'booking_complete_settlement', 'booking_merchant_cancel_compensation', 'seed_credit') NOT NULL,
    `status` ENUM('applied') NOT NULL DEFAULT 'applied',
    `reference_type` VARCHAR(80) NOT NULL,
    `reference_id` INTEGER NOT NULL,
    `actor_user_id` INTEGER NULL,
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `ledger_transactions_transaction_no_key`(`transaction_no`),
    UNIQUE INDEX `ledger_transactions_idempotency_key_key`(`idempotency_key`),
    INDEX `ledger_transactions_type_idx`(`type`),
    INDEX `ledger_transactions_status_idx`(`status`),
    INDEX `ledger_transactions_reference_type_reference_id_idx`(`reference_type`, `reference_id`),
    INDEX `ledger_transactions_actor_user_id_idx`(`actor_user_id`),
    INDEX `ledger_transactions_created_at_idx`(`created_at`),
    INDEX `ledger_transactions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_ledgers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `wallet_id` INTEGER NOT NULL,
    `transaction_id` INTEGER NOT NULL,
    `direction` ENUM('available_credit', 'available_debit', 'freeze', 'unfreeze', 'frozen_debit') NOT NULL,
    `amount` INTEGER NOT NULL,
    `available_delta` INTEGER NOT NULL,
    `frozen_delta` INTEGER NOT NULL,
    `available_balance_after` INTEGER NOT NULL,
    `frozen_balance_after` INTEGER NOT NULL,
    `reason` VARCHAR(160) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `wallet_ledgers_wallet_id_idx`(`wallet_id`),
    INDEX `wallet_ledgers_transaction_id_idx`(`transaction_id`),
    INDEX `wallet_ledgers_direction_idx`(`direction`),
    INDEX `wallet_ledgers_created_at_idx`(`created_at`),
    INDEX `wallet_ledgers_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_reconciliations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transaction_id` INTEGER NOT NULL,
    `reference_type` VARCHAR(80) NOT NULL,
    `reference_id` INTEGER NOT NULL,
    `status` ENUM('pending', 'exported') NOT NULL DEFAULT 'pending',
    `currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
    `expected_amount` INTEGER NOT NULL,
    `actual_amount` INTEGER NOT NULL,
    `difference_amount` INTEGER NOT NULL DEFAULT 0,
    `exported_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `finance_reconciliations_transaction_id_key`(`transaction_id`),
    INDEX `finance_reconciliations_reference_type_reference_id_idx`(`reference_type`, `reference_id`),
    INDEX `finance_reconciliations_status_idx`(`status`),
    INDEX `finance_reconciliations_created_at_idx`(`created_at`),
    INDEX `finance_reconciliations_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ledger_transactions` ADD CONSTRAINT `ledger_transactions_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledgers` ADD CONSTRAINT `wallet_ledgers_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet_ledgers` ADD CONSTRAINT `wallet_ledgers_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_reconciliations` ADD CONSTRAINT `finance_reconciliations_transaction_id_fkey` FOREIGN KEY (`transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
