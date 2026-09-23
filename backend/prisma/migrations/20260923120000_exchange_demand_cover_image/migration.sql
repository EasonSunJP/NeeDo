ALTER TABLE `exchange_demands`
  ADD COLUMN `cover_media_asset_id` INTEGER NULL;

CREATE UNIQUE INDEX `exchange_demands_cover_media_asset_id_key`
  ON `exchange_demands`(`cover_media_asset_id`);

ALTER TABLE `exchange_demands`
  ADD CONSTRAINT `exchange_demands_cover_media_asset_id_fkey`
  FOREIGN KEY (`cover_media_asset_id`) REFERENCES `media_assets`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
