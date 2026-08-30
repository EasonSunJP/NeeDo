-- Repair identity-pair ranking after excluding non-friendship conversations.

CREATE TEMPORARY TABLE `friendship_identity_pair_rank_fix` AS
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
    AND `conversation`.`deleted_at` IS NULL
    AND `conversation`.`type` = 'direct'
    AND `conversation`.`access_policy` = 'friendship_required'
  GROUP BY `participant`.`conversation_id`
  HAVING COUNT(*) = 2
) AS `aggregated`;

UPDATE `conversations` AS `conversation`
INNER JOIN `friendship_identity_pair_rank_fix` AS `pair`
  ON `pair`.`conversation_id` = `conversation`.`id`
SET `conversation`.`friendship_pair_key` =
  CONCAT(`pair`.`low_identity_id`, ':', `pair`.`high_identity_id`)
WHERE `pair`.`pair_rank` = 1
  AND `conversation`.`friendship_pair_key` IS NULL;

DROP TEMPORARY TABLE `friendship_identity_pair_rank_fix`;
