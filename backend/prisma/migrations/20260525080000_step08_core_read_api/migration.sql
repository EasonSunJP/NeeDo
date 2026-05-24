-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(100) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `name_ja` VARCHAR(120) NULL,
    `name_en` VARCHAR(120) NULL,
    `parent_id` INTEGER NULL,
    `icon_url` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `categories_code_key`(`code`),
    INDEX `categories_parent_id_idx`(`parent_id`),
    INDEX `categories_sort_order_idx`(`sort_order`),
    INDEX `categories_is_active_idx`(`is_active`),
    INDEX `categories_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shops` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `city` VARCHAR(100) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `phone` VARCHAR(32) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'published',
    `is_recommended` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `shops_owner_user_id_idx`(`owner_user_id`),
    INDEX `shops_city_idx`(`city`),
    INDEX `shops_status_idx`(`status`),
    INDEX `shops_is_recommended_idx`(`is_recommended`),
    INDEX `shops_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `shop_id` INTEGER NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `bio` TEXT NULL,
    `city` VARCHAR(100) NOT NULL,
    `service_area` VARCHAR(255) NULL,
    `years_experience` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(50) NOT NULL DEFAULT 'published',
    `is_recommended` BOOLEAN NOT NULL DEFAULT false,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_profiles_user_id_key`(`user_id`),
    INDEX `technician_profiles_shop_id_idx`(`shop_id`),
    INDEX `technician_profiles_city_idx`(`city`),
    INDEX `technician_profiles_status_idx`(`status`),
    INDEX `technician_profiles_is_recommended_idx`(`is_recommended`),
    INDEX `technician_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `bio` TEXT NULL,
    `city` VARCHAR(100) NULL,
    `membership_level` VARCHAR(50) NOT NULL DEFAULT 'standard',
    `is_public` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `customer_profiles_user_id_key`(`user_id`),
    INDEX `customer_profiles_city_idx`(`city`),
    INDEX `customer_profiles_is_public_idx`(`is_public`),
    INDEX `customer_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `technician_profile_id` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `city` VARCHAR(100) NOT NULL,
    `service_mode` VARCHAR(50) NOT NULL DEFAULT 'store',
    `price_amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
    `duration_minutes` INTEGER NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'published',
    `is_recommended` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `services_category_id_idx`(`category_id`),
    INDEX `services_shop_id_idx`(`shop_id`),
    INDEX `services_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `services_city_idx`(`city`),
    INDEX `services_status_idx`(`status`),
    INDEX `services_is_recommended_idx`(`is_recommended`),
    INDEX `services_price_amount_idx`(`price_amount`),
    INDEX `services_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entity_type` VARCHAR(50) NOT NULL,
    `entity_id` INTEGER NOT NULL,
    `category_id` INTEGER NULL,
    `service_id` INTEGER NULL,
    `shop_id` INTEGER NULL,
    `technician_profile_id` INTEGER NULL,
    `customer_profile_id` INTEGER NULL,
    `url` VARCHAR(500) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
    `usage_type` VARCHAR(50) NOT NULL DEFAULT 'gallery',
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `alt_text` VARCHAR(255) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `media_assets_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `media_assets_category_id_idx`(`category_id`),
    INDEX `media_assets_service_id_idx`(`service_id`),
    INDEX `media_assets_shop_id_idx`(`shop_id`),
    INDEX `media_assets_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `media_assets_customer_profile_id_idx`(`customer_profile_id`),
    INDEX `media_assets_usage_type_idx`(`usage_type`),
    INDEX `media_assets_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_summaries` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `target_type` VARCHAR(50) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `shop_id` INTEGER NULL,
    `service_id` INTEGER NULL,
    `technician_profile_id` INTEGER NULL,
    `customer_profile_id` INTEGER NULL,
    `rating_average` DECIMAL(3, 2) NOT NULL DEFAULT 0,
    `review_count` INTEGER NOT NULL DEFAULT 0,
    `latest_review_at` DATETIME(3) NULL,
    `highlights` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `review_summaries_shop_id_key`(`shop_id`),
    UNIQUE INDEX `review_summaries_service_id_key`(`service_id`),
    UNIQUE INDEX `review_summaries_technician_profile_id_key`(`technician_profile_id`),
    UNIQUE INDEX `review_summaries_customer_profile_id_key`(`customer_profile_id`),
    UNIQUE INDEX `review_summaries_target_type_target_id_key`(`target_type`, `target_id`),
    INDEX `review_summaries_shop_id_idx`(`shop_id`),
    INDEX `review_summaries_service_id_idx`(`service_id`),
    INDEX `review_summaries_technician_profile_id_idx`(`technician_profile_id`),
    INDEX `review_summaries_customer_profile_id_idx`(`customer_profile_id`),
    INDEX `review_summaries_rating_average_idx`(`rating_average`),
    INDEX `review_summaries_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shops` ADD CONSTRAINT `shops_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_profiles` ADD CONSTRAINT `technician_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_profiles` ADD CONSTRAINT `technician_profiles_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_profiles` ADD CONSTRAINT `customer_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_summaries` ADD CONSTRAINT `review_summaries_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_summaries` ADD CONSTRAINT `review_summaries_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_summaries` ADD CONSTRAINT `review_summaries_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_summaries` ADD CONSTRAINT `review_summaries_customer_profile_id_fkey` FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
