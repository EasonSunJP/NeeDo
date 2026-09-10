INSERT INTO `merchant_identity_profiles` (
  `identity_id`, `user_id`, `display_name`, `gender`, `languages`, `visibility`,
  `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `user_identities`.`id`,
  `user_identities`.`user_id`,
  COALESCE(NULLIF(TRIM(`user_identities`.`display_name`), ''), `users`.`username`),
  'private',
  JSON_ARRAY(),
  'public',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `user_identities`
JOIN `users` ON `users`.`id` = `user_identities`.`user_id`
LEFT JOIN `merchant_identity_profiles`
  ON `merchant_identity_profiles`.`identity_id` = `user_identities`.`id`
WHERE `user_identities`.`type` IN ('merchant_owner', 'merchant_staff', 'merchant_organization', 'merchant')
  AND `user_identities`.`deleted_at` IS NULL
  AND `users`.`deleted_at` IS NULL
  AND `merchant_identity_profiles`.`id` IS NULL;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`,
  `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('查看商户身份资料', 'merchant-profile:read', 'api', 'merchant-profile', '读取当前商户身份的独立个人资料', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('编辑商户身份资料', 'merchant-profile:write', 'api', 'merchant-profile', '更新当前商户身份的独立个人资料', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('merchant-profile:read', 'merchant-profile:write')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
