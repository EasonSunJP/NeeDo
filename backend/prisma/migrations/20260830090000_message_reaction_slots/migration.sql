SET @message_reaction_slot_cleanup_at = CURRENT_TIMESTAMP(3);

INSERT INTO `audit_logs` (
  `actor_id`,
  `action`,
  `target_type`,
  `target_id`,
  `ip`,
  `user_agent`,
  `metadata`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  NULL,
  'migration.im.reaction_slot_cleanup',
  'MessageReaction',
  stale.`id`,
  NULL,
  NULL,
  JSON_OBJECT(
    'migration',
    '20260830090000_message_reaction_slots',
    'previousUpdatedAt',
    DATE_FORMAT(stale.`updated_at`, '%Y-%m-%dT%H:%i:%s.%fZ')
  ),
  @message_reaction_slot_cleanup_at,
  @message_reaction_slot_cleanup_at,
  NULL
FROM (
  SELECT `id`, `updated_at`
  FROM (
    SELECT
      `id`,
      `updated_at`,
      ROW_NUMBER() OVER (
        PARTITION BY
          `message_id`,
          `user_id`,
          CASE
            WHEN `emoji` IN ('OK', 'NO', 'Pending', '+1', 'Done', 'Cool', 'Good', 'Thanks')
              THEN 'judgement'
            ELSE 'emoji'
          END
        ORDER BY `updated_at` DESC, `id` DESC
      ) AS `reaction_rank`
    FROM `message_reactions`
    WHERE `deleted_at` IS NULL
  ) AS ranked_reactions
  WHERE `reaction_rank` > 1
) AS stale;

UPDATE `message_reactions` AS stale_reaction
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = stale_reaction.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
SET
  stale_reaction.`deleted_at` = @message_reaction_slot_cleanup_at,
  stale_reaction.`updated_at` = @message_reaction_slot_cleanup_at;
