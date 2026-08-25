ALTER TABLE `entity_suspensions`
  ADD COLUMN `batch_key` VARCHAR(191) NULL;

CREATE INDEX `entity_suspensions_batch_key_idx`
  ON `entity_suspensions`(`batch_key`);
