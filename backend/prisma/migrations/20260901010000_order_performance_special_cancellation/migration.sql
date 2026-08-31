-- Normalize technician-accountable adverse order outcomes. Revisions are
-- append-only application records; summaries are rebuildable projections.
CREATE TABLE `order_performance_assessments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `outcome` ENUM('technician_cancelled', 'technician_uncompleted') NOT NULL,
  `treatment` ENUM('counted', 'special_excluded') NOT NULL DEFAULT 'counted',
  `version` INTEGER NOT NULL DEFAULT 1,
  `current_revision_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  CONSTRAINT `order_performance_assessments_version_chk`
    CHECK (`version` >= 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_performance_assessment_revisions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `assessment_id` INTEGER NOT NULL,
  `booking_order_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `action` ENUM(
    'classify_technician_cancelled',
    'classify_technician_uncompleted',
    'apply_special_exclusion',
    'revoke_special_exclusion'
  ) NOT NULL,
  `previous_treatment` ENUM('counted', 'special_excluded') NULL,
  `next_treatment` ENUM('counted', 'special_excluded') NOT NULL,
  `public_reason` VARCHAR(500) NULL,
  `internal_note` VARCHAR(1000) NULL,
  `actor_user_id` INTEGER NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `assessment_version` INTEGER NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  CONSTRAINT `order_performance_revisions_assessment_version_chk`
    CHECK (`assessment_version` >= 1)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `technician_performance_summaries` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `technician_profile_id` INTEGER NOT NULL,
  `completed_order_count` INTEGER NOT NULL DEFAULT 0,
  `accountable_cancellation_count` INTEGER NOT NULL DEFAULT 0,
  `accountable_uncompleted_count` INTEGER NOT NULL DEFAULT 0,
  `special_excluded_count` INTEGER NOT NULL DEFAULT 0,
  `acceptance_rate_bps` INTEGER NOT NULL DEFAULT 10000,
  `source_calculated_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  PRIMARY KEY (`id`),
  CONSTRAINT `technician_performance_summaries_counts_chk`
    CHECK (
      `completed_order_count` >= 0
      AND `accountable_cancellation_count` >= 0
      AND `accountable_uncompleted_count` >= 0
      AND `special_excluded_count` >= 0
    ),
  CONSTRAINT `technician_performance_summaries_rate_chk`
    CHECK (`acceptance_rate_bps` BETWEEN 0 AND 10000)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `order_performance_assessments_booking_order_id_key`
  ON `order_performance_assessments`(`booking_order_id`);
CREATE UNIQUE INDEX `order_performance_assessments_current_revision_id_key`
  ON `order_performance_assessments`(`current_revision_id`);
CREATE INDEX `order_performance_assessments_technician_treatment_deleted_idx`
  ON `order_performance_assessments`(`technician_profile_id`, `treatment`, `deleted_at`);
CREATE INDEX `order_performance_assessments_deleted_at_idx`
  ON `order_performance_assessments`(`deleted_at`);

CREATE UNIQUE INDEX `order_performance_assessment_revisions_idempotency_key_key`
  ON `order_performance_assessment_revisions`(`idempotency_key`);
CREATE INDEX `order_performance_assessment_revisions_assessment_id_idx`
  ON `order_performance_assessment_revisions`(`assessment_id`);
CREATE INDEX `order_performance_revisions_order_created_idx`
  ON `order_performance_assessment_revisions`(`booking_order_id`, `created_at`);
CREATE INDEX `order_performance_assessment_revisions_technician_profile_id_idx`
  ON `order_performance_assessment_revisions`(`technician_profile_id`);
CREATE INDEX `order_performance_assessment_revisions_actor_user_id_idx`
  ON `order_performance_assessment_revisions`(`actor_user_id`);
CREATE INDEX `order_performance_assessment_revisions_deleted_at_idx`
  ON `order_performance_assessment_revisions`(`deleted_at`);

CREATE UNIQUE INDEX `technician_performance_summaries_technician_profile_id_key`
  ON `technician_performance_summaries`(`technician_profile_id`);
CREATE INDEX `technician_performance_summaries_deleted_at_idx`
  ON `technician_performance_summaries`(`deleted_at`);

ALTER TABLE `order_performance_assessments`
  ADD CONSTRAINT `order_performance_assessments_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `order_performance_assessments_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_performance_assessment_revisions`
  ADD CONSTRAINT `order_performance_assessment_revisions_assessment_id_fkey`
    FOREIGN KEY (`assessment_id`) REFERENCES `order_performance_assessments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `order_performance_assessment_revisions_booking_order_id_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `order_performance_assessment_revisions_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `order_performance_assessment_revisions_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `order_performance_assessments`
  ADD CONSTRAINT `order_performance_assessments_current_revision_id_fkey`
    FOREIGN KEY (`current_revision_id`) REFERENCES `order_performance_assessment_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `technician_performance_summaries`
  ADD CONSTRAINT `technician_performance_summaries_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
