-- AlterTable
ALTER TABLE `shops`
  ADD COLUMN `pricing_mode` ENUM('merchant', 'technician') NOT NULL DEFAULT 'merchant',
  ADD COLUMN `pricing_mode_updated_at` DATETIME(3) NULL,
  ADD COLUMN `pricing_mode_updated_by` INTEGER NULL;

-- AlterTable
ALTER TABLE `schedule_slots`
  MODIFY `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `booking_orders`
  MODIFY `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL,
  ADD COLUMN `pricing_mode_snapshot` ENUM('merchant', 'technician') NOT NULL DEFAULT 'merchant',
  ADD COLUMN `service_owner_type` ENUM('shop', 'technician') NOT NULL DEFAULT 'shop',
  ADD COLUMN `service_owner_id` INTEGER NULL,
  ADD COLUMN `service_name_snapshot` VARCHAR(160) NULL,
  ADD COLUMN `service_price_snapshot` DECIMAL(10, 2) NULL,
  ADD COLUMN `service_duration_snapshot` INTEGER NULL,
  ADD COLUMN `service_snapshot_json` JSON NULL;

-- CreateTable
CREATE TABLE `technician_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_id` INTEGER NOT NULL,
    `technician_id` INTEGER NOT NULL,
    `source_shop_service_id` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `category_id` INTEGER NOT NULL,
    `price_amount` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
    `duration_minutes` INTEGER NOT NULL,
    `cover_image_url` VARCHAR(500) NULL,
    `images_json` JSON NULL,
    `tags_json` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_bookable` BOOLEAN NOT NULL DEFAULT true,
    `is_recommended` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `review_status` ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
    `rejection_reason` VARCHAR(500) NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `tech_services_shop_tech_active_deleted_idx`(`shop_id`, `technician_id`, `is_active`, `deleted_at`),
    INDEX `tech_services_shop_reco_active_deleted_idx`(`shop_id`, `is_recommended`, `is_active`, `deleted_at`),
    INDEX `technician_services_source_shop_service_id_idx`(`source_shop_service_id`),
    INDEX `technician_services_category_id_idx`(`category_id`),
    INDEX `technician_services_created_by_idx`(`created_by`),
    INDEX `technician_services_updated_by_idx`(`updated_by`),
    INDEX `technician_services_review_status_idx`(`review_status`),
    INDEX `technician_services_is_bookable_idx`(`is_bookable`),
    INDEX `technician_services_sort_order_idx`(`sort_order`),
    INDEX `technician_services_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill
UPDATE `booking_orders`
SET
  `service_owner_id` = `service_id`,
  `service_name_snapshot` = (
    SELECT `services`.`name`
    FROM `services`
    WHERE `services`.`id` = `booking_orders`.`service_id`
  ),
  `service_price_snapshot` = `price_amount`,
  `service_duration_snapshot` = (
    SELECT `services`.`duration_minutes`
    FROM `services`
    WHERE `services`.`id` = `booking_orders`.`service_id`
  )
WHERE `service_id` IS NOT NULL;

-- CreateIndex
CREATE INDEX `shops_pricing_mode_idx` ON `shops`(`pricing_mode`);
CREATE INDEX `shops_pricing_mode_updated_by_idx` ON `shops`(`pricing_mode_updated_by`);
CREATE INDEX `schedule_slots_technician_service_id_idx` ON `schedule_slots`(`technician_service_id`);
CREATE INDEX `booking_orders_technician_service_id_idx` ON `booking_orders`(`technician_service_id`);
CREATE INDEX `booking_orders_pricing_mode_snapshot_idx` ON `booking_orders`(`pricing_mode_snapshot`);
CREATE INDEX `booking_orders_service_owner_type_service_owner_id_idx` ON `booking_orders`(`service_owner_type`, `service_owner_id`);

-- AddForeignKey
ALTER TABLE `shops` ADD CONSTRAINT `shops_pricing_mode_updated_by_fkey` FOREIGN KEY (`pricing_mode_updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_technician_id_fkey` FOREIGN KEY (`technician_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_source_shop_service_id_fkey` FOREIGN KEY (`source_shop_service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `technician_services` ADD CONSTRAINT `technician_services_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `schedule_slots` ADD CONSTRAINT `schedule_slots_technician_service_id_fkey` FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_technician_service_id_fkey` FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
