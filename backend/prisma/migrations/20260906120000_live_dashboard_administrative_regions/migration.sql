CREATE TABLE `administrative_regions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `country_code` CHAR(2) NOT NULL,
  `official_code` VARCHAR(16) NOT NULL,
  `level` ENUM('COUNTRY', 'ADMIN1', 'ADMIN2') NOT NULL,
  `parent_id` INTEGER NULL,
  `centroid_lat` DECIMAL(10, 7) NULL,
  `centroid_lng` DECIMAL(10, 7) NULL,
  `source` VARCHAR(120) NOT NULL,
  `source_version` VARCHAR(40) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `administrative_regions_country_code_chk`
    CHECK (`country_code` REGEXP '^[A-Z]{2}$'),
  UNIQUE INDEX `administrative_regions_country_code_key` (`country_code`, `official_code`),
  INDEX `administrative_regions_hierarchy_idx` (`country_code`, `level`, `parent_id`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `administrative_region_locales` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `region_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `administrative_region_locales_region_locale_key` (`region_id`, `locale`),
  INDEX `administrative_region_locales_locale_deleted_idx` (`locale`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_service_locations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `country_code` CHAR(2) NOT NULL,
  `admin1_region_id` INTEGER NOT NULL,
  `admin2_region_id` INTEGER NOT NULL,
  `dataset_version` VARCHAR(40) NOT NULL,
  `verified_at` DATETIME(3) NOT NULL,
  `verified_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `shop_service_locations_country_code_chk`
    CHECK (`country_code` REGEXP '^[A-Z]{2}$'),
  UNIQUE INDEX `shop_service_locations_shop_id_key` (`shop_id`),
  INDEX `shop_service_locations_scope_idx` (`country_code`, `admin1_region_id`, `admin2_region_id`, `deleted_at`),
  INDEX `shop_service_locations_verified_by_id_idx` (`verified_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_service_locations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `country_code` CHAR(2) NOT NULL,
  `admin1_region_code` VARCHAR(16) NULL,
  `admin1_name` VARCHAR(160) NULL,
  `admin2_region_code` VARCHAR(16) NULL,
  `admin2_name` VARCHAR(160) NULL,
  `source` ENUM('SHOP_LOCATION', 'CUSTOMER_SERVICE_LOCATION') NOT NULL,
  `resolution_status` ENUM('VERIFIED', 'UNRESOLVED') NOT NULL,
  `dataset_version` VARCHAR(40) NOT NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `booking_service_locations_country_code_chk`
    CHECK (`country_code` REGEXP '^[A-Z]{2}$'),
  CONSTRAINT `booking_service_locations_verified_regions_chk`
    CHECK (`resolution_status` <> 'VERIFIED' OR (`admin1_region_code` IS NOT NULL AND `admin2_region_code` IS NOT NULL)),
  CONSTRAINT `booking_service_locations_admin2_requires_admin1_chk`
    CHECK (`admin2_region_code` IS NULL OR `admin1_region_code` IS NOT NULL),
  UNIQUE INDEX `booking_service_locations_booking_order_id_key` (`booking_order_id`),
  INDEX `booking_service_locations_scope_idx` (`country_code`, `admin1_region_code`, `admin2_region_code`, `resolution_status`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `administrative_regions`
  ADD CONSTRAINT `administrative_regions_parent_id_fkey`
    FOREIGN KEY (`parent_id`) REFERENCES `administrative_regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `administrative_region_locales`
  ADD CONSTRAINT `administrative_region_locales_region_id_fkey`
    FOREIGN KEY (`region_id`) REFERENCES `administrative_regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shop_service_locations`
  ADD CONSTRAINT `shop_service_locations_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_service_locations_admin1_region_id_fkey`
    FOREIGN KEY (`admin1_region_id`) REFERENCES `administrative_regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_service_locations_admin2_region_id_fkey`
    FOREIGN KEY (`admin2_region_id`) REFERENCES `administrative_regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `shop_service_locations_verified_by_id_fkey`
    FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `booking_service_locations`
  ADD CONSTRAINT `booking_service_locations_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
