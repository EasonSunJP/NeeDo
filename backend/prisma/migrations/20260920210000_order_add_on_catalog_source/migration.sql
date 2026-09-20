ALTER TABLE `order_add_ons`
  MODIFY `service_id` INTEGER NULL,
  ADD COLUMN `technician_service_id` INTEGER NULL AFTER `service_id`,
  ADD CONSTRAINT `order_add_ons_catalog_source_chk` CHECK (
    (`service_id` IS NOT NULL AND `technician_service_id` IS NULL)
    OR (`service_id` IS NULL AND `technician_service_id` IS NOT NULL)
  ),
  ADD INDEX `order_add_ons_technician_service_idx`(`technician_service_id`),
  ADD CONSTRAINT `order_add_ons_technician_service_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
