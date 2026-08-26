-- Enforce one active provider identity per NeeDo user. Existing duplicates must be remediated explicitly.
ALTER TABLE `external_auth_accounts`
  ADD COLUMN `active_user_provider_key` VARCHAR(300) NULL;

UPDATE `external_auth_accounts`
SET `active_user_provider_key` = CONCAT(`provider`, ':', `user_id`)
WHERE `deleted_at` IS NULL;

SET @duplicate_active_provider := (
  SELECT COUNT(*) FROM (
    SELECT `active_user_provider_key`
    FROM `external_auth_accounts`
    WHERE `active_user_provider_key` IS NOT NULL
    GROUP BY `active_user_provider_key`
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

CREATE UNIQUE INDEX `external_auth_active_user_provider_key`
  ON `external_auth_accounts` (`active_user_provider_key`);
