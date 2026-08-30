ALTER TABLE `friend_requests`
  MODIFY `status` ENUM('pending','accepted','rejected','expired') NOT NULL DEFAULT 'pending',
  ADD COLUMN `expires_at` DATETIME(3) NULL,
  ADD COLUMN `expired_at` DATETIME(3) NULL;

UPDATE `friend_requests`
SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 72 HOUR),
    `expired_at` = CASE
      WHEN `status` = 'pending' AND DATE_ADD(`created_at`, INTERVAL 72 HOUR) <= CURRENT_TIMESTAMP(3)
      THEN DATE_ADD(`created_at`, INTERVAL 72 HOUR)
      ELSE NULL
    END,
    `status` = CASE
      WHEN `status` = 'pending' AND DATE_ADD(`created_at`, INTERVAL 72 HOUR) <= CURRENT_TIMESTAMP(3)
      THEN 'expired'
      ELSE `status`
    END;

ALTER TABLE `friend_requests`
  MODIFY `expires_at` DATETIME(3) NOT NULL;

ALTER TABLE `conversations`
  ADD COLUMN `access_policy` ENUM('friendship_required','business_context','group_membership') NULL,
  ADD COLUMN `friendship_pair_key` VARCHAR(64) NULL;

CREATE TEMPORARY TABLE `friendship_conversation_pair_backfill` AS
SELECT
  `conversation_id`,
  MIN(`user_id`) AS `low_user_id`,
  MAX(`user_id`) AS `high_user_id`,
  COUNT(*) AS `participant_count`
FROM `conversation_participants`
WHERE `deleted_at` IS NULL
GROUP BY `conversation_id`;

UPDATE `conversations` AS `conversation`
LEFT JOIN `friendship_conversation_pair_backfill` AS `pair`
  ON `pair`.`conversation_id` = `conversation`.`id`
SET
  `conversation`.`access_policy` = CASE
    WHEN `conversation`.`type` = 'group' THEN 'group_membership'
    WHEN EXISTS (
      SELECT 1
      FROM `contacts` AS `forward_contact`
      INNER JOIN `contacts` AS `reverse_contact`
        ON `reverse_contact`.`owner_user_id` = `forward_contact`.`contact_user_id`
       AND `reverse_contact`.`contact_user_id` = `forward_contact`.`owner_user_id`
       AND `reverse_contact`.`source` = 'technician_application'
       AND `reverse_contact`.`deleted_at` IS NULL
      WHERE `forward_contact`.`owner_user_id` = `pair`.`low_user_id`
        AND `forward_contact`.`contact_user_id` = `pair`.`high_user_id`
        AND `forward_contact`.`source` = 'technician_application'
        AND `forward_contact`.`deleted_at` IS NULL
    ) THEN 'business_context'
    ELSE 'friendship_required'
  END,
  `conversation`.`friendship_pair_key` = CASE
    WHEN `conversation`.`type` = 'direct'
      AND `pair`.`participant_count` = 2
      AND NOT EXISTS (
        SELECT 1
        FROM `contacts` AS `forward_contact`
        INNER JOIN `contacts` AS `reverse_contact`
          ON `reverse_contact`.`owner_user_id` = `forward_contact`.`contact_user_id`
         AND `reverse_contact`.`contact_user_id` = `forward_contact`.`owner_user_id`
         AND `reverse_contact`.`source` = 'technician_application'
         AND `reverse_contact`.`deleted_at` IS NULL
        WHERE `forward_contact`.`owner_user_id` = `pair`.`low_user_id`
          AND `forward_contact`.`contact_user_id` = `pair`.`high_user_id`
          AND `forward_contact`.`source` = 'technician_application'
          AND `forward_contact`.`deleted_at` IS NULL
      )
    THEN CONCAT(`pair`.`low_user_id`, ':', `pair`.`high_user_id`)
    ELSE NULL
  END;

DROP TEMPORARY TABLE `friendship_conversation_pair_backfill`;

ALTER TABLE `conversations`
  MODIFY `access_policy` ENUM('friendship_required','business_context','group_membership') NOT NULL;

CREATE UNIQUE INDEX `conversations_friendship_pair_key_key`
  ON `conversations`(`friendship_pair_key`);
CREATE INDEX `friend_request_direction_status_expiry_idx`
  ON `friend_requests`(`requester_user_id`, `target_user_id`, `status`, `expires_at`, `deleted_at`);
CREATE INDEX `friend_request_target_pending_expiry_idx`
  ON `friend_requests`(`target_user_id`, `status`, `expires_at`, `deleted_at`);
