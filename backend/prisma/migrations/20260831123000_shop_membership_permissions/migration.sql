-- Keep the protected shop membership routes deployable when migrations run
-- without the full canonical seed.
INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('店铺会员读取', 'shop.member.view', 'api', 'shop-membership', '读取当前店铺的会员关系、会员卡和基础总览', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('店铺会员开通', 'shop.member.create', 'api', 'shop-membership', '为与当前店铺存在正式预约关系的客户开通店铺会员', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('店铺会员分析读取', 'shop.member.analytics.view', 'api', 'shop-membership', '读取当前店铺的会员与会员卡状态分析', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('店铺会员活动读取', 'shop.member.operation_log.view', 'api', 'shop-membership', '读取当前店铺的会员操作活动记录', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
  ON (
    (`roles`.`code` IN ('admin', 'merchant_owner') AND `permissions`.`code` IN (
      'shop.member.view',
      'shop.member.create',
      'shop.member.analytics.view',
      'shop.member.operation_log.view'
    ))
    OR
    (`roles`.`code` = 'merchant_staff' AND `permissions`.`code` = 'shop.member.view')
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
