ALTER TABLE `exchange_demands`
  ADD COLUMN `service_mode` ENUM('home', 'store') NOT NULL DEFAULT 'store' AFTER `publisher_identity_public`,
  ADD INDEX `exchange_demands_service_mode_deleted_at_idx` (`service_mode`, `deleted_at`);
