-- Technician services belong to the technician portfolio. shop_id is retained
-- only as an optional creation-origin reference for legacy rows.
ALTER TABLE `technician_services`
  MODIFY `shop_id` INTEGER NULL;
