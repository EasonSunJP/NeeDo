-- Keep status history values aligned with the booking order fulfillment lifecycle.
ALTER TABLE `order_status_histories`
  MODIFY `from_status` ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', 'awaiting_payment_confirmation', 'completed', 'cancelled') NULL,
  MODIFY `to_status` ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', 'awaiting_payment_confirmation', 'completed', 'cancelled') NOT NULL;
