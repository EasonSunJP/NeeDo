ALTER TABLE `technician_profiles`
  ADD COLUMN `current_operating_shop_id` INTEGER NULL;

ALTER TABLE `technician_work_states`
  ADD COLUMN `shop_id` INTEGER NULL;

UPDATE `technician_profiles` AS profile
JOIN (
  SELECT
    profile.`id` AS `technician_profile_id`,
    COALESCE(
      MAX(CASE WHEN affiliation.`shop_id` = profile.`shop_id` THEN affiliation.`shop_id` END),
      CAST(
        SUBSTRING_INDEX(
          GROUP_CONCAT(affiliation.`shop_id` ORDER BY affiliation.`starts_at`, affiliation.`id`),
          ',',
          1
        ) AS UNSIGNED
      )
    ) AS `selected_shop_id`
  FROM `technician_profiles` AS profile
  JOIN `technician_shop_affiliations` AS affiliation
    ON affiliation.`technician_profile_id` = profile.`id`
   AND affiliation.`work_status` = 'active'
   AND affiliation.`active_key` IS NOT NULL
   AND affiliation.`starts_at` <= CURRENT_TIMESTAMP
   AND (affiliation.`ends_at` IS NULL OR affiliation.`ends_at` > CURRENT_TIMESTAMP)
   AND affiliation.`deleted_at` IS NULL
  JOIN `shops` AS shop
    ON shop.`id` = affiliation.`shop_id`
   AND shop.`status` = 'published'
   AND shop.`deleted_at` IS NULL
  WHERE profile.`deleted_at` IS NULL
  GROUP BY profile.`id`
) AS selected_shop
  ON selected_shop.`technician_profile_id` = profile.`id`
SET profile.`current_operating_shop_id` = selected_shop.`selected_shop_id`
WHERE profile.`deleted_at` IS NULL
  AND profile.`current_operating_shop_id` IS NULL;

UPDATE `technician_work_states` AS work_state
JOIN `technician_profiles` AS profile
  ON profile.`id` = work_state.`technician_profile_id`
SET work_state.`shop_id` = profile.`current_operating_shop_id`
WHERE work_state.`deleted_at` IS NULL
  AND work_state.`shop_id` IS NULL;

CREATE UNIQUE INDEX `technician_work_states_profile_shop_key`
  ON `technician_work_states`(`technician_profile_id`, `shop_id`);

ALTER TABLE `technician_work_states`
  DROP INDEX `technician_work_states_technician_profile_id_key`;

CREATE INDEX `technician_work_states_shop_id_idx`
  ON `technician_work_states`(`shop_id`);

CREATE INDEX `technician_profiles_current_operating_shop_id_idx`
  ON `technician_profiles`(`current_operating_shop_id`);

ALTER TABLE `technician_work_states`
  ADD CONSTRAINT `technician_work_states_shop_id_fkey`
  FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `technician_profiles`
  ADD CONSTRAINT `technician_profiles_current_operating_shop_id_fkey`
  FOREIGN KEY (`current_operating_shop_id`) REFERENCES `shops`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
