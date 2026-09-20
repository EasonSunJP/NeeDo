CREATE TABLE `user_favorite_interactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `owner_user_id` INTEGER NOT NULL,
  `item_type` VARCHAR(40) NOT NULL,
  `item_key` VARCHAR(191) NOT NULL,
  `pinned_at` DATETIME(3) NULL,
  `reaction` VARCHAR(16) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `user_favorite_interactions_owner_type_key`(`owner_user_id`, `item_type`, `item_key`),
  INDEX `user_favorite_interactions_owner_sort_idx`(`owner_user_id`, `pinned_at`, `updated_at`),
  INDEX `user_favorite_interactions_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `user_favorite_interactions`
  ADD CONSTRAINT `user_favorite_interactions_owner_user_id_fkey`
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
