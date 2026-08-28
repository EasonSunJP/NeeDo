-- Keep the merchant employee-affiliation APIs deployable on existing databases
-- that apply migrations without running the complete User Management seed again.
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
    '商户员工从属读取',
    'merchant-admin:employee-affiliation:read',
    'api', 'merchant-admin',
    '按当前店铺读取员工身份和在职从属关系',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  ),
  (
    '商户员工从属维护',
    'merchant-admin:employee-affiliation:write',
    'api', 'merchant-admin',
    '按当前店铺创建、更新或结束员工从属关系',
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

-- These assignments match buildRolePermissionAssignments for the system admin
-- and the two shop-scoped merchant roles that manage employee records.
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
  ON `permissions`.`code` IN ('merchant-admin:employee-affiliation:read', 'merchant-admin:employee-affiliation:write')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
