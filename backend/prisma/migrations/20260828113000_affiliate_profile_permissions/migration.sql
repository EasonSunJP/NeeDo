-- Keep affiliate profile routes deployable on databases that apply migrations
-- without running the complete User Management seed afterwards.
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
    '联盟营销资料',
    'page:affiliate-profile',
    'page',
    'affiliate',
    '访问本人联盟营销公开资料',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  ),
  (
    '编辑联盟营销资料',
    'button:affiliate-profile-edit',
    'button',
    'affiliate',
    '编辑本人联盟营销资料和外部平台主页链接',
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
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Admin keeps all permissions. The scout role represents an activated affiliate
-- and alone receives the marketplace and self-profile actions.
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
JOIN `permissions`
  ON `permissions`.`code` IN (
    'menu:affiliate',
    'page:affiliate-marketplace',
    'button:affiliate-claim',
    'page:affiliate-profile',
    'button:affiliate-profile-edit'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'scout')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Non-activated roles retain only menu:affiliate so they can enter the
-- activation flow. Soft-delete legacy marketplace/profile assignments.
UPDATE `role_permissions`
JOIN `roles`
  ON `roles`.`id` = `role_permissions`.`role_id`
  AND `roles`.`deleted_at` IS NULL
JOIN `permissions`
  ON `permissions`.`id` = `role_permissions`.`permission_id`
  AND `permissions`.`deleted_at` IS NULL
SET
  `role_permissions`.`updated_at` = CURRENT_TIMESTAMP(3),
  `role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)
WHERE `roles`.`code` IN ('operator', 'finance', 'support', 'merchant_owner', 'merchant_staff', 'technician', 'customer', 'broker', 'viewer')
  AND `permissions`.`code` IN (
    'page:affiliate-marketplace',
    'button:affiliate-claim',
    'page:affiliate-profile',
    'button:affiliate-profile-edit'
  )
  AND `role_permissions`.`deleted_at` IS NULL;
