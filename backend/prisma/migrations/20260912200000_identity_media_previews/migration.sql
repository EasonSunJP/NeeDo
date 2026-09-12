ALTER TABLE `identity_application_media`
  ADD COLUMN `variant` VARCHAR(20) NOT NULL DEFAULT 'original',
  ADD COLUMN `source_media_id` INTEGER NULL;

CREATE INDEX `identity_application_media_source_media_id_idx`
  ON `identity_application_media`(`source_media_id`);

CREATE UNIQUE INDEX `identity_application_media_source_media_id_variant_key`
  ON `identity_application_media`(`source_media_id`, `variant`);

ALTER TABLE `identity_application_media`
  ADD CONSTRAINT `identity_application_media_source_media_id_fkey`
  FOREIGN KEY (`source_media_id`) REFERENCES `identity_application_media`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
