ALTER TABLE `users`
  ADD COLUMN `avatar_bootstrap_url` VARCHAR(500) NULL AFTER `avatar_url`,
  ADD COLUMN `avatar_bootstrapped_at` DATETIME(3) NULL AFTER `avatar_bootstrap_url`;

UPDATE `users`
SET
  `avatar_bootstrap_url` = `avatar_url`,
  `avatar_bootstrapped_at` = COALESCE(`updated_at`, `created_at`)
WHERE `avatar_url` IS NOT NULL
  AND `avatar_bootstrap_url` IS NULL;

UPDATE `users` AS `u`
SET
  `u`.`avatar_bootstrap_url` = (
    SELECT `ma`.`url`
    FROM `customer_profiles` AS `cp`
    INNER JOIN `media_assets` AS `ma`
      ON `ma`.`customer_profile_id` = `cp`.`id`
      AND `ma`.`usage_type` = 'avatar'
      AND `ma`.`is_active` = TRUE
      AND `ma`.`deleted_at` IS NULL
    WHERE `cp`.`user_id` = `u`.`id`
      AND `cp`.`deleted_at` IS NULL
    ORDER BY `ma`.`id` DESC
    LIMIT 1
  ),
  `u`.`avatar_bootstrapped_at` = COALESCE(`u`.`updated_at`, `u`.`created_at`)
WHERE `u`.`avatar_bootstrap_url` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `customer_profiles` AS `cp`
    INNER JOIN `media_assets` AS `ma`
      ON `ma`.`customer_profile_id` = `cp`.`id`
      AND `ma`.`usage_type` = 'avatar'
      AND `ma`.`is_active` = TRUE
      AND `ma`.`deleted_at` IS NULL
    WHERE `cp`.`user_id` = `u`.`id`
      AND `cp`.`deleted_at` IS NULL
  );

UPDATE `users` AS `u`
SET
  `u`.`avatar_bootstrap_url` = (
    SELECT `ma`.`url`
    FROM `technician_profiles` AS `tp`
    INNER JOIN `media_assets` AS `ma`
      ON `ma`.`technician_profile_id` = `tp`.`id`
      AND `ma`.`usage_type` = 'avatar'
      AND `ma`.`is_active` = TRUE
      AND `ma`.`deleted_at` IS NULL
    WHERE `tp`.`user_id` = `u`.`id`
      AND `tp`.`deleted_at` IS NULL
    ORDER BY `ma`.`id` DESC
    LIMIT 1
  ),
  `u`.`avatar_bootstrapped_at` = COALESCE(`u`.`updated_at`, `u`.`created_at`),
  `u`.`avatar_url` = COALESCE(
    `u`.`avatar_url`,
    (
      SELECT `ma`.`url`
      FROM `technician_profiles` AS `tp`
      INNER JOIN `media_assets` AS `ma`
        ON `ma`.`technician_profile_id` = `tp`.`id`
        AND `ma`.`usage_type` = 'avatar'
        AND `ma`.`is_active` = TRUE
        AND `ma`.`deleted_at` IS NULL
      WHERE `tp`.`user_id` = `u`.`id`
        AND `tp`.`deleted_at` IS NULL
      ORDER BY `ma`.`id` DESC
      LIMIT 1
    )
  )
WHERE `u`.`avatar_bootstrap_url` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `technician_profiles` AS `tp`
    INNER JOIN `media_assets` AS `ma`
      ON `ma`.`technician_profile_id` = `tp`.`id`
      AND `ma`.`usage_type` = 'avatar'
      AND `ma`.`is_active` = TRUE
      AND `ma`.`deleted_at` IS NULL
    WHERE `tp`.`user_id` = `u`.`id`
      AND `tp`.`deleted_at` IS NULL
  );
