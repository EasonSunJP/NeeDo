-- CreateTable
CREATE TABLE `order_review_amendments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `order_review_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `rating` INTEGER NULL,
    `comment` TEXT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `revised_by_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_review_amendments_public_id_key`(`public_id`),
    UNIQUE INDEX `order_review_amendments_review_version_key`(`order_review_id`, `version`),
    INDEX `order_review_amendments_review_created_idx`(`order_review_id`, `created_at`, `deleted_at`),
    INDEX `order_review_amendments_revised_by_id_idx`(`revised_by_id`),
    INDEX `order_review_amendments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_review_amendment_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amendment_id` INTEGER NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_review_amendment_tags_key`(`amendment_id`, `label`),
    INDEX `order_review_amendment_tags_label_idx`(`label`),
    INDEX `order_review_amendment_tags_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_review_amendments` ADD CONSTRAINT `order_review_amendments_order_review_id_fkey` FOREIGN KEY (`order_review_id`) REFERENCES `order_reviews`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_review_amendments` ADD CONSTRAINT `order_review_amendments_revised_by_id_fkey` FOREIGN KEY (`revised_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_review_amendment_tags` ADD CONSTRAINT `order_review_amendment_tags_amendment_id_fkey` FOREIGN KEY (`amendment_id`) REFERENCES `order_review_amendments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_review_amendments`
  ADD CONSTRAINT `order_review_amendments_version_chk` CHECK (`version` >= 1),
  ADD CONSTRAINT `order_review_amendments_rating_chk` CHECK (`rating` IS NULL OR `rating` BETWEEN 1 AND 5),
  ADD CONSTRAINT `order_review_amendments_reason_chk` CHECK (CHAR_LENGTH(TRIM(`reason`)) BETWEEN 1 AND 500);

ALTER TABLE `order_review_amendment_tags`
  ADD CONSTRAINT `order_review_amendment_tags_label_chk` CHECK (CHAR_LENGTH(TRIM(`label`)) BETWEEN 1 AND 40);
