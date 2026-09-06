-- CreateTable
CREATE TABLE `sos_alerts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `sender_user_id` INTEGER NOT NULL,
    `sender_identity_id` INTEGER NOT NULL,
    `sender_type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `active_key` VARCHAR(100) NULL,
    `resolved_by_user_id` INTEGER NULL,
    `resolved_by_identity_id` INTEGER NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `sos_alerts_active_key_key`(`active_key`),
    INDEX `sos_alerts_order_id_idx`(`order_id`),
    INDEX `sos_alerts_sender_user_id_idx`(`sender_user_id`),
    INDEX `sos_alerts_sender_identity_id_idx`(`sender_identity_id`),
    INDEX `sos_alerts_resolved_by_user_id_idx`(`resolved_by_user_id`),
    INDEX `sos_alerts_resolved_by_identity_id_idx`(`resolved_by_identity_id`),
    INDEX `sos_alerts_shop_id_status_deleted_at_created_at_idx`(`shop_id`, `status`, `deleted_at`, `created_at`),
    INDEX `sos_alerts_status_deleted_at_created_at_idx`(`status`, `deleted_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sos_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sender_identity_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `order_id` INTEGER NOT NULL,
    `alert_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `sos_commands_order_id_idx`(`order_id`),
    INDEX `sos_commands_alert_id_idx`(`alert_id`),
    INDEX `sos_commands_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `sos_commands_sender_identity_id_idempotency_key_key`(`sender_identity_id`, `idempotency_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_sender_identity_id_fkey` FOREIGN KEY (`sender_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_resolved_by_user_id_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_resolved_by_identity_id_fkey` FOREIGN KEY (`resolved_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_commands` ADD CONSTRAINT `sos_commands_sender_identity_id_fkey` FOREIGN KEY (`sender_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_commands` ADD CONSTRAINT `sos_commands_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sos_commands` ADD CONSTRAINT `sos_commands_alert_id_fkey` FOREIGN KEY (`alert_id`) REFERENCES `sos_alerts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Pending uniqueness is released only by explicit resolution; retries remain permanently bound.
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_lifecycle_check` CHECK (
  (`status` = 'pending' AND `active_key` IS NOT NULL AND `resolved_at` IS NULL AND `resolved_by_user_id` IS NULL AND `resolved_by_identity_id` IS NULL)
  OR (`status` = 'resolved' AND `active_key` IS NULL AND `resolved_at` IS NOT NULL AND `resolved_by_user_id` IS NOT NULL AND `resolved_by_identity_id` IS NOT NULL)
);
ALTER TABLE `sos_alerts` ADD CONSTRAINT `sos_alerts_sender_type_check` CHECK (`sender_type` IN ('customer', 'technician'));
INSERT INTO `permissions` (`name`,`code`,`type`,`module`,`description`,`is_system`,`created_at`,`updated_at`)
VALUES ('发送求救','sos:create','api','sos','Booking SOS create',true,NOW(3),NOW(3)),
('查看求救','sos:list','api','sos','Booking SOS list',true,NOW(3),NOW(3)),
('处理求救','sos:resolve','api','sos','Booking SOS resolve',true,NOW(3),NOW(3))
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=NOW(3);
INSERT INTO `role_permissions` (`role_id`,`permission_id`,`created_at`,`updated_at`)
SELECT r.id,p.id,NOW(3),NOW(3) FROM `roles` r CROSS JOIN `permissions` p
WHERE r.deleted_at IS NULL AND p.deleted_at IS NULL AND
((p.code='sos:create' AND r.code IN ('admin','customer','technician')) OR
(p.code IN ('sos:list','sos:resolve') AND r.code IN ('admin','operator','support','merchant_owner','merchant_staff')))
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=NOW(3);
