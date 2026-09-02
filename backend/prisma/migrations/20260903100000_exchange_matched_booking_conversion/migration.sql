-- Forward-only Exchange matched-result to BookingOrder schema foundation.
-- Existing participants retain their active reservation until a later booking command converts it.

ALTER TABLE `exchange_match_events`
  MODIFY `type` ENUM(
    'opened', 'claim_added', 'claim_withdrawn', 'budget_increased',
    'target_reduced', 'selective_matched', 'bookings_created',
    'quick_matched', 'closed'
  ) NOT NULL;

ALTER TABLE `booking_orders`
  ADD COLUMN `fulfillment_address_snapshot` JSON NULL;

ALTER TABLE `exchange_match_participants`
  MODIFY `active_reservation_key` VARCHAR(191) NULL,
  ADD COLUMN `service_name_snapshot` VARCHAR(160) NULL,
  ADD COLUMN `service_duration_snapshot` INTEGER NULL,
  ADD COLUMN `booking_order_id` INTEGER NULL,
  ADD COLUMN `booked_at` DATETIME(3) NULL;

UPDATE `exchange_match_participants` AS `participant`
LEFT JOIN `services` AS `service`
  ON `service`.`id` = `participant`.`service_id`
LEFT JOIN `technician_services` AS `technician_service`
  ON `technician_service`.`id` = `participant`.`technician_service_id`
SET
  `participant`.`service_name_snapshot` = COALESCE(`service`.`name`, `technician_service`.`name`),
  `participant`.`service_duration_snapshot` = COALESCE(
    `service`.`duration_minutes`,
    `technician_service`.`duration_minutes`
  );

ALTER TABLE `exchange_match_participants`
  MODIFY `service_name_snapshot` VARCHAR(160) NOT NULL,
  MODIFY `service_duration_snapshot` INTEGER NOT NULL,
  ADD UNIQUE INDEX `exchange_match_participants_booking_order_key` (`booking_order_id`),
  ADD INDEX `exchange_match_participants_booking_order_idx` (`booking_order_id`),
  ADD CONSTRAINT `exchange_match_participants_booking_state_chk`
    CHECK (
      (`booking_order_id` IS NULL AND `booked_at` IS NULL AND `active_reservation_key` IS NOT NULL)
      OR
      (`booking_order_id` IS NOT NULL AND `booked_at` IS NOT NULL AND `active_reservation_key` IS NULL)
    ),
  ADD CONSTRAINT `exchange_match_participants_booking_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '创建匹配预约',
  'exchange:matching:book-own',
  'api',
  'exchange',
  '将本人发布需求的正式匹配结果转换为预约',
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
  ON `permissions`.`code` = 'exchange:matching:book-own'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
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
  ON `permissions`.`code` = 'exchange:matching:read-own'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'technician', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
