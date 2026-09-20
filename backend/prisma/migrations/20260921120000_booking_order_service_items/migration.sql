CREATE TABLE `booking_order_service_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `technician_service_id` INTEGER NOT NULL,
  `schedule_slot_id` INTEGER NOT NULL,
  `position` INTEGER NOT NULL,
  `service_name_snapshot` VARCHAR(160) NOT NULL,
  `price_amount_jpy` INTEGER NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
  `duration_minutes` INTEGER NOT NULL,
  `starts_at` DATETIME(3) NOT NULL,
  `ends_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `booking_order_service_items_order_position_key` (`booking_order_id`, `position`),
  UNIQUE INDEX `booking_order_service_items_order_slot_key` (`booking_order_id`, `schedule_slot_id`),
  INDEX `booking_order_service_items_technician_service_idx` (`technician_service_id`),
  INDEX `booking_order_service_items_schedule_slot_idx` (`schedule_slot_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `booking_order_service_items_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `booking_order_service_items_technician_service_id_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `booking_order_service_items_schedule_slot_id_fkey`
    FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
