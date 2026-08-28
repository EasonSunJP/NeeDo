-- Keep alliance routes deployable when migrations run without a complete seed.
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
    '联盟',
    'page:affiliate-alliance',
    'page',
    'affiliate',
    '访问本人当前联盟',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  ),
  (
    '创建联盟',
    'button:affiliate-alliance-create',
    'button',
    'affiliate',
    '创建本人拥有的联盟',
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

-- Admin keeps all permissions. The scout role is the activated Affiliate identity.
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
    'page:affiliate-alliance',
    'button:affiliate-alliance-create'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'scout')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Non-activated identities must not inherit alliance read/create access.
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
    'page:affiliate-alliance',
    'button:affiliate-alliance-create'
  )
  AND `role_permissions`.`deleted_at` IS NULL;
