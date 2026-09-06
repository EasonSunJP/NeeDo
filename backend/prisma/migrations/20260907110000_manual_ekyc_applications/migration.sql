CREATE TABLE `ekyc_applications` (
 `id` INTEGER NOT NULL AUTO_INCREMENT,
 `user_id` INTEGER NOT NULL,
 `active_user_id` INTEGER NULL,
 `status` VARCHAR(40) NOT NULL,
 `version` INTEGER NOT NULL DEFAULT 1,
 `profile_encrypted` LONGTEXT NOT NULL,
 `reviewer_user_id` INTEGER NULL,
 `reviewed_at` DATETIME(3) NULL,
 `review_note` TEXT NULL,
 `rejection_reason` TEXT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `updated_at` DATETIME(3) NOT NULL,
 `deleted_at` DATETIME(3) NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `ekyc_applications_active_user_id_key` (`active_user_id`),
 INDEX `ekyc_applications_user_id_status_idx` (`user_id`, `status`),
 INDEX `ekyc_applications_reviewer_user_id_idx` (`reviewer_user_id`),
 INDEX `ekyc_applications_status_created_at_idx` (`status`, `created_at`),
 INDEX `ekyc_applications_deleted_at_idx` (`deleted_at`),
 CONSTRAINT `ekyc_applications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT `ekyc_applications_reviewer_user_id_fkey` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `permissions` (`name`,`code`,`type`,`module`,`description`,`is_system`,`created_at`,`updated_at`)
VALUES
 ('本人 eKYC 申请','ekyc-application:own','api','ekyc-application','提交、读取、撤回本人 eKYC 申请',TRUE,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
 ('查看 eKYC 申请','ops:ekyc-application:read','api','ekyc-application','读取人工 eKYC 申请',TRUE,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
 ('审核 eKYC 申请','ops:ekyc-application:review','api','ekyc-application','人工证据核实后审核 eKYC 申请',TRUE,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=UTC_TIMESTAMP(3);

-- Copy only existing active applicant/reviewer grants; never broaden merchant roles to operations.
INSERT INTO `role_permissions` (`role_id`,`permission_id`,`created_at`,`updated_at`)
SELECT DISTINCT rp.`role_id`, target.`id`, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM `role_permissions` rp
JOIN `roles` r ON r.`id`=rp.`role_id` AND r.`deleted_at` IS NULL
JOIN `permissions` source ON source.`id`=rp.`permission_id` AND source.`deleted_at` IS NULL
JOIN `permissions` target ON
 (source.`code`='identity-application:own' AND target.`code`='ekyc-application:own') OR
 (source.`code`='ops:merchant-application:read' AND target.`code`='ops:ekyc-application:read') OR
 (source.`code`='ops:merchant-application:review' AND target.`code`='ops:ekyc-application:review')
WHERE rp.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE `deleted_at`=NULL,`updated_at`=UTC_TIMESTAMP(3);
