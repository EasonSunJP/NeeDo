-- CreateTable
CREATE TABLE `exchange_booking_cancellations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `booking_order_id` INTEGER NOT NULL,
    `active_order_id` INTEGER NULL,
    `initiated_by_user_id` INTEGER NOT NULL,
    `initiated_by_identity_id` INTEGER NOT NULL,
    `initiator_party` ENUM('customer', 'provider') NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `status` ENUM('pending', 'accepted', 'rejected', 'withdrawn') NOT NULL DEFAULT 'pending',
    `requested_version` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `resolved_by_user_id` INTEGER NULL,
    `resolved_by_identity_id` INTEGER NULL,
    `resolver_party` ENUM('customer', 'provider') NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_cancel_active_order_key`(`active_order_id`),
    INDEX `exchange_cancel_order_history_idx`(`booking_order_id`, `deleted_at`, `created_at`),
    INDEX `exchange_cancel_initiator_user_idx`(`initiated_by_user_id`, `created_at`),
    INDEX `exchange_cancel_initiator_identity_idx`(`initiated_by_identity_id`, `created_at`),
    INDEX `exchange_cancel_resolver_user_idx`(`resolved_by_user_id`),
    INDEX `exchange_cancel_resolver_identity_idx`(`resolved_by_identity_id`),
    INDEX `exchange_cancel_status_idx`(`status`, `created_at`),
    INDEX `exchange_cancel_deleted_idx`(`deleted_at`),
    UNIQUE INDEX `exchange_cancel_id_order_key`(`id`, `booking_order_id`),
    UNIQUE INDEX `exchange_cancel_order_request_version_key`(`booking_order_id`, `requested_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_booking_cancellation_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cancellation_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `type` ENUM('requested', 'accepted', 'rejected', 'withdrawn') NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `actor_identity_id` INTEGER NOT NULL,
    `actor_party` ENUM('customer', 'provider') NOT NULL,
    `version_before` INTEGER NOT NULL,
    `version_after` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `payload_fingerprint` CHAR(64) NOT NULL,
    `result_snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_cancel_event_idempotency_key`(`idempotency_key`),
    INDEX `exchange_cancel_event_request_idx`(`cancellation_id`),
    INDEX `exchange_cancel_event_user_idx`(`actor_user_id`, `created_at`),
    INDEX `exchange_cancel_event_identity_idx`(`actor_identity_id`, `created_at`),
    INDEX `exchange_cancel_event_type_idx`(`type`, `created_at`),
    INDEX `exchange_cancel_event_deleted_idx`(`deleted_at`),
    UNIQUE INDEX `exchange_cancel_event_order_version_key`(`booking_order_id`, `version_after`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellations` ADD CONSTRAINT `exchange_cancel_participant_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `exchange_match_participants`(`booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellations` ADD CONSTRAINT `exchange_cancel_initiator_user_fkey` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellations` ADD CONSTRAINT `exchange_cancel_initiator_identity_fkey` FOREIGN KEY (`initiated_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellations` ADD CONSTRAINT `exchange_cancel_resolver_user_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellations` ADD CONSTRAINT `exchange_cancel_resolver_identity_fkey` FOREIGN KEY (`resolved_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellation_events` ADD CONSTRAINT `exchange_cancel_event_request_fkey` FOREIGN KEY (`cancellation_id`, `booking_order_id`) REFERENCES `exchange_booking_cancellations`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellation_events` ADD CONSTRAINT `exchange_cancel_event_user_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `exchange_booking_cancellation_events` ADD CONSTRAINT `exchange_cancel_event_identity_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Application policy is also enforced for persisted row shape. CHECK expressions
-- explicitly guard nullable fields: SQL UNKNOWN must not admit incomplete decisions.
ALTER TABLE `exchange_booking_cancellations`
  ADD CONSTRAINT `exchange_cancel_active_chk` CHECK (
    (`status` = 'pending' AND `active_order_id` IS NOT NULL
      AND `active_order_id` = `booking_order_id` AND `deleted_at` IS NULL)
    OR (`status` <> 'pending' AND `active_order_id` IS NULL)
  ),
  ADD CONSTRAINT `exchange_cancel_resolution_chk` CHECK (
    (`status` = 'pending' AND `resolved_by_user_id` IS NULL
      AND `resolved_by_identity_id` IS NULL AND `resolver_party` IS NULL AND `resolved_at` IS NULL)
    OR (`status` <> 'pending' AND `resolved_by_user_id` IS NOT NULL
      AND `resolved_by_identity_id` IS NOT NULL AND `resolver_party` IS NOT NULL
      AND `resolved_at` IS NOT NULL AND `resolved_at` >= `created_at`)
  ),
  ADD CONSTRAINT `exchange_cancel_party_chk` CHECK (
    `status` = 'pending'
    OR (`status` IN ('accepted', 'rejected') AND `resolver_party` <> `initiator_party`
      AND `resolved_by_user_id` <> `initiated_by_user_id`
      AND `resolved_by_identity_id` <> `initiated_by_identity_id`)
    OR (`status` = 'withdrawn' AND `resolver_party` = `initiator_party`
      AND `resolved_by_user_id` = `initiated_by_user_id`
      AND `resolved_by_identity_id` = `initiated_by_identity_id`)
  ),
  ADD CONSTRAINT `exchange_cancel_version_chk` CHECK (
    `requested_version` BETWEEN 1 AND 2147483646
    AND ((`status` = 'pending' AND `version` = `requested_version`)
      OR (`status` <> 'pending' AND `version` = `requested_version` + 1))
  ),
  ADD CONSTRAINT `exchange_cancel_reason_chk` CHECK (CHAR_LENGTH(TRIM(`reason`)) > 0);

ALTER TABLE `exchange_booking_cancellation_events`
  ADD CONSTRAINT `exchange_cancel_event_version_chk` CHECK (
    `version_before` BETWEEN 0 AND 2147483646
    AND `version_after` = `version_before` + 1
    AND ((`type` = 'requested' AND `version_before` <= 2147483645)
      OR (`type` <> 'requested' AND `version_before` >= 1))
  ),
  ADD CONSTRAINT `exchange_cancel_event_key_chk` CHECK (
    CHAR_LENGTH(TRIM(`idempotency_key`)) > 0
    AND CHAR_LENGTH(`payload_fingerprint`) = 64
    AND `payload_fingerprint` REGEXP '^[0-9a-fA-F]{64}$'
  );
