ALTER TABLE `carousel_slides` MODIFY `target_type` ENUM('shop', 'technician', 'service', 'affiliate_announcement', 'none') NOT NULL;

ALTER TABLE `carousel_slide_translations`
  ADD COLUMN `media_asset_id` INTEGER NULL;

CREATE INDEX `carousel_slide_translations_media_asset_id_idx`
  ON `carousel_slide_translations`(`media_asset_id`);

ALTER TABLE `carousel_slide_translations`
  ADD CONSTRAINT `carousel_slide_translations_media_asset_id_fkey`
  FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
