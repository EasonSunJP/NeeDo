ALTER TABLE `official_notices`
  MODIFY `audience_type` ENUM(
    'all',
    'identity_types',
    'exact_users',
    'shop_card_holders',
    'shop_employees',
    'shop_technicians'
  ) NOT NULL,
  ADD COLUMN `issuer_type` ENUM('platform', 'shop') NOT NULL DEFAULT 'platform' AFTER `request_fingerprint`,
  ADD COLUMN `issuer_shop_id` INTEGER NULL AFTER `issuer_type`,
  ADD COLUMN `created_by_identity_id` INTEGER NULL AFTER `issuer_shop_id`,
  ADD INDEX `official_notices_issuer_scope_created_at_idx` (`issuer_type`, `issuer_shop_id`, `created_at`, `deleted_at`),
  ADD INDEX `official_notices_issuer_shop_id_idx` (`issuer_shop_id`),
  ADD INDEX `official_notices_created_by_identity_id_idx` (`created_by_identity_id`),
  ADD CONSTRAINT `official_notices_issuer_scope_check` CHECK (
    (`issuer_type` = 'platform' AND `issuer_shop_id` IS NULL)
    OR
    (`issuer_type` = 'shop' AND `issuer_shop_id` IS NOT NULL AND `created_by_identity_id` IS NOT NULL)
  ),
  ADD CONSTRAINT `official_notices_issuer_shop_id_fkey`
    FOREIGN KEY (`issuer_shop_id`) REFERENCES `shops` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `official_notices_created_by_identity_id_fkey`
    FOREIGN KEY (`created_by_identity_id`) REFERENCES `user_identities` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('商户通知读取', 'merchant-admin:notice:read', 'api', 'merchant-admin', '分页读取当前店铺发布的正式通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户通知创建', 'merchant-admin:notice:create', 'api', 'merchant-admin', '为当前店铺的服务端派生受众创建正式通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户通知审核', 'merchant-admin:notice:review', 'api', 'merchant-admin', '取消或归档当前店铺发布的正式通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('商户通知发送', 'merchant-admin:notice:send', 'api', 'merchant-admin', '立即或定时发送并重试当前店铺的正式通知', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
JOIN `permissions`
  ON `permissions`.`code` IN (
    'merchant-admin:notice:read',
    'merchant-admin:notice:create',
    'merchant-admin:notice:review',
    'merchant-admin:notice:send'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
