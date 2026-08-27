-- Keep formal message recall deployable on existing databases that apply
-- migrations without running the complete User Management seed afterwards.
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
VALUES (
  '撤回消息',
  'message:recall',
  'api',
  'im',
  '在正式时限内撤回本人发送的 IM 消息',
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

-- These assignments match buildRolePermissionAssignments for every role that
-- receives the formal realtime user permission bundle.
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
  ON `permissions`.`code` = 'message:recall'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
