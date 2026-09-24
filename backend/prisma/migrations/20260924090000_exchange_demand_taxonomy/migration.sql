ALTER TABLE `exchange_demands`
  ADD COLUMN `category_id` INTEGER NULL,
  ADD COLUMN `business_keyword_ids_json` JSON NULL;

CREATE INDEX `exchange_demands_category_id_deleted_at_idx`
  ON `exchange_demands`(`category_id`, `deleted_at`);

ALTER TABLE `exchange_demands`
  ADD CONSTRAINT `exchange_demands_category_id_fkey`
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
