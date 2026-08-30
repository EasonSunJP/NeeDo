ALTER TABLE `technician_profiles`
  ADD COLUMN `service_areas` JSON NULL,
  ADD COLUMN `age` INTEGER NULL,
  ADD COLUMN `height_cm` DECIMAL(5,2) NULL,
  ADD COLUMN `languages` JSON NULL,
  ADD COLUMN `profile_tags` JSON NULL,
  ADD COLUMN `can_serve_foreigners` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `bid_budget_min_jpy` INTEGER NULL,
  ADD COLUMN `bid_budget_max_jpy` INTEGER NULL,
  ADD COLUMN `payment_methods` JSON NULL,
  ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public';

UPDATE `technician_profiles`
SET
  `service_areas` = CASE
    WHEN `service_area` IS NULL OR TRIM(`service_area`) = '' THEN JSON_ARRAY()
    ELSE JSON_ARRAY(`service_area`)
  END,
  `languages` = JSON_ARRAY('日本語'),
  `profile_tags` = JSON_ARRAY(),
  `payment_methods` = JSON_ARRAY('platform', 'offline')
WHERE `service_areas` IS NULL
   OR `languages` IS NULL
   OR `profile_tags` IS NULL
   OR `payment_methods` IS NULL;

CREATE INDEX `technician_profiles_visibility_idx`
  ON `technician_profiles`(`visibility`);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('查看技师资料', 'technician-profile:read', 'api', 'technician-profile', '读取当前技师身份的个人资料', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('编辑技师资料', 'technician-profile:write', 'api', 'technician-profile', '更新当前技师身份的个人资料', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('technician-profile:read', 'technician-profile:write')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'technician')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
