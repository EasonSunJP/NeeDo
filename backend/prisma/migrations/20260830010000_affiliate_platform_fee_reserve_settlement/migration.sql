-- CreateTable
CREATE TABLE `affiliate_platform_fee_rules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scope_type` ENUM('global', 'shop') NOT NULL,
    `scope_key` VARCHAR(80) NOT NULL,
    `shop_id` INTEGER NULL,
    `fee_bps` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_to` DATETIME(3) NULL,
    `active_key` VARCHAR(80) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_platform_fee_rules_scope_shop_version_key`(`scope_type`, `shop_id`, `version`),
    UNIQUE INDEX `affiliate_platform_fee_rules_scope_key_version_key`(`scope_key`, `version`),
    UNIQUE INDEX `affiliate_platform_fee_rules_active_key_key`(`active_key`),
    INDEX `affiliate_platform_fee_rules_effective_idx`(`scope_type`, `shop_id`, `effective_from`, `effective_to`, `deleted_at`),
    INDEX `affiliate_platform_fee_rules_shop_id_idx`(`shop_id`),
    INDEX `affiliate_platform_fee_rules_created_by_id_idx`(`created_by_id`),
    INDEX `affiliate_platform_fee_rules_updated_by_id_idx`(`updated_by_id`),
    INDEX `affiliate_platform_fee_rules_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `affiliate_platform_fee_rules_fee_bps_check`
      CHECK (`fee_bps` BETWEEN 0 AND 10000),
    CONSTRAINT `affiliate_platform_fee_rules_version_check`
      CHECK (`version` > 0),
    CONSTRAINT `affiliate_platform_fee_rules_scope_check`
      CHECK (
        (`scope_type` = 'global' AND `shop_id` IS NULL AND `scope_key` = 'global')
        OR
        (`scope_type` = 'shop' AND `shop_id` IS NOT NULL AND `scope_key` = CONCAT('shop:', `shop_id`))
      ),
    CONSTRAINT `affiliate_platform_fee_rules_active_key_check`
      CHECK (`active_key` IS NULL OR `active_key` = `scope_key`),
    CONSTRAINT `affiliate_platform_fee_rules_effective_range_check`
      CHECK (`effective_to` IS NULL OR `effective_to` > `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `affiliate_platform_fee_rules`
  ADD CONSTRAINT `affiliate_platform_fee_rules_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_platform_fee_rules`
  ADD CONSTRAINT `affiliate_platform_fee_rules_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_platform_fee_rules`
  ADD CONSTRAINT `affiliate_platform_fee_rules_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the first immutable global Affiliate fee version at 10 percent.
INSERT INTO `affiliate_platform_fee_rules` (
  `scope_type`,
  `scope_key`,
  `shop_id`,
  `fee_bps`,
  `version`,
  `effective_from`,
  `effective_to`,
  `active_key`,
  `reason`,
  `created_by_id`,
  `updated_by_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES (
  'global',
  'global',
  NULL,
  1000,
  1,
  CURRENT_TIMESTAMP(3),
  NULL,
  'global',
  'Initial Affiliate platform fee policy',
  NULL,
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
);

-- AlterTable: store an immutable platform-fee snapshot on every submitted task.
ALTER TABLE `affiliate_tasks`
  ADD COLUMN `platform_fee_rule_id` INTEGER NULL,
  ADD COLUMN `platform_fee_bps` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `platform_fee_reserve_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `settled_platform_fee_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `released_platform_fee_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD INDEX `affiliate_tasks_platform_fee_rule_id_idx`(`platform_fee_rule_id`),
  ADD CONSTRAINT `affiliate_tasks_platform_fee_bps_check`
    CHECK (`platform_fee_bps` BETWEEN 0 AND 10000),
  ADD CONSTRAINT `affiliate_tasks_platform_fee_amounts_check`
    CHECK (
      `platform_fee_reserve_ndp` >= 0
      AND `settled_platform_fee_ndp` >= 0
      AND `released_platform_fee_ndp` >= 0
      AND `settled_platform_fee_ndp` + `released_platform_fee_ndp` <= `platform_fee_reserve_ndp`
    );

-- Existing tasks retain their historical commission-only behavior.
UPDATE `affiliate_tasks`
SET
  `platform_fee_bps` = 0,
  `platform_fee_reserve_ndp` = 0,
  `settled_platform_fee_ndp` = 0,
  `released_platform_fee_ndp` = 0
WHERE `platform_fee_rule_id` IS NULL;

-- AddForeignKey
ALTER TABLE `affiliate_tasks`
  ADD CONSTRAINT `affiliate_tasks_platform_fee_rule_id_fkey`
  FOREIGN KEY (`platform_fee_rule_id`) REFERENCES `affiliate_platform_fee_rules`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: total_frozen_ndp becomes the gross reserve while commission and fee remain independently auditable.
ALTER TABLE `affiliate_budget_reservations`
  ADD COLUMN `commission_frozen_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `platform_fee_frozen_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `platform_fee_captured_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `platform_fee_released_ndp` INTEGER NOT NULL DEFAULT 0;

-- Existing reservations are commission-only snapshots with no platform-fee reserve.
UPDATE `affiliate_budget_reservations`
SET
  `commission_frozen_ndp` = `total_frozen_ndp`,
  `platform_fee_frozen_ndp` = 0,
  `platform_fee_captured_ndp` = 0,
  `platform_fee_released_ndp` = 0;

ALTER TABLE `affiliate_budget_reservations`
  ADD CONSTRAINT `affiliate_budget_reservations_components_check`
    CHECK (`total_frozen_ndp` = `commission_frozen_ndp` + `platform_fee_frozen_ndp`),
  ADD CONSTRAINT `affiliate_budget_reservations_platform_fee_check`
    CHECK (
      `commission_frozen_ndp` >= 0
      AND `platform_fee_frozen_ndp` >= 0
      AND `platform_fee_captured_ndp` >= 0
      AND `platform_fee_released_ndp` >= 0
      AND `platform_fee_captured_ndp` + `platform_fee_released_ndp` <= `platform_fee_frozen_ndp`
    );

-- AlterTable: persist each reward's immutable platform allocation and destination wallet.
ALTER TABLE `affiliate_rewards`
  ADD COLUMN `platform_wallet_id` INTEGER NULL,
  ADD COLUMN `platform_fee_ndp` INTEGER NOT NULL DEFAULT 0,
  ADD INDEX `affiliate_rewards_platform_wallet_id_idx`(`platform_wallet_id`),
  ADD CONSTRAINT `affiliate_rewards_platform_fee_ndp_check`
    CHECK (`platform_fee_ndp` >= 0);

-- AddForeignKey
ALTER TABLE `affiliate_rewards`
  ADD CONSTRAINT `affiliate_rewards_platform_wallet_id_fkey`
  FOREIGN KEY (`platform_wallet_id`) REFERENCES `wallets`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the new protected routes deployable when migrations run without a complete seed.
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
  ('联盟营销抽成规则', 'page:backoffice-affiliate-fee-rule', 'page', 'backoffice-affiliate', '分页查看联盟营销平台抽成规则及历史版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('新建联盟营销抽成版本', 'button:backoffice-affiliate-fee-rule-create', 'button', 'backoffice-affiliate', '创建全局或店铺范围的联盟营销平台抽成规则版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Admin, operations, finance, and viewer may read fee-rule history.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
CROSS JOIN `permissions`
WHERE `roles`.`code` IN ('admin', 'operator', 'finance', 'viewer')
  AND `roles`.`deleted_at` IS NULL
  AND `permissions`.`code` = 'page:backoffice-affiliate-fee-rule'
  AND `permissions`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Only admin and finance may create a new immutable fee-rule version.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
CROSS JOIN `permissions`
WHERE `roles`.`code` IN ('admin', 'finance')
  AND `roles`.`deleted_at` IS NULL
  AND `permissions`.`code` = 'button:backoffice-affiliate-fee-rule-create'
  AND `permissions`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
