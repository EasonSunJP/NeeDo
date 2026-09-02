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
  ('运营后台合作方身份管理', 'backoffice:partner-profile:write', 'api', 'backoffice', '将正式用户标记为代理商、加盟商或供货商', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营后台代理商读取', 'backoffice:agent:read', 'api', 'backoffice', '分页读取代理商身份及其正式账号状态', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营后台代理商关系管理', 'backoffice:agent:write', 'api', 'backoffice', '确认代理商介绍的正式店铺关系', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营成本读取', 'backoffice:operating-cost:read', 'api', 'backoffice', '分页读取运营成本草稿、已发布版本及店铺分摊结果', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营成本管理', 'backoffice:operating-cost:write', 'api', 'backoffice', '创建、修改、删除草稿并发布可审计的运营成本分摊', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算读取', 'backoffice:agent-settlement:read', 'api', 'backoffice', '读取代理商已确认及已支付的不可变结算记录', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算确认', 'backoffice:agent-settlement:write', 'api', 'backoffice', '预览并确认含完整财务证据的代理商结算', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('代理商结算支付确认', 'backoffice:agent-settlement:pay', 'api', 'backoffice', '依据结算规则登记付款凭证并完成结算', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
