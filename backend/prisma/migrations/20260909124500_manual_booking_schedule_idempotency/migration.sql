ALTER TABLE `schedule_slots`
  ADD COLUMN `manual_booking_idempotency_key` VARCHAR(160) NULL,
  ADD COLUMN `manual_booking_request_fingerprint` CHAR(64) NULL,
  ADD UNIQUE INDEX `schedule_slots_technician_manual_booking_idempotency_key` (`technician_profile_id`, `manual_booking_idempotency_key`);
