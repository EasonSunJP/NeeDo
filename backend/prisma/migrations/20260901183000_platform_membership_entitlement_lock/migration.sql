ALTER TABLE `platform_membership_entitlements`
  ADD COLUMN `change_kind` ENUM('grant', 'renew', 'upgrade', 'downgrade') NOT NULL DEFAULT 'grant' AFTER `source_reference`,
  ADD COLUMN `billing_months` INTEGER NOT NULL DEFAULT 1 AFTER `change_kind`,
  ADD COLUMN `experience_value_ndp` INTEGER NOT NULL DEFAULT 0 AFTER `billing_months`,
  ADD COLUMN `lock_version` INTEGER NOT NULL DEFAULT 1 AFTER `created_by_id`,
  ADD CONSTRAINT `platform_membership_entitlements_billing_months_chk`
    CHECK (`billing_months` BETWEEN 1 AND 12),
  ADD CONSTRAINT `platform_membership_entitlements_experience_value_chk`
    CHECK (`experience_value_ndp` >= 0),
  ADD CONSTRAINT `platform_membership_entitlements_lock_version_chk`
    CHECK (`lock_version` > 0);

ALTER TABLE `customer_profiles`
  ADD COLUMN `platform_membership_lock_version` INTEGER NOT NULL DEFAULT 1 AFTER `membership_granted_by_id`,
  ADD CONSTRAINT `customer_profiles_platform_membership_lock_version_chk`
    CHECK (`platform_membership_lock_version` > 0);
