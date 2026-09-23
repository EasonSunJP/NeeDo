ALTER TABLE `shops`
  ADD COLUMN `booking_contact_target` VARCHAR(32) NOT NULL DEFAULT 'owner',
  ADD COLUMN `booking_contact_employee_needo_id` VARCHAR(32) NULL;

ALTER TABLE `conversations`
  ADD COLUMN `business_context_shop_id` INTEGER NULL,
  ADD INDEX `conversations_shop_booking_contact_idx` (`business_context_shop_id`, `business_context_customer_user_id`, `deleted_at`),
  ADD CONSTRAINT `conversations_business_context_shop_id_fkey` FOREIGN KEY (`business_context_shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
