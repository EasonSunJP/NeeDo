-- CreateTable
CREATE TABLE `technician_shop_affiliations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `technician_profile_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `relationship_type` ENUM('exclusive', 'partner') NOT NULL,
    `work_status` ENUM('active', 'on_leave', 'suspended', 'ended') NOT NULL DEFAULT 'active',
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ends_at` DATETIME(3) NULL,
    `active_key` VARCHAR(191) NULL,
    `created_by_id` INTEGER NULL,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `tech_shop_affiliation_active_key_key`(`active_key`),
    INDEX `tech_shop_affiliation_profile_status_deleted_idx`(`technician_profile_id`, `work_status`, `deleted_at`),
    INDEX `tech_shop_affiliation_shop_status_deleted_idx`(`shop_id`, `work_status`, `deleted_at`),
    INDEX `tech_shop_affiliation_shop_profile_deleted_idx`(`shop_id`, `technician_profile_id`, `deleted_at`),
    INDEX `tech_shop_affiliation_created_by_idx`(`created_by_id`),
    INDEX `tech_shop_affiliation_updated_by_idx`(`updated_by_id`),
    INDEX `tech_shop_affiliation_deleted_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `technician_shop_affiliations` ADD CONSTRAINT `technician_shop_affiliations_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_shop_affiliations` ADD CONSTRAINT `technician_shop_affiliations_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_shop_affiliations` ADD CONSTRAINT `technician_shop_affiliations_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_shop_affiliations` ADD CONSTRAINT `technician_shop_affiliations_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
