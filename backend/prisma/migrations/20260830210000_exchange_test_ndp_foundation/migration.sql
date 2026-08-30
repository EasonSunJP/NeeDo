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

INSERT INTO `permissions` (
  `name`,
  `code`,
  `type`,
  `module`,
  `description`,
  `is_system`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES
  (
    '更新测试账号分类',
    'user:test-account:update',
    'api',
    'user',
    '切换测试账号分类并审计双币种资金边界',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  ),
  (
    '测试账号分类按钮',
    'button:user:test-account:update',
    'button',
    'user',
    '显示测试账号分类操作',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  )
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  roles.id,
  permissions.id,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON permissions.code IN (
    'user:test-account:update',
    'button:user:test-account:update'
  )
  AND permissions.deleted_at IS NULL
WHERE roles.code IN ('admin', 'operator')
  AND roles.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
