-- Stable public identities and a bounded formal-payment access path for analytics rankings.
ALTER TABLE `technician_services`
  ADD COLUMN `public_id` CHAR(36) NULL;

UPDATE `technician_services`
SET `public_id` = UUID()
WHERE `public_id` IS NULL;

ALTER TABLE `technician_services`
  MODIFY COLUMN `public_id` CHAR(36) NOT NULL;

CREATE UNIQUE INDEX `technician_services_public_id_key`
  ON `technician_services`(`public_id`);

CREATE INDEX `booking_orders_ranking_window_idx`
  ON `booking_orders`(`status`, `payment_status`, `deleted_at`, `payment_confirmed_at`, `shop_id`, `id`);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
) VALUES (
  '平台排行分析读取', 'backoffice:analytics-ranking:read', 'api', 'analytics-ranking',
  '读取平台范围的正式服务、技师与用户消费排行', TRUE,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `type` = VALUES(`type`), `module` = VALUES(`module`),
  `description` = VALUES(`description`), `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'backoffice:analytics-ranking:read'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
