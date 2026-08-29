SET @needo_clear_cutoff_column_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`COLUMNS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'conversation_participants'
    AND `COLUMN_NAME` = 'cleared_through_message_id'
);
SET @needo_clear_cutoff_column_sql = IF(
  @needo_clear_cutoff_column_exists = 0,
  'ALTER TABLE `conversation_participants` ADD COLUMN `cleared_through_message_id` INTEGER NULL',
  'SELECT 1'
);
PREPARE needo_clear_cutoff_column_statement FROM @needo_clear_cutoff_column_sql;
EXECUTE needo_clear_cutoff_column_statement;
DEALLOCATE PREPARE needo_clear_cutoff_column_statement;

SET @needo_clear_cutoff_index_exists = (
  SELECT COUNT(*)
  FROM `information_schema`.`STATISTICS`
  WHERE `TABLE_SCHEMA` = DATABASE()
    AND `TABLE_NAME` = 'conversation_participants'
    AND `INDEX_NAME` = 'conv_participant_clear_cutoff_idx'
);
SET @needo_clear_cutoff_index_sql = IF(
  @needo_clear_cutoff_index_exists = 0,
  'CREATE INDEX `conv_participant_clear_cutoff_idx` ON `conversation_participants`(`conversation_id`, `cleared_through_message_id`)',
  'SELECT 1'
);
PREPARE needo_clear_cutoff_index_statement FROM @needo_clear_cutoff_index_sql;
EXECUTE needo_clear_cutoff_index_statement;
DEALLOCATE PREPARE needo_clear_cutoff_index_statement;
