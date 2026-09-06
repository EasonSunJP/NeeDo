ALTER TABLE `platform_partner_profiles`
    DROP INDEX `platform_partner_profiles_active_partner_key`,
    DROP COLUMN `active_partner_key`,
    ADD COLUMN `ends_at` DATETIME(3) NULL AFTER `activated_at`,
    ADD CONSTRAINT `platform_partner_profiles_validity_chk`
      CHECK (`ends_at` IS NULL OR `ends_at` > `activated_at`),
    ADD INDEX `platform_partner_profiles_validity_idx`
      (`user_id`, `partner_type`, `activated_at`, `ends_at`, `deleted_at`);
