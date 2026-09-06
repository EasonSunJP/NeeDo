-- Register user-management operation permissions and grant them to operations roles.
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
  ('用户履约评论管理', 'backoffice:user-usage:comment', 'api', 'backoffice', '在用户履约时间线追加不可删除的运营评论', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户退款信息修订', 'backoffice:user-refund:amend', 'api', 'backoffice', '以理由和审计记录修订用户履约退款信息', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
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
  ON `permissions`.`code` IN (
    'backoffice:user-usage:comment',
    'backoffice:user-refund:amend'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
