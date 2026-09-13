INSERT INTO `permissions`
  (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`)
VALUES
  ('运营需求情报核验', 'backoffice:exchange:read', 'api', 'exchange', '分页读取脱敏的正式需求、情报、抢单、匹配、发布费与审计证据', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `deleted_at` = NULL,
  `updated_at` = UTC_TIMESTAMP(3);

INSERT INTO `role_permissions`
  (`role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT roles.id, permissions.id, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM `roles`
CROSS JOIN `permissions`
WHERE roles.code IN ('admin', 'operator', 'viewer')
  AND roles.deleted_at IS NULL
  AND permissions.code = 'backoffice:exchange:read'
  AND permissions.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  `deleted_at` = NULL,
  `updated_at` = UTC_TIMESTAMP(3);

