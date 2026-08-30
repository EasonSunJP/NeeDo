-- Reconcile friendship authorization with the active identity boundary.

CREATE TEMPORARY TABLE `friendship_identity_pair_backfill` AS
SELECT
  `aggregated`.*,
  ROW_NUMBER() OVER (
    PARTITION BY `low_identity_id`, `high_identity_id`
    ORDER BY `conversation_updated_at` DESC, `conversation_id` DESC
  ) AS `pair_rank`
FROM (
  SELECT
    `participant`.`conversation_id`,
    MIN(`participant`.`identity_id`) AS `low_identity_id`,
    MAX(`participant`.`identity_id`) AS `high_identity_id`,
    COUNT(*) AS `participant_count`,
    MAX(`conversation`.`updated_at`) AS `conversation_updated_at`
  FROM `conversation_participants` AS `participant`
  INNER JOIN `conversations` AS `conversation`
    ON `conversation`.`id` = `participant`.`conversation_id`
  WHERE `participant`.`deleted_at` IS NULL
  GROUP BY `participant`.`conversation_id`
) AS `aggregated`;

UPDATE `conversations` AS `conversation`
LEFT JOIN `friendship_identity_pair_backfill` AS `pair`
  ON `pair`.`conversation_id` = `conversation`.`id`
SET `conversation`.`friendship_pair_key` = CASE
  WHEN `pair`.`participant_count` = 2 AND `pair`.`pair_rank` = 1
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
