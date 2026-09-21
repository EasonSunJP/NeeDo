ALTER TABLE `conversations`
  ADD COLUMN `business_context_type` VARCHAR(40) NULL,
  ADD COLUMN `business_context_expires_at` DATETIME(3) NULL,
  ADD COLUMN `business_context_customer_user_id` INTEGER NULL,
  ADD COLUMN `business_context_technician_profile_id` INTEGER NULL;

CREATE INDEX `conversations_business_context_expiry_idx`
  ON `conversations`(`business_context_type`, `business_context_expires_at`, `deleted_at`);

CREATE INDEX `conversations_booking_contact_pair_idx`
  ON `conversations`(`business_context_customer_user_id`, `business_context_technician_profile_id`, `deleted_at`);

ALTER TABLE `conversations`
  ADD CONSTRAINT `conversations_business_context_customer_user_id_fkey`
    FOREIGN KEY (`business_context_customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `conversations_business_context_technician_profile_id_fkey`
    FOREIGN KEY (`business_context_technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
