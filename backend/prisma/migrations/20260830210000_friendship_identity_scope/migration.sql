-- Reconcile friendship authorization with the active identity boundary.

CREATE TEMPORARY TABLE `friendship_identity_pair_backfill` AS
SELECT
  `conversation_id`,
  MIN(`identity_id`) AS `low_identity_id`,
  MAX(`identity_id`) AS `high_identity_id`,
  COUNT(*) AS `participant_count`
FROM `conversation_participants`
WHERE `deleted_at` IS NULL
GROUP BY `conversation_id`;

UPDATE `conversations` AS `conversation`
LEFT JOIN `friendship_identity_pair_backfill` AS `pair`
  ON `pair`.`conversation_id` = `conversation`.`id`
SET `conversation`.`friendship_pair_key` = CASE
  WHEN `pair`.`participant_count` = 2
  THEN CONCAT(`pair`.`low_identity_id`, ':', `pair`.`high_identity_id`)
  ELSE NULL
END
WHERE `conversation`.`type` = 'direct'
  AND `conversation`.`access_policy` = 'friendship_required';

DROP TEMPORARY TABLE `friendship_identity_pair_backfill`;

DROP INDEX `friend_request_direction_status_expiry_idx` ON `friend_requests`;
DROP INDEX `friend_request_target_pending_expiry_idx` ON `friend_requests`;

CREATE INDEX `friend_request_direction_status_expiry_idx`
  ON `friend_requests`(
    `requester_identity_id`,
    `target_identity_id`,
    `status`,
    `expires_at`,
    `deleted_at`
  );
CREATE INDEX `friend_request_target_pending_expiry_idx`
  ON `friend_requests`(`target_identity_id`, `status`, `expires_at`, `deleted_at`);
