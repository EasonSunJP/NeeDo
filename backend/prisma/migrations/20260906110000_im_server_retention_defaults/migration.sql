-- Publish a new active IM lifecycle policy only when the legacy active row has
-- unlimited text retention. Historical policy rows and existing message expiry
-- snapshots remain unchanged.
START TRANSACTION;

SET @needo_im_policy_previous_id = (
  SELECT `id`
  FROM `im_policies`
  WHERE `active_key` = 'active'
    AND `deleted_at` IS NULL
    AND `text_retention_seconds` IS NULL
  ORDER BY `version` DESC, `id` DESC
  LIMIT 1
);

UPDATE `im_policies`
SET `active_key` = NULL
WHERE `id` = @needo_im_policy_previous_id;

INSERT INTO `im_policies` (
  `active_key`,
  `text_retention_seconds`,
  `image_retention_seconds`,
  `video_retention_seconds`,
  `recall_window_seconds`,
  `traceless_recall_membership_levels`,
  `version`,
  `updated_by_user_id`,
  `created_at`,
  `updated_at`
)
SELECT
  'active',
  2592000,
  `image_retention_seconds`,
  `video_retention_seconds`,
  `recall_window_seconds`,
  `traceless_recall_membership_levels`,
  `version` + 1,
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `im_policies`
WHERE `id` = @needo_im_policy_previous_id;

COMMIT;
