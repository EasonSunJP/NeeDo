ALTER TABLE `availabilities`
  ADD COLUMN `is_schedule_control_window` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD INDEX `availability_schedule_control_window_idx` (`technician_profile_id`, `is_schedule_control_window`, `starts_at`, `ends_at`, `deleted_at`);
