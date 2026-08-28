-- AlterTable
ALTER TABLE `availabilities`
    ADD COLUMN `source_type` ENUM('shop', 'technician') NOT NULL DEFAULT 'shop' AFTER `technician_profile_id`,
    ADD COLUMN `visibility` ENUM('shop_only', 'affiliated_shops') NOT NULL DEFAULT 'shop_only' AFTER `source_type`;

-- CreateIndex
CREATE INDEX `availability_technician_visibility_range_idx`
    ON `availabilities`(`technician_profile_id`, `visibility`, `starts_at`, `ends_at`, `deleted_at`);

-- CreateIndex
CREATE INDEX `schedule_slot_technician_shop_range_deleted_idx`
    ON `schedule_slots`(`technician_profile_id`, `shop_id`, `starts_at`, `ends_at`, `deleted_at`);

-- CreateIndex
CREATE INDEX `booking_order_technician_status_range_deleted_idx`
    ON `booking_orders`(`technician_profile_id`, `status`, `starts_at`, `ends_at`, `deleted_at`);
