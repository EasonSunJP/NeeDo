ALTER TABLE `categories`
  ADD COLUMN `qualification_policy` ENUM('open', 'platform_review', 'conditional', 'qualification_review') NOT NULL DEFAULT 'open' AFTER `icon_url`;

CREATE TABLE `category_translations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `category_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'ja', 'en', 'ko') NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `category_translations_category_id_locale_key` (`category_id`, `locale`),
  INDEX `category_translations_locale_name_deleted_idx` (`locale`, `name`, `deleted_at`),
  INDEX `category_translations_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_keywords` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(120) NOT NULL,
  `category_id` INTEGER NOT NULL,
  `qualification_policy` ENUM('open', 'platform_review', 'conditional', 'qualification_review') NOT NULL DEFAULT 'open',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `business_keywords_code_key` (`code`),
  INDEX `business_keywords_category_active_sort_idx` (`category_id`, `is_active`, `sort_order`),
  INDEX `business_keywords_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `business_keyword_translations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `business_keyword_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'ja', 'en', 'ko') NOT NULL,
  `label` VARCHAR(120) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `business_keyword_translations_keyword_id_locale_key` (`business_keyword_id`, `locale`),
  INDEX `business_keyword_translations_locale_label_deleted_idx` (`locale`, `label`, `deleted_at`),
  INDEX `business_keyword_translations_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_service_categories` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `category_id` INTEGER NOT NULL,
  `selected_by_user_id` INTEGER NOT NULL,
  `active_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `deleted_at` IS NULL THEN CONCAT(`shop_id`, ':', `category_id`) ELSE NULL END) STORED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `shop_service_categories_active_key_key` (`active_key`),
  INDEX `shop_service_categories_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `shop_service_categories_category_deleted_idx` (`category_id`, `deleted_at`),
  INDEX `shop_service_categories_selected_by_user_id_idx` (`selected_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_business_keywords` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `business_keyword_id` INTEGER NOT NULL,
  `selected_by_user_id` INTEGER NOT NULL,
  `active_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `deleted_at` IS NULL THEN CONCAT(`shop_id`, ':', `business_keyword_id`) ELSE NULL END) STORED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `shop_business_keywords_active_key_key` (`active_key`),
  INDEX `shop_business_keywords_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `shop_business_keywords_keyword_deleted_idx` (`business_keyword_id`, `deleted_at`),
  INDEX `shop_business_keywords_selected_by_user_id_idx` (`selected_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_service_taxonomy_states` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `shop_service_taxonomy_states_shop_id_key` (`shop_id`),
  INDEX `shop_service_taxonomy_states_deleted_at_idx` (`deleted_at`),
  CONSTRAINT `shop_service_taxonomy_states_version_check` CHECK (`version` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_service_taxonomy_commands` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NOT NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `resulting_version` INTEGER NOT NULL,
  `result_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `shop_service_taxonomy_commands_shop_id_idempotency_key_key` (`shop_id`, `idempotency_key`),
  INDEX `shop_service_taxonomy_commands_shop_created_idx` (`shop_id`, `created_at`),
  INDEX `shop_service_taxonomy_commands_actor_user_id_idx` (`actor_user_id`),
  INDEX `shop_service_taxonomy_commands_deleted_at_idx` (`deleted_at`),
  CONSTRAINT `shop_service_taxonomy_commands_resulting_version_check` CHECK (`resulting_version` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_service_qualifications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `category_id` INTEGER NULL,
  `business_keyword_id` INTEGER NULL,
  `source_application_id` INTEGER NULL,
  `status` ENUM('approved', 'revoked') NOT NULL,
  `expires_at` DATETIME(3) NULL,
  `approved_by_user_id` INTEGER NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  INDEX `shop_service_qualifications_shop_status_expiry_idx` (`shop_id`, `status`, `expires_at`, `deleted_at`),
  INDEX `shop_service_qualifications_category_status_idx` (`category_id`, `status`, `deleted_at`),
  INDEX `shop_service_qualifications_keyword_status_idx` (`business_keyword_id`, `status`, `deleted_at`),
  INDEX `shop_service_qualifications_source_application_id_idx` (`source_application_id`),
  INDEX `shop_service_qualifications_approved_by_user_id_idx` (`approved_by_user_id`),
  CONSTRAINT `shop_service_qualifications_target_check` CHECK ((`category_id` IS NOT NULL) <> (`business_keyword_id` IS NOT NULL)),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_application_service_categories` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `application_id` INTEGER NOT NULL,
  `category_id` INTEGER NOT NULL,
  `selected_by_user_id` INTEGER NOT NULL,
  `active_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `deleted_at` IS NULL THEN CONCAT(`application_id`, ':', `category_id`) ELSE NULL END) STORED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `merchant_application_service_categories_active_key_key` (`active_key`),
  INDEX `merchant_application_service_categories_application_deleted_idx` (`application_id`, `deleted_at`),
  INDEX `merchant_application_service_categories_category_deleted_idx` (`category_id`, `deleted_at`),
  INDEX `merchant_application_service_categories_selected_by_user_id_idx` (`selected_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `merchant_application_business_keywords` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `application_id` INTEGER NOT NULL,
  `business_keyword_id` INTEGER NOT NULL,
  `selected_by_user_id` INTEGER NOT NULL,
  `active_key` VARCHAR(191) GENERATED ALWAYS AS (CASE WHEN `deleted_at` IS NULL THEN CONCAT(`application_id`, ':', `business_keyword_id`) ELSE NULL END) STORED,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `merchant_application_business_keywords_active_key_key` (`active_key`),
  INDEX `merchant_application_business_keywords_application_deleted_idx` (`application_id`, `deleted_at`),
  INDEX `merchant_application_business_keywords_keyword_deleted_idx` (`business_keyword_id`, `deleted_at`),
  INDEX `merchant_application_business_keywords_selected_by_user_id_idx` (`selected_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `category_translations` ADD CONSTRAINT `category_translations_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `business_keywords` ADD CONSTRAINT `business_keywords_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `business_keyword_translations` ADD CONSTRAINT `business_keyword_translations_business_keyword_id_fkey` FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_categories` ADD CONSTRAINT `shop_service_categories_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_service_categories` ADD CONSTRAINT `shop_service_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_service_categories` ADD CONSTRAINT `shop_service_categories_selected_by_user_id_fkey` FOREIGN KEY (`selected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_business_keywords` ADD CONSTRAINT `shop_business_keywords_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_business_keywords` ADD CONSTRAINT `shop_business_keywords_business_keyword_id_fkey` FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_business_keywords` ADD CONSTRAINT `shop_business_keywords_selected_by_user_id_fkey` FOREIGN KEY (`selected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_taxonomy_states` ADD CONSTRAINT `shop_service_taxonomy_states_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_taxonomy_commands` ADD CONSTRAINT `shop_service_taxonomy_commands_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_taxonomy_commands` ADD CONSTRAINT `shop_service_taxonomy_commands_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_qualifications` ADD CONSTRAINT `shop_service_qualifications_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_service_qualifications` ADD CONSTRAINT `shop_service_qualifications_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_service_qualifications` ADD CONSTRAINT `shop_service_qualifications_business_keyword_id_fkey` FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `shop_service_qualifications` ADD CONSTRAINT `shop_service_qualifications_source_application_id_fkey` FOREIGN KEY (`source_application_id`) REFERENCES `identity_applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_service_qualifications` ADD CONSTRAINT `shop_service_qualifications_approved_by_user_id_fkey` FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `merchant_application_service_categories` ADD CONSTRAINT `merchant_application_service_categories_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `merchant_application_service_categories` ADD CONSTRAINT `merchant_application_service_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `merchant_application_service_categories` ADD CONSTRAINT `merchant_application_service_categories_selected_by_user_id_fkey` FOREIGN KEY (`selected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `merchant_application_business_keywords` ADD CONSTRAINT `merchant_application_business_keywords_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `identity_applications`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `merchant_application_business_keywords` ADD CONSTRAINT `merchant_application_business_keywords_business_keyword_id_fkey` FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `merchant_application_business_keywords` ADD CONSTRAINT `merchant_application_business_keywords_selected_by_user_id_fkey` FOREIGN KEY (`selected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
