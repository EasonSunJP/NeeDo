-- CreateTable
CREATE TABLE `order_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NOT NULL,
    `reviewer_user_id` INTEGER NOT NULL,
    `target_type` ENUM('customer', 'technician') NOT NULL,
    `customer_profile_id` INTEGER NULL,
    `technician_profile_id` INTEGER NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `order_reviews_booking_order_id_idx`(`booking_order_id`),
    INDEX `order_reviews_reviewer_user_id_idx`(`reviewer_user_id`),
    INDEX `order_reviews_target_type_idx`(`target_type`),
    INDEX `order_reviews_customer_profile_id_idx`(`customer_profile_id`),
    INDEX `order_reviews_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `order_reviews_created_at_idx`(`created_at`),
    INDEX `order_reviews_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `order_reviews_booking_order_id_reviewer_user_id_target_type_key`(`booking_order_id`, `reviewer_user_id`, `target_type`),
    CONSTRAINT `order_reviews_rating_check` CHECK (`rating` BETWEEN 1 AND 5),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_review_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_review_id` INTEGER NOT NULL,
    `label` VARCHAR(40) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `order_review_tags_order_review_id_idx`(`order_review_id`),
    INDEX `order_review_tags_label_idx`(`label`),
    INDEX `order_review_tags_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `order_review_tags_order_review_id_label_key`(`order_review_id`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backoffice_profile_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_type` ENUM('customer', 'technician') NOT NULL,
    `customer_profile_id` INTEGER NULL,
    `technician_profile_id` INTEGER NULL,
    `active_key` VARCHAR(191) NULL,
    `code` VARCHAR(80) NOT NULL,
    `label` VARCHAR(80) NOT NULL,
    `sentiment` ENUM('positive', 'negative') NOT NULL,
    `source` ENUM('system', 'manual', 'simulation_seed') NOT NULL,
    `rule_version` VARCHAR(40) NULL,
    `evidence_json` JSON NULL,
    `assigned_by_user_id` INTEGER NULL,
    `reason` VARCHAR(500) NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `backoffice_profile_tags_active_key_key`(`active_key`),
    INDEX `backoffice_profile_tags_target_type_idx`(`target_type`),
    INDEX `backoffice_profile_tags_customer_profile_id_idx`(`customer_profile_id`),
    INDEX `backoffice_profile_tags_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `backoffice_profile_tags_code_idx`(`code`),
    INDEX `backoffice_profile_tags_sentiment_idx`(`sentiment`),
    INDEX `backoffice_profile_tags_source_idx`(`source`),
    INDEX `backoffice_profile_tags_assigned_by_user_id_idx`(`assigned_by_user_id`),
    INDEX `backoffice_profile_tags_is_active_expires_at_idx`(`is_active`, `expires_at`),
    INDEX `backoffice_profile_tags_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_timeline_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `visibility` VARCHAR(40) NOT NULL DEFAULT 'backoffice',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `order_timeline_comments_booking_order_id_idx`(`booking_order_id`),
    INDEX `order_timeline_comments_actor_user_id_idx`(`actor_user_id`),
    INDEX `order_timeline_comments_visibility_idx`(`visibility`),
    INDEX `order_timeline_comments_created_at_idx`(`created_at`),
    INDEX `order_timeline_comments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_reviewer_user_id_fkey` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_reviews` ADD CONSTRAINT `order_reviews_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_review_tags` ADD CONSTRAINT `order_review_tags_order_review_id_fkey` FOREIGN KEY (`order_review_id`) REFERENCES `order_reviews`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backoffice_profile_tags` ADD CONSTRAINT `backoffice_profile_tags_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backoffice_profile_tags` ADD CONSTRAINT `backoffice_profile_tags_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backoffice_profile_tags` ADD CONSTRAINT `backoffice_profile_tags_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_timeline_comments` ADD CONSTRAINT `order_timeline_comments_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_timeline_comments` ADD CONSTRAINT `order_timeline_comments_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
