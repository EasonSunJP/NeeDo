-- CreateTable
CREATE TABLE `ekyc_verifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `provider` VARCHAR(80) NOT NULL,
    `provider_reference` VARCHAR(191) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `verified_name_encrypted` TEXT NOT NULL,
    `verified_name_kana_encrypted` TEXT NOT NULL,
    `name_match_hash` CHAR(64) NOT NULL,
    `result_hash` CHAR(64) NOT NULL,
    `verified_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `ekyc_verifications_provider_reference_key`(`provider_reference`),
    INDEX `ekyc_verifications_user_id_status_idx`(`user_id`, `status`),
    INDEX `ekyc_verifications_name_match_hash_idx`(`name_match_hash`),
    INDEX `ekyc_verifications_expires_at_idx`(`expires_at`),
    INDEX `ekyc_verifications_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ekyc_verifications` ADD CONSTRAINT `ekyc_verifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
