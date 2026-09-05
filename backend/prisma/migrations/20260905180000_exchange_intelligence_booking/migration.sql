ALTER TABLE `exchange_intelligences`
  ADD COLUMN `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL,
  ADD COLUMN `service_name_snapshot` VARCHAR(160) NULL,
  ADD COLUMN `service_duration_snapshot` INTEGER NULL,
  ADD INDEX `exchange_intelligences_service_deleted_idx` (`service_id`, `deleted_at`),
  ADD INDEX `exchange_intelligences_technician_service_deleted_idx` (`technician_service_id`, `deleted_at`),
  ADD CONSTRAINT `exchange_intelligences_service_binding_check` CHECK (
    (
      `service_id` IS NULL
      AND `technician_service_id` IS NULL
      AND `service_name_snapshot` IS NULL
      AND `service_duration_snapshot` IS NULL
    )
    OR
    (
      (
        (`service_id` IS NOT NULL AND `technician_service_id` IS NULL)
        OR (`service_id` IS NULL AND `technician_service_id` IS NOT NULL)
      )
      AND `service_name_snapshot` IS NOT NULL
      AND CHAR_LENGTH(TRIM(`service_name_snapshot`)) > 0
      AND `service_duration_snapshot` > 0
    )
  ),
  ADD CONSTRAINT `exchange_intelligences_service_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_intelligences_technician_service_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `booking_orders`
  ADD COLUMN `exchange_intelligence_post_id` INTEGER NULL,
  ADD COLUMN `create_idempotency_key` VARCHAR(191) NULL,
  ADD COLUMN `create_request_fingerprint` CHAR(64) NULL,
  ADD INDEX `booking_orders_exchange_intelligence_created_idx` (`exchange_intelligence_post_id`, `created_at`),
  ADD UNIQUE INDEX `booking_orders_customer_create_idempotency_key` (`customer_user_id`, `create_idempotency_key`),
  ADD CONSTRAINT `booking_orders_exchange_intelligence_fkey`
    FOREIGN KEY (`exchange_intelligence_post_id`) REFERENCES `exchange_intelligences` (`post_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '读取情报服务选项',
  'exchange:intelligence:service-options:list',
  'api',
  'exchange',
  '分页读取当前技师或店铺可用于发布正式情报的服务',
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
  ON `permissions`.`code` = 'exchange:intelligence:service-options:list'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
