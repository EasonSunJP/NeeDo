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
    'test_ndp_manual_credit',
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

INSERT INTO `permissions` (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  ('Test NDP 人工入账', 'backoffice:test-ndp:credit', 'api', 'finance', '向合格测试账号人工入账 Test NDP', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('创建正式 NDP 入账申请', 'backoffice:wallet-adjustment:create', 'api', 'finance', '为指定用户创建待复核的正式 NDP 入账申请', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `type` = VALUES(`type`), `module` = VALUES(`module`),
  `description` = VALUES(`description`), `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` IN ('backoffice:test-ndp:credit', 'backoffice:wallet-adjustment:create') AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'finance') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

UPDATE `role_permissions`
JOIN `roles` ON `roles`.`id` = `role_permissions`.`role_id` AND `roles`.`deleted_at` IS NULL
JOIN `permissions` ON `permissions`.`id` = `role_permissions`.`permission_id` AND `permissions`.`deleted_at` IS NULL
SET `role_permissions`.`updated_at` = CURRENT_TIMESTAMP(3),
    `role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)
WHERE `roles`.`code` = 'operator'
  AND `permissions`.`code` IN ('user:test-account:update', 'button:user:test-account:update')
  AND `role_permissions`.`deleted_at` IS NULL;
