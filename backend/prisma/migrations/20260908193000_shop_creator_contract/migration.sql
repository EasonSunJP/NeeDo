ALTER TABLE `shops`
  ADD COLUMN `created_by_id` INTEGER NULL;

CREATE INDEX `shops_created_by_id_idx` ON `shops`(`created_by_id`);

ALTER TABLE `shops`
  ADD CONSTRAINT `shops_created_by_id_fkey`
  FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
