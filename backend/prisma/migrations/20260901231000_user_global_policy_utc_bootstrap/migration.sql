-- MySQL DATETIME does not carry timezone information. The MariaDB adapter reads
-- these values as UTC, so normalize the default published policy when a
-- non-UTC server session made the bootstrap row appear scheduled in the future.
UPDATE `user_global_policy_versions`
SET
  `effective_from` = UTC_TIMESTAMP(3),
  `published_at` = UTC_TIMESTAMP(3),
  `created_at` = LEAST(`created_at`, UTC_TIMESTAMP(3)),
  `updated_at` = UTC_TIMESTAMP(3)
WHERE `version` = 1
  AND `status` = 'published'
  AND `created_by_id` IS NULL
  AND `published_by_id` IS NULL
  AND `require_phone` = FALSE
  AND `require_email` = FALSE
  AND `require_home_service_ekyc` = FALSE
  AND `require_store_service_ekyc` = FALSE
  AND `ndp_per_base_exp` = 100
  AND `base_exp_units_per_threshold` = 10000
  AND `deleted_at` IS NULL
  AND `effective_from` > UTC_TIMESTAMP(3);
