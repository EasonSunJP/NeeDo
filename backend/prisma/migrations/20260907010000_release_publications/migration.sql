CREATE TABLE `release_publications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `deployment_id` CHAR(36) NOT NULL,
  `environment` VARCHAR(16) NOT NULL,
  `version` VARCHAR(100) NOT NULL,
  `source_revision` CHAR(40) NOT NULL,
  `previous_revision` CHAR(40) NULL,
  `kind` VARCHAR(16) NOT NULL,
  `changes` JSON NOT NULL,
  `published_at` DATETIME(3) NOT NULL,
  `payload_hash` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,
  UNIQUE INDEX `release_publications_deployment_id_key` (`deployment_id`),
  INDEX `release_publications_environment_deleted_at_published_at_id_idx` (`environment`, `deleted_at`, `published_at`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
