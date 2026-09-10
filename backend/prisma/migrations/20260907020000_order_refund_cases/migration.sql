CREATE TABLE `order_refund_cases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_user_id` INTEGER NOT NULL,
    `status` ENUM('merchant_review_pending', 'refund_pending', 'customer_confirmation_pending', 'merchant_rejected', 'disputed', 'refunded', 'dispute_rejected') NOT NULL DEFAULT 'merchant_review_pending',
    `responsibility` VARCHAR(20) NOT NULL DEFAULT 'shop',
    `refund_amount_jpy` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
    `version` INTEGER NOT NULL DEFAULT 1,
    `active_key` VARCHAR(191) NULL,
    `request_reason` VARCHAR(500) NOT NULL,
    `requested_by_identity_id` INTEGER NOT NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `merchant_decision_reason` VARCHAR(500) NULL,
    `merchant_decided_by_user_id` INTEGER NULL,
    `merchant_decided_by_identity_id` INTEGER NULL,
    `merchant_decided_at` DATETIME(3) NULL,
    `refund_evidence` JSON NULL,
    `refund_evidence_submitted_by_id` INTEGER NULL,
    `refund_evidence_identity_id` INTEGER NULL,
    `refund_evidence_submitted_at` DATETIME(3) NULL,
    `customer_confirmed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_refund_cases_public_id_key`(`public_id`),
    UNIQUE INDEX `order_refund_cases_active_key_key`(`active_key`),
    INDEX `order_refund_cases_order_created_deleted_idx`(`booking_order_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_cases_shop_status_created_deleted_idx`(`shop_id`, `status`, `created_at`, `deleted_at`),
    INDEX `order_refund_cases_customer_status_created_deleted_idx`(`customer_user_id`, `status`, `created_at`, `deleted_at`),
    INDEX `order_refund_cases_requested_by_identity_id_idx`(`requested_by_identity_id`),
    INDEX `order_refund_cases_merchant_decided_by_user_id_idx`(`merchant_decided_by_user_id`),
    INDEX `order_refund_cases_merchant_decided_by_identity_id_idx`(`merchant_decided_by_identity_id`),
    INDEX `order_refund_cases_refund_evidence_submitted_by_id_idx`(`refund_evidence_submitted_by_id`),
    INDEX `order_refund_cases_refund_evidence_identity_id_idx`(`refund_evidence_identity_id`),
    INDEX `order_refund_cases_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_refund_case_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_refund_case_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `action` ENUM('request', 'merchant_approve', 'merchant_reject', 'open_complaint', 'resolve_dispute_refund', 'resolve_dispute_reject', 'submit_refund_evidence', 'confirm_customer_receipt') NOT NULL,
    `from_status` ENUM('merchant_review_pending', 'refund_pending', 'customer_confirmation_pending', 'merchant_rejected', 'disputed', 'refunded', 'dispute_rejected') NULL,
    `to_status` ENUM('merchant_review_pending', 'refund_pending', 'customer_confirmation_pending', 'merchant_rejected', 'disputed', 'refunded', 'dispute_rejected') NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `actor_identity_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_refund_case_events_idempotency_key_key`(`idempotency_key`),
    INDEX `order_refund_case_events_case_created_deleted_idx`(`order_refund_case_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_case_events_order_created_deleted_idx`(`booking_order_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_case_events_actor_created_deleted_idx`(`actor_user_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_case_events_actor_identity_id_idx`(`actor_identity_id`),
    INDEX `order_refund_case_events_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_refund_disputes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `order_refund_case_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `shop_id` INTEGER NOT NULL,
    `customer_user_id` INTEGER NOT NULL,
    `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    `resolution` ENUM('refund', 'reject') NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `active_key` VARCHAR(191) NULL,
    `opened_by_user_id` INTEGER NOT NULL,
    `opened_by_identity_id` INTEGER NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `resolved_by_user_id` INTEGER NULL,
    `resolved_by_identity_id` INTEGER NULL,
    `resolved_at` DATETIME(3) NULL,
    `public_resolution_reason` VARCHAR(500) NULL,
    `internal_note` VARCHAR(1000) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_refund_disputes_public_id_key`(`public_id`),
    UNIQUE INDEX `order_refund_disputes_active_key_key`(`active_key`),
    INDEX `order_refund_disputes_case_created_deleted_idx`(`order_refund_case_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_disputes_status_shop_created_deleted_idx`(`status`, `shop_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_disputes_booking_order_id_idx`(`booking_order_id`),
    INDEX `order_refund_disputes_customer_user_id_idx`(`customer_user_id`),
    INDEX `order_refund_disputes_opened_by_user_id_idx`(`opened_by_user_id`),
    INDEX `order_refund_disputes_opened_by_identity_id_idx`(`opened_by_identity_id`),
    INDEX `order_refund_disputes_resolved_by_user_id_idx`(`resolved_by_user_id`),
    INDEX `order_refund_disputes_resolved_by_identity_id_idx`(`resolved_by_identity_id`),
    INDEX `order_refund_disputes_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_refund_dispute_revisions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_refund_dispute_id` INTEGER NOT NULL,
    `order_refund_case_id` INTEGER NOT NULL,
    `booking_order_id` INTEGER NOT NULL,
    `resolution` ENUM('refund', 'reject') NOT NULL,
    `previous_version` INTEGER NOT NULL,
    `next_version` INTEGER NOT NULL,
    `resolved_by_user_id` INTEGER NOT NULL,
    `resolved_by_identity_id` INTEGER NOT NULL,
    `public_resolution_reason` VARCHAR(500) NOT NULL,
    `internal_note` VARCHAR(1000) NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_refund_dispute_revisions_idempotency_key_key`(`idempotency_key`),
    INDEX `order_refund_dispute_revisions_dispute_created_deleted_idx`(`order_refund_dispute_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_dispute_revisions_case_created_deleted_idx`(`order_refund_case_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_dispute_revisions_booking_order_id_idx`(`booking_order_id`),
    INDEX `order_refund_dispute_revisions_resolver_created_deleted_idx`(`resolved_by_user_id`, `created_at`, `deleted_at`),
    INDEX `order_refund_dispute_revisions_resolved_by_identity_id_idx`(`resolved_by_identity_id`),
    INDEX `order_refund_dispute_revisions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `order_refund_cases`
  ADD CONSTRAINT `order_refund_cases_shop_responsibility_chk`
    CHECK (responsibility = 'shop');
ALTER TABLE `order_refund_cases`
  ADD CONSTRAINT `order_refund_cases_amount_chk`
    CHECK (refund_amount_jpy > 0);
ALTER TABLE `order_refund_cases`
  ADD CONSTRAINT `order_refund_cases_version_chk`
    CHECK (version > 0);
ALTER TABLE `order_refund_disputes`
  ADD CONSTRAINT `order_refund_disputes_version_chk`
    CHECK (version > 0);
ALTER TABLE `order_refund_dispute_revisions`
  ADD CONSTRAINT `order_refund_dispute_revisions_versions_chk`
    CHECK (previous_version > 0 AND next_version > previous_version);

ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_requested_by_identity_id_fkey` FOREIGN KEY (`requested_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_merchant_decided_by_user_id_fkey` FOREIGN KEY (`merchant_decided_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_merchant_decided_by_identity_id_fkey` FOREIGN KEY (`merchant_decided_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_refund_evidence_submitted_by_id_fkey` FOREIGN KEY (`refund_evidence_submitted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_cases` ADD CONSTRAINT `order_refund_cases_refund_evidence_identity_id_fkey` FOREIGN KEY (`refund_evidence_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_refund_case_events` ADD CONSTRAINT `order_refund_case_events_case_id_fkey` FOREIGN KEY (`order_refund_case_id`) REFERENCES `order_refund_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_case_events` ADD CONSTRAINT `order_refund_case_events_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_case_events` ADD CONSTRAINT `order_refund_case_events_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_case_events` ADD CONSTRAINT `order_refund_case_events_actor_identity_id_fkey` FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_case_id_fkey` FOREIGN KEY (`order_refund_case_id`) REFERENCES `order_refund_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_customer_user_id_fkey` FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_opened_by_user_id_fkey` FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_opened_by_identity_id_fkey` FOREIGN KEY (`opened_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_resolved_by_user_id_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_disputes` ADD CONSTRAINT `order_refund_disputes_resolved_by_identity_id_fkey` FOREIGN KEY (`resolved_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `order_refund_dispute_revisions` ADD CONSTRAINT `order_refund_dispute_revisions_dispute_id_fkey` FOREIGN KEY (`order_refund_dispute_id`) REFERENCES `order_refund_disputes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_dispute_revisions` ADD CONSTRAINT `order_refund_dispute_revisions_case_id_fkey` FOREIGN KEY (`order_refund_case_id`) REFERENCES `order_refund_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_dispute_revisions` ADD CONSTRAINT `order_refund_dispute_revisions_booking_order_id_fkey` FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_dispute_revisions` ADD CONSTRAINT `order_refund_dispute_revisions_resolved_by_user_id_fkey` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_refund_dispute_revisions` ADD CONSTRAINT `order_refund_dispute_revisions_resolved_by_identity_id_fkey` FOREIGN KEY (`resolved_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
