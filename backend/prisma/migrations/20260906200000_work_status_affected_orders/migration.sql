-- CreateTable
CREATE TABLE `technician_attendance_affected_orders` (
    `id` CHAR(36) NOT NULL,
    `incident_id` CHAR(36) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `service_name` VARCHAR(160) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `technician_attendance_affected_orders_order_id_idx`(`order_id`),
    INDEX `technician_attendance_affected_orders_shop_id_deleted_at_idx`(`shop_id`, `deleted_at`),
    UNIQUE INDEX `attendance_affected_incident_order_key`(`incident_id`, `order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `technician_attendance_affected_orders` ADD CONSTRAINT `technician_attendance_affected_orders_incident_id_fkey` FOREIGN KEY (`incident_id`) REFERENCES `technician_attendance_incidents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_affected_orders` ADD CONSTRAINT `technician_attendance_affected_orders_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_affected_orders` ADD CONSTRAINT `technician_attendance_affected_orders_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
