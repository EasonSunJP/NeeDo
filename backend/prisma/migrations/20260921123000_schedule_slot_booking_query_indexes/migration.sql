-- Bound customer availability pagination and counts to the selected catalog item
-- before evaluating the requested time range.
CREATE INDEX `schedule_slot_service_deleted_start_id_idx`
  ON `schedule_slots`(`service_id`, `deleted_at`, `starts_at`, `id`);

CREATE INDEX `schedule_slot_technician_service_deleted_start_id_idx`
  ON `schedule_slots`(`technician_service_id`, `deleted_at`, `starts_at`, `id`);
