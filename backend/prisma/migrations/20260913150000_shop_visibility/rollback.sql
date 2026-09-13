ALTER TABLE `shops`
  DROP FOREIGN KEY `shops_visibility_updated_by_fkey`;

ALTER TABLE `shops`
  DROP CHECK `shops_visibility_value_check`;

DROP INDEX `shops_visibility_updated_by_idx` ON `shops`;
DROP INDEX `shops_visibility_idx` ON `shops`;

ALTER TABLE `shops`
  DROP COLUMN `visibility_updated_at`,
  DROP COLUMN `visibility_updated_by`,
  DROP COLUMN `visibility`;
