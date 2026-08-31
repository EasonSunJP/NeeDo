-- Extend the existing order lifecycle without rewriting historical rows.
ALTER TABLE `booking_orders`
  MODIFY `status` ENUM('pending', 'confirmed', 'in_service', 'awaiting_checkout', 'awaiting_payment_confirmation', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  MODIFY `payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NOT NULL DEFAULT 'onsite';

-- Versioned NDP/JPY rates are immutable inputs to every checkout snapshot.
CREATE TABLE `ndp_exchange_rate_rules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `version` INTEGER NOT NULL,
  `ndp_units` INTEGER NOT NULL,
  `jpy_units` INTEGER NOT NULL,
  `status` ENUM('active', 'superseded') NOT NULL,
  `effective_from` DATETIME(3) NOT NULL,
  `effective_to` DATETIME(3) NULL,
  `active_key` VARCHAR(80) NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `created_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `ndp_exchange_rate_rules_ndp_units_chk` CHECK (`ndp_units` > 0),
  CONSTRAINT `ndp_exchange_rate_rules_jpy_units_chk` CHECK (`jpy_units` > 0),
  CONSTRAINT `ndp_exchange_rate_rules_version_chk` CHECK (`version` > 0),
  CONSTRAINT `ndp_exchange_rate_rules_window_chk` CHECK (`effective_to` IS NULL OR `effective_to` > `effective_from`),
  CONSTRAINT `ndp_exchange_rate_rules_active_sentinel_chk` CHECK (
    (`status` = 'active' AND `active_key` = 'ndp_exchange_rate')
    OR (`status` = 'superseded' AND `active_key` IS NULL)
  ),
  UNIQUE INDEX `ndp_exchange_rate_rules_public_id_key`(`public_id`),
  UNIQUE INDEX `ndp_exchange_rate_rules_version_key`(`version`),
  UNIQUE INDEX `ndp_exchange_rate_rules_active_key`(`active_key`),
  UNIQUE INDEX `ndp_exchange_rate_rules_idempotency_key`(`idempotency_key`),
  INDEX `ndp_exchange_rate_rules_effective_idx`(`status`, `effective_from`, `effective_to`, `deleted_at`),
  INDEX `ndp_exchange_rate_rules_created_by_idx`(`created_by_id`),
  INDEX `ndp_exchange_rate_rules_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_service_sessions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `verification_hash` VARCHAR(255) NOT NULL,
  `started_by_user_id` INTEGER NULL,
  `started_at` DATETIME(3) NULL,
  `expected_ends_at` DATETIME(3) NULL,
  `ended_by_user_id` INTEGER NULL,
  `ended_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `order_service_sessions_ended_chronology_chk` CHECK (
    `ended_at` IS NULL OR (`started_at` IS NOT NULL AND `ended_at` >= `started_at`)
  ),
  CONSTRAINT `order_service_sessions_expected_chronology_chk` CHECK (
    `expected_ends_at` IS NULL OR `started_at` IS NULL OR `expected_ends_at` >= `started_at`
  ),
  UNIQUE INDEX `order_service_sessions_booking_order_key`(`booking_order_id`),
  UNIQUE INDEX `order_service_sessions_id_order_key`(`id`, `booking_order_id`),
  INDEX `order_service_sessions_started_by_idx`(`started_by_user_id`),
  INDEX `order_service_sessions_ended_by_idx`(`ended_by_user_id`),
  INDEX `order_service_sessions_due_active_idx`(`expected_ends_at`, `ended_at`, `deleted_at`),
  INDEX `order_service_sessions_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_add_ons` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `service_session_id` INTEGER NOT NULL,
  `service_id` INTEGER NOT NULL,
  `status` ENUM('proposed', 'accepted', 'rejected') NOT NULL DEFAULT 'proposed',
  `service_name_snapshot` VARCHAR(160) NOT NULL,
  `price_amount_jpy` INTEGER NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
  `duration_minutes` INTEGER NOT NULL,
  `service_snapshot_json` JSON NOT NULL,
  `proposed_by_user_id` INTEGER NOT NULL,
  `proposed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `accepted_by_user_id` INTEGER NULL,
  `accepted_at` DATETIME(3) NULL,
  `rejected_by_user_id` INTEGER NULL,
  `rejected_at` DATETIME(3) NULL,
  `resolution_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `order_add_ons_price_chk` CHECK (`price_amount_jpy` >= 0),
  CONSTRAINT `order_add_ons_currency_chk` CHECK (`currency` = 'JPY'),
  CONSTRAINT `order_add_ons_duration_chk` CHECK (`duration_minutes` > 0),
  CONSTRAINT `order_add_ons_resolution_chk` CHECK (
    (`status` = 'proposed' AND `accepted_by_user_id` IS NULL AND `accepted_at` IS NULL AND `rejected_by_user_id` IS NULL AND `rejected_at` IS NULL)
    OR (`status` = 'accepted' AND `accepted_by_user_id` IS NOT NULL AND `accepted_at` IS NOT NULL AND `rejected_by_user_id` IS NULL AND `rejected_at` IS NULL)
    OR (`status` = 'rejected' AND `rejected_by_user_id` IS NOT NULL AND `rejected_at` IS NOT NULL AND `accepted_by_user_id` IS NULL AND `accepted_at` IS NULL)
  ),
  UNIQUE INDEX `order_add_ons_id_order_session_key`(`id`, `booking_order_id`, `service_session_id`),
  INDEX `order_add_ons_session_order_idx`(`service_session_id`, `booking_order_id`),
  INDEX `order_add_ons_order_status_idx`(`booking_order_id`, `status`, `deleted_at`),
  INDEX `order_add_ons_session_status_idx`(`service_session_id`, `status`, `deleted_at`),
  INDEX `order_add_ons_service_idx`(`service_id`),
  INDEX `order_add_ons_proposed_by_idx`(`proposed_by_user_id`),
  INDEX `order_add_ons_accepted_by_idx`(`accepted_by_user_id`),
  INDEX `order_add_ons_rejected_by_idx`(`rejected_by_user_id`),
  INDEX `order_add_ons_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_checkouts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `base_amount_jpy` INTEGER NOT NULL,
  `add_on_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `discount_amount_jpy` INTEGER NOT NULL DEFAULT 0,
  `checkout_amount_jpy` INTEGER NOT NULL,
  `payable_ndp` INTEGER NOT NULL,
  `ndp_rate_rule_id` INTEGER NOT NULL,
  `rate_snapshot_json` JSON NOT NULL,
  `calculation_snapshot_json` JSON NOT NULL,
  `payment_method` ENUM('onsite', 'bank_transfer', 'cash', 'ndp', 'other') NULL,
  `payment_selected_at` DATETIME(3) NULL,
  `other_method_code` VARCHAR(40) NULL,
  `other_method_label` VARCHAR(80) NULL,
  `other_payment_reference` VARCHAR(120) NULL,
  `ledger_transaction_id` INTEGER NULL,
  `receipt_confirmed_by_id` INTEGER NULL,
  `receipt_confirmed_at` DATETIME(3) NULL,
  `receipt_confirmation_reason` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `order_checkouts_base_amount_chk` CHECK (`base_amount_jpy` >= 0),
  CONSTRAINT `order_checkouts_add_on_amount_chk` CHECK (`add_on_amount_jpy` >= 0),
  CONSTRAINT `order_checkouts_discount_amount_chk` CHECK (`discount_amount_jpy` >= 0),
  CONSTRAINT `order_checkouts_amount_chk` CHECK (`checkout_amount_jpy` >= 0 AND `payable_ndp` >= 0),
  CONSTRAINT `order_checkouts_total_chk` CHECK (`checkout_amount_jpy` = `base_amount_jpy` + `add_on_amount_jpy` - `discount_amount_jpy`),
  CONSTRAINT `order_checkouts_other_method_chk` CHECK (`payment_method` <> 'other' OR (`other_method_code` IS NOT NULL AND `other_method_label` IS NOT NULL)),
  CONSTRAINT `order_checkouts_ledger_method_chk` CHECK (`ledger_transaction_id` IS NULL OR `payment_method` = 'ndp'),
  CONSTRAINT `order_checkouts_receipt_evidence_chk` CHECK (
    (`receipt_confirmed_by_id` IS NULL AND `receipt_confirmed_at` IS NULL AND `receipt_confirmation_reason` IS NULL)
    OR (`receipt_confirmed_by_id` IS NOT NULL AND `receipt_confirmed_at` IS NOT NULL AND `receipt_confirmation_reason` IS NOT NULL AND `payment_method` IN ('cash', 'other'))
  ),
  UNIQUE INDEX `order_checkouts_booking_order_key`(`booking_order_id`),
  UNIQUE INDEX `order_checkouts_id_order_key`(`id`, `booking_order_id`),
  UNIQUE INDEX `order_checkouts_ledger_transaction_key`(`ledger_transaction_id`),
  INDEX `order_checkouts_rate_rule_idx`(`ndp_rate_rule_id`),
  INDEX `order_checkouts_receipt_actor_idx`(`receipt_confirmed_by_id`),
  INDEX `order_checkouts_payment_active_idx`(`payment_method`, `deleted_at`),
  INDEX `order_checkouts_created_active_idx`(`created_at`, `deleted_at`),
  INDEX `order_checkouts_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `order_service_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `booking_order_id` INTEGER NOT NULL,
  `service_session_id` INTEGER NOT NULL,
  `order_add_on_id` INTEGER NULL,
  `order_checkout_id` INTEGER NULL,
  `event_type` ENUM('service_started', 'add_on_proposed', 'add_on_accepted', 'add_on_rejected', 'service_ended', 'checkout_created', 'payment_method_selected', 'ndp_payment_applied', 'receipt_confirmed') NOT NULL,
  `actor_user_id` INTEGER NULL,
  `idempotency_key` VARCHAR(160) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `metadata` JSON NULL,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  CONSTRAINT `order_service_events_shape_chk` CHECK (
    (`event_type` IN ('service_started', 'service_ended') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NULL)
    OR (`event_type` IN ('add_on_proposed', 'add_on_accepted', 'add_on_rejected') AND `order_add_on_id` IS NOT NULL AND `order_checkout_id` IS NULL)
    OR (`event_type` IN ('checkout_created', 'payment_method_selected', 'ndp_payment_applied', 'receipt_confirmed') AND `order_add_on_id` IS NULL AND `order_checkout_id` IS NOT NULL)
  ),
  UNIQUE INDEX `order_service_events_idempotency_key`(`idempotency_key`),
  INDEX `order_service_events_order_time_idx`(`booking_order_id`, `occurred_at`, `deleted_at`),
  INDEX `order_service_events_session_time_idx`(`service_session_id`, `occurred_at`, `deleted_at`),
  INDEX `order_service_events_session_order_idx`(`service_session_id`, `booking_order_id`),
  INDEX `order_service_events_add_on_order_session_idx`(`order_add_on_id`, `booking_order_id`, `service_session_id`),
  INDEX `order_service_events_checkout_order_idx`(`order_checkout_id`, `booking_order_id`),
  INDEX `order_service_events_type_time_idx`(`event_type`, `occurred_at`, `deleted_at`),
  INDEX `order_service_events_actor_idx`(`actor_user_id`),
  INDEX `order_service_events_deleted_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ndp_exchange_rate_rules`
  ADD CONSTRAINT `ndp_exchange_rate_rules_created_by_fkey`
    FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `order_service_sessions`
  ADD CONSTRAINT `order_service_sessions_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_sessions_started_by_fkey`
    FOREIGN KEY (`started_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_sessions_ended_by_fkey`
    FOREIGN KEY (`ended_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `order_add_ons`
  ADD CONSTRAINT `order_add_ons_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_add_ons_session_fkey`
    FOREIGN KEY (`service_session_id`, `booking_order_id`) REFERENCES `order_service_sessions`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_add_ons_service_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_add_ons_proposed_by_fkey`
    FOREIGN KEY (`proposed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_add_ons_accepted_by_fkey`
    FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_add_ons_rejected_by_fkey`
    FOREIGN KEY (`rejected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `order_checkouts`
  ADD CONSTRAINT `order_checkouts_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_checkouts_rate_rule_fkey`
    FOREIGN KEY (`ndp_rate_rule_id`) REFERENCES `ndp_exchange_rate_rules`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_checkouts_ledger_fkey`
    FOREIGN KEY (`ledger_transaction_id`) REFERENCES `ledger_transactions`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_checkouts_receipt_actor_fkey`
    FOREIGN KEY (`receipt_confirmed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `order_service_events`
  ADD CONSTRAINT `order_service_events_order_fkey`
    FOREIGN KEY (`booking_order_id`) REFERENCES `booking_orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_events_session_fkey`
    FOREIGN KEY (`service_session_id`, `booking_order_id`) REFERENCES `order_service_sessions`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_events_add_on_order_fkey`
    FOREIGN KEY (`order_add_on_id`, `booking_order_id`, `service_session_id`) REFERENCES `order_add_ons`(`id`, `booking_order_id`, `service_session_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_events_checkout_order_fkey`
    FOREIGN KEY (`order_checkout_id`, `booking_order_id`) REFERENCES `order_checkouts`(`id`, `booking_order_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `order_service_events_actor_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Prisma applies this migration once; the guard prevents a duplicate bootstrap row
-- if a previously interrupted deployment already inserted the formal initial rate.
INSERT INTO `ndp_exchange_rate_rules` (
  `public_id`, `version`, `ndp_units`, `jpy_units`, `status`, `effective_from`,
  `effective_to`, `active_key`, `idempotency_key`, `reason`, `created_by_id`,
  `created_at`, `updated_at`, `deleted_at`
)
SELECT UUID(), 1, 1, 1, 'active', UTC_TIMESTAMP(3),
  NULL, 'ndp_exchange_rate', 'ndp-rate-bootstrap-1-to-1',
  'Initial formal 1 NDP = 1 JPY rate', NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM `ndp_exchange_rate_rules`
  WHERE `version` = 1 OR `active_key` = 'ndp_exchange_rate'
);
