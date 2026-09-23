-- AlterTable
ALTER TABLE `booking_orders` ADD COLUMN `booking_group_guest_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `booking_order_service_items` ADD COLUMN `service_id` INTEGER NULL,
    MODIFY `technician_service_id` INTEGER NULL;

-- Every item still points to exactly one published catalog source.
ALTER TABLE `booking_order_service_items`
    ADD CONSTRAINT `booking_order_service_items_one_source_check`
    CHECK ((`service_id` IS NULL) <> (`technician_service_id` IS NULL));

-- CreateTable
CREATE TABLE `booking_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `customer_user_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `booking_groups_public_id_key`(`public_id`),
    INDEX `booking_groups_shop_start_idx`(`shop_id`, `starts_at`),
    UNIQUE INDEX `booking_groups_customer_idempotency_key`(`customer_user_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_group_guests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_group_id` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `booking_group_guests_group_position_key`(`booking_group_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `booking_orders_group_guest_idx` ON `booking_orders`(`booking_group_guest_id`);

-- CreateIndex
CREATE INDEX `booking_order_service_items_service_idx` ON `booking_order_service_items`(`service_id`);

-- AddForeignKey
ALTER TABLE `booking_groups` ADD CONSTRAINT `booking_groups_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_groups` ADD CONSTRAINT `booking_groups_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_group_guests` ADD CONSTRAINT `booking_group_guests_booking_group_id_fkey` FOREIGN KEY (`booking_group_id`) REFERENCES `booking_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_orders` ADD CONSTRAINT `booking_orders_booking_group_guest_id_fkey` FOREIGN KEY (`booking_group_guest_id`) REFERENCES `booking_group_guests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_order_service_items` ADD CONSTRAINT `booking_order_service_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
