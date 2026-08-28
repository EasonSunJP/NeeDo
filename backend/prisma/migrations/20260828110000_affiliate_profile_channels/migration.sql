-- CreateTable
CREATE TABLE `affiliate_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('active', 'suspended', 'closed') NOT NULL DEFAULT 'active',
    `cooperation_status` ENUM('available', 'selective', 'unavailable') NOT NULL DEFAULT 'available',
    `bio` VARCHAR(1000) NULL,
    `strengths` JSON NULL,
    `service_areas` JSON NULL,
    `suspended_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_profiles_user_id_key`(`user_id`),
    INDEX `affiliate_profiles_status_cooperation_status_idx`(`status`, `cooperation_status`),
    INDEX `affiliate_profiles_updated_at_idx`(`updated_at`),
    INDEX `affiliate_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_profile_channels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `profile_id` INTEGER NOT NULL,
    `platform` ENUM('x', 'instagram', 'youtube', 'tiktok', 'custom') NOT NULL,
    `custom_label` VARCHAR(60) NULL,
    `homepage_url` VARCHAR(500) NOT NULL,
    `active_key` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_profile_channels_active_key_key`(`active_key`),
    INDEX `affiliate_profile_channels_profile_id_sort_order_idx`(`profile_id`, `sort_order`),
    INDEX `affiliate_profile_channels_platform_idx`(`platform`),
    INDEX `affiliate_profile_channels_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `affiliate_profiles` ADD CONSTRAINT `affiliate_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_profile_channels` ADD CONSTRAINT `affiliate_profile_channels_profile_id_fkey` FOREIGN KEY (`profile_id`) REFERENCES `affiliate_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
