ALTER TABLE `users`
  ADD COLUMN `needo_id` VARCHAR(32) NULL,
  ADD COLUMN `email_verified_at` DATETIME(3) NULL;

UPDATE `users`
SET
  `needo_id` = CONCAT('n', LPAD(CAST(`id` AS CHAR), 10, '0')),
  `email_verified_at` = CASE WHEN `deleted_at` IS NULL THEN `created_at` ELSE NULL END;

ALTER TABLE `users`
  MODIFY COLUMN `needo_id` VARCHAR(32) NOT NULL,
  MODIFY COLUMN `password_hash` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `users_needo_id_key` ON `users`(`needo_id`);

CREATE TABLE `external_auth_accounts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `provider` VARCHAR(32) NOT NULL,
  `provider_subject` VARCHAR(255) NOT NULL,
  `provider_email` VARCHAR(255) NOT NULL,
  `provider_email_verified_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `external_auth_provider_subject_key`(`provider`, `provider_subject`),
  INDEX `external_auth_user_provider_deleted_idx`(`user_id`, `provider`, `deleted_at`),
  INDEX `external_auth_email_provider_deleted_idx`(`provider_email`, `provider`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `external_auth_accounts`
  ADD CONSTRAINT `external_auth_accounts_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
