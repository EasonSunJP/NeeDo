CREATE TABLE `platform_membership_tiers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `code` ENUM('free', 'silver', 'gold', 'black_diamond') NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `platform_membership_tiers_sort_order_chk`
      CHECK (`sort_order` BETWEEN 0 AND 3),
    UNIQUE INDEX `platform_membership_tiers_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_membership_tiers_code_key`(`code`),
    INDEX `platform_membership_tiers_sort_deleted_idx`(`sort_order`, `deleted_at`),
    INDEX `platform_membership_tiers_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_membership_benefits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `code` ENUM(
      'ndp_experience',
      'member_sign_in',
      'priority_request',
      'support_service',
      'exclusive_discount',
      'member_day',
      'birthday_gift'
    ) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_globally_enabled` BOOLEAN NOT NULL DEFAULT TRUE,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `platform_membership_benefits_sort_order_chk`
      CHECK (`sort_order` BETWEEN 0 AND 6),
    CONSTRAINT `platform_membership_benefits_lock_version_chk`
      CHECK (`lock_version` > 0),
    UNIQUE INDEX `platform_membership_benefits_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_membership_benefits_code_key`(`code`),
    INDEX `platform_membership_benefits_sort_deleted_idx`(`sort_order`, `deleted_at`),
    INDEX `platform_membership_benefits_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_membership_tier_versions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `tier_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `duration_days` INTEGER NULL,
    `monthly_value_ndp` INTEGER NOT NULL,
    `annual_billing_months` INTEGER NOT NULL DEFAULT 10,
    `experience_multiplier` DECIMAL(8, 4) NOT NULL,
    `detail_accent_color` CHAR(7) NOT NULL,
    `detail_surface_color` CHAR(7) NOT NULL,
    `detail_item_surface_color` CHAR(7) NOT NULL,
    `detail_outer_border_color` CHAR(7) NOT NULL,
    `detail_item_border_color` CHAR(7) NOT NULL,
    `detail_avatar_border_color` CHAR(7) NOT NULL,
    `simple_top_color` CHAR(7) NOT NULL,
    `simple_bottom_color` CHAR(7) NOT NULL,
    `description` TEXT NULL,
    `effective_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effective_to` DATETIME(3) NULL,
    `published_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `published_by_id` INTEGER NULL,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `platform_membership_tier_versions_version_chk`
      CHECK (`version` > 0),
    CONSTRAINT `platform_membership_tier_versions_duration_chk`
      CHECK (`duration_days` IS NULL OR `duration_days` > 0),
    CONSTRAINT `platform_membership_tier_versions_monthly_value_chk`
      CHECK (`monthly_value_ndp` >= 0),
    CONSTRAINT `platform_membership_tier_versions_annual_months_chk`
      CHECK (`annual_billing_months` BETWEEN 0 AND 12),
    CONSTRAINT `platform_membership_tier_versions_multiplier_chk`
      CHECK (`experience_multiplier` > 0),
    CONSTRAINT `platform_membership_tier_versions_effective_window_chk`
      CHECK (`effective_to` IS NULL OR `effective_to` > `effective_from`),
    CONSTRAINT `platform_membership_tier_versions_lock_version_chk`
      CHECK (`lock_version` > 0),
    CONSTRAINT `platform_membership_tier_versions_colors_chk`
      CHECK (
        `detail_accent_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `detail_surface_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `detail_item_surface_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `detail_outer_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `detail_item_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `detail_avatar_border_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `simple_top_color` REGEXP '^#[0-9A-Fa-f]{6}$'
        AND `simple_bottom_color` REGEXP '^#[0-9A-Fa-f]{6}$'
      ),
    UNIQUE INDEX `platform_membership_tier_versions_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_membership_tier_version_key`(`tier_id`, `version`),
    INDEX `platform_membership_tier_version_resolution_idx`(`tier_id`, `status`, `effective_from`, `effective_to`, `deleted_at`),
    INDEX `platform_membership_tier_versions_created_by_id_idx`(`created_by_id`),
    INDEX `platform_membership_tier_versions_published_by_id_idx`(`published_by_id`),
    INDEX `platform_membership_tier_versions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_membership_tier_benefits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `tier_version_id` INTEGER NOT NULL,
    `benefit_id` INTEGER NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
    `configuration_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `platform_membership_tier_benefits_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_membership_tier_benefit_key`(`tier_version_id`, `benefit_id`),
    INDEX `platform_membership_tier_benefit_enabled_idx`(`benefit_id`, `is_enabled`, `deleted_at`),
    INDEX `platform_membership_tier_benefits_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `platform_membership_entitlements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `tier_version_id` INTEGER NOT NULL,
    `source` ENUM('purchase', 'operations', 'offline_transfer', 'internal', 'migration') NOT NULL,
    `source_reference` VARCHAR(160) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `superseded_at` DATETIME(3) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `platform_membership_entitlements_window_chk`
      CHECK (`expires_at` IS NULL OR `expires_at` > `starts_at`),
    CONSTRAINT `platform_membership_entitlements_source_reference_chk`
      CHECK (CHAR_LENGTH(TRIM(`source_reference`)) > 0),
    UNIQUE INDEX `platform_membership_entitlements_public_id_key`(`public_id`),
    UNIQUE INDEX `platform_membership_entitlement_source_key`(`user_id`, `source`, `source_reference`),
    INDEX `platform_membership_entitlement_active_idx`(`user_id`, `starts_at`, `expires_at`, `superseded_at`, `deleted_at`),
    INDEX `platform_membership_entitlements_tier_version_id_idx`(`tier_version_id`),
    INDEX `platform_membership_entitlements_created_by_id_idx`(`created_by_id`),
    INDEX `platform_membership_entitlements_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `platform_membership_tier_versions`
    ADD CONSTRAINT `platform_membership_tier_versions_tier_id_fkey`
    FOREIGN KEY (`tier_id`) REFERENCES `platform_membership_tiers`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_membership_tier_versions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_membership_tier_versions_published_by_id_fkey`
    FOREIGN KEY (`published_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `platform_membership_tier_benefits`
    ADD CONSTRAINT `platform_membership_tier_benefits_tier_version_id_fkey`
    FOREIGN KEY (`tier_version_id`) REFERENCES `platform_membership_tier_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_membership_tier_benefits_benefit_id_fkey`
    FOREIGN KEY (`benefit_id`) REFERENCES `platform_membership_benefits`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `platform_membership_entitlements`
    ADD CONSTRAINT `platform_membership_entitlements_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_membership_entitlements_tier_version_id_fkey`
    FOREIGN KEY (`tier_version_id`) REFERENCES `platform_membership_tier_versions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `platform_membership_entitlements_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `platform_membership_tiers`
  (`public_id`, `code`, `sort_order`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  (UUID(), 'free', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'silver', 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'gold', 2, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'black_diamond', 3, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `sort_order` = VALUES(`sort_order`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `platform_membership_benefits`
  (`public_id`, `code`, `sort_order`, `is_globally_enabled`, `lock_version`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  (UUID(), 'ndp_experience', 0, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'member_sign_in', 1, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'priority_request', 2, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'support_service', 3, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'exclusive_discount', 4, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'member_day', 5, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  (UUID(), 'birthday_gift', 6, TRUE, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `sort_order` = VALUES(`sort_order`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `platform_membership_tier_versions` (
  `public_id`, `tier_id`, `version`, `status`, `duration_days`, `monthly_value_ndp`,
  `annual_billing_months`, `experience_multiplier`, `detail_accent_color`,
  `detail_surface_color`, `detail_item_surface_color`, `detail_outer_border_color`,
  `detail_item_border_color`, `detail_avatar_border_color`, `simple_top_color`,
  `simple_bottom_color`, `description`, `effective_from`, `effective_to`,
  `published_at`, `created_by_id`, `published_by_id`, `lock_version`, `created_at`,
  `updated_at`, `deleted_at`
)
SELECT
  UUID(), `tier`.`id`, 1, 'published',
  CASE `tier`.`code` WHEN 'free' THEN NULL ELSE 30 END,
  CASE `tier`.`code`
    WHEN 'free' THEN 0 WHEN 'silver' THEN 300 WHEN 'gold' THEN 1999 ELSE 4999
  END,
  CASE `tier`.`code` WHEN 'free' THEN 0 ELSE 10 END,
  CASE `tier`.`code`
    WHEN 'free' THEN 1.0000 WHEN 'silver' THEN 2.0000 WHEN 'gold' THEN 5.0000 ELSE 10.0000
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#A7FF33' WHEN 'silver' THEN '#D6DEE8' WHEN 'gold' THEN '#F4C967' ELSE '#BFA7FF'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#102731' WHEN 'silver' THEN '#1A2430' WHEN 'gold' THEN '#302818' ELSE '#171225'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#0B1820' WHEN 'silver' THEN '#111923' WHEN 'gold' THEN '#201A10' ELSE '#100C1A'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#577A39' WHEN 'silver' THEN '#8D9AAA' WHEN 'gold' THEN '#A98645' ELSE '#695789'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#34514A' WHEN 'silver' THEN '#536170' WHEN 'gold' THEN '#66552F' ELSE '#473A5D'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#729548' WHEN 'silver' THEN '#AAB5C2' WHEN 'gold' THEN '#D0A857' ELSE '#8E73B6'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#0A2619' WHEN 'silver' THEN '#25303C' WHEN 'gold' THEN '#382C13' ELSE '#241738'
  END,
  CASE `tier`.`code`
    WHEN 'free' THEN '#102631' WHEN 'silver' THEN '#15202B' WHEN 'gold' THEN '#241E12' ELSE '#151020'
  END,
  NULL,
  CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3), NULL, NULL, 1,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `platform_membership_tiers` AS `tier`
WHERE `tier`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `platform_membership_tier_benefits` (
  `public_id`, `tier_version_id`, `benefit_id`, `is_enabled`, `configuration_json`,
  `created_at`, `updated_at`, `deleted_at`
)
SELECT
  UUID(), `version`.`id`, `benefit`.`id`,
  `benefit`.`code` IN ('ndp_experience', 'member_sign_in'),
  CASE
    WHEN `benefit`.`code` = 'ndp_experience'
      THEN JSON_OBJECT('extraThresholdNdp', NULL, 'extraAwardExpUnits', NULL)
    ELSE JSON_OBJECT()
  END,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `platform_membership_tier_versions` AS `version`
INNER JOIN `platform_membership_tiers` AS `tier`
  ON `tier`.`id` = `version`.`tier_id` AND `tier`.`deleted_at` IS NULL
CROSS JOIN `platform_membership_benefits` AS `benefit`
WHERE `version`.`version` = 1
  AND `version`.`deleted_at` IS NULL
  AND `benefit`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `is_enabled` = VALUES(`is_enabled`),
  `configuration_json` = VALUES(`configuration_json`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
