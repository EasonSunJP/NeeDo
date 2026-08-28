-- Expand the shared owner enum without changing existing wallet rows.
ALTER TABLE `wallets` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account', 'alliance') NOT NULL;
ALTER TABLE `wallet_adjustment_requests` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account', 'alliance') NOT NULL;
ALTER TABLE `wallet_holds` MODIFY `owner_type` ENUM('user', 'shop', 'platform', 'merchant_account', 'alliance') NOT NULL;

-- CreateTable
CREATE TABLE `affiliate_alliances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `owner_user_id` INTEGER NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` ENUM('active', 'suspended', 'closed') NOT NULL DEFAULT 'active',
    `default_promoter_share_bps` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_alliances_owner_user_id_idx`(`owner_user_id`),
    INDEX `affiliate_alliances_status_idx`(`status`),
    INDEX `affiliate_alliances_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `affiliate_alliances_default_promoter_share_bps_check`
      CHECK (`default_promoter_share_bps` BETWEEN 0 AND 10000),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_alliance_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alliance_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `role` ENUM('owner', 'partner', 'subordinate') NOT NULL,
    `parent_member_id` INTEGER NULL,
    `promoter_share_bps_override` INTEGER NULL,
    `active_key` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `left_at` DATETIME(3) NULL,
    `left_reason` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_alliance_members_active_key_key`(`active_key`),
    INDEX `affiliate_alliance_members_alliance_id_role_idx`(`alliance_id`, `role`),
    INDEX `affiliate_alliance_members_user_id_idx`(`user_id`),
    INDEX `affiliate_alliance_members_parent_member_id_idx`(`parent_member_id`),
    INDEX `affiliate_alliance_members_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `affiliate_alliance_members_promoter_share_bps_override_check`
      CHECK (`promoter_share_bps_override` IS NULL OR `promoter_share_bps_override` BETWEEN 0 AND 10000),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_alliance_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `member_id` INTEGER NOT NULL,
    `can_claim_tasks` BOOLEAN NOT NULL DEFAULT false,
    `can_view_alliance_overview` BOOLEAN NOT NULL DEFAULT false,
    `can_view_member_details` BOOLEAN NOT NULL DEFAULT false,
    `can_manage_own_subordinates` BOOLEAN NOT NULL DEFAULT false,
    `can_view_alliance_wallet` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_alliance_permissions_member_id_key`(`member_id`),
    INDEX `affiliate_alliance_permissions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `affiliate_alliances` ADD CONSTRAINT `affiliate_alliances_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_members` ADD CONSTRAINT `affiliate_alliance_members_alliance_id_fkey` FOREIGN KEY (`alliance_id`) REFERENCES `affiliate_alliances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_members` ADD CONSTRAINT `affiliate_alliance_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_members` ADD CONSTRAINT `affiliate_alliance_members_parent_member_id_fkey` FOREIGN KEY (`parent_member_id`) REFERENCES `affiliate_alliance_members`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_permissions` ADD CONSTRAINT `affiliate_alliance_permissions_member_id_fkey` FOREIGN KEY (`member_id`) REFERENCES `affiliate_alliance_members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
