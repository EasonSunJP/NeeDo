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
  ADD INDEX `booking_orders_exchange_intelligence_created_idx` (`exchange_intelligence_post_id`, `created_at`),
  ADD CONSTRAINT `booking_orders_exchange_intelligence_fkey`
    FOREIGN KEY (`exchange_intelligence_post_id`) REFERENCES `exchange_intelligences` (`post_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
