ALTER TABLE `customer_profiles`
  ADD COLUMN `bio_locales_json` JSON NULL;

ALTER TABLE `merchant_identity_profiles`
  ADD COLUMN `bio_locales_json` JSON NULL;
