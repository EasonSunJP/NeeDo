ALTER TABLE `technician_profiles`
  ADD COLUMN `bio_locales_json` JSON NULL;

ALTER TABLE `technician_services`
  ADD COLUMN `localized_content_json` JSON NULL;
