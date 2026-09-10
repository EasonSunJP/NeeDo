-- CreateTable
CREATE TABLE `technician_work_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `technician_profile_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'unsynced',
    `version` INTEGER NOT NULL DEFAULT 0,
    `synced_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_work_states_technician_profile_id_key`(`technician_profile_id`),
    INDEX `technician_work_states_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_work_events` (
    `id` CHAR(36) NOT NULL,
    `technician_profile_id` INTEGER NOT NULL,
    `shop_id` INTEGER NULL,
    `order_id` INTEGER NULL,
    `incident_id` CHAR(36) NULL,
    `actor_id` INTEGER NULL,
    `kind` VARCHAR(20) NOT NULL,
    `from_status` VARCHAR(20) NULL,
    `to_status` VARCHAR(20) NULL,
    `at` DATETIME(3) NOT NULL,
    `actual_at` DATETIME(3) NULL,
    `reason` VARCHAR(1000) NULL,
    `command_key` VARCHAR(191) NULL,
    `command_hash` CHAR(64) NULL,
    `result` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_work_events_command_key_key`(`command_key`),
    INDEX `technician_work_events_technician_profile_id_at_deleted_at_idx`(`technician_profile_id`, `at`, `deleted_at`),
    INDEX `technician_work_events_shop_id_at_deleted_at_idx`(`shop_id`, `at`, `deleted_at`),
    INDEX `technician_work_events_order_id_idx`(`order_id`),
    INDEX `technician_work_events_actor_id_idx`(`actor_id`),
    INDEX `technician_work_events_incident_id_created_at_idx`(`incident_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_attendance_incidents` (
    `id` CHAR(36) NOT NULL,
    `incident_key` VARCHAR(191) NOT NULL,
    `technician_profile_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `order_id` INTEGER NULL,
    `availability_id` INTEGER NULL,
    `kind` VARCHAR(20) NOT NULL,
    `basis` VARCHAR(20) NOT NULL,
    `planned_at` DATETIME(3) NOT NULL,
    `planned_end_at` DATETIME(3) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `actual_at` DATETIME(3) NULL,
    `rule_version` INTEGER NOT NULL DEFAULT 1,
    `reason` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `technician_attendance_incidents_incident_key_key`(`incident_key`),
    INDEX `technician_attendance_incidents_technician_profile_id_kind_o_idx`(`technician_profile_id`, `kind`, `occurred_at`, `deleted_at`),
    INDEX `technician_attendance_incidents_shop_id_kind_occurred_at_del_idx`(`shop_id`, `kind`, `occurred_at`, `deleted_at`),
    INDEX `technician_attendance_incidents_order_id_idx`(`order_id`),
    INDEX `technician_attendance_incidents_availability_id_idx`(`availability_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `technician_attendance_epochs` (
    `id` INTEGER NOT NULL,
    `activated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `technician_work_states` ADD CONSTRAINT `technician_work_states_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_work_events` ADD CONSTRAINT `technician_work_events_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_work_events` ADD CONSTRAINT `technician_work_events_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_work_events` ADD CONSTRAINT `technician_work_events_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_work_events` ADD CONSTRAINT `technician_work_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_work_events` ADD CONSTRAINT `technician_work_events_incident_id_fkey` FOREIGN KEY (`incident_id`) REFERENCES `technician_attendance_incidents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_incidents` ADD CONSTRAINT `technician_attendance_incidents_technician_profile_id_fkey` FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_incidents` ADD CONSTRAINT `technician_attendance_incidents_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_incidents` ADD CONSTRAINT `technician_attendance_incidents_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `technician_attendance_incidents` ADD CONSTRAINT `technician_attendance_incidents_availability_id_fkey` FOREIGN KEY (`availability_id`) REFERENCES `availabilities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Activation boundary intentionally excludes all obligations that began before this release.
INSERT INTO `technician_attendance_epochs` (`id`, `activated_at`, `created_at`, `updated_at`) VALUES (1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
