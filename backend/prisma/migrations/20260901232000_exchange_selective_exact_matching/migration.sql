-- Formal selective exact-matching persistence. Matching records a publisher's
-- terminal selection decision without creating bookings or moving NDP.

ALTER TABLE `exchange_posts`
  MODIFY `status` ENUM('published', 'withdrawn', 'expired', 'matched', 'closed') NOT NULL DEFAULT 'published';

ALTER TABLE `exchange_claims`
  MODIFY `status` ENUM(
    'active',
    'withdrawn',
    'request_withdrawn',
    'request_expired',
    'matched',
    'not_selected',
    'matching_closed'
  ) NOT NULL DEFAULT 'active';

CREATE TABLE `exchange_request_matchings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `exchange_post_id` INTEGER NOT NULL,
  `status` ENUM('open', 'matched', 'closed') NOT NULL DEFAULT 'open',
  `effective_target_provider_count` INTEGER NOT NULL,
  `effective_budget_max_jpy` INTEGER NOT NULL,
  `selected_quote_total_jpy` INTEGER NOT NULL DEFAULT 0,
  `version` INTEGER NOT NULL DEFAULT 1,
  `matched_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `exchange_request_matchings_post_id_key` (`exchange_post_id`),
  INDEX `exchange_request_matchings_status_updated_idx` (`status`, `updated_at`),
  INDEX `exchange_request_matchings_deleted_idx` (`deleted_at`),
  CONSTRAINT `exchange_request_matchings_target_check`
    CHECK (`effective_target_provider_count` > 0),
  CONSTRAINT `exchange_request_matchings_budget_check`
    CHECK (`effective_budget_max_jpy` > 0),
  CONSTRAINT `exchange_request_matchings_quote_total_check`
    CHECK (`selected_quote_total_jpy` >= 0),
  CONSTRAINT `exchange_request_matchings_version_check`
    CHECK (`version` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `exchange_match_participants` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `matching_id` INTEGER NOT NULL,
  `exchange_post_id` INTEGER NOT NULL,
  `exchange_claim_id` INTEGER NOT NULL,
  `participant_user_id` INTEGER NOT NULL,
  `participant_identity_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `service_id` INTEGER NULL,
  `technician_service_id` INTEGER NULL,
  `schedule_slot_id` INTEGER NOT NULL,
  `quote_amount_jpy` INTEGER NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
  `estimated_starts_at` DATETIME(3) NOT NULL,
  `estimated_ends_at` DATETIME(3) NOT NULL,
  `active_reservation_key` VARCHAR(191) NOT NULL,
  `matched_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `exchange_match_participants_claim_id_key` (`exchange_claim_id`),
  UNIQUE INDEX `exchange_match_participants_reservation_key` (`active_reservation_key`),
  UNIQUE INDEX `exchange_match_participants_matching_technician_key` (`matching_id`, `technician_profile_id`),
  INDEX `exchange_match_participants_post_deleted_idx` (`exchange_post_id`, `deleted_at`),
  INDEX `exchange_match_participants_technician_range_idx` (`technician_profile_id`, `estimated_starts_at`, `estimated_ends_at`, `deleted_at`),
  INDEX `exchange_match_participants_identity_created_idx` (`participant_identity_id`, `created_at`),
  INDEX `exchange_match_participants_shop_created_idx` (`shop_id`, `created_at`),
  INDEX `exchange_match_participants_schedule_slot_idx` (`schedule_slot_id`),
  INDEX `exchange_match_participants_service_idx` (`service_id`),
  INDEX `exchange_match_participants_technician_service_idx` (`technician_service_id`),
  INDEX `exchange_match_participants_deleted_idx` (`deleted_at`),
  CONSTRAINT `exchange_match_participants_exactly_one_service_ref`
    CHECK ((`service_id` IS NULL) <> (`technician_service_id` IS NULL)),
  CONSTRAINT `exchange_match_participants_quote_check`
    CHECK (`quote_amount_jpy` > 0),
  CONSTRAINT `exchange_match_participants_time_check`
    CHECK (`estimated_ends_at` > `estimated_starts_at`),
  CONSTRAINT `exchange_match_participants_currency_check`
    CHECK (`currency` = 'JPY'),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `exchange_match_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `matching_id` INTEGER NOT NULL,
  `sequence` INTEGER NOT NULL,
  `type` ENUM(
    'opened',
    'claim_added',
    'claim_withdrawn',
    'budget_increased',
    'target_reduced',
    'selective_matched',
    'quick_matched',
    'closed'
  ) NOT NULL,
  `actor_user_id` INTEGER NULL,
  `actor_identity_id` INTEGER NULL,
  `version_before` INTEGER NOT NULL,
  `version_after` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(191) NULL,
  `payload_fingerprint` CHAR(64) NULL,
  `payload` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `exchange_match_events_idempotency_key` (`idempotency_key`),
  UNIQUE INDEX `exchange_match_events_matching_sequence_key` (`matching_id`, `sequence`),
  INDEX `exchange_match_events_actor_user_created_idx` (`actor_user_id`, `created_at`),
  INDEX `exchange_match_events_actor_identity_created_idx` (`actor_identity_id`, `created_at`),
  INDEX `exchange_match_events_type_created_idx` (`type`, `created_at`),
  INDEX `exchange_match_events_deleted_idx` (`deleted_at`),
  CONSTRAINT `exchange_match_events_sequence_check`
    CHECK (`sequence` > 0),
  CONSTRAINT `exchange_match_events_version_check`
    CHECK (`version_before` >= 0 AND `version_after` > `version_before`),
  CONSTRAINT `exchange_match_events_idempotency_pair`
    CHECK (
      (`idempotency_key` IS NULL AND `payload_fingerprint` IS NULL)
      OR (`idempotency_key` IS NOT NULL AND `payload_fingerprint` IS NOT NULL)
    ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `exchange_request_matchings`
  ADD CONSTRAINT `exchange_request_matchings_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exchange_match_participants`
  ADD CONSTRAINT `exchange_match_participants_matching_id_fkey`
    FOREIGN KEY (`matching_id`) REFERENCES `exchange_request_matchings`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_claim_id_fkey`
    FOREIGN KEY (`exchange_claim_id`) REFERENCES `exchange_claims`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_user_id_fkey`
    FOREIGN KEY (`participant_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_identity_id_fkey`
    FOREIGN KEY (`participant_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_technician_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_technician_service_id_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_participants_schedule_slot_id_fkey`
    FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `exchange_match_events`
  ADD CONSTRAINT `exchange_match_events_matching_id_fkey`
    FOREIGN KEY (`matching_id`) REFERENCES `exchange_request_matchings`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_events_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_match_events_actor_identity_id_fkey`
    FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `exchange_request_matchings` (
  `exchange_post_id`,
  `status`,
  `effective_target_provider_count`,
  `effective_budget_max_jpy`,
  `selected_quote_total_jpy`,
  `version`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `posts`.`id`,
  'open',
  `demands`.`target_provider_count`,
  CASE
    WHEN `demands`.`budget_mode` = 'per_provider'
      THEN `demands`.`budget_max_jpy` * `demands`.`target_provider_count`
    ELSE `demands`.`budget_max_jpy`
  END,
  0,
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `exchange_posts` AS `posts`
INNER JOIN `exchange_demands` AS `demands`
  ON `demands`.`post_id` = `posts`.`id`
  AND `demands`.`deleted_at` IS NULL
WHERE `posts`.`type` = 'demand'
  AND `posts`.`deleted_at` IS NULL;

INSERT INTO `exchange_match_events` (
  `matching_id`,
  `sequence`,
  `type`,
  `version_before`,
  `version_after`,
  `payload`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `matchings`.`id`,
  1,
  'opened',
  0,
  1,
  JSON_OBJECT(
    'exchangePostId', `matchings`.`exchange_post_id`,
    'effectiveTargetProviderCount', `matchings`.`effective_target_provider_count`,
    'effectiveBudgetMaxJpy', `matchings`.`effective_budget_max_jpy`
  ),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `exchange_request_matchings` AS `matchings`
WHERE `matchings`.`deleted_at` IS NULL;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('读取需求匹配', 'exchange:matching:read-own', 'api', 'exchange', '读取本人发布需求的正式匹配状态', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('完成需求选配', 'exchange:matching:select-own', 'api', 'exchange', '为本人发布的选配需求选择准确人数的有效抢单', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('exchange:matching:read-own', 'exchange:matching:select-own')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
