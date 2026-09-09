-- CreateTable
CREATE TABLE `technician_automation_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `technician_profile_id` INTEGER NOT NULL,
    `kind` ENUM('booking', 'request') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `rules` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_automation_settings_owner_kind_key`(`technician_profile_id`, `kind`),
    INDEX `technician_automation_settings_kind_enabled_idx`(`kind`, `enabled`, `deleted_at`),
    INDEX `technician_automation_settings_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_automation_decision_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `setting_id` INTEGER NULL,
    `technician_profile_id` INTEGER NOT NULL,
    `kind` ENUM('booking', 'request') NOT NULL,
    `target_type` VARCHAR(40) NOT NULL,
    `target_id` INTEGER NOT NULL,
    `action_type` VARCHAR(40) NOT NULL,
    `rule_version` INTEGER NOT NULL,
    `outcome` ENUM('matched', 'not_matched', 'executed', 'action_failed', 'already_handled') NOT NULL,
    `matched_conditions` JSON NOT NULL,
    `failed_reasons` JSON NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `executed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_automation_decision_logs_idempotency_key_key`(`idempotency_key`),
    INDEX `technician_automation_decision_logs_setting_id_idx`(`setting_id`),
    INDEX `technician_automation_decision_logs_owner_kind_idx`(`technician_profile_id`, `kind`, `created_at`),
    INDEX `technician_automation_decision_logs_target_idx`(`target_type`, `target_id`, `action_type`),
    INDEX `technician_automation_decision_logs_outcome_idx`(`outcome`, `created_at`),
    INDEX `technician_automation_decision_logs_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `technician_automation_settings` ADD CONSTRAINT `technician_automation_settings_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_automation_decision_logs` ADD CONSTRAINT `technician_automation_decision_logs_setting_id_fkey` FOREIGN KEY (`setting_id`) REFERENCES `technician_automation_settings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_automation_decision_logs` ADD CONSTRAINT `technician_automation_decision_logs_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `permissions` (`name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`)
VALUES
  ('读取技师自动接单设置', 'technician:automation-settings:read', 'api', 'technician', '读取本人 Booking 自动接受和 Request 自动应募规则', true, NOW(3), NOW(3)),
  ('维护技师自动接单设置', 'technician:automation-settings:write', 'api', 'technician', '保存本人 Booking 自动接受和 Request 自动应募规则', true, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE `deleted_at` = NULL, `updated_at` = NOW(3);

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`)
SELECT role_row.id, permission_row.id, NOW(3), NOW(3)
FROM `roles` AS role_row
CROSS JOIN `permissions` AS permission_row
WHERE role_row.deleted_at IS NULL
  AND permission_row.deleted_at IS NULL
  AND role_row.code IN ('admin', 'technician')
  AND permission_row.code IN ('technician:automation-settings:read', 'technician:automation-settings:write')
ON DUPLICATE KEY UPDATE `deleted_at` = NULL, `updated_at` = NOW(3);
