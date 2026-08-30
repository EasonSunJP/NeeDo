-- Formal Exchange Request publication contract and publication-fee snapshot.
-- This migration is additive: legacy Exchange rows are retained and backfilled.

-- Extend the existing ledger vocabulary for Request publication lifecycle events.
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
    'exchange_request_publication_release'
  ) NOT NULL;

-- The fingerprint makes retried Request publication payloads comparable without
-- weakening the existing unique idempotency-key contract.
ALTER TABLE `exchange_posts`
  ADD COLUMN `payload_fingerprint` CHAR(64) NULL;

-- Expand the persisted Request contract. Address line 1 is staged as nullable so
-- existing formal rows can be preserved and backfilled before it becomes required.
ALTER TABLE `exchange_demands`
  MODIFY `budget_min_jpy` INTEGER NULL,
  ADD COLUMN `target_provider_count` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `target_provider_limit_snapshot` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `publisher_capacity_source` ENUM('customer_membership', 'shop_merchant') NOT NULL DEFAULT 'customer_membership',
  ADD COLUMN `membership_level_snapshot` VARCHAR(50) NULL,
  ADD COLUMN `match_mode` ENUM('quick', 'selective') NOT NULL DEFAULT 'quick',
  ADD COLUMN `budget_mode` ENUM('total', 'per_provider') NOT NULL DEFAULT 'total',
  ADD COLUMN `address_line_1` VARCHAR(255) NULL,
  ADD COLUMN `address_line_2` VARCHAR(255) NULL,
  ADD COLUMN `address_line_3` VARCHAR(255) NULL,
  ADD COLUMN `address_line_2_public` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `address_line_3_public` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `publisher_identity_public` BOOLEAN NOT NULL DEFAULT false;

UPDATE `exchange_demands` AS `demand`
JOIN `exchange_posts` AS `post` ON `post`.`id` = `demand`.`post_id`
SET
  `demand`.`address_line_1` = `post`.`area_label`,
  `demand`.`membership_level_snapshot` = 'standard'
WHERE `demand`.`address_line_1` IS NULL;

ALTER TABLE `exchange_demands`
  MODIFY `address_line_1` VARCHAR(255) NOT NULL,
  DROP CHECK `exchange_demands_budget_check`,
  ADD CONSTRAINT `exchange_demands_budget_check`
    CHECK (
      `budget_max_jpy` >= 0
      AND (`budget_min_jpy` IS NULL OR (`budget_min_jpy` >= 0 AND `budget_max_jpy` >= `budget_min_jpy`))
    ),
  ADD CONSTRAINT `exchange_demands_target_provider_count_check`
    CHECK (
      `target_provider_count` BETWEEN 1 AND 20
      AND `target_provider_limit_snapshot` BETWEEN 1 AND 20
      AND `target_provider_count` <= `target_provider_limit_snapshot`
    );

-- Reuse the established fee-calculation and wallet-hold infrastructure. Each
-- hold belongs to exactly one Booking order or one Exchange Request post.
ALTER TABLE `fee_calculation_logs`
  ADD COLUMN `exchange_post_id` INTEGER NULL,
  ADD INDEX `fee_calculation_logs_exchange_post_id_idx` (`exchange_post_id`),
  ADD CONSTRAINT `fee_calculation_logs_exchange_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `wallet_holds`
  MODIFY `booking_order_id` INTEGER NULL,
  ADD COLUMN `exchange_post_id` INTEGER NULL,
  ADD UNIQUE INDEX `wallet_holds_exchange_post_id_key` (`exchange_post_id`),
  ADD CONSTRAINT `wallet_holds_exactly_one_business_ref`
    CHECK ((`booking_order_id` IS NULL) <> (`exchange_post_id` IS NULL)),
  ADD CONSTRAINT `wallet_holds_exchange_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable rule/version/log/hold references keep each Request publication fee
-- reproducible even after operations changes the active global rule.
CREATE TABLE `exchange_request_financials` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `exchange_post_id` INTEGER NOT NULL,
  `payer_type` VARCHAR(20) NOT NULL,
  `payer_id` INTEGER NOT NULL,
  `wallet_owner_type` ENUM('user', 'shop', 'platform', 'merchant_account', 'alliance') NOT NULL,
  `wallet_owner_id` INTEGER NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `fee_rule_set_id` INTEGER NOT NULL,
  `fee_rule_set_version` INTEGER NOT NULL,
  `fee_rule_id` INTEGER NOT NULL,
  `fee_calculation_log_id` INTEGER NOT NULL,
  `wallet_hold_id` INTEGER NOT NULL,
  `amount_ndp` INTEGER NOT NULL,
  `state` ENUM('held', 'captured', 'released') NOT NULL DEFAULT 'held',
  `captured_at` DATETIME(3) NULL,
  `released_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `exchange_request_financials_exchange_post_id_key` (`exchange_post_id`),
  UNIQUE INDEX `exchange_request_financials_fee_calculation_log_id_key` (`fee_calculation_log_id`),
  UNIQUE INDEX `exchange_request_financials_wallet_hold_id_key` (`wallet_hold_id`),
  INDEX `exchange_request_financials_payer_type_payer_id_idx` (`payer_type`, `payer_id`),
  INDEX `exchange_request_financials_wallet_owner_type_wallet_owner_id_idx` (`wallet_owner_type`, `wallet_owner_id`),
  INDEX `exchange_request_financials_fee_rule_set_id_idx` (`fee_rule_set_id`),
  INDEX `exchange_request_financials_fee_rule_id_idx` (`fee_rule_id`),
  INDEX `exchange_request_financials_state_idx` (`state`),
  INDEX `exchange_request_financials_deleted_at_idx` (`deleted_at`),
  CONSTRAINT `exchange_request_financials_amount_check` CHECK (`amount_ndp` >= 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `exchange_request_financials`
  ADD CONSTRAINT `exchange_request_financials_exchange_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `exchange_request_financials_fee_rule_set_id_fkey`
    FOREIGN KEY (`fee_rule_set_id`) REFERENCES `platform_fee_rule_sets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `exchange_request_financials_fee_rule_id_fkey`
    FOREIGN KEY (`fee_rule_id`) REFERENCES `platform_fee_rules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `exchange_request_financials_fee_calculation_log_id_fkey`
    FOREIGN KEY (`fee_calculation_log_id`) REFERENCES `fee_calculation_logs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `exchange_request_financials_wallet_hold_id_fkey`
    FOREIGN KEY (`wallet_hold_id`) REFERENCES `wallet_holds`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial global Request publication fee. Operations may publish later versions;
-- publication always locks the selected version and amount into the snapshot above.
INSERT INTO `platform_fee_rule_sets` (
  `name`,
  `description`,
  `scope_type`,
  `family_code`,
  `priority`,
  `status`,
  `version`,
  `effective_from`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES (
  'Exchange Request Publication Fee',
  'Global NDP fee frozen when a formal Exchange Request is published',
  'platform',
  'exchange_request_publication',
  100,
  'active',
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `scope_type` = VALUES(`scope_type`),
  `priority` = VALUES(`priority`),
  `status` = VALUES(`status`),
  `effective_from` = COALESCE(`effective_from`, VALUES(`effective_from`)),
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `platform_fee_rules` (
  `rule_set_id`,
  `fee_type`,
  `order_type`,
  `payer_type`,
  `base_amount_ndp`,
  `calculation_mode`,
  `hold_strategy`,
  `pricing_lock_mode`,
  `stacking_mode`,
  `priority`,
  `status`,
  `effective_from`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `rule_set`.`id`,
  'exchange_request_publication_fee',
  'exchange_request',
  'publisher', 1000, 'fixed',
  'exact_estimate',
  'lock_at_publish',
  'sum',
  100,
  'active',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `platform_fee_rule_sets` AS `rule_set`
WHERE `rule_set`.`family_code` = 'exchange_request_publication'
  AND `rule_set`.`version` = 1
  AND `rule_set`.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `platform_fee_rules` AS `existing_rule`
    WHERE `existing_rule`.`rule_set_id` = `rule_set`.`id`
      AND `existing_rule`.`fee_type` = 'exchange_request_publication_fee'
      AND `existing_rule`.`deleted_at` IS NULL
  );

-- Backoffice permissions for the global rule. Request publication remains a
-- normal Exchange permission and is extended only to shop merchant owners.
INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('查看需求发布费', 'backoffice:exchange-request-fee:read', 'api', 'finance', '查看正式需求发布费规则与版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('管理需求发布费', 'backoffice:exchange-request-fee:write', 'api', 'finance', '发布正式需求发布费的新版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'exchange:posts:create-demand'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'backoffice:exchange-request-fee:read'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator', 'finance', 'viewer')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'backoffice:exchange-request-fee:write'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'finance')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
