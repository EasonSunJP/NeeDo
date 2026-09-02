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

-- Freeze the service identity and classification used by historical completed orders.
UPDATE `booking_orders` AS `booking`
LEFT JOIN `services` AS `service`
  ON `service`.`id` = `booking`.`service_id`
LEFT JOIN `technician_services` AS `technician_service`
  ON `technician_service`.`id` = `booking`.`technician_service_id`
SET `booking`.`service_name_snapshot` = COALESCE(
    NULLIF(TRIM(`booking`.`service_name_snapshot`), ''),
    `service`.`name`,
    `technician_service`.`name`
  ),
  `booking`.`service_snapshot_json` = JSON_SET(
  CASE
    WHEN JSON_TYPE(`booking`.`service_snapshot_json`) = 'OBJECT'
      THEN `booking`.`service_snapshot_json`
    ELSE JSON_OBJECT()
  END,
  '$.entityType', IF(`booking`.`service_id` IS NOT NULL, 'service', 'technician_service'),
  '$.entityNumericId', COALESCE(`booking`.`service_id`, `booking`.`technician_service_id`),
  '$.publicId', COALESCE(`service`.`public_id`, `technician_service`.`public_id`),
  '$.categoryId', COALESCE(`service`.`category_id`, `technician_service`.`category_id`)
)
WHERE (`booking`.`service_id` IS NULL) <> (`booking`.`technician_service_id` IS NULL);

UPDATE `order_add_ons` AS `add_on`
JOIN `services` AS `service`
  ON `service`.`id` = `add_on`.`service_id`
SET `add_on`.`service_snapshot_json` = JSON_SET(
  CASE
    WHEN JSON_TYPE(`add_on`.`service_snapshot_json`) = 'OBJECT'
      THEN `add_on`.`service_snapshot_json`
    ELSE JSON_OBJECT()
  END,
  '$.entityType', 'service',
  '$.entityNumericId', `add_on`.`service_id`,
  '$.publicId', `service`.`public_id`,
  '$.categoryId', `service`.`category_id`
);

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
