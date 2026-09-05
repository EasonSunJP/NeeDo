INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES
  (
    '读取匹配预约取消状态',
    'exchange:cancellation:read-own',
    'api',
    'exchange',
    '读取当前账号作为顾客或服务承接方参与的逐单双方取消状态',
    TRUE,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
  ),
  (
    '处理匹配预约取消',
    'exchange:cancellation:write-own',
    'api',
    'exchange',
    '发起、同意、拒绝或撤回当前账号参与的逐单双方取消申请',
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
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
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
    'exchange:cancellation:read-own',
    'exchange:cancellation:write-own'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'technician', 'merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
