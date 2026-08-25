-- AlterTable
ALTER TABLE `media_assets`
    ADD COLUMN `owner_user_id` INTEGER NULL,
    ADD COLUMN `checksum_sha256` CHAR(64) NULL,
    ADD COLUMN `purge_at` DATETIME(3) NULL,
    ADD COLUMN `purged_at` DATETIME(3) NULL;

CREATE INDEX `media_assets_owner_user_id_idx` ON `media_assets`(`owner_user_id`);
CREATE INDEX `media_assets_purge_at_idx` ON `media_assets`(`purge_at`);

-- CreateTable
CREATE TABLE `identity_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` VARCHAR(40) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
    `active_key` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `submitted_snapshot_hash` CHAR(64) NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewer_user_id` INTEGER NULL,
    `rejection_reason` VARCHAR(1000) NULL,
    `closed_at` DATETIME(3) NULL,
    `purge_at` DATETIME(3) NULL,
    `purged_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `identity_applications_active_key_key`(`active_key`),
    INDEX `identity_applications_user_id_type_status_idx`(`user_id`, `type`, `status`),
    INDEX `identity_applications_reviewer_user_id_idx`(`reviewer_user_id`),
    INDEX `identity_applications_status_submitted_at_idx`(`status`, `submitted_at`),
    INDEX `identity_applications_purge_at_purged_at_idx`(`purge_at`, `purged_at`),
    INDEX `identity_applications_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `protected_bank_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` INTEGER NOT NULL,
    `purpose` VARCHAR(40) NOT NULL,
    `bank_code` VARCHAR(16) NOT NULL,
    `bank_name` VARCHAR(120) NOT NULL,
    `branch_code` VARCHAR(16) NOT NULL,
    `branch_name` VARCHAR(120) NOT NULL,
    `account_type` VARCHAR(32) NOT NULL,
    `account_number_encrypted` TEXT NOT NULL,
    `account_holder_encrypted` TEXT NOT NULL,
    `account_holder_normalized_encrypted` TEXT NOT NULL,
    `holder_match_hash` CHAR(64) NOT NULL,
    `verification_source` VARCHAR(40) NOT NULL,
    `verification_status` VARCHAR(40) NOT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `protected_bank_accounts_owner_user_id_purpose_idx`(`owner_user_id`, `purpose`),
    INDEX `protected_bank_accounts_verification_status_idx`(`verification_status`),
    INDEX `protected_bank_accounts_holder_match_hash_idx`(`holder_match_hash`),
    INDEX `protected_bank_accounts_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_acceptances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accepted_by_user_id` INTEGER NOT NULL,
    `identity_application_id` INTEGER NULL,
    `contract_type` VARCHAR(40) NOT NULL,
    `contract_version` VARCHAR(80) NOT NULL,
    `effective_at` DATETIME(3) NOT NULL,
    `accepted_text_snapshot` LONGTEXT NOT NULL,
    `content_hash` CHAR(64) NOT NULL,
    `accepted_at` DATETIME(3) NOT NULL,
    `language` VARCHAR(16) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `receipt_id` VARCHAR(191) NOT NULL,
    `acceptance_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `contract_acceptances_receipt_id_key`(`receipt_id`),
    UNIQUE INDEX `contract_acceptances_acceptance_key_key`(`acceptance_key`),
    INDEX `contract_acceptances_accepted_by_user_id_contract_type_idx`(`accepted_by_user_id`, `contract_type`),
    INDEX `contract_acceptances_identity_application_id_idx`(`identity_application_id`),
    INDEX `contract_acceptances_contract_type_contract_version_idx`(`contract_type`, `contract_version`),
    INDEX `contract_acceptances_accepted_at_idx`(`accepted_at`),
    INDEX `contract_acceptances_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_application_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `target_shop_id` INTEGER NOT NULL,
    `applicant_name` VARCHAR(120) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `city` VARCHAR(100) NULL,
    `service_areas` JSON NULL,
    `skills` JSON NULL,
    `years_experience` INTEGER NULL,
    `bio` TEXT NULL,
    `gender` VARCHAR(32) NULL,
    `birth_date` DATE NULL,
    `submitted_snapshot` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_application_details_application_id_key`(`application_id`),
    INDEX `technician_application_details_target_shop_id_idx`(`target_shop_id`),
    INDEX `technician_application_details_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_application_details` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `applicant_kind` VARCHAR(40) NOT NULL,
    `corporate_legal_name` VARCHAR(191) NULL,
    `corporate_legal_name_kana` VARCHAR(191) NULL,
    `representative_name` VARCHAR(120) NOT NULL,
    `representative_name_kana` VARCHAR(191) NOT NULL,
    `shop_name` VARCHAR(160) NOT NULL,
    `business_address` VARCHAR(255) NOT NULL,
    `contact_phone` VARCHAR(32) NOT NULL,
    `responsible_person_name` VARCHAR(120) NOT NULL,
    `showcase_draft` JSON NULL,
    `submitted_snapshot` JSON NULL,
    `bank_account_id` INTEGER NULL,
    `contract_acceptance_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `merchant_application_details_application_id_key`(`application_id`),
    UNIQUE INDEX `merchant_application_details_contract_acceptance_id_key`(`contract_acceptance_id`),
    INDEX `merchant_application_details_bank_account_id_idx`(`bank_account_id`),
    INDEX `merchant_application_details_applicant_kind_idx`(`applicant_kind`),
    INDEX `merchant_application_details_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `identity_application_media` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `application_id` INTEGER NOT NULL,
    `media_asset_id` INTEGER NOT NULL,
    `purpose` VARCHAR(50) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `identity_application_media_media_asset_id_idx`(`media_asset_id`),
    INDEX `identity_application_media_application_id_purpose_idx`(`application_id`, `purpose`),
    INDEX `identity_application_media_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `identity_application_media_application_id_media_asset_id_key`(`application_id`, `media_asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_applications` ADD CONSTRAINT `identity_applications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_applications` ADD CONSTRAINT `identity_applications_reviewer_user_id_fkey` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `protected_bank_accounts` ADD CONSTRAINT `protected_bank_accounts_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_acceptances` ADD CONSTRAINT `contract_acceptances_accepted_by_user_id_fkey` FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_acceptances` ADD CONSTRAINT `contract_acceptances_identity_application_id_fkey` FOREIGN KEY (`identity_application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_application_details` ADD CONSTRAINT `technician_application_details_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_application_details` ADD CONSTRAINT `technician_application_details_target_shop_id_fkey` FOREIGN KEY (`target_shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_application_details` ADD CONSTRAINT `merchant_application_details_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_application_details` ADD CONSTRAINT `merchant_application_details_bank_account_id_fkey` FOREIGN KEY (`bank_account_id`) REFERENCES `protected_bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_application_details` ADD CONSTRAINT `merchant_application_details_contract_acceptance_id_fkey` FOREIGN KEY (`contract_acceptance_id`) REFERENCES `contract_acceptances`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_application_media` ADD CONSTRAINT `identity_application_media_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `identity_application_media` ADD CONSTRAINT `identity_application_media_media_asset_id_fkey` FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
