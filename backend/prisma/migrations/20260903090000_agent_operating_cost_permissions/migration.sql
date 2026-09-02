-- Deploy agent, operating-cost, and settlement permissions without requiring a seed rerun.
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
  ('平台合作身份管理', 'backoffice:partner-profile:write', 'api', 'backoffice', '标记现有用户为代理商、加盟商或供货商', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商读取', 'backoffice:agent:read', 'api', 'backoffice', '分页读取代理商、关联店铺、佣金规则与结算资料', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商管理', 'backoffice:agent:write', 'api', 'backoffice', '关联代理商介绍店铺并发布佣金规则', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营成本读取', 'backoffice:operating-cost:read', 'api', 'finance', '分页读取运营成本及店铺分摊结果', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营成本管理', 'backoffice:operating-cost:write', 'api', 'finance', '创建、编辑、删除及发布运营成本版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算读取', 'backoffice:agent-settlement:read', 'api', 'finance', '读取代理商结算预览、正式结算及计算快照', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算确认', 'backoffice:agent-settlement:write', 'api', 'finance', '确认不可变代理商结算及明细行', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算支付', 'backoffice:agent-settlement:pay', 'api', 'finance', '记录代理商结算支付方式、凭证及执行人', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
  ON `permissions`.`code` IN (
    'backoffice:partner-profile:write',
    'backoffice:agent:read',
    'backoffice:agent:write',
    'backoffice:operating-cost:read',
    'backoffice:operating-cost:write',
    'backoffice:agent-settlement:read',
    'backoffice:agent-settlement:write',
    'backoffice:agent-settlement:pay'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'admin'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:partner-profile:write',
    'backoffice:agent:read',
    'backoffice:agent:write',
    'backoffice:operating-cost:read',
    'backoffice:operating-cost:write',
    'backoffice:agent-settlement:read',
    'backoffice:agent-settlement:write'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'operator'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:operating-cost:read',
    'backoffice:operating-cost:write',
    'backoffice:agent-settlement:read',
    'backoffice:agent-settlement:pay'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'finance'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'backoffice:agent:read',
    'backoffice:operating-cost:read',
    'backoffice:agent-settlement:read'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
