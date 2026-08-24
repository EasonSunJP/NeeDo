ALTER TABLE `booking_orders`
  ADD COLUMN `payment_method` ENUM('onsite', 'bank_transfer') NOT NULL DEFAULT 'onsite' AFTER `cancel_reason`,
  ADD COLUMN `payment_status` ENUM('pending', 'confirmed', 'refund_pending', 'refunded') NOT NULL DEFAULT 'pending' AFTER `payment_method`,
  ADD COLUMN `payment_amount_jpy` INTEGER NOT NULL DEFAULT 0 AFTER `payment_status`,
  ADD COLUMN `payment_confirmed_by_id` INTEGER NULL AFTER `payment_amount_jpy`,
  ADD COLUMN `payment_confirmed_at` DATETIME(3) NULL AFTER `payment_confirmed_by_id`,
  ADD COLUMN `payment_reference` VARCHAR(120) NULL AFTER `payment_confirmed_at`,
  ADD COLUMN `payment_note` VARCHAR(500) NULL AFTER `payment_reference`,
  ADD COLUMN `payment_refunded_by_id` INTEGER NULL AFTER `payment_note`,
  ADD COLUMN `payment_refunded_at` DATETIME(3) NULL AFTER `payment_refunded_by_id`,
  ADD COLUMN `payment_refund_reference` VARCHAR(120) NULL AFTER `payment_refunded_at`,
  ADD COLUMN `payment_refund_reason` VARCHAR(500) NULL AFTER `payment_refund_reference`;

UPDATE `booking_orders`
SET `payment_amount_jpy` = ROUND(`price_amount`)
WHERE `payment_amount_jpy` = 0;

CREATE INDEX `booking_orders_payment_method_idx` ON `booking_orders`(`payment_method`);
CREATE INDEX `booking_orders_payment_status_idx` ON `booking_orders`(`payment_status`);
CREATE INDEX `booking_orders_payment_confirmed_by_id_idx` ON `booking_orders`(`payment_confirmed_by_id`);
CREATE INDEX `booking_orders_payment_refunded_by_id_idx` ON `booking_orders`(`payment_refunded_by_id`);

ALTER TABLE `booking_orders`
  ADD CONSTRAINT `booking_orders_payment_confirmed_by_id_fkey`
    FOREIGN KEY (`payment_confirmed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `booking_orders_payment_refunded_by_id_fkey`
    FOREIGN KEY (`payment_refunded_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
