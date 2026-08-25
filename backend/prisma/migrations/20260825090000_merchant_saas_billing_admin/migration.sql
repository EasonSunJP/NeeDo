-- CreateTable
CREATE TABLE `merchant_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(100) NOT NULL,
    `owner_user_id` INTEGER NULL,
    `name` VARCHAR(160) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `payment_responsibility` VARCHAR(40) NOT NULL DEFAULT 'group_consolidated',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `merchant_accounts_code_key`(`code`),
    INDEX `merchant_accounts_owner_user_id_idx`(`owner_user_id`),
    INDEX `merchant_accounts_status_idx`(`status`),
    INDEX `merchant_accounts_payment_responsibility_idx`(`payment_responsibility`),
    INDEX `merchant_accounts_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `merchant_shop_memberships` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `merchant_account_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `active_key` VARCHAR(120) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NULL,
    `removed_reason` VARCHAR(500) NULL,
    `created_by_id` INTEGER NULL,
    `removed_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `merchant_shop_memberships_active_key_key`(`active_key`),
    INDEX `merchant_shop_memberships_merchant_account_id_idx`(`merchant_account_id`),
    INDEX `merchant_shop_memberships_shop_id_idx`(`shop_id`),
    INDEX `merchant_shop_memberships_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `merchant_shop_memberships_created_by_id_idx`(`created_by_id`),
    INDEX `merchant_shop_memberships_removed_by_id_idx`(`removed_by_id`),
    INDEX `merchant_shop_memberships_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saas_billing_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_type` VARCHAR(40) NOT NULL,
    `subject_id` INTEGER NOT NULL,
    `merchant_account_id` INTEGER NULL,
    `shop_id` INTEGER NULL,
    `active_key` VARCHAR(120) NULL,
    `billing_cadence` VARCHAR(40) NOT NULL DEFAULT 'monthly',
    `monthly_fee_jpy` INTEGER NOT NULL DEFAULT 9800,
    `cadence_locked` BOOLEAN NOT NULL DEFAULT false,
    `amount_locked` BOOLEAN NOT NULL DEFAULT false,
    `trial_status` VARCHAR(40) NOT NULL DEFAULT 'not_started',
    `trial_started_at` DATETIME(3) NULL,
    `trial_ends_at` DATETIME(3) NULL,
    `trial_used_at` DATETIME(3) NULL,
    `paid_through` DATETIME(3) NULL,
    `payment_provider` VARCHAR(40) NOT NULL DEFAULT 'manual',
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `saas_billing_profiles_active_key_key`(`active_key`),
    INDEX `saas_billing_profiles_subject_type_subject_id_idx`(`subject_type`, `subject_id`),
    INDEX `saas_billing_profiles_merchant_account_id_idx`(`merchant_account_id`),
    INDEX `saas_billing_profiles_shop_id_idx`(`shop_id`),
    INDEX `saas_billing_profiles_billing_cadence_idx`(`billing_cadence`),
    INDEX `saas_billing_profiles_trial_status_idx`(`trial_status`),
    INDEX `saas_billing_profiles_payment_provider_idx`(`payment_provider`),
    INDEX `saas_billing_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saas_free_periods` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `billing_profile_id` INTEGER NOT NULL,
    `period_type` VARCHAR(40) NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `extension_sequence` INTEGER NULL,
    `reason` VARCHAR(500) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `saas_free_periods_idempotency_key_key`(`idempotency_key`),
    INDEX `saas_free_periods_billing_profile_id_idx`(`billing_profile_id`),
    INDEX `saas_free_periods_period_type_idx`(`period_type`),
    INDEX `saas_free_periods_starts_at_ends_at_idx`(`starts_at`, `ends_at`),
    INDEX `saas_free_periods_extension_sequence_idx`(`extension_sequence`),
    INDEX `saas_free_periods_created_by_id_idx`(`created_by_id`),
    INDEX `saas_free_periods_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saas_invoices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_no` VARCHAR(80) NOT NULL,
    `payer_type` VARCHAR(40) NOT NULL,
    `merchant_account_id` INTEGER NULL,
    `shop_id` INTEGER NULL,
    `billing_cadence` VARCHAR(40) NOT NULL,
    `period_starts_at` DATETIME(3) NOT NULL,
    `period_ends_at` DATETIME(3) NOT NULL,
    `due_at` DATETIME(3) NOT NULL,
    `amount_jpy` INTEGER NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
    `payment_provider` VARCHAR(40) NOT NULL DEFAULT 'manual',
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `saas_invoices_invoice_no_key`(`invoice_no`),
    UNIQUE INDEX `saas_invoices_idempotency_key_key`(`idempotency_key`),
    INDEX `saas_invoices_payer_type_idx`(`payer_type`),
    INDEX `saas_invoices_merchant_account_id_idx`(`merchant_account_id`),
    INDEX `saas_invoices_shop_id_idx`(`shop_id`),
    INDEX `saas_invoices_period_starts_at_period_ends_at_idx`(`period_starts_at`, `period_ends_at`),
    INDEX `saas_invoices_due_at_idx`(`due_at`),
    INDEX `saas_invoices_status_idx`(`status`),
    INDEX `saas_invoices_payment_provider_idx`(`payment_provider`),
    INDEX `saas_invoices_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saas_invoice_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `subject_type` VARCHAR(40) NOT NULL,
    `merchant_account_id` INTEGER NULL,
    `shop_id` INTEGER NULL,
    `description` VARCHAR(255) NOT NULL,
    `monthly_fee_jpy` INTEGER NOT NULL,
    `amount_jpy` INTEGER NOT NULL,
    `period_starts_at` DATETIME(3) NOT NULL,
    `period_ends_at` DATETIME(3) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `saas_invoice_lines_idempotency_key_key`(`idempotency_key`),
    INDEX `saas_invoice_lines_invoice_id_idx`(`invoice_id`),
    INDEX `saas_invoice_lines_subject_type_idx`(`subject_type`),
    INDEX `saas_invoice_lines_merchant_account_id_idx`(`merchant_account_id`),
    INDEX `saas_invoice_lines_shop_id_idx`(`shop_id`),
    INDEX `saas_invoice_lines_period_starts_at_period_ends_at_idx`(`period_starts_at`, `period_ends_at`),
    INDEX `saas_invoice_lines_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `saas_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoice_id` INTEGER NOT NULL,
    `provider` VARCHAR(40) NOT NULL DEFAULT 'manual',
    `external_reference` VARCHAR(191) NULL,
    `amount_jpy` INTEGER NOT NULL,
    `received_at` DATETIME(3) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'pending_review',
    `reviewed_by_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `saas_payments_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `saas_payments_provider_external_reference_key`(`provider`, `external_reference`),
    INDEX `saas_payments_invoice_id_idx`(`invoice_id`),
    INDEX `saas_payments_status_idx`(`status`),
    INDEX `saas_payments_received_at_idx`(`received_at`),
    INDEX `saas_payments_reviewed_by_id_idx`(`reviewed_by_id`),
    INDEX `saas_payments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `entity_suspensions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `subject_type` VARCHAR(40) NOT NULL,
    `merchant_account_id` INTEGER NULL,
    `shop_id` INTEGER NULL,
    `active_key` VARCHAR(120) NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `scope` VARCHAR(60) NOT NULL,
    `reason_codes` JSON NOT NULL,
    `note` VARCHAR(1000) NULL,
    `created_by_id` INTEGER NOT NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `released_at` DATETIME(3) NULL,
    `released_by_id` INTEGER NULL,
    `release_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `entity_suspensions_active_key_key`(`active_key`),
    INDEX `entity_suspensions_subject_type_idx`(`subject_type`),
    INDEX `entity_suspensions_merchant_account_id_idx`(`merchant_account_id`),
    INDEX `entity_suspensions_shop_id_idx`(`shop_id`),
    INDEX `entity_suspensions_status_idx`(`status`),
    INDEX `entity_suspensions_scope_idx`(`scope`),
    INDEX `entity_suspensions_created_by_id_idx`(`created_by_id`),
    INDEX `entity_suspensions_released_by_id_idx`(`released_by_id`),
    INDEX `entity_suspensions_starts_at_idx`(`starts_at`),
    INDEX `entity_suspensions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `merchant_accounts` ADD CONSTRAINT `merchant_accounts_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_shop_memberships` ADD CONSTRAINT `merchant_shop_memberships_merchant_account_id_fkey` FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_shop_memberships` ADD CONSTRAINT `merchant_shop_memberships_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_shop_memberships` ADD CONSTRAINT `merchant_shop_memberships_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `merchant_shop_memberships` ADD CONSTRAINT `merchant_shop_memberships_removed_by_id_fkey` FOREIGN KEY (`removed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_billing_profiles` ADD CONSTRAINT `saas_billing_profiles_merchant_account_id_fkey` FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_billing_profiles` ADD CONSTRAINT `saas_billing_profiles_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_free_periods` ADD CONSTRAINT `saas_free_periods_billing_profile_id_fkey` FOREIGN KEY (`billing_profile_id`) REFERENCES `saas_billing_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_free_periods` ADD CONSTRAINT `saas_free_periods_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_invoices` ADD CONSTRAINT `saas_invoices_merchant_account_id_fkey` FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_invoices` ADD CONSTRAINT `saas_invoices_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_invoice_lines` ADD CONSTRAINT `saas_invoice_lines_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `saas_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_invoice_lines` ADD CONSTRAINT `saas_invoice_lines_merchant_account_id_fkey` FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_invoice_lines` ADD CONSTRAINT `saas_invoice_lines_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_payments` ADD CONSTRAINT `saas_payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `saas_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `saas_payments` ADD CONSTRAINT `saas_payments_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_suspensions` ADD CONSTRAINT `entity_suspensions_merchant_account_id_fkey` FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_suspensions` ADD CONSTRAINT `entity_suspensions_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_suspensions` ADD CONSTRAINT `entity_suspensions_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entity_suspensions` ADD CONSTRAINT `entity_suspensions_released_by_id_fkey` FOREIGN KEY (`released_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
