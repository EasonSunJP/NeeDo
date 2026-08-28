-- CreateTable
CREATE TABLE `affiliate_alliance_invitations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alliance_id` INTEGER NOT NULL,
    `inviter_member_id` INTEGER NOT NULL,
    `invitee_user_id` INTEGER NOT NULL,
    `role` ENUM('partner', 'subordinate') NOT NULL,
    `proposed_parent_member_id` INTEGER NULL,
    `status` ENUM('pending', 'accepted', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
    `pending_key` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `responded_at` DATETIME(3) NULL,
    `expired_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `affiliate_alliance_invitations_pending_key_key`(`pending_key`),
    INDEX `affiliate_alliance_invitations_alliance_id_status_created_at_idx`(`alliance_id`, `status`, `created_at`),
    INDEX `affiliate_alliance_invitee_status_created_idx`(`invitee_user_id`, `status`, `created_at`),
    INDEX `affiliate_alliance_invitations_status_expires_at_id_idx`(`status`, `expires_at`, `id`),
    INDEX `affiliate_alliance_invitations_inviter_member_id_idx`(`inviter_member_id`),
    INDEX `affiliate_alliance_invitations_proposed_parent_member_id_idx`(`proposed_parent_member_id`),
    INDEX `affiliate_alliance_invitations_deleted_at_idx`(`deleted_at`),
    CONSTRAINT `affiliate_alliance_invitations_role_parent_check`
      CHECK (
        (`role` = 'partner' AND `proposed_parent_member_id` IS NULL)
        OR (`role` = 'subordinate' AND `proposed_parent_member_id` IS NOT NULL)
      ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_invitations` ADD CONSTRAINT `affiliate_alliance_invitations_alliance_id_fkey` FOREIGN KEY (`alliance_id`) REFERENCES `affiliate_alliances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_invitations` ADD CONSTRAINT `affiliate_alliance_invitations_inviter_member_id_fkey` FOREIGN KEY (`inviter_member_id`) REFERENCES `affiliate_alliance_members`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_invitations` ADD CONSTRAINT `affiliate_alliance_invitations_invitee_user_id_fkey` FOREIGN KEY (`invitee_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_alliance_invitations` ADD CONSTRAINT `affiliate_alliance_invitations_proposed_parent_member_id_fkey` FOREIGN KEY (`proposed_parent_member_id`) REFERENCES `affiliate_alliance_members`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Keep invitation routes deployable when migrations run without a complete seed.
INSERT INTO `permissions` (
  `name`,
  `code`,
  `type`,
  `module`,
  `description`,
  `is_system`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES
  ('查看联盟成员', 'affiliate-alliance:members:list', 'api', 'affiliate', '查看本人负责联盟的成员列表', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('查看联盟邀请候选', 'affiliate-alliance:candidates:list', 'api', 'affiliate', '查看本人负责联盟的双向好友候选', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('查看联盟邀请', 'affiliate-alliance:invitations:list', 'api', 'affiliate', '查看本人负责联盟发出的邀请或本人收到的邀请', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('邀请联盟成员', 'button:affiliate-alliance-invite', 'button', 'affiliate', '向符合条件的双向好友发送联盟邀请', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('响应联盟邀请', 'button:affiliate-alliance-invitation-respond', 'button', 'affiliate', '接受或拒绝本人收到的联盟邀请', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Admin keeps all permissions. The scout role is the activated Affiliate identity.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'affiliate-alliance:members:list',
    'affiliate-alliance:candidates:list',
    'affiliate-alliance:invitations:list',
    'button:affiliate-alliance-invite',
    'button:affiliate-alliance-invitation-respond'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'scout')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Non-activated identities must not inherit alliance invitation access.
UPDATE `role_permissions`
JOIN `roles`
  ON `roles`.`id` = `role_permissions`.`role_id`
  AND `roles`.`deleted_at` IS NULL
JOIN `permissions`
  ON `permissions`.`id` = `role_permissions`.`permission_id`
  AND `permissions`.`deleted_at` IS NULL
SET
  `role_permissions`.`updated_at` = CURRENT_TIMESTAMP(3),
  `role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)
WHERE `roles`.`code` IN ('operator', 'finance', 'support', 'merchant_owner', 'merchant_staff', 'technician', 'customer', 'broker', 'viewer')
  AND `permissions`.`code` IN (
    'affiliate-alliance:members:list',
    'affiliate-alliance:candidates:list',
    'affiliate-alliance:invitations:list',
    'button:affiliate-alliance-invite',
    'button:affiliate-alliance-invitation-respond'
  )
  AND `role_permissions`.`deleted_at` IS NULL;
