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
  ('平台会员等级读取', 'backoffice:membership-tier:read', 'api', 'backoffice', '读取固定平台会员等级及其版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('平台会员等级发布', 'backoffice:membership-tier:publish', 'api', 'backoffice', '保存并发布平台会员等级版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('平台会员权益读取', 'backoffice:membership-benefit:read', 'api', 'backoffice', '读取固定平台会员权益目录', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('平台会员权益管理', 'backoffice:membership-benefit:write', 'api', 'backoffice', '启用或停用平台会员权益', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户平台会员管理', 'backoffice:user-membership:write', 'api', 'backoffice', '发放、续费、升级、降级或终止用户平台会员资格', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

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
    'backoffice:membership-tier:read',
    'backoffice:membership-tier:publish',
    'backoffice:membership-benefit:read',
    'backoffice:membership-benefit:write',
    'backoffice:user-membership:write'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

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
    'backoffice:membership-tier:read',
    'backoffice:membership-benefit:read'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
