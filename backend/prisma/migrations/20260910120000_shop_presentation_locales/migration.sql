CREATE TABLE `shop_presentation_locales` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
  `content` JSON NOT NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `updated_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_presentation_locales_shop_id_locale_key` (`shop_id`, `locale`),
  INDEX `shop_presentation_locales_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `shop_presentation_locales_updated_by_idx` (`updated_by_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shop_presentation_locales`
  ADD CONSTRAINT `shop_presentation_locales_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `shop_presentation_locales_updated_by_id_fkey`
    FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
