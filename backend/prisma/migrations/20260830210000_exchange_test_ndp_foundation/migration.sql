ALTER TABLE `users`
  ADD COLUMN `is_test_account` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX `users_test_account_deleted_idx` (`is_test_account`, `deleted_at`);

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
    'test_balance_calibration'
  ) NOT NULL;

ALTER TABLE `finance_reconciliations`
  MODIFY `status` ENUM('pending', 'exported', 'test_only') NOT NULL DEFAULT 'pending';

ALTER TABLE `wallet_holds`
  ADD COLUMN `currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
  ADD INDEX `wallet_holds_currency_status_idx` (`currency`, `status`);

ALTER TABLE `order_financials`
  ADD COLUMN `ndp_currency` VARCHAR(10) NOT NULL DEFAULT 'NDP',
  ADD INDEX `order_financials_ndp_currency_created_idx` (`ndp_currency`, `created_at`);

UPDATE `users` SET `is_test_account` = TRUE;
UPDATE `wallets` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `ledger_transactions` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `finance_reconciliations`
SET `currency` = 'TEST_NDP', `status` = 'test_only'
WHERE `currency` = 'NDP';
UPDATE `wallet_holds` SET `currency` = 'TEST_NDP' WHERE `currency` = 'NDP';
UPDATE `order_financials` SET `ndp_currency` = 'TEST_NDP' WHERE `ndp_currency` = 'NDP';
