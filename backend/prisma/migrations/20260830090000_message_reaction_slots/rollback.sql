-- WARNING: this rollback reintroduces the pre-migration multi-reaction state.
-- Run only while the matching application enforcement is also rolled back.
UPDATE `message_reactions` AS reaction
JOIN `audit_logs` AS cleanup
  ON cleanup.`target_type` = 'MessageReaction'
  AND cleanup.`target_id` = reaction.`id`
  AND cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL
  AND reaction.`deleted_at` = cleanup.`created_at`
  AND reaction.`updated_at` = cleanup.`created_at`
SET
  reaction.`deleted_at` = NULL,
  reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  );

UPDATE `audit_logs` AS cleanup
JOIN `message_reactions` AS reaction
  ON reaction.`id` = cleanup.`target_id`
  AND reaction.`deleted_at` IS NULL
  AND reaction.`updated_at` = STR_TO_DATE(
    JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.previousUpdatedAt')),
    '%Y-%m-%dT%H:%i:%s.%fZ'
  )
SET
  cleanup.`deleted_at` = CURRENT_TIMESTAMP(3),
  cleanup.`updated_at` = CURRENT_TIMESTAMP(3)
WHERE cleanup.`action` = 'migration.im.reaction_slot_cleanup'
  AND JSON_UNQUOTE(JSON_EXTRACT(cleanup.`metadata`, '$.migration'))
    = '20260830090000_message_reaction_slots'
  AND cleanup.`deleted_at` IS NULL;
