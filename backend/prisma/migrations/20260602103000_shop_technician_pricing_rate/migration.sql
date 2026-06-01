-- Store-facing technician pricing rate.
ALTER TABLE `shops`
  ADD COLUMN `technician_pricing_rate_percent` INTEGER NOT NULL DEFAULT 100;
