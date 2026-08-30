CREATE TABLE `social_post_likes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NOT NULL,
  `actor_identity_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `social_post_likes_post_id_actor_identity_id_key` (`post_id`, `actor_identity_id`),
  INDEX `social_post_likes_post_id_deleted_at_idx` (`post_id`, `deleted_at`),
  INDEX `social_post_likes_actor_user_id_deleted_at_idx` (`actor_user_id`, `deleted_at`),
  INDEX `social_post_likes_actor_identity_id_deleted_at_idx` (`actor_identity_id`, `deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `social_post_likes_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `social_posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_likes_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_likes_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `social_post_bookmarks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NOT NULL,
  `actor_identity_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `social_post_bookmarks_post_id_actor_identity_id_key` (`post_id`, `actor_identity_id`),
  INDEX `social_post_bookmarks_post_id_deleted_at_idx` (`post_id`, `deleted_at`),
  INDEX `social_post_bookmarks_actor_user_id_deleted_at_idx` (`actor_user_id`, `deleted_at`),
  INDEX `social_post_bookmarks_actor_identity_id_deleted_at_idx` (`actor_identity_id`, `deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `social_post_bookmarks_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `social_posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_bookmarks_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_bookmarks_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `social_post_views` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NOT NULL,
  `actor_identity_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `social_post_views_post_id_actor_identity_id_key` (`post_id`, `actor_identity_id`),
  INDEX `social_post_views_post_id_deleted_at_idx` (`post_id`, `deleted_at`),
  INDEX `social_post_views_actor_user_id_deleted_at_idx` (`actor_user_id`, `deleted_at`),
  INDEX `social_post_views_actor_identity_id_deleted_at_idx` (`actor_identity_id`, `deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `social_post_views_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `social_posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_views_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_views_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `social_post_shares` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `post_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NOT NULL,
  `actor_identity_id` INTEGER NOT NULL,
  `recipient_user_id` INTEGER NOT NULL,
  `recipient_identity_id` INTEGER NOT NULL,
  `conversation_id` INTEGER NOT NULL,
  `message_id` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `social_post_shares_message_id_key` (`message_id`),
  UNIQUE INDEX `social_post_shares_actor_identity_id_idempotency_key_recipient_identity_id_key` (`actor_identity_id`, `idempotency_key`, `recipient_identity_id`),
  INDEX `social_post_shares_post_id_deleted_at_idx` (`post_id`, `deleted_at`),
  INDEX `social_post_shares_actor_user_id_deleted_at_idx` (`actor_user_id`, `deleted_at`),
  INDEX `social_post_shares_actor_identity_id_deleted_at_idx` (`actor_identity_id`, `deleted_at`),
  INDEX `social_post_shares_recipient_user_id_deleted_at_idx` (`recipient_user_id`, `deleted_at`),
  INDEX `social_post_shares_recipient_identity_id_deleted_at_idx` (`recipient_identity_id`, `deleted_at`),
  INDEX `social_post_shares_conversation_id_deleted_at_idx` (`conversation_id`, `deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `social_post_shares_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `social_posts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_recipient_identity_id_fkey` FOREIGN KEY (`recipient_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `social_post_shares_message_id_fkey` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES (
  '动态互动', 'social-post:interact', 'api', 'social', '点赞、收藏、记录浏览并向好友转发动态', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'social-post:interact'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician', 'customer')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
