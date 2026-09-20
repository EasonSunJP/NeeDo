ALTER TABLE `availabilities`
  MODIFY `visibility` ENUM('shop_only', 'affiliated_shops', 'technician_shops')
  NOT NULL DEFAULT 'shop_only';

UPDATE `availabilities`
SET `visibility` = 'technician_shops'
WHERE `visibility` = 'affiliated_shops';

ALTER TABLE `availabilities`
  MODIFY `visibility` ENUM('shop_only', 'technician_shops')
  NOT NULL DEFAULT 'shop_only';
