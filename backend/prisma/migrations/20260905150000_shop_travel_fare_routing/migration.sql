CREATE TABLE `shop_travel_fare_policy_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL,
  `effective_from` DATETIME(3) NOT NULL,
  `published_by_user_id` INTEGER NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_travel_fare_policy_versions_public_id_key` (`public_id`),
  UNIQUE INDEX `shop_travel_fare_policy_versions_shop_version_key` (`shop_id`, `version`),
  INDEX `shop_travel_fare_policy_versions_effective_idx` (`shop_id`, `effective_from`, `deleted_at`),
  INDEX `shop_travel_fare_policy_versions_publisher_idx` (`published_by_user_id`),
  INDEX `shop_travel_fare_policy_versions_deleted_idx` (`deleted_at`),
  CONSTRAINT `shop_travel_fare_policy_versions_version_check` CHECK (`version` > 0),
  CONSTRAINT `shop_travel_fare_policy_versions_shop_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `shop_travel_fare_policy_versions_publisher_fkey`
    FOREIGN KEY (`published_by_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_travel_fare_bands` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `policy_version_id` INTEGER NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `maximum_distance_meters` INTEGER NOT NULL,
  `fare_amount_jpy` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_travel_fare_bands_policy_ordinal_key` (`policy_version_id`, `ordinal`),
  UNIQUE INDEX `shop_travel_fare_bands_policy_distance_key` (`policy_version_id`, `maximum_distance_meters`),
  INDEX `shop_travel_fare_bands_policy_deleted_idx` (`policy_version_id`, `deleted_at`),
  INDEX `shop_travel_fare_bands_deleted_idx` (`deleted_at`),
  CONSTRAINT `shop_travel_fare_bands_ordinal_check` CHECK (`ordinal` >= 0),
  CONSTRAINT `shop_travel_fare_bands_distance_check` CHECK (`maximum_distance_meters` > 0),
  CONSTRAINT `shop_travel_fare_bands_fare_check` CHECK (`fare_amount_jpy` >= 0),
  CONSTRAINT `shop_travel_fare_bands_policy_fkey`
    FOREIGN KEY (`policy_version_id`) REFERENCES `shop_travel_fare_policy_versions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `route_estimates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `customer_user_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `policy_version_id` INTEGER NOT NULL,
  `matched_band_id` INTEGER NOT NULL,
  `provider_code` VARCHAR(32) NOT NULL,
  `provider_request_id` VARCHAR(160) NULL,
  `origin_address_hash` CHAR(64) NOT NULL,
  `destination_address_hash` CHAR(64) NOT NULL,
  `distance_meters` INTEGER NOT NULL,
  `duration_seconds` INTEGER NOT NULL,
  `fare_amount_jpy` INTEGER NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `consumed_by_booking_order_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `route_estimates_public_id_key` (`public_id`),
  UNIQUE INDEX `route_estimates_consumed_booking_key` (`consumed_by_booking_order_id`),
  INDEX `route_estimates_binding_expiry_idx` (`customer_user_id`, `shop_id`, `service_id`, `expires_at`, `deleted_at`),
  INDEX `route_estimates_provider_cache_idx` (`provider_code`, `origin_address_hash`, `destination_address_hash`, `expires_at`, `deleted_at`),
  INDEX `route_estimates_policy_idx` (`policy_version_id`),
  INDEX `route_estimates_band_idx` (`matched_band_id`),
  INDEX `route_estimates_shop_idx` (`shop_id`),
  INDEX `route_estimates_service_idx` (`service_id`),
  INDEX `route_estimates_deleted_idx` (`deleted_at`),
  CONSTRAINT `route_estimates_distance_check` CHECK (`distance_meters` > 0),
  CONSTRAINT `route_estimates_duration_check` CHECK (`duration_seconds` > 0),
  CONSTRAINT `route_estimates_fare_check` CHECK (`fare_amount_jpy` >= 0),
  CONSTRAINT `route_estimates_expiry_check` CHECK (`expires_at` > `created_at`),
  CONSTRAINT `route_estimates_consumption_check` CHECK (
    (`consumed_at` IS NULL AND `consumed_by_booking_order_id` IS NULL)
    OR (`consumed_at` IS NOT NULL AND `consumed_by_booking_order_id` IS NOT NULL)
  ),
  CONSTRAINT `route_estimates_customer_fkey`
    FOREIGN KEY (`customer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `route_estimates_shop_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `route_estimates_service_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `route_estimates_policy_fkey`
    FOREIGN KEY (`policy_version_id`) REFERENCES `shop_travel_fare_policy_versions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `route_estimates_band_fkey`
    FOREIGN KEY (`matched_band_id`) REFERENCES `shop_travel_fare_bands` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `route_estimates_consumed_booking_fkey`
    FOREIGN KEY (`consumed_by_booking_order_id`) REFERENCES `booking_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `booking_travel_fare_snapshots` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `booking_order_id` INTEGER NOT NULL,
  `route_estimate_id` INTEGER NOT NULL,
  `policy_version_id` INTEGER NOT NULL,
  `matched_band_id` INTEGER NOT NULL,
  `policy_version_public_id` CHAR(36) NOT NULL,
  `band_maximum_distance_meters` INTEGER NOT NULL,
  `provider_code` VARCHAR(32) NOT NULL,
  `provider_request_id` VARCHAR(160) NULL,
  `origin_address_hash` CHAR(64) NOT NULL,
  `destination_address_hash` CHAR(64) NOT NULL,
  `fulfillment_address_json` JSON NOT NULL,
  `distance_meters` INTEGER NOT NULL,
  `duration_seconds` INTEGER NOT NULL,
  `fare_amount_jpy` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `booking_travel_fare_snapshots_public_id_key` (`public_id`),
  UNIQUE INDEX `booking_travel_fare_snapshots_booking_key` (`booking_order_id`),
  UNIQUE INDEX `booking_travel_fare_snapshots_estimate_key` (`route_estimate_id`),
  INDEX `booking_travel_fare_snapshots_policy_idx` (`policy_version_id`),
  INDEX `booking_travel_fare_snapshots_band_idx` (`matched_band_id`),
  INDEX `booking_travel_fare_snapshots_distance_idx` (`distance_meters`),
  INDEX `booking_travel_fare_snapshots_deleted_idx` (`deleted_at`),
  CONSTRAINT `booking_travel_fare_snapshots_band_limit_check` CHECK (`band_maximum_distance_meters` > 0),
  CONSTRAINT `booking_travel_fare_snapshots_distance_check` CHECK (`distance_meters` > 0),
  CONSTRAINT `booking_travel_fare_snapshots_duration_check` CHECK (`duration_seconds` > 0),
  CONSTRAINT `booking_travel_fare_snapshots_fare_check` CHECK (`fare_amount_jpy` >= 0),
  CONSTRAINT `booking_travel_fare_snapshots_booking_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `booking_travel_fare_snapshots_estimate_fkey`
    FOREIGN KEY (`route_estimate_id`) REFERENCES `route_estimates` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `booking_travel_fare_snapshots_policy_fkey`
    FOREIGN KEY (`policy_version_id`) REFERENCES `shop_travel_fare_policy_versions` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `booking_travel_fare_snapshots_band_fkey`
    FOREIGN KEY (`matched_band_id`) REFERENCES `shop_travel_fare_bands` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_checkouts`
  ADD COLUMN `travel_fare_amount_jpy` INTEGER NOT NULL DEFAULT 0 AFTER `add_on_amount_jpy`,
  ADD CONSTRAINT `order_checkouts_travel_fare_amount_check` CHECK (`travel_fare_amount_jpy` >= 0);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('商户车费规则读取', 'merchant-admin:travel-fare-policy:read', 'api', 'travel-fare', '读取当前店铺的车费规则与不可变版本历史', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户车费规则发布', 'merchant-admin:travel-fare-policy:write', 'api', 'travel-fare', '为当前店铺发布按行驶距离计算的车费规则版本', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营车费读取', 'backoffice:travel-fare:read', 'api', 'travel-fare', '读取路线供应商状态与店铺车费规则', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('预约路线估算创建', 'booking:travel-estimate:create', 'api', 'travel-fare', '为当前顾客的上门预约创建服务端路线与车费估算', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`deleted_at` IS NULL
  AND (
    `roles`.`code` = 'admin'
    OR (`roles`.`code` = 'merchant_owner' AND `permissions`.`code` IN (
      'merchant-admin:travel-fare-policy:read',
      'merchant-admin:travel-fare-policy:write'
    ))
    OR (`roles`.`code` = 'merchant_staff' AND `permissions`.`code` = 'merchant-admin:travel-fare-policy:read')
    OR (`roles`.`code` IN ('operator', 'viewer') AND `permissions`.`code` = 'backoffice:travel-fare:read')
    OR (`roles`.`code` = 'customer' AND `permissions`.`code` = 'booking:travel-estimate:create')
  )
WHERE `roles`.`deleted_at` IS NULL
  AND `permissions`.`code` IN (
    'merchant-admin:travel-fare-policy:read',
    'merchant-admin:travel-fare-policy:write',
    'backoffice:travel-fare:read',
    'booking:travel-estimate:create'
  )
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
