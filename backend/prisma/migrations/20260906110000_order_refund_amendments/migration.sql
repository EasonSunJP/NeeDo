-- CreateTable
CREATE TABLE `order_refund_amendments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `display_reference` VARCHAR(120) NULL,
    `note` VARCHAR(500) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `revised_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_refund_amendments_public_id_key`(`public_id`),
    UNIQUE INDEX `order_refund_amendments_order_version_key`(`booking_order_id`, `version`),
    INDEX `order_refund_amendments_order_created_idx`(`booking_order_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_amendments_revised_by_id_idx`(`revised_by_id`),
    INDEX `order_refund_amendments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_refund_amendments` ADD CONSTRAINT `order_refund_amendments_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_amendments` ADD CONSTRAINT `order_refund_amendments_revised_by_id_fkey` FOREIGN KEY (`revised_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_refund_amendments`
  ADD CONSTRAINT `order_refund_amendments_version_chk` CHECK (`version` >= 1),
  ADD CONSTRAINT `order_refund_amendments_reason_chk` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 500);
