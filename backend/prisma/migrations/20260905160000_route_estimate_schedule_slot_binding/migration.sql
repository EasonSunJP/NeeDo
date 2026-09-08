ALTER TABLE `route_estimates`
  DROP INDEX `route_estimates_binding_expiry_idx`,
  ADD COLUMN `schedule_slot_id` INTEGER NULL AFTER `service_id`,
  ADD INDEX `route_estimates_binding_expiry_idx`
    (`customer_user_id`, `shop_id`, `service_id`, `schedule_slot_id`, `expires_at`, `deleted_at`),
  ADD INDEX `route_estimates_schedule_slot_idx` (`schedule_slot_id`),
  ADD CONSTRAINT `route_estimates_schedule_slot_fkey`
    FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots` (`id`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
