-- Existing formal service-transition permissions are extended to merchant operators.
-- The API still enforces shop ownership, order state, verification code, timing,
-- idempotency, and settlement invariants for every transition.
INSERT INTO `role_permissions` (
  `role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN ('order:service:start', 'order:service:end')
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('merchant_owner', 'merchant_staff')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
