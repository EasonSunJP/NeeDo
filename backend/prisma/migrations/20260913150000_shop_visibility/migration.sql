ALTER TABLE `shops`
  ADD COLUMN `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
  ADD COLUMN `visibility_updated_by` INTEGER NULL,
  ADD COLUMN `visibility_updated_at` DATETIME(3) NULL,
  ADD CONSTRAINT `shops_visibility_value_check`
    CHECK (`visibility` IN ('public', 'privateAll', 'limited', 'network'));

CREATE INDEX `shops_visibility_idx` ON `shops`(`visibility`);
CREATE INDEX `shops_visibility_updated_by_idx` ON `shops`(`visibility_updated_by`);

ALTER TABLE `shops`
  ADD CONSTRAINT `shops_visibility_updated_by_fkey`
  FOREIGN KEY (`visibility_updated_by`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
