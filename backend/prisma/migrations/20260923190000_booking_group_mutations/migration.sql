CREATE TABLE `booking_group_mutations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_group_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `order_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `booking_group_mutations_group_key`(`booking_group_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking_group_mutations`
    ADD CONSTRAINT `booking_group_mutations_booking_group_id_fkey`
    FOREIGN KEY (`booking_group_id`) REFERENCES `booking_groups`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
