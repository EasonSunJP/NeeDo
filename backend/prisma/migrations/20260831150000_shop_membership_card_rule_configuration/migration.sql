-- Add versioned operations policy for the fee charged on top of membership NDP rewards.
CREATE TABLE `membership_reward_fee_policy_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `fee_rate_bps` INTEGER NOT NULL,
  `status` ENUM('active', 'superseded') NOT NULL DEFAULT 'active',
  `effective_from` DATETIME(3) NOT NULL,
  `effective_to` DATETIME(3) NULL,
  `active_key` VARCHAR(80) NULL,
  `reason` VARCHAR(500) NOT NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `membership_reward_fee_rate_bps_chk` CHECK (`fee_rate_bps` BETWEEN 0 AND 10000),
  UNIQUE INDEX `membership_reward_fee_policy_versions_public_id_key`(`public_id`),
  UNIQUE INDEX `membership_reward_fee_policy_versions_version_key`(`version`),
  UNIQUE INDEX `membership_reward_fee_policy_versions_active_key_key`(`active_key`),
  INDEX `membership_reward_fee_policy_effective_idx`(`status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `membership_reward_fee_policy_created_by_idx`(`created_by_id`),
  INDEX `membership_reward_fee_policy_updated_by_idx`(`updated_by_id`),
  INDEX `membership_reward_fee_policy_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_membership_card_plans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `status` ENUM('draft', 'active', 'retired') NOT NULL DEFAULT 'draft',
  `current_version_id` INTEGER NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_membership_card_plans_public_id_key`(`public_id`),
  UNIQUE INDEX `shop_membership_card_plans_current_version_id_key`(`current_version_id`),
  INDEX `shop_membership_card_plans_shop_status_idx`(`shop_id`, `status`, `updated_at`, `deleted_at`),
  INDEX `shop_membership_card_plans_created_by_idx`(`created_by_id`),
  INDEX `shop_membership_card_plans_updated_by_idx`(`updated_by_id`),
  INDEX `shop_membership_card_plans_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_membership_card_plan_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `plan_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `status` ENUM('draft', 'published', 'retired') NOT NULL DEFAULT 'draft',
  `draft_key` VARCHAR(80) NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `card_type` ENUM('stored_value', 'count', 'benefit') NOT NULL,
  `validity_mode` ENUM('never', 'fixed_days', 'fixed_date') NOT NULL,
  `validity_days` INTEGER NULL,
  `fixed_expiry_at` DATETIME(3) NULL,
  `min_initial_principal_jpy` INTEGER NULL,
  `max_initial_principal_jpy` INTEGER NULL,
  `min_initial_uses` INTEGER NULL,
  `max_initial_uses` INTEGER NULL,
  `reward_caps` JSON NOT NULL,
  `platform_fee_policy_id` INTEGER NULL,
  `platform_fee_rate_bps` INTEGER NULL,
  `published_by_id` INTEGER NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `shop_membership_card_plan_versions_validity_days_chk` CHECK (`validity_days` IS NULL OR `validity_days` > 0),
  CONSTRAINT `shop_membership_card_plan_versions_principal_min_chk` CHECK (`min_initial_principal_jpy` IS NULL OR `min_initial_principal_jpy` >= 0),
  CONSTRAINT `shop_membership_card_plan_versions_principal_max_chk` CHECK (`max_initial_principal_jpy` IS NULL OR `max_initial_principal_jpy` >= 0),
  CONSTRAINT `shop_membership_card_plan_versions_principal_range_chk` CHECK (`min_initial_principal_jpy` IS NULL OR `max_initial_principal_jpy` IS NULL OR `min_initial_principal_jpy` <= `max_initial_principal_jpy`),
  CONSTRAINT `shop_membership_card_plan_versions_uses_min_chk` CHECK (`min_initial_uses` IS NULL OR `min_initial_uses` >= 0),
  CONSTRAINT `shop_membership_card_plan_versions_uses_max_chk` CHECK (`max_initial_uses` IS NULL OR `max_initial_uses` >= 0),
  CONSTRAINT `shop_membership_card_plan_versions_uses_range_chk` CHECK (`min_initial_uses` IS NULL OR `max_initial_uses` IS NULL OR `min_initial_uses` <= `max_initial_uses`),
  CONSTRAINT `shop_membership_card_plan_versions_fee_bps_chk` CHECK (`platform_fee_rate_bps` IS NULL OR `platform_fee_rate_bps` BETWEEN 0 AND 10000),
  UNIQUE INDEX `shop_membership_card_plan_versions_public_id_key`(`public_id`),
  UNIQUE INDEX `shop_membership_card_plan_versions_draft_key_key`(`draft_key`),
  UNIQUE INDEX `shop_membership_card_plan_versions_plan_version_key`(`plan_id`, `version`),
  INDEX `shop_membership_card_plan_versions_plan_status_idx`(`plan_id`, `status`, `updated_at`, `deleted_at`),
  INDEX `shop_membership_card_plan_versions_fee_policy_idx`(`platform_fee_policy_id`),
  INDEX `shop_membership_card_plan_versions_published_by_idx`(`published_by_id`),
  INDEX `shop_membership_card_plan_versions_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_membership_reward_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `plan_version_id` INTEGER NOT NULL,
  `kind` ENUM(
    'fixed_per_completion',
    'percent_of_eligible_amount',
    'spend_block',
    'first_card_use_bonus',
    'service_scope_bonus',
    'completion_milestone_bonus',
    'spend_milestone_bonus',
    'birthday_month_bonus',
    'schedule_window_bonus',
    'consecutive_month_bonus'
  ) NOT NULL,
  `rule_group` ENUM('base', 'bonus') NOT NULL,
  `config` JSON NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_membership_reward_rules_public_id_key`(`public_id`),
  INDEX `shop_membership_reward_rules_version_group_idx`(`plan_version_id`, `rule_group`, `sort_order`, `deleted_at`),
  INDEX `shop_membership_reward_rules_kind_idx`(`kind`, `deleted_at`),
  INDEX `shop_membership_reward_rules_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `membership_reward_fee_policy_versions`
  ADD CONSTRAINT `membership_reward_fee_policy_versions_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `membership_reward_fee_policy_versions_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shop_membership_card_plans`
  ADD CONSTRAINT `shop_membership_card_plans_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_plans_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_plans_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shop_membership_card_plan_versions`
  ADD CONSTRAINT `shop_membership_card_plan_versions_plan_id_fkey`
  FOREIGN KEY (`plan_id`) REFERENCES `shop_membership_card_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_plan_versions_fee_policy_id_fkey`
  FOREIGN KEY (`platform_fee_policy_id`) REFERENCES `membership_reward_fee_policy_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_membership_card_plan_versions_published_by_id_fkey`
  FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shop_membership_card_plans`
  ADD CONSTRAINT `shop_membership_card_plans_current_version_id_fkey`
  FOREIGN KEY (`current_version_id`) REFERENCES `shop_membership_card_plan_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shop_membership_reward_rules`
  ADD CONSTRAINT `shop_membership_reward_rules_plan_version_id_fkey`
  FOREIGN KEY (`plan_version_id`) REFERENCES `shop_membership_card_plan_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- The initial policy is an idempotent 10% fee charged in addition to the customer reward.
INSERT INTO `membership_reward_fee_policy_versions` (
  `public_id`, `version`, `fee_rate_bps`, `status`, `effective_from`, `effective_to`,
  `active_key`, `reason`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  UUID(), 1, 1000, 'active', CURRENT_TIMESTAMP(3), NULL,
  'membership_reward', 'Initial membership reward platform fee', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `membership_reward_fee_policy_versions`
  WHERE `deleted_at` IS NULL
);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('会员卡方案读取', 'shop.member.card_plan.view', 'api', 'shop-membership', '读取当前店铺的会员卡方案、版本和 NDP 返点规则', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('会员卡方案维护', 'shop.member.card_plan.manage', 'api', 'shop-membership', '创建和编辑当前店铺的会员卡方案草稿并进行成本试算', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('会员卡方案发布', 'shop.member.card_plan.publish', 'api', 'shop-membership', '发布或停用当前店铺的不可变会员卡方案版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('会员返点平台费读取', 'page:backoffice-membership-reward-fee', 'page', 'finance', '读取会员 NDP 返点平台费当前版本和历史', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('会员返点平台费版本创建', 'button:backoffice-membership-reward-fee-create', 'button', 'finance', '创建会员 NDP 返点平台费的不可变版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
JOIN `permissions` ON (
  (`roles`.`code` = 'admin' AND `permissions`.`code` IN (
    'shop.member.card_plan.view',
    'shop.member.card_plan.manage',
    'shop.member.card_plan.publish',
    'page:backoffice-membership-reward-fee',
    'button:backoffice-membership-reward-fee-create'
  ))
  OR (`roles`.`code` = 'merchant_owner' AND `permissions`.`code` IN (
    'shop.member.card_plan.view',
    'shop.member.card_plan.manage',
    'shop.member.card_plan.publish'
  ))
  OR (`roles`.`code` = 'merchant_staff' AND `permissions`.`code` = 'shop.member.card_plan.view')
  OR (`roles`.`code` = 'operator' AND `permissions`.`code` = 'page:backoffice-membership-reward-fee')
  OR (`roles`.`code` = 'finance' AND `permissions`.`code` IN (
    'page:backoffice-membership-reward-fee',
    'button:backoffice-membership-reward-fee-create'
  ))
)
AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
