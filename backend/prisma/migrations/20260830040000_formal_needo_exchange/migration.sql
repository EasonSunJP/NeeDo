-- Create the dedicated formal NeeDo Exchange domain. Existing Social, Booking,
-- Order, wallet, and legacy compatibility tables are not changed by this migration.

-- CreateTable
CREATE TABLE `exchange_posts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `author_user_id` INTEGER NOT NULL,
    `author_identity_id` INTEGER NOT NULL,
    `publisher_public_id` VARCHAR(32) NOT NULL,
    `publisher_identity_type` VARCHAR(50) NOT NULL,
    `publisher_display_name` VARCHAR(100) NOT NULL,
    `publisher_avatar_url` VARCHAR(500) NULL,
    `type` ENUM('demand', 'intelligence') NOT NULL,
    `status` ENUM('published', 'withdrawn', 'expired') NOT NULL DEFAULT 'published',
    `title` VARCHAR(120) NOT NULL,
    `detail` TEXT NOT NULL,
    `content_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `area_label` VARCHAR(120) NOT NULL,
    `service_start_at` DATETIME(3) NOT NULL,
    `service_end_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `withdrawn_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_posts_idempotency_key_key`(`idempotency_key`),
    INDEX `exchange_posts_type_status_expires_at_created_at_idx`(`type`, `status`, `expires_at`, `created_at`),
    INDEX `exchange_posts_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
    INDEX `exchange_posts_author_identity_id_created_at_idx`(`author_identity_id`, `created_at`),
    INDEX `exchange_posts_area_label_type_status_idx`(`area_label`, `type`, `status`),
    INDEX `exchange_posts_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `exchange_posts_service_window_check`
      CHECK (`service_start_at` < `service_end_at` AND `service_end_at` <= `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_demands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `budget_min_jpy` INTEGER NOT NULL,
    `budget_max_jpy` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_demands_post_id_key`(`post_id`),
    INDEX `exchange_demands_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `exchange_demands_budget_check`
      CHECK (`budget_min_jpy` >= 0 AND `budget_max_jpy` >= `budget_min_jpy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_intelligences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `service_mode` ENUM('store', 'onsite', 'flexible') NOT NULL,
    `address_label` VARCHAR(255) NULL,
    `service_areas` JSON NOT NULL,
    `original_price_jpy` INTEGER NULL,
    `campaign_price_jpy` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_intelligences_post_id_key`(`post_id`),
    INDEX `exchange_intelligences_service_mode_deleted_at_idx`(`service_mode`, `deleted_at`),
    INDEX `exchange_intelligences_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `exchange_intelligences_price_check`
      CHECK (`campaign_price_jpy` >= 0 AND (`original_price_jpy` IS NULL OR (`original_price_jpy` >= 0 AND `campaign_price_jpy` <= `original_price_jpy`))),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `author_user_id` INTEGER NOT NULL,
    `author_identity_id` INTEGER NOT NULL,
    `author_public_id` VARCHAR(32) NOT NULL,
    `author_identity_type` VARCHAR(50) NOT NULL,
    `author_display_name` VARCHAR(100) NOT NULL,
    `author_avatar_url` VARCHAR(500) NULL,
    `content` TEXT NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_comments_idempotency_key_key`(`idempotency_key`),
    INDEX `exchange_comments_post_id_created_at_id_idx`(`post_id`, `created_at`, `id`),
    INDEX `exchange_comments_author_user_id_created_at_idx`(`author_user_id`, `created_at`),
    INDEX `exchange_comments_author_identity_id_created_at_idx`(`author_identity_id`, `created_at`),
    INDEX `exchange_comments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `actor_identity_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `exchange_likes_post_id_deleted_at_idx`(`post_id`, `deleted_at`),
    INDEX `exchange_likes_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `exchange_likes_actor_identity_id_created_at_idx`(`actor_identity_id`, `created_at`),
    INDEX `exchange_likes_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `exchange_likes_post_id_actor_user_id_key`(`post_id`, `actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exchange_shares` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `post_id` INTEGER NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `actor_identity_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `exchange_shares_idempotency_key_key`(`idempotency_key`),
    INDEX `exchange_shares_post_id_deleted_at_idx`(`post_id`, `deleted_at`),
    INDEX `exchange_shares_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    INDEX `exchange_shares_actor_identity_id_created_at_idx`(`actor_identity_id`, `created_at`),
    INDEX `exchange_shares_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `exchange_shares_post_id_actor_user_id_key`(`post_id`, `actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `exchange_posts` ADD CONSTRAINT `exchange_posts_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_posts` ADD CONSTRAINT `exchange_posts_author_identity_id_fkey` FOREIGN KEY (`author_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_demands` ADD CONSTRAINT `exchange_demands_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_intelligences` ADD CONSTRAINT `exchange_intelligences_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_comments` ADD CONSTRAINT `exchange_comments_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_comments` ADD CONSTRAINT `exchange_comments_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_comments` ADD CONSTRAINT `exchange_comments_author_identity_id_fkey` FOREIGN KEY (`author_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_likes` ADD CONSTRAINT `exchange_likes_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_likes` ADD CONSTRAINT `exchange_likes_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_likes` ADD CONSTRAINT `exchange_likes_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_shares` ADD CONSTRAINT `exchange_shares_post_id_fkey` FOREIGN KEY (`post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_shares` ADD CONSTRAINT `exchange_shares_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `exchange_shares` ADD CONSTRAINT `exchange_shares_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep Exchange routes deployable when migrations are applied without a full seed.
INSERT INTO `permissions` (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`)
VALUES
  ('需求情报列表', 'exchange:posts:list', 'api', 'exchange', '分页读取正式需求与情报', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('需求情报详情', 'exchange:posts:detail', 'api', 'exchange', '读取正式需求或情报详情', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('发布需求', 'exchange:posts:create-demand', 'api', 'exchange', '以当前顾客身份发布正式需求', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('发布情报', 'exchange:posts:create-intelligence', 'api', 'exchange', '以当前技师或店铺身份发布正式情报', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('撤回本人发布', 'exchange:posts:withdraw-own', 'api', 'exchange', '撤回当前账号发布的正式需求或情报', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('需求情报评论列表', 'exchange:comments:list', 'api', 'exchange', '分页读取正式需求与情报评论', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('需求情报评论', 'exchange:comments:create', 'api', 'exchange', '以当前身份发布正式评论', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('需求情报点赞', 'exchange:likes:write', 'api', 'exchange', '写入或撤销当前账号的正式点赞', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('需求情报分享', 'exchange:shares:create', 'api', 'exchange', '记录当前账号已完成的正式分享', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Common read and interaction rights for every active Exchange portal role.
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` IN ('exchange:posts:list', 'exchange:posts:detail', 'exchange:posts:withdraw-own', 'exchange:comments:list', 'exchange:comments:create', 'exchange:likes:write', 'exchange:shares:create') AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'technician', 'merchant_owner', 'merchant_staff') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

-- Demand publication belongs only to the customer role (plus the administrator).
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` = 'exchange:posts:create-demand' AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

-- Intelligence publication belongs only to technician/shop roles (plus the administrator).
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` = 'exchange:posts:create-intelligence' AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'technician', 'merchant_owner', 'merchant_staff') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
