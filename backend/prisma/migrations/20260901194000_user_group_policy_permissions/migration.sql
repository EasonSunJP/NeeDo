INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('用户分组读取', 'backoffice:user-group:read', 'api', 'backoffice', '分页读取系统派生分组与自定义用户分组', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户分组管理', 'backoffice:user-group:write', 'api', 'backoffice', '创建、编辑、归档自定义分组并维护成员', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户全局策略读取', 'backoffice:user-policy:read', 'api', 'backoffice', '读取账号绑定与服务 eKYC 全局策略', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户全局策略发布', 'backoffice:user-policy:publish', 'api', 'backoffice', '保存并发布用户全局策略版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('NDP经验活动读取', 'backoffice:ndp-experience-campaign:read', 'api', 'backoffice', '分页读取 NDP 经验倍率活动', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('NDP经验活动发布', 'backoffice:ndp-experience-campaign:publish', 'api', 'backoffice', '保存、发布或归档 NDP 经验倍率活动', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:user-group:read',
    'backoffice:user-group:write',
    'backoffice:user-policy:read',
    'backoffice:user-policy:publish',
    'backoffice:ndp-experience-campaign:read',
    'backoffice:ndp-experience-campaign:publish'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
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
    'backoffice:user-group:read',
    'backoffice:user-policy:read',
    'backoffice:ndp-experience-campaign:read'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
