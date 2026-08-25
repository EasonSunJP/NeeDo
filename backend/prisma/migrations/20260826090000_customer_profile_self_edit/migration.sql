ALTER TABLE `customer_profiles`
  ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private',
  ADD COLUMN `age` INTEGER NULL,
  ADD COLUMN `height_cm` DECIMAL(5,2) NULL,
  ADD COLUMN `languages` JSON NULL,
  ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public';

UPDATE `customer_profiles`
SET `languages` = JSON_ARRAY('日本語'),
    `visibility` = CASE WHEN `is_public` = TRUE THEN 'public' ELSE 'privateAll' END
WHERE `languages` IS NULL;

CREATE INDEX `customer_profiles_visibility_idx`
  ON `customer_profiles`(`visibility`);
