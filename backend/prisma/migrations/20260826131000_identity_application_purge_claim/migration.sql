-- A short-lived claim prevents a rejected application from being reopened
-- while its server-side private files are being physically removed.
ALTER TABLE `identity_applications`
    ADD COLUMN `purge_started_at` DATETIME(3) NULL;

CREATE INDEX `identity_applications_purge_started_at_idx`
    ON `identity_applications`(`purge_started_at`);
