-- CreateTable
CREATE TABLE `availabilities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `technician_profile_id` INTEGER NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `availabilities_shop_id_idx`(`shop_id`),
    INDEX `availabilities_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `availabilities_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `availabilities_is_active_idx`(`is_active`),
    INDEX `availabilities_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_slots` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `availability_id` INTEGER NULL,
    `service_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `technician_profile_id` INTEGER NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 1,
    `booked_count` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('available', 'booked', 'blocked') NOT NULL DEFAULT 'available',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `schedule_slots_availability_id_idx`(`availability_id`),
    INDEX `schedule_slots_service_id_idx`(`service_id`),
    INDEX `schedule_slots_shop_id_idx`(`shop_id`),
    INDEX `schedule_slots_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `schedule_slots_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `schedule_slots_status_idx`(`status`),
    INDEX `schedule_slots_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(40) NOT NULL,
    `order_type` ENUM('booking', 'request') NOT NULL DEFAULT 'booking',
    `customer_user_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `technician_profile_id` INTEGER NULL,
    `schedule_slot_id` INTEGER NOT NULL,
    `status` ENUM('pending', 'confirmed', 'in_service', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `fulfillment_mode` VARCHAR(50) NOT NULL DEFAULT 'store',
    `price_amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `note` VARCHAR(500) NULL,
    `cancel_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `booking_orders_order_no_key`(`order_no`),
    INDEX `booking_orders_customer_user_id_idx`(`customer_user_id`),
    INDEX `booking_orders_service_id_idx`(`service_id`),
    INDEX `booking_orders_shop_id_idx`(`shop_id`),
    INDEX `booking_orders_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `booking_orders_schedule_slot_id_idx`(`schedule_slot_id`),
    INDEX `booking_orders_status_idx`(`status`),
    INDEX `booking_orders_order_type_idx`(`order_type`),
    INDEX `booking_orders_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `booking_orders_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_status_histories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NOT NULL,
    `from_status` ENUM('pending', 'confirmed', 'in_service', 'completed', 'cancelled') NULL,
    `to_status` ENUM('pending', 'confirmed', 'in_service', 'completed', 'cancelled') NOT NULL,
    `actor_user_id` INTEGER NULL,
    `reason` VARCHAR(500) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `order_status_histories_booking_order_id_idx`(`booking_order_id`),
    INDEX `order_status_histories_actor_user_id_idx`(`actor_user_id`),
    INDEX `order_status_histories_to_status_idx`(`to_status`),
    INDEX `order_status_histories_created_at_idx`(`created_at`),
    INDEX `order_status_histories_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `availabilities` ADD CONSTRAINT `availabilities_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availabilities` ADD CONSTRAINT `availabilities_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_slots` ADD CONSTRAINT `schedule_slots_availability_id_fkey` FOREIGN KEY (`availability_id`) REFERENCES `availabilities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_slots` ADD CONSTRAINT `schedule_slots_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_slots` ADD CONSTRAINT `schedule_slots_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_slots` ADD CONSTRAINT `schedule_slots_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_schedule_slot_id_fkey` FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_histories` ADD CONSTRAINT `order_status_histories_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_histories` ADD CONSTRAINT `order_status_histories_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
