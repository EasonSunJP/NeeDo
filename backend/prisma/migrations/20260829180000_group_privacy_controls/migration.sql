-- Persist every setting exposed by the formal group privacy UI.
ALTER TABLE `conversations`
    ADD COLUMN `hide_member_profiles` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `disappearing_start_mode` VARCHAR(20) NOT NULL DEFAULT 'sent';

UPDATE `conversations`
SET `hide_member_profiles` = false,
    `disappearing_start_mode` = 'sent'
WHERE `deleted_at` IS NULL;
