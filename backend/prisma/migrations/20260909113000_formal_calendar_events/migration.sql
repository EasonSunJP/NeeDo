CREATE TABLE `calendar_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `owner_identity_id` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `payload_fingerprint` CHAR(64) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `starts_at` DATETIME(3) NOT NULL,
  `ends_at` DATETIME(3) NOT NULL,
  `all_day` BOOLEAN NOT NULL DEFAULT false,
  `reminder_minutes` INTEGER NULL,
  `repeat_rule` VARCHAR(20) NOT NULL DEFAULT 'none',
  `location` VARCHAR(300) NOT NULL DEFAULT '',
  `url` VARCHAR(1000) NOT NULL DEFAULT '',
  `note` TEXT NOT NULL,
  `visibility` VARCHAR(20) NOT NULL DEFAULT 'private',
  `participant_identity_ids` JSON NOT NULL,
  `image_urls` JSON NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `calendar_events_owner_idempotency_key`(`owner_identity_id`, `idempotency_key`),
  INDEX `calendar_events_owner_range_deleted_idx`(`owner_identity_id`, `starts_at`, `ends_at`, `deleted_at`),
  INDEX `calendar_events_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `calendar_events`
  ADD CONSTRAINT `calendar_events_owner_identity_id_fkey`
  FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
