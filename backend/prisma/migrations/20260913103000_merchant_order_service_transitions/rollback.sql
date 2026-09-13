-- Revoke only the merchant role grants introduced by this migration.
UPDATE `role_permissions`
JOIN `roles` ON `roles`.`id` = `role_permissions`.`role_id`
JOIN `permissions` ON `permissions`.`id` = `role_permissions`.`permission_id`
SET
  `role_permissions`.`updated_at` = CURRENT_TIMESTAMP(3),
  `role_permissions`.`deleted_at` = CURRENT_TIMESTAMP(3)
WHERE `roles`.`code` IN ('merchant_owner', 'merchant_staff')
  AND `permissions`.`code` IN ('order:service:start', 'order:service:end')
  AND `role_permissions`.`deleted_at` IS NULL;
