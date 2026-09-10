ALTER TABLE `entity_favorites`
  ADD COLUMN `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL;

ALTER TABLE `entity_share_events`
  ADD COLUMN `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL;

ALTER TABLE `entity_favorites`
  DROP CHECK `entity_favorites_exactly_one_target_chk`,
  ADD CONSTRAINT `entity_favorites_exactly_one_target_chk`
    CHECK (
      (`shop_id` IS NOT NULL)
      + (`technician_profile_id` IS NOT NULL)
      + (`service_id` IS NOT NULL)
      + (`technician_service_id` IS NOT NULL) = 1
    );

ALTER TABLE `entity_share_events`
  DROP CHECK `entity_share_events_exactly_one_target_chk`,
  DROP CHECK `entity_share_events_channel_payload_chk`,
  ADD CONSTRAINT `entity_share_events_exactly_one_target_chk`
    CHECK (
      (`shop_id` IS NOT NULL)
      + (`technician_profile_id` IS NOT NULL)
      + (`service_id` IS NOT NULL)
      + (`technician_service_id` IS NOT NULL) = 1
    ),
  ADD CONSTRAINT `entity_share_events_channel_payload_chk`
    CHECK (
      (
        `channel` = 'needo_message'
        AND `conversation_id` IS NOT NULL
        AND `message_id` IS NOT NULL
        AND (
          (`recipient_user_id` IS NULL AND `recipient_identity_id` IS NULL)
          OR
          (`recipient_user_id` IS NOT NULL AND `recipient_identity_id` IS NOT NULL)
        )
      )
      OR
      (
        `channel` = 'system_share'
        AND `recipient_user_id` IS NULL
        AND `recipient_identity_id` IS NULL
        AND `conversation_id` IS NULL
        AND `message_id` IS NULL
      )
    );

CREATE INDEX `entity_favorites_service_deleted_idx`
  ON `entity_favorites` (`service_id`, `deleted_at`);
CREATE INDEX `entity_favorites_technician_service_deleted_idx`
  ON `entity_favorites` (`technician_service_id`, `deleted_at`);
CREATE INDEX `entity_share_events_service_created_idx`
  ON `entity_share_events` (`service_id`, `created_at`);
CREATE INDEX `entity_share_events_service_deleted_idx`
  ON `entity_share_events` (`service_id`, `deleted_at`);
CREATE INDEX `entity_share_events_technician_service_created_idx`
  ON `entity_share_events` (`technician_service_id`, `created_at`);
CREATE INDEX `entity_share_events_technician_service_deleted_idx`
  ON `entity_share_events` (`technician_service_id`, `deleted_at`);

ALTER TABLE `entity_favorites`
  ADD CONSTRAINT `entity_favorites_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_favorites_technician_service_id_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `entity_share_events`
  ADD CONSTRAINT `entity_share_events_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `entity_share_events_technician_service_id_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
