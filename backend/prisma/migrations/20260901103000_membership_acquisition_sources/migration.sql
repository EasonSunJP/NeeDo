-- Formal membership acquisition provenance and immutable lifecycle foundation.
ALTER TABLE `shop_membership_cards`
  MODIFY COLUMN `issuance_source`
    ENUM('offline_paid', 'online_paid', 'gift', 'trial', 'renewal', 'historical_replacement', 'manual_grant') NULL;

CREATE INDEX `shop_membership_cards_source_issued_id_idx`
  ON `shop_membership_cards`(`issuance_source`, `issued_at`, `id`);
CREATE INDEX `shop_membership_cards_membership_source_issued_id_idx`
  ON `shop_membership_cards`(`membership_id`, `issuance_source`, `issued_at`, `id`);
CREATE INDEX `shop_membership_cards_status_issued_expiry_idx`
  ON `shop_membership_cards`(`status`, `issued_at`, `expires_at`, `deleted_at`, `membership_id`);

CREATE TABLE `shop_membership_card_status_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `card_id` INTEGER NOT NULL,
  `from_status` ENUM('active', 'frozen', 'expired', 'void') NULL,
  `to_status` ENUM('active', 'frozen', 'expired', 'void') NOT NULL,
  `source` ENUM('issuance', 'migration_backfill', 'status_transition') NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `reason_code` VARCHAR(160) NOT NULL,
  `actor_user_id` INTEGER NULL,
  `metadata` JSON NULL,
  `event_key` VARCHAR(160) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `shop_membership_card_status_events_event_key` (`event_key`),
  INDEX `shop_membership_card_status_events_card_time_idx` (`card_id`, `occurred_at`, `id`, `deleted_at`),
  INDEX `shop_membership_card_status_events_status_time_idx` (`to_status`, `occurred_at`, `id`, `deleted_at`),
  INDEX `shop_membership_card_status_events_actor_idx` (`actor_user_id`),
  INDEX `shop_membership_card_status_events_deleted_idx` (`deleted_at`),
  CONSTRAINT `shop_membership_card_status_events_reason_visible`
    CHECK (CHAR_LENGTH(TRIM(`reason_code`)) > 0),
  CONSTRAINT `shop_membership_card_status_events_transition_distinct`
    CHECK (`from_status` IS NULL OR `from_status` <> `to_status`),
  CONSTRAINT `shop_membership_card_status_events_append_only`
    CHECK (`deleted_at` IS NULL),
  CONSTRAINT `shop_membership_card_status_events_card_id_fkey`
    FOREIGN KEY (`card_id`) REFERENCES `shop_membership_cards`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `shop_membership_card_status_events_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `shop_membership_card_status_events` (
  `card_id`, `from_status`, `to_status`, `source`, `occurred_at`, `reason_code`, `actor_user_id`,
  `metadata`, `event_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `card`.`id`, NULL, 'active', 'migration_backfill', `card`.`issued_at`, 'historical_card_issued', NULL,
  JSON_OBJECT('issuanceSource', `card`.`issuance_source`),
  CONCAT('membership-card:', `card`.`public_id`, ':backfill-issued'),
  `card`.`issued_at`, `card`.`issued_at`, NULL
FROM `shop_membership_cards` AS `card`
ON DUPLICATE KEY UPDATE `event_key` = VALUES(`event_key`);

-- Only a persisted frozen_at on a currently frozen legacy card is authoritative
-- enough to append a historical transition. Missing/invalid evidence stays incomplete.
INSERT INTO `shop_membership_card_status_events` (
  `card_id`, `from_status`, `to_status`, `source`, `occurred_at`, `reason_code`, `actor_user_id`,
  `metadata`, `event_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `card`.`id`, 'active', 'frozen', 'status_transition', `card`.`frozen_at`, 'historical_card_frozen', NULL,
  NULL, CONCAT('membership-card:', `card`.`public_id`, ':backfill-frozen'),
  `card`.`frozen_at`, `card`.`frozen_at`, NULL
FROM `shop_membership_cards` AS `card`
WHERE `card`.`status` = 'frozen'
  AND `card`.`frozen_at` IS NOT NULL
  AND `card`.`frozen_at` >= `card`.`issued_at`
ON DUPLICATE KEY UPDATE `event_key` = VALUES(`event_key`);

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
) VALUES (
  '平台会员分析读取', 'backoffice.member.analytics.view', 'api', 'shop-membership',
  '读取平台范围的正式会员与会员卡分析', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`), `type` = VALUES(`type`), `module` = VALUES(`module`),
  `description` = VALUES(`description`), `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'backoffice.member.analytics.view'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
