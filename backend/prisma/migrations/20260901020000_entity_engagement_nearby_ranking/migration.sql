ALTER TABLE `technician_profiles`
  ADD COLUMN `base_latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `base_longitude` DECIMAL(10, 7) NULL,
  ADD CONSTRAINT `technician_profiles_base_coordinate_pair_chk`
    CHECK ((`base_latitude` IS NULL) = (`base_longitude` IS NULL));

CREATE INDEX `technician_profiles_base_coordinates_idx`
  ON `technician_profiles` (`base_latitude`, `base_longitude`);

CREATE INDEX `shops_coordinates_idx`
  ON `shops` (`latitude`, `longitude`);

CREATE TABLE `entity_favorites` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `shop_id` INTEGER NULL,
  `technician_profile_id` INTEGER NULL,
  `active_key` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `entity_favorites_active_key_key` (`active_key`),
  INDEX `entity_favorites_user_deleted_idx` (`user_id`, `deleted_at`),
  INDEX `entity_favorites_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `entity_favorites_technician_deleted_idx` (`technician_profile_id`, `deleted_at`),
  INDEX `entity_favorites_deleted_idx` (`deleted_at`),
  CONSTRAINT `entity_favorites_exactly_one_target_chk`
    CHECK ((`shop_id` IS NOT NULL) + (`technician_profile_id` IS NOT NULL) = 1),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `entity_share_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actor_user_id` INTEGER NOT NULL,
  `actor_identity_id` INTEGER NOT NULL,
  `shop_id` INTEGER NULL,
  `technician_profile_id` INTEGER NULL,
  `channel` ENUM('needo_message', 'system_share') NOT NULL,
  `recipient_user_id` INTEGER NULL,
  `recipient_identity_id` INTEGER NULL,
  `conversation_id` INTEGER NULL,
  `message_id` INTEGER NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `entity_share_events_message_id_key` (`message_id`),
  UNIQUE INDEX `entity_share_actor_idempotency_key` (`actor_user_id`, `idempotency_key`),
  INDEX `entity_share_events_actor_created_idx` (`actor_user_id`, `created_at`),
  INDEX `entity_share_events_actor_identity_created_idx` (`actor_identity_id`, `created_at`),
  INDEX `entity_share_events_recipient_created_idx` (`recipient_user_id`, `created_at`),
  INDEX `entity_share_events_recipient_identity_idx` (`recipient_identity_id`),
  INDEX `entity_share_events_shop_created_idx` (`shop_id`, `created_at`),
  INDEX `entity_share_events_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `entity_share_events_technician_created_idx` (`technician_profile_id`, `created_at`),
  INDEX `entity_share_events_technician_deleted_idx` (`technician_profile_id`, `deleted_at`),
  INDEX `entity_share_events_conversation_idx` (`conversation_id`),
  INDEX `entity_share_events_deleted_idx` (`deleted_at`),
  CONSTRAINT `entity_share_events_exactly_one_target_chk`
    CHECK ((`shop_id` IS NOT NULL) + (`technician_profile_id` IS NOT NULL) = 1),
  CONSTRAINT `entity_share_events_channel_payload_chk`
    CHECK (
      (
        `channel` = 'needo_message'
        AND `recipient_user_id` IS NOT NULL
        AND `recipient_identity_id` IS NOT NULL
        AND `conversation_id` IS NOT NULL
        AND `message_id` IS NOT NULL
      )
      OR
      (
        `channel` = 'system_share'
        AND `recipient_user_id` IS NULL
        AND `recipient_identity_id` IS NULL
        AND `conversation_id` IS NULL
        AND `message_id` IS NULL
      )
    ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `entity_favorites`
  ADD CONSTRAINT `entity_favorites_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_favorites_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_favorites_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `entity_share_events`
  ADD CONSTRAINT `entity_share_events_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_actor_identity_id_fkey`
    FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_recipient_user_id_fkey`
    FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_recipient_identity_id_fkey`
    FOREIGN KEY (`recipient_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_conversation_id_fkey`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_message_id_fkey`
    FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
