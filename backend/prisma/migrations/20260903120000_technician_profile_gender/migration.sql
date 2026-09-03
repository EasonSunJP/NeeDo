ALTER TABLE `technician_profiles`
  ADD COLUMN `gender` VARCHAR(20) NOT NULL DEFAULT 'private' AFTER `base_longitude`;
