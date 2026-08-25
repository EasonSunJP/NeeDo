-- Approved merchant applications transfer their verified bank account into
-- operational settlement data before application-only records are purged.
ALTER TABLE `merchant_accounts`
    ADD COLUMN `settlement_bank_account_id` INTEGER NULL;

CREATE INDEX `merchant_accounts_settlement_bank_account_id_idx`
    ON `merchant_accounts`(`settlement_bank_account_id`);

ALTER TABLE `merchant_accounts`
    ADD CONSTRAINT `merchant_accounts_settlement_bank_account_id_fkey`
    FOREIGN KEY (`settlement_bank_account_id`) REFERENCES `protected_bank_accounts`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
