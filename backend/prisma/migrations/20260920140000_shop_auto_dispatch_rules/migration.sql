CREATE TABLE `shop_auto_dispatch_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT false,
  `starts_on` DATE NULL,
  `ends_on` DATE NULL,
  `start_minute` INTEGER NOT NULL DEFAULT 0,
  `end_minute` INTEGER NOT NULL DEFAULT 1439,
  `allow_store` BOOLEAN NOT NULL DEFAULT true,
  `allow_home` BOOLEAN NOT NULL DEFAULT true,
  `minimum_rating` DECIMAL(2,1) NULL,
  `minimum_acceptance_rate` INTEGER NULL,
  `maximum_cancellation_rate` INTEGER NULL,
  `daily_technician_limit` INTEGER NULL,
  `strategy` VARCHAR(40) NOT NULL DEFAULT 'balanced',
  `preferred_technician_ids_json` JSON NULL,
  `travel_minutes_per_km` INTEGER NOT NULL DEFAULT 3,
  `strict_window` BOOLEAN NOT NULL DEFAULT false,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_auto_dispatch_rules_shop_id_key`(`shop_id`),
  INDEX `shop_auto_dispatch_rules_active_range_idx`(`enabled`, `starts_on`, `ends_on`, `deleted_at`),
  INDEX `shop_auto_dispatch_rules_created_by_id_idx`(`created_by_id`),
  INDEX `shop_auto_dispatch_rules_updated_by_id_idx`(`updated_by_id`),
  INDEX `shop_auto_dispatch_rules_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `shop_auto_dispatch_rules_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `im_chat_record_deliveries`
  ADD COLUMN `forward_idempotency_key` VARCHAR(191) NULL,
  ADD COLUMN `forwarded_by_identity_id` INTEGER NULL,
  ADD UNIQUE INDEX `im_chat_record_deliveries_forward_key_key`(`forward_idempotency_key`),
  ADD INDEX `im_chat_record_deliveries_forwarded_by_identity_id_idx`(`forwarded_by_identity_id`);
