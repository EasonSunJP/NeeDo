-- MySQL DATETIME does not carry timezone information. The MariaDB adapter reads
-- these values as UTC, so normalize the bootstrap row when a non-UTC server
-- session made it appear to be scheduled in the future.
UPDATE `membership_reward_fee_policy_versions`
SET
  `effective_from` = UTC_TIMESTAMP(3),
  `created_at` = LEAST(`created_at`, UTC_TIMESTAMP(3)),
  `updated_at` = UTC_TIMESTAMP(3)
WHERE `version` = 1
  AND `reason` = 'Initial membership reward platform fee'
  AND `deleted_at` IS NULL
  AND `effective_from` > UTC_TIMESTAMP(3);
