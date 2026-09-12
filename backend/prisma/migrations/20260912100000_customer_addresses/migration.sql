CREATE TABLE `customer_addresses` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `customer_profile_id` INTEGER NOT NULL,
  `label` VARCHAR(50) NOT NULL,
  `country_code` CHAR(2) NOT NULL DEFAULT 'JP',
  `postal_code` CHAR(7) NOT NULL,
  `admin1_code` CHAR(2) NOT NULL,
  `prefecture` VARCHAR(32) NOT NULL,
  `admin2_code` CHAR(5) NOT NULL,
  `city` VARCHAR(100) NOT NULL,
  `address_line_1` VARCHAR(255) NOT NULL,
  `address_line_2` VARCHAR(255) NULL,
  `building` VARCHAR(255) NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `default_profile_key` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `customer_addresses_public_id_key` (`public_id`),
  UNIQUE INDEX `customer_addresses_default_profile_key_key` (`default_profile_key`),
  INDEX `customer_addresses_profile_active_default_idx` (`customer_profile_id`, `deleted_at`, `is_default`),
  INDEX `customer_addresses_deleted_idx` (`deleted_at`),
  CONSTRAINT `customer_addresses_customer_profile_fkey`
    FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
