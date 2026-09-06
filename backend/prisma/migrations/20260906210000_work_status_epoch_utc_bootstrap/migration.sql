-- Correct a fresh bootstrap created with CURRENT_TIMESTAMP in a non-UTC
-- MySQL session. Keep the applied migration unchanged. Only the singleton's
-- future activation may move, and only before any work history exists.
-- Soft-deleted history also prevents correction; established attendance
-- boundaries must never be silently reset. UTC_TIMESTAMP ignores session TZ.
UPDATE `technician_attendance_epochs`
SET `activated_at` = UTC_TIMESTAMP(3),
    `updated_at` = UTC_TIMESTAMP(3)
WHERE `id` = 1
  AND `deleted_at` IS NULL
  AND `activated_at` > UTC_TIMESTAMP(3)
  AND NOT EXISTS (SELECT 1 FROM `technician_work_states`)
  AND NOT EXISTS (SELECT 1 FROM `technician_work_events`)
  AND NOT EXISTS (SELECT 1 FROM `technician_attendance_incidents`);
