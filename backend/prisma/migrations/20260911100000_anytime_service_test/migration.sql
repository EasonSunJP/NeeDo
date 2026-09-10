ALTER TABLE `platform_setting_versions`
  ADD COLUMN `anytime_service_test_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `ndp_payment_enabled`;
