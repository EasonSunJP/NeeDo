CREATE INDEX `booking_orders_field_job_projection_idx`
  ON `booking_orders`(`fulfillment_mode`, `status`, `created_at`, `deleted_at`, `id`);

INSERT INTO `permissions` (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  ('运营上门工单读取', 'backoffice:field-jobs:read', 'api', 'backoffice', '分页读取由正式上门订单投影的运营工单', TRUE, NOW(), NOW(), NULL),
  ('运营上门地址读取', 'backoffice:field-jobs:address:read', 'api', 'backoffice', '读取正式上门工单的完整履约地址', TRUE, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `deleted_at` = NULL,
  `updated_at` = NOW();

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT roles.id, permissions.id, NOW(), NOW(), NULL
FROM `roles` AS roles
JOIN `permissions` AS permissions
  ON permissions.code IN ('backoffice:field-jobs:read', 'backoffice:field-jobs:address:read')
  AND permissions.deleted_at IS NULL
WHERE roles.code IN ('admin', 'operator')
  AND roles.deleted_at IS NULL
ON DUPLICATE KEY UPDATE
  `deleted_at` = NULL,
  `updated_at` = NOW();
