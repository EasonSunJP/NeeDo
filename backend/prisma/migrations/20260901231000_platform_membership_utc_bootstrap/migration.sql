-- MySQL DATETIME does not carry timezone information. The MariaDB adapter reads
-- these values as UTC, so normalize only untouched bootstrap V1 publications
-- that a non-UTC server session made appear to be scheduled in the future.
UPDATE `platform_membership_tier_versions`
SET
  `effective_from` = UTC_TIMESTAMP(3),
  `published_at` = LEAST(`published_at`, UTC_TIMESTAMP(3)),
  `created_at` = LEAST(`created_at`, UTC_TIMESTAMP(3)),
  `updated_at` = UTC_TIMESTAMP(3)
WHERE `version` = 1
  AND `status` = 'published'
  AND `created_by_id` IS NULL
  AND `published_by_id` IS NULL
  AND `effective_to` IS NULL
  AND `deleted_at` IS NULL
  AND `effective_from` > UTC_TIMESTAMP(3);
