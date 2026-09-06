ALTER TABLE `user_global_policy_versions`
  ADD COLUMN `require_merchant_application_ekyc` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `require_technician_application_ekyc` BOOLEAN NOT NULL DEFAULT FALSE,
  ALTER COLUMN `require_home_service_ekyc` SET DEFAULT TRUE;

START TRANSACTION;
SET @ekyc_defaults_public_id = UUID();

-- Append a new default version only for an untouched system bootstrap.
-- Operator-created drafts and publications are preserved, including their booking switches.
INSERT INTO `user_global_policy_versions`
(`public_id`, `version`, `status`, `require_phone`, `require_email`,
 `require_home_service_ekyc`, `require_store_service_ekyc`,
 `require_merchant_application_ekyc`, `require_technician_application_ekyc`,
 `ndp_per_base_exp`, `base_exp_units_per_threshold`, `effective_from`, `published_at`,
 `lock_version`, `created_at`, `updated_at`)
SELECT @ekyc_defaults_public_id, 2, 'published', p.`require_phone`, p.`require_email`, TRUE, FALSE, FALSE, FALSE,
 p.`ndp_per_base_exp`, p.`base_exp_units_per_threshold`, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3),
 1, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM `user_global_policy_versions` p
WHERE p.`version` = 1 AND p.`status` = 'published'
  AND p.`created_by_id` IS NULL AND p.`published_by_id` IS NULL AND p.`deleted_at` IS NULL
  AND (SELECT total FROM (SELECT COUNT(*) AS total FROM `user_global_policy_versions`) count_policies) = 1;

INSERT INTO `audit_logs` (`actor_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`, `updated_at`)
SELECT NULL, 'user_global_policy.ekyc_defaults_initialized', 'UserGlobalPolicyVersion', p.`id`,
 JSON_OBJECT('reason', 'Initialize requested eKYC defaults: only home bookings required',
 'requireMerchantApplicationEkyc', FALSE, 'requireTechnicianApplicationEkyc', FALSE,
 'requireHomeServiceEkyc', TRUE, 'requireStoreServiceEkyc', FALSE), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM `user_global_policy_versions` p
WHERE p.`public_id` = @ekyc_defaults_public_id
 AND p.`require_home_service_ekyc` = TRUE AND p.`deleted_at` IS NULL
 AND NOT EXISTS (SELECT 1 FROM `audit_logs` a WHERE a.`target_id` = p.`id` AND a.`action` = 'user_global_policy.ekyc_defaults_initialized');

COMMIT;
