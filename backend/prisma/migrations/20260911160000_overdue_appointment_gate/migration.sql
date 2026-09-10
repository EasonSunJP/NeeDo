ALTER TABLE `platform_setting_versions`
  ADD COLUMN `overdue_appointment_gate_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `anytime_service_test_enabled`;

ALTER TABLE `order_reviews`
  DROP CHECK `order_reviews_rating_check`,
  DROP FOREIGN KEY `order_reviews_reviewer_user_id_fkey`,
  MODIFY COLUMN `reviewer_user_id` INTEGER NULL,
  ADD COLUMN `author_type` ENUM('user', 'system') NOT NULL DEFAULT 'user' AFTER `reviewer_user_id`,
  ADD COLUMN `system_source_key` VARCHAR(80) NULL AFTER `author_type`,
  ADD CONSTRAINT `order_reviews_rating_check` CHECK (`rating` BETWEEN 0 AND 5),
  ADD UNIQUE INDEX `order_reviews_order_target_system_source_key` (`booking_order_id`, `target_type`, `system_source_key`);

ALTER TABLE `order_reviews`
  ADD CONSTRAINT `order_reviews_reviewer_user_id_fkey` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `order_reviews`
  ADD CONSTRAINT `order_reviews_author_check` CHECK (
    (`author_type` = 'user' AND `reviewer_user_id` IS NOT NULL AND `system_source_key` IS NULL)
    OR (`author_type` = 'system' AND `reviewer_user_id` IS NULL AND `system_source_key` IS NOT NULL)
  );

CREATE TABLE `order_overdue_resolutions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `booking_order_id` INTEGER NOT NULL,
  `resolution` ENUM('actually_completed', 'customer_no_show', 'technician_no_show') NOT NULL,
  `resolved_by_user_id` INTEGER NOT NULL,
  `resolved_by_identity_id` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `service_name_snapshot` VARCHAR(160) NOT NULL,
  `starts_at_snapshot` DATETIME(3) NOT NULL,
  `ends_at_snapshot` DATETIME(3) NOT NULL,
  `system_review_id` INTEGER NULL,
  `resolved_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `order_overdue_resolutions_public_id_key` (`public_id`),
  UNIQUE INDEX `order_overdue_resolutions_booking_order_key` (`booking_order_id`),
  UNIQUE INDEX `order_overdue_resolutions_idempotency_key_key` (`idempotency_key`),
  UNIQUE INDEX `order_overdue_resolutions_system_review_key` (`system_review_id`),
  INDEX `order_overdue_resolutions_resolved_by_user_idx` (`resolved_by_user_id`),
  INDEX `order_overdue_resolutions_resolved_by_identity_idx` (`resolved_by_identity_id`),
  INDEX `order_overdue_resolutions_resolution_resolved_idx` (`resolution`, `resolved_at`),
  INDEX `order_overdue_resolutions_deleted_idx` (`deleted_at`),
  CONSTRAINT `order_overdue_resolutions_booking_order_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `order_overdue_resolutions_resolved_by_user_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `order_overdue_resolutions_resolved_by_identity_fkey` FOREIGN KEY (`resolved_by_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `order_overdue_resolutions_system_review_fkey` FOREIGN KEY (`system_review_id`) REFERENCES `order_reviews` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '处置过期预约',
  'order:overdue-resolution:create',
  'api',
  'order',
  '订单顾客或指派技师处置本人参与的过期未完成预约',
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
  ON `permissions`.`code` = 'order:overdue-resolution:create'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'technician')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
