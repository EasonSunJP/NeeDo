-- Fail before any DDL when historical active provider bindings are ambiguous.
SET @duplicate_active_provider := (
  SELECT COUNT(*) FROM (
    SELECT `provider`, `user_id`
    FROM `external_auth_accounts`
    WHERE `deleted_at` IS NULL
    GROUP BY `provider`, `user_id`
    HAVING COUNT(*) > 1
  ) AS duplicates
);
SET @duplicate_guard_sql := IF(
  @duplicate_active_provider = 0,
  'SELECT 1',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Duplicate active external provider bindings require remediation before migration'''
);
PREPARE duplicate_guard FROM @duplicate_guard_sql;
EXECUTE duplicate_guard;
DEALLOCATE PREPARE duplicate_guard;

-- Adding a stored generated column rebuilds this referenced InnoDB table on MySQL 8.
SET FOREIGN_KEY_CHECKS = 0;
ALTER TABLE `external_auth_accounts`
  ADD COLUMN `active_user_provider_key` VARCHAR(300)
    GENERATED ALWAYS AS (
      CASE
        WHEN `deleted_at` IS NULL THEN CONCAT(`provider`, ':', `user_id`)
        ELSE NULL
      END
    ) VIRTUAL;

CREATE UNIQUE INDEX `external_auth_active_user_provider_key`
  ON `external_auth_accounts` (`active_user_provider_key`);

ALTER TABLE `users`
  ADD COLUMN `session_generation` INT NOT NULL DEFAULT 0,
  ALGORITHM = INSTANT;
SET FOREIGN_KEY_CHECKS = 1;
