-- CreateTable
CREATE TABLE `shop_customer_memberships` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `customer_profile_id` INTEGER NOT NULL,
  `status` ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  `source` ENUM('merchant_manual') NOT NULL DEFAULT 'merchant_manual',
  `active_key` VARCHAR(191) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ended_at` DATETIME(3) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_customer_memberships_public_id_key`(`public_id`),
  UNIQUE INDEX `shop_customer_memberships_active_key_key`(`active_key`),
  INDEX `shop_customer_memberships_shop_status_idx`(`shop_id`, `status`, `started_at`, `deleted_at`),
  INDEX `shop_customer_memberships_customer_status_idx`(`customer_profile_id`, `status`, `started_at`, `deleted_at`),
  INDEX `shop_customer_memberships_created_by_idx`(`created_by_id`),
  INDEX `shop_customer_memberships_updated_by_idx`(`updated_by_id`),
  INDEX `shop_customer_memberships_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_membership_cards` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `membership_id` INTEGER NOT NULL,
  `card_no` VARCHAR(40) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `type` ENUM('stored_value', 'count', 'benefit') NOT NULL,
  `status` ENUM('active', 'frozen', 'expired', 'void') NOT NULL DEFAULT 'active',
  `principal_balance_jpy` INTEGER NULL,
  `bonus_balance_jpy` INTEGER NULL,
  `remaining_uses` INTEGER NULL,
  `total_uses` INTEGER NULL,
  `issued_at` DATETIME(3) NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `frozen_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_membership_cards_public_id_key`(`public_id`),
  UNIQUE INDEX `shop_membership_cards_card_no_key`(`card_no`),
  INDEX `shop_membership_cards_membership_status_idx`(`membership_id`, `status`, `deleted_at`),
  INDEX `shop_membership_cards_status_expiry_idx`(`status`, `expires_at`, `deleted_at`),
  INDEX `shop_membership_cards_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `shop_customer_memberships`
  ADD CONSTRAINT `shop_customer_memberships_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_customer_memberships`
  ADD CONSTRAINT `shop_customer_memberships_customer_profile_id_fkey`
  FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_customer_memberships`
  ADD CONSTRAINT `shop_customer_memberships_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_customer_memberships`
  ADD CONSTRAINT `shop_customer_memberships_updated_by_id_fkey`
  FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_membership_cards`
  ADD CONSTRAINT `shop_membership_cards_membership_id_fkey`
  FOREIGN KEY (`membership_id`) REFERENCES `shop_customer_memberships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
