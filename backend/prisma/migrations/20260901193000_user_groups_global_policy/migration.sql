CREATE TABLE `backoffice_user_groups` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `kind` ENUM('custom') NOT NULL DEFAULT 'custom',
  `name` VARCHAR(100) NOT NULL,
  `active_name_key` VARCHAR(191) NULL,
  `description` VARCHAR(500) NULL,
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `created_by_id` INTEGER NOT NULL,
  `updated_by_id` INTEGER NOT NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `backoffice_user_groups_public_id_key` (`public_id`),
  UNIQUE INDEX `backoffice_user_groups_code_key` (`code`),
  UNIQUE INDEX `backoffice_user_group_active_name_key` (`active_name_key`),
  INDEX `backoffice_user_group_list_idx` (`status`, `name`, `deleted_at`),
  INDEX `backoffice_user_groups_created_by_id_idx` (`created_by_id`),
  INDEX `backoffice_user_groups_updated_by_id_idx` (`updated_by_id`),
  INDEX `backoffice_user_groups_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `backoffice_user_groups_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `backoffice_user_groups_updated_by_id_fkey`
    FOREIGN KEY (`updated_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `backoffice_user_group_archive_state_chk`
    CHECK ((`status` = 'active' AND `archived_at` IS NULL AND `active_name_key` IS NOT NULL) OR (`status` = 'archived' AND `archived_at` IS NOT NULL AND `active_name_key` IS NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `backoffice_user_group_memberships` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `group_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `assigned_by_id` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `backoffice_user_group_membership_key` (`group_id`, `user_id`),
  INDEX `backoffice_user_group_membership_user_idx` (`user_id`, `deleted_at`),
  INDEX `backoffice_user_group_memberships_assigned_by_id_idx` (`assigned_by_id`),
  INDEX `backoffice_user_group_memberships_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `backoffice_user_group_memberships_group_id_fkey`
    FOREIGN KEY (`group_id`) REFERENCES `backoffice_user_groups` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `backoffice_user_group_memberships_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `backoffice_user_group_memberships_assigned_by_id_fkey`
    FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_global_policy_versions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `require_phone` BOOLEAN NOT NULL DEFAULT FALSE,
  `require_email` BOOLEAN NOT NULL DEFAULT FALSE,
  `require_home_service_ekyc` BOOLEAN NOT NULL DEFAULT FALSE,
  `require_store_service_ekyc` BOOLEAN NOT NULL DEFAULT FALSE,
  `ndp_per_base_exp` INTEGER NOT NULL DEFAULT 100,
  `base_exp_units_per_threshold` INTEGER NOT NULL DEFAULT 10000,
  `effective_from` DATETIME(3) NOT NULL,
  `effective_to` DATETIME(3) NULL,
  `published_at` DATETIME(3) NULL,
  `created_by_id` INTEGER NULL,
  `published_by_id` INTEGER NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `user_global_policy_versions_public_id_key` (`public_id`),
  UNIQUE INDEX `user_global_policy_version_key` (`version`),
  INDEX `user_global_policy_resolution_idx` (`status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `user_global_policy_versions_created_by_id_idx` (`created_by_id`),
  INDEX `user_global_policy_versions_published_by_id_idx` (`published_by_id`),
  INDEX `user_global_policy_versions_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `user_global_policy_versions_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `user_global_policy_versions_published_by_id_fkey`
    FOREIGN KEY (`published_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `user_global_policy_version_positive_chk` CHECK (`version` > 0),
  CONSTRAINT `user_global_policy_lock_version_chk` CHECK (`lock_version` > 0),
  CONSTRAINT `user_global_policy_ndp_per_base_exp_chk` CHECK (`ndp_per_base_exp` > 0),
  CONSTRAINT `user_global_policy_base_exp_units_chk` CHECK (`base_exp_units_per_threshold` > 0),
  CONSTRAINT `user_global_policy_window_chk` CHECK (`effective_to` IS NULL OR `effective_to` > `effective_from`),
  CONSTRAINT `user_global_policy_publication_chk` CHECK ((`status` = 'draft' AND `published_at` IS NULL) OR (`status` IN ('published', 'archived') AND `published_at` IS NOT NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ndp_experience_campaigns` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  `factor_bps` INTEGER NOT NULL DEFAULT 10000,
  `effective_from` DATETIME(3) NOT NULL,
  `effective_to` DATETIME(3) NOT NULL,
  `published_at` DATETIME(3) NULL,
  `created_by_id` INTEGER NULL,
  `published_by_id` INTEGER NULL,
  `lock_version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `ndp_experience_campaigns_public_id_key` (`public_id`),
  UNIQUE INDEX `ndp_experience_campaign_version_key` (`version`),
  INDEX `ndp_experience_campaign_resolution_idx` (`status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `ndp_experience_campaigns_created_by_id_idx` (`created_by_id`),
  INDEX `ndp_experience_campaigns_published_by_id_idx` (`published_by_id`),
  INDEX `ndp_experience_campaigns_deleted_at_idx` (`deleted_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ndp_experience_campaigns_created_by_id_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ndp_experience_campaigns_published_by_id_fkey`
    FOREIGN KEY (`published_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ndp_experience_campaign_version_positive_chk` CHECK (`version` > 0),
  CONSTRAINT `ndp_experience_campaign_lock_version_chk` CHECK (`lock_version` > 0),
  CONSTRAINT `ndp_experience_campaign_factor_bps_chk` CHECK (`factor_bps` > 0),
  CONSTRAINT `ndp_experience_campaign_window_chk` CHECK (`effective_to` > `effective_from`),
  CONSTRAINT `ndp_experience_campaign_publication_chk` CHECK ((`status` = 'draft' AND `published_at` IS NULL) OR (`status` IN ('published', 'archived') AND `published_at` IS NOT NULL))
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `user_global_policy_versions` (
  `public_id`,
  `version`,
  `status`,
  `require_phone`,
  `require_email`,
  `require_home_service_ekyc`,
  `require_store_service_ekyc`,
  `ndp_per_base_exp`,
  `base_exp_units_per_threshold`,
  `effective_from`,
  `effective_to`,
  `published_at`,
  `created_by_id`,
  `published_by_id`,
  `lock_version`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES
  (UUID(), 1, 'published', FALSE, FALSE, FALSE, FALSE, 100, 10000, CURRENT_TIMESTAMP(3), NULL, CURRENT_TIMESTAMP(3), NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL);
