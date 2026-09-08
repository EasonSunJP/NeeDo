-- Version the existing formal service taxonomy for audited optimistic locking.
ALTER TABLE `categories`
  ADD COLUMN `configuration_version` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `business_keywords`
  ADD COLUMN `configuration_version` INTEGER NOT NULL DEFAULT 1;

-- Map user-entered synonyms to one formal category and search keyword.
CREATE TABLE `search_keyword_aliases` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `alias` VARCHAR(191) NOT NULL,
  `normalized_alias` VARCHAR(191) NOT NULL,
  `category_id` INTEGER NOT NULL,
  `business_keyword_id` INTEGER NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `configuration_version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  INDEX `search_keyword_aliases_normalized_active_deleted_idx` (`normalized_alias`, `is_active`, `deleted_at`),
  INDEX `search_keyword_aliases_taxonomy_deleted_idx` (`category_id`, `business_keyword_id`, `deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Store only actual submitted searches. The optional session value is a one-way hash.
CREATE TABLE `search_query_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `original_keyword` VARCHAR(191) NOT NULL,
  `normalized_keyword` VARCHAR(191) NOT NULL,
  `city` VARCHAR(120) NULL,
  `entity_type` VARCHAR(32) NOT NULL,
  `category_id` INTEGER NULL,
  `business_keyword_id` INTEGER NULL,
  `result_count` INTEGER NOT NULL,
  `anonymous_session_hash` CHAR(64) NULL,
  `searched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  INDEX `search_query_events_window_city_category_idx` (`searched_at`, `city`, `category_id`, `deleted_at`),
  INDEX `search_query_events_keyword_window_idx` (`normalized_keyword`, `searched_at`, `deleted_at`),
  INDEX `search_query_events_business_keyword_window_idx` (`business_keyword_id`, `searched_at`, `deleted_at`),
  INDEX `search_query_events_session_window_idx` (`anonymous_session_hash`, `searched_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `search_keyword_aliases`
  ADD CONSTRAINT `search_keyword_aliases_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `search_keyword_aliases_business_keyword_id_fkey`
  FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `search_query_events`
  ADD CONSTRAINT `search_query_events_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `search_query_events_business_keyword_id_fkey`
  FOREIGN KEY (`business_keyword_id`) REFERENCES `business_keywords`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('运营服务类型读取', 'backoffice:service-taxonomy:read', 'api', 'backoffice', '分页读取正式服务类型、搜索标签与同义词配置', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('运营服务类型管理', 'backoffice:service-taxonomy:write', 'api', 'backoffice', '创建和修改带版本及审计保护的服务类型、搜索标签与同义词', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('搜索关键词分析读取', 'backoffice:search-analytics:read', 'api', 'backoffice', '按城市、时间和服务类型读取真实搜索关键词排行与趋势', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` IN (
  'backoffice:service-taxonomy:read',
  'backoffice:service-taxonomy:write',
  'backoffice:search-analytics:read'
) AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator') AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions` ON `permissions`.`code` IN (
  'backoffice:service-taxonomy:read',
  'backoffice:search-analytics:read'
) AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer' AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `updated_at` = VALUES(`updated_at`), `deleted_at` = NULL;
