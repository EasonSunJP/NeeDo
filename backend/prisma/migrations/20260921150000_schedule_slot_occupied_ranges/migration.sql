ALTER TABLE `schedule_slots`
  ADD COLUMN `occupied_starts_at` DATETIME(3) NULL,
  ADD COLUMN `occupied_ends_at` DATETIME(3) NULL,
  ADD COLUMN `pre_buffer_minutes` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `post_buffer_minutes` INTEGER NOT NULL DEFAULT 0;

UPDATE `schedule_slots`
SET `occupied_starts_at` = `starts_at`,
    `occupied_ends_at` = `ends_at`
WHERE `occupied_starts_at` IS NULL OR `occupied_ends_at` IS NULL;

CREATE INDEX `schedule_slot_technician_occupied_range_idx`
  ON `schedule_slots`(`technician_profile_id`, `occupied_starts_at`, `occupied_ends_at`, `deleted_at`);
