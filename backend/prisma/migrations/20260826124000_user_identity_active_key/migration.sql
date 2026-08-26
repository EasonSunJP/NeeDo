ALTER TABLE `user_identities`
  ADD COLUMN `active_key` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `user_identities_active_key_key`
  ON `user_identities`(`active_key`);
