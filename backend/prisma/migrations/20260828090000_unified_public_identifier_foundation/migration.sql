-- Add nullable transition columns without changing the active legacy runtime.
ALTER TABLE `users`
  ADD COLUMN `account_no` CHAR(10) NULL,
  ADD COLUMN `primary_identity_type` ENUM('u', 'needo') NULL,
  ADD UNIQUE INDEX `users_account_no_key`(`account_no`),
  ADD INDEX `users_primary_identity_type_idx`(`primary_identity_type`),
  ADD CONSTRAINT `users_account_no_format_check`
    CHECK (`account_no` IS NULL OR `account_no` REGEXP '^[0-9]{10}$'),
  ADD CONSTRAINT `users_primary_identity_pair_check`
    CHECK (
      (`account_no` IS NULL AND `primary_identity_type` IS NULL)
      OR (`account_no` IS NOT NULL AND `primary_identity_type` IS NOT NULL)
    );

ALTER TABLE `shops`
  ADD COLUMN `shop_no` CHAR(10) NULL,
  ADD UNIQUE INDEX `shops_shop_no_key`(`shop_no`),
  ADD CONSTRAINT `shops_shop_no_format_check`
    CHECK (`shop_no` IS NULL OR `shop_no` REGEXP '^[0-9]{10}$');

ALTER TABLE `merchant_accounts`
  ADD COLUMN `owner_no` CHAR(10) NULL,
  ADD UNIQUE INDEX `merchant_accounts_owner_no_key`(`owner_no`),
  ADD CONSTRAINT `merchant_accounts_owner_no_format_check`
    CHECK (`owner_no` IS NULL OR `owner_no` REGEXP '^[0-9]{10}$');

-- CreateTable
CREATE TABLE `customer_support_accounts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NULL,
  `type` ENUM('shop', 'needo_official') NOT NULL,
  `display_name` VARCHAR(160) NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `customer_support_accounts_shop_id_key`(`shop_id`),
  INDEX `customer_support_accounts_type_is_active_idx`(`type`, `is_active`),
  INDEX `customer_support_accounts_deleted_at_idx`(`deleted_at`),
  CONSTRAINT `customer_support_accounts_owner_check` CHECK (
    (`type` = 'shop' AND `shop_id` IS NOT NULL)
    OR (`type` = 'needo_official' AND `shop_id` IS NULL)
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `public_identifiers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` VARCHAR(32) NOT NULL,
  `number_part` CHAR(10) NOT NULL,
  `kind` ENUM('u', 'needo', 's', 'b', 'o', 'shop', 'owner', 'cs') NOT NULL,
  `user_identity_id` INTEGER NULL,
  `shop_id` INTEGER NULL,
  `merchant_account_id` INTEGER NULL,
  `customer_support_account_id` INTEGER NULL,
  `login_allowed` BOOLEAN NOT NULL DEFAULT false,
  `searchable` BOOLEAN NOT NULL DEFAULT false,
  `status` ENUM('active', 'disabled', 'tombstoned') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `public_identifiers_public_id_key`(`public_id`),
  UNIQUE INDEX `public_identifiers_user_identity_id_key`(`user_identity_id`),
  UNIQUE INDEX `public_identifiers_shop_id_key`(`shop_id`),
  UNIQUE INDEX `public_identifiers_merchant_account_id_key`(`merchant_account_id`),
  UNIQUE INDEX `public_identifiers_customer_support_account_id_key`(`customer_support_account_id`),
  UNIQUE INDEX `public_identifiers_kind_number_part_key`(`kind`, `number_part`),
  INDEX `public_identifiers_number_part_idx`(`number_part`),
  INDEX `public_identifiers_status_idx`(`status`),
  INDEX `public_identifiers_deleted_at_idx`(`deleted_at`),
  CONSTRAINT `public_identifiers_number_part_format_check` CHECK (
    `number_part` REGEXP '^[0-9]{10}$'
  ),
  CONSTRAINT `public_identifiers_single_target_check` CHECK (
    (`user_identity_id` IS NOT NULL)
    + (`shop_id` IS NOT NULL)
    + (`merchant_account_id` IS NOT NULL)
    + (`customer_support_account_id` IS NOT NULL) = 1
  ),
  CONSTRAINT `public_identifiers_target_kind_check` CHECK (
    (`user_identity_id` IS NOT NULL AND `kind` IN ('u', 'needo', 's', 'b', 'o'))
    OR (`shop_id` IS NOT NULL AND `kind` = 'shop')
    OR (`merchant_account_id` IS NOT NULL AND `kind` = 'owner')
    OR (`customer_support_account_id` IS NOT NULL AND `kind` = 'cs')
  ),
  CONSTRAINT `public_identifiers_public_id_format_check` CHECK (
    BINARY `public_id` = BINARY CONCAT(`kind`, `number_part`)
  ),
  CONSTRAINT `public_identifiers_login_kind_check` CHECK (
    `login_allowed` = false OR `kind` IN ('u', 'needo', 's', 'b', 'o')
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vanity_number_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(80) NOT NULL,
  `kind` ENUM('repeated_digit', 'ascending_sequence', 'descending_sequence', 'repeated_block') NOT NULL,
  `minimum_length` INTEGER NOT NULL DEFAULT 6,
  `configuration` JSON NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `vanity_number_rules_code_key`(`code`),
  INDEX `vanity_number_rules_kind_is_active_idx`(`kind`, `is_active`),
  INDEX `vanity_number_rules_deleted_at_idx`(`deleted_at`),
  CONSTRAINT `vanity_number_rules_minimum_length_check` CHECK (
    `minimum_length` BETWEEN 2 AND 10
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vanity_number_reservations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `number_part` CHAR(10) NOT NULL,
  `rule_id` INTEGER NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'sealed',
  `reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `vanity_number_reservations_number_part_key`(`number_part`),
  INDEX `vanity_number_reservations_rule_id_idx`(`rule_id`),
  INDEX `vanity_number_reservations_status_idx`(`status`),
  INDEX `vanity_number_reservations_deleted_at_idx`(`deleted_at`),
  CONSTRAINT `vanity_number_reservations_number_part_format_check` CHECK (
    `number_part` REGEXP '^[0-9]{10}$'
  ),
  CONSTRAINT `vanity_number_reservations_status_check` CHECK (`status` = 'sealed'),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_support_accounts`
  ADD CONSTRAINT `customer_support_accounts_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `public_identifiers`
  ADD CONSTRAINT `public_identifiers_user_identity_id_fkey`
  FOREIGN KEY (`user_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `public_identifiers`
  ADD CONSTRAINT `public_identifiers_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `public_identifiers`
  ADD CONSTRAINT `public_identifiers_merchant_account_id_fkey`
  FOREIGN KEY (`merchant_account_id`) REFERENCES `merchant_accounts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `public_identifiers`
  ADD CONSTRAINT `public_identifiers_customer_support_account_id_fkey`
  FOREIGN KEY (`customer_support_account_id`) REFERENCES `customer_support_accounts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `vanity_number_reservations`
  ADD CONSTRAINT `vanity_number_reservations_rule_id_fkey`
  FOREIGN KEY (`rule_id`) REFERENCES `vanity_number_rules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
