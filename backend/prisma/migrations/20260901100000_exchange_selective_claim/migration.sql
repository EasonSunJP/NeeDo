-- Formal selective-mode Exchange claim foundation. This migration reuses the
-- existing identity, affiliation, service, schedule and booking authorities.

CREATE TABLE `exchange_claims` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `exchange_post_id` INTEGER NOT NULL,
  `claimant_user_id` INTEGER NOT NULL,
  `claimant_identity_id` INTEGER NOT NULL,
  `shop_id` INTEGER NOT NULL,
  `technician_profile_id` INTEGER NOT NULL,
  `service_id` INTEGER NULL,
  `technician_service_id` INTEGER NULL,
  `schedule_slot_id` INTEGER NOT NULL,
  `quote_amount_jpy` INTEGER NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'JPY',
  `message` VARCHAR(1000) NULL,
  `status` ENUM('active', 'withdrawn', 'request_withdrawn', 'request_expired') NOT NULL DEFAULT 'active',
  `active_key` VARCHAR(191) NULL,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `payload_fingerprint` CHAR(64) NOT NULL,
  `withdrawn_at` DATETIME(3) NULL,
  `terminal_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `exchange_claims_active_key_key` (`active_key`),
  UNIQUE INDEX `exchange_claims_idempotency_key_key` (`idempotency_key`),
  INDEX `exchange_claims_post_status_created_idx` (`exchange_post_id`, `status`, `created_at`),
  INDEX `exchange_claims_identity_created_idx` (`claimant_identity_id`, `created_at`),
  INDEX `exchange_claims_technician_status_deleted_idx` (`technician_profile_id`, `status`, `deleted_at`),
  INDEX `exchange_claims_technician_created_idx` (`technician_profile_id`, `created_at`),
  INDEX `exchange_claims_shop_created_idx` (`shop_id`, `created_at`),
  INDEX `exchange_claims_schedule_slot_idx` (`schedule_slot_id`),
  INDEX `exchange_claims_service_id_idx` (`service_id`),
  INDEX `exchange_claims_technician_service_id_idx` (`technician_service_id`),
  INDEX `exchange_claims_claimant_user_id_idx` (`claimant_user_id`),
  INDEX `exchange_claims_deleted_idx` (`deleted_at`),
  CONSTRAINT `exchange_claims_exactly_one_service_ref`
    CHECK ((`service_id` IS NULL) <> (`technician_service_id` IS NULL)),
  CONSTRAINT `exchange_claims_active_key_matches_status`
    CHECK (
      (`status` = 'active' AND `active_key` IS NOT NULL)
      OR (`status` <> 'active' AND `active_key` IS NULL)
    ),
  CONSTRAINT `exchange_claims_quote_amount_check`
    CHECK (`quote_amount_jpy` > 0),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `exchange_claims`
  ADD CONSTRAINT `exchange_claims_exchange_post_id_fkey`
    FOREIGN KEY (`exchange_post_id`) REFERENCES `exchange_posts`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_claimant_user_id_fkey`
    FOREIGN KEY (`claimant_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_claimant_identity_id_fkey`
    FOREIGN KEY (`claimant_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_shop_id_fkey`
    FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_technician_profile_id_fkey`
    FOREIGN KEY (`technician_profile_id`) REFERENCES `technician_profiles`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_service_id_fkey`
    FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_technician_service_id_fkey`
    FOREIGN KEY (`technician_service_id`) REFERENCES `technician_services`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `exchange_claims_schedule_slot_id_fkey`
    FOREIGN KEY (`schedule_slot_id`) REFERENCES `schedule_slots`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `permissions` (
  `name`, `code`, `type`, `module`, `description`, `is_system`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  ('读取可抢单选项', 'exchange:claim-options:list', 'api', 'exchange', '分页读取当前服务者可用的正式抢单组合', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('提交抢单', 'exchange:claims:create', 'api', 'exchange', '以当前商户或技师身份提交正式选配抢单', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('读取本人抢单', 'exchange:claims:read-own', 'api', 'exchange', '读取当前身份在正式需求下提交的抢单', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('读取收到的抢单', 'exchange:claims:list-owned-request', 'api', 'exchange', '分页读取当前身份发布需求收到的正式抢单', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('撤回本人抢单', 'exchange:claims:withdraw-own', 'api', 'exchange', '撤回当前身份尚未匹配成立的正式抢单', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = TRUE,
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'exchange:claim-options:list',
    'exchange:claims:create',
    'exchange:claims:read-own',
    'exchange:claims:withdraw-own'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'merchant_owner', 'merchant_staff', 'technician')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `role_permissions` (`role_id`, `permission_id`, `created_at`, `updated_at`, `deleted_at`)
SELECT `roles`.`id`, `permissions`.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` = 'exchange:claims:list-owned-request'
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'customer', 'merchant_owner')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
