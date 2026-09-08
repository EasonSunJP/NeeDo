-- Shop employee foundation. The backfill intentionally accepts only formal
-- database evidence; browser-local manual employee rows are not authoritative.

CREATE TABLE `shop_employees` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NOT NULL,
  `user_id` INTEGER NOT NULL,
  `status` ENUM('active', 'on_leave', 'suspended', 'ended') NOT NULL DEFAULT 'active',
  `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ends_at` DATETIME(3) NULL,
  `technician_shop_affiliation_id` INTEGER NULL,
  `active_key` VARCHAR(191) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_employees_tech_affiliation_key` (`technician_shop_affiliation_id`),
  UNIQUE INDEX `shop_employees_active_key_key` (`active_key`),
  INDEX `shop_employees_shop_status_deleted_idx` (`shop_id`, `status`, `deleted_at`),
  INDEX `shop_employees_user_status_deleted_idx` (`user_id`, `status`, `deleted_at`),
  INDEX `shop_employees_created_by_idx` (`created_by_id`),
  INDEX `shop_employees_updated_by_idx` (`updated_by_id`),
  INDEX `shop_employees_deleted_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_employee_roles` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_id` INTEGER NULL,
  `code` VARCHAR(64) NOT NULL,
  `name_zh_hans` VARCHAR(160) NOT NULL,
  `name_zh_hant` VARCHAR(160) NOT NULL,
  `name_ja` VARCHAR(160) NOT NULL,
  `name_en` VARCHAR(160) NOT NULL,
  `name_ko` VARCHAR(160) NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `is_technician_role` BOOLEAN NOT NULL DEFAULT false,
  `active_key` VARCHAR(191) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_employee_roles_active_key_key` (`active_key`),
  INDEX `shop_employee_roles_shop_deleted_idx` (`shop_id`, `deleted_at`),
  INDEX `shop_employee_roles_code_deleted_idx` (`code`, `deleted_at`),
  INDEX `shop_employee_roles_created_by_idx` (`created_by_id`),
  INDEX `shop_employee_roles_updated_by_idx` (`updated_by_id`),
  INDEX `shop_employee_roles_deleted_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `shop_employee_role_assignments` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `shop_employee_id` INTEGER NOT NULL,
  `shop_employee_role_id` INTEGER NOT NULL,
  `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ends_at` DATETIME(3) NULL,
  `active_key` VARCHAR(191) NULL,
  `created_by_id` INTEGER NULL,
  `updated_by_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `deleted_at` DATETIME(3) NULL,

  UNIQUE INDEX `shop_employee_role_assignments_active_key_key` (`active_key`),
  INDEX `shop_employee_role_assignments_employee_range_idx` (`shop_employee_id`, `starts_at`, `ends_at`, `deleted_at`),
  INDEX `shop_employee_role_assignments_role_range_idx` (`shop_employee_role_id`, `starts_at`, `ends_at`, `deleted_at`),
  INDEX `shop_employee_role_assignments_created_by_idx` (`created_by_id`),
  INDEX `shop_employee_role_assignments_updated_by_idx` (`updated_by_id`),
  INDEX `shop_employee_role_assignments_deleted_idx` (`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shop_employees` ADD CONSTRAINT `shop_employees_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employees` ADD CONSTRAINT `shop_employees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employees` ADD CONSTRAINT `shop_employees_technician_shop_affiliation_id_fkey` FOREIGN KEY (`technician_shop_affiliation_id`) REFERENCES `technician_shop_affiliations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employees` ADD CONSTRAINT `shop_employees_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_employees` ADD CONSTRAINT `shop_employees_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_employee_roles` ADD CONSTRAINT `shop_employee_roles_shop_id_fkey` FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employee_roles` ADD CONSTRAINT `shop_employee_roles_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_employee_roles` ADD CONSTRAINT `shop_employee_roles_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_employee_role_assignments` ADD CONSTRAINT `shop_employee_role_assignments_employee_id_fkey` FOREIGN KEY (`shop_employee_id`) REFERENCES `shop_employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employee_role_assignments` ADD CONSTRAINT `shop_employee_role_assignments_role_id_fkey` FOREIGN KEY (`shop_employee_role_id`) REFERENCES `shop_employee_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `shop_employee_role_assignments` ADD CONSTRAINT `shop_employee_role_assignments_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `shop_employee_role_assignments` ADD CONSTRAINT `shop_employee_role_assignments_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `shop_employee_roles` (
  `shop_id`, `code`, `name_zh_hans`, `name_zh_hant`, `name_ja`, `name_en`, `name_ko`,
  `is_system`, `is_technician_role`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
VALUES
  (NULL, 'OWNER', '店主', '店主', 'オーナー', 'Owner', '점주', true, false, 'system:OWNER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'ADMINISTRATOR', '管理员', '管理員', '管理者', 'Administrator', '관리자', true, false, 'system:ADMINISTRATOR', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'STAFF', '员工', '員工', 'スタッフ', 'Staff', '직원', true, false, 'system:STAFF', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'TECHNICIAN', '技师', '技師', '技術者', 'Technician', '기술자', true, true, 'system:TECHNICIAN', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'ACCOUNTANT', '会计', '會計', '会計', 'Accountant', '회계', true, false, 'system:ACCOUNTANT', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'DRIVER', '司机', '司機', 'ドライバー', 'Driver', '운전기사', true, false, 'system:DRIVER', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'GENERAL_AFFAIRS', '总务', '總務', '総務', 'General Affairs', '총무', true, false, 'system:GENERAL_AFFAIRS', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL),
  (NULL, 'CHEF', '厨师', '廚師', '料理人', 'Chef', '요리사', true, false, 'system:CHEF', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name_zh_hans` = VALUES(`name_zh_hans`),
  `name_zh_hant` = VALUES(`name_zh_hant`),
  `name_ja` = VALUES(`name_ja`),
  `name_en` = VALUES(`name_en`),
  `name_ko` = VALUES(`name_ko`),
  `is_system` = true,
  `is_technician_role` = VALUES(`is_technician_role`),
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- shop-owner-backfill
INSERT INTO `shop_employees` (
  `shop_id`, `user_id`, `status`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `shops`.`id`,
  `shops`.`owner_user_id`,
  'active',
  `shops`.`created_at`,
  CONCAT('shop:', `shops`.`id`, ':user:', `shops`.`owner_user_id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `shops`
WHERE `shops`.`owner_user_id` IS NOT NULL
  AND `shops`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- shop-identity-backfill
INSERT INTO `shop_employees` (
  `shop_id`, `user_id`, `status`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT DISTINCT
  `identities`.`scope_id`,
  `identities`.`user_id`,
  'active',
  `identities`.`created_at`,
  CONCAT('shop:', `identities`.`scope_id`, ':user:', `identities`.`user_id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `user_identities` AS `identities`
JOIN `shops` ON `shops`.`id` = `identities`.`scope_id` AND `shops`.`deleted_at` IS NULL
WHERE `identities`.`scope_type` = 'shop'
  AND `identities`.`type` IN ('merchant', 'merchant_owner', 'merchant_staff', 'business', 'b')
  AND `identities`.`is_active` = true
  AND `identities`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- merchant-account-backfill
INSERT INTO `shop_employees` (
  `shop_id`, `user_id`, `status`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT DISTINCT
  `memberships`.`shop_id`,
  `account_users`.`user_id`,
  'active',
  `memberships`.`starts_at`,
  CONCAT('shop:', `memberships`.`shop_id`, ':user:', `account_users`.`user_id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `merchant_shop_memberships` AS `memberships`
JOIN `merchant_accounts` AS `accounts`
  ON `accounts`.`id` = `memberships`.`merchant_account_id`
  AND `accounts`.`status` = 'active'
  AND `accounts`.`deleted_at` IS NULL
JOIN (
  SELECT `merchant_accounts`.`id` AS `merchant_account_id`, `merchant_accounts`.`owner_user_id` AS `user_id`
  FROM `merchant_accounts`
  WHERE `merchant_accounts`.`owner_user_id` IS NOT NULL
    AND `merchant_accounts`.`deleted_at` IS NULL
  UNION
  SELECT `identities`.`scope_id` AS `merchant_account_id`, `identities`.`user_id`
  FROM `user_identities` AS `identities`
  WHERE `identities`.`scope_type` IN ('merchant_account', 'merchant')
    AND `identities`.`type` IN ('merchant_organization', 'merchant_owner', 'owner', 'o')
    AND `identities`.`is_active` = true
    AND `identities`.`deleted_at` IS NULL
) AS `account_users` ON `account_users`.`merchant_account_id` = `accounts`.`id`
WHERE `memberships`.`starts_at` <= UTC_TIMESTAMP(3)
  AND (`memberships`.`ends_at` IS NULL OR `memberships`.`ends_at` > UTC_TIMESTAMP(3))
  AND `memberships`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- technician-affiliation-backfill
INSERT INTO `shop_employees` (
  `shop_id`, `user_id`, `status`, `starts_at`, `ends_at`, `technician_shop_affiliation_id`,
  `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `affiliations`.`shop_id`,
  `profiles`.`user_id`,
  `affiliations`.`work_status`,
  `affiliations`.`starts_at`,
  `affiliations`.`ends_at`,
  `affiliations`.`id`,
  CONCAT('shop:', `affiliations`.`shop_id`, ':user:', `profiles`.`user_id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `technician_shop_affiliations` AS `affiliations`
JOIN `technician_profiles` AS `profiles`
  ON `profiles`.`id` = `affiliations`.`technician_profile_id`
  AND `profiles`.`deleted_at` IS NULL
WHERE `affiliations`.`work_status` IN ('active', 'on_leave', 'suspended')
  AND (`affiliations`.`ends_at` IS NULL OR `affiliations`.`ends_at` > UTC_TIMESTAMP(3))
  AND `affiliations`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `technician_shop_affiliation_id` = VALUES(`technician_shop_affiliation_id`),
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- Assign OWNER from direct shop ownership.
INSERT INTO `shop_employee_role_assignments` (
  `shop_employee_id`, `shop_employee_role_id`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `employees`.`id`,
  `roles`.`id`,
  `employees`.`starts_at`,
  CONCAT('employee:', `employees`.`id`, ':role:', `roles`.`id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `shop_employees` AS `employees`
JOIN `shops` ON `shops`.`id` = `employees`.`shop_id` AND `shops`.`owner_user_id` = `employees`.`user_id`
JOIN `shop_employee_roles` AS `roles` ON `roles`.`active_key` = 'system:OWNER'
WHERE `employees`.`deleted_at` IS NULL
  AND `shops`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- Assign shop-scoped formal identity roles.
INSERT INTO `shop_employee_role_assignments` (
  `shop_employee_id`, `shop_employee_role_id`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT DISTINCT
  `employees`.`id`,
  `roles`.`id`,
  `identities`.`created_at`,
  CONCAT('employee:', `employees`.`id`, ':role:', `roles`.`id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `user_identities` AS `identities`
JOIN `shop_employees` AS `employees`
  ON `employees`.`shop_id` = `identities`.`scope_id`
  AND `employees`.`user_id` = `identities`.`user_id`
  AND `employees`.`deleted_at` IS NULL
JOIN `shop_employee_roles` AS `roles`
  ON `roles`.`active_key` = CONCAT(
    'system:',
    CASE
      WHEN `identities`.`type` = 'merchant_owner' THEN 'OWNER'
      WHEN `identities`.`type` = 'merchant_staff' THEN 'STAFF'
      ELSE 'ADMINISTRATOR'
    END
  )
WHERE `identities`.`scope_type` = 'shop'
  AND `identities`.`type` IN ('merchant', 'merchant_owner', 'merchant_staff', 'business', 'b')
  AND `identities`.`is_active` = true
  AND `identities`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- Assign merchant-account authorities to every current member shop.
INSERT INTO `shop_employee_role_assignments` (
  `shop_employee_id`, `shop_employee_role_id`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT DISTINCT
  `employees`.`id`,
  `roles`.`id`,
  `memberships`.`starts_at`,
  CONCAT('employee:', `employees`.`id`, ':role:', `roles`.`id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `merchant_shop_memberships` AS `memberships`
JOIN `merchant_accounts` AS `accounts`
  ON `accounts`.`id` = `memberships`.`merchant_account_id`
  AND `accounts`.`status` = 'active'
  AND `accounts`.`deleted_at` IS NULL
JOIN `shop_employees` AS `employees`
  ON `employees`.`shop_id` = `memberships`.`shop_id`
  AND `employees`.`user_id` = `accounts`.`owner_user_id`
  AND `employees`.`deleted_at` IS NULL
JOIN `shop_employee_roles` AS `roles` ON `roles`.`active_key` = 'system:OWNER'
WHERE `accounts`.`owner_user_id` IS NOT NULL
  AND `memberships`.`starts_at` <= UTC_TIMESTAMP(3)
  AND (`memberships`.`ends_at` IS NULL OR `memberships`.`ends_at` > UTC_TIMESTAMP(3))
  AND `memberships`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `shop_employee_role_assignments` (
  `shop_employee_id`, `shop_employee_role_id`, `starts_at`, `active_key`, `created_at`, `updated_at`, `deleted_at`
)
SELECT DISTINCT
  `employees`.`id`,
  `roles`.`id`,
  `memberships`.`starts_at`,
  CONCAT('employee:', `employees`.`id`, ':role:', `roles`.`id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `merchant_shop_memberships` AS `memberships`
JOIN `user_identities` AS `identities`
  ON `identities`.`scope_id` = `memberships`.`merchant_account_id`
  AND `identities`.`scope_type` IN ('merchant_account', 'merchant')
  AND `identities`.`type` IN ('merchant_organization', 'merchant_owner', 'owner', 'o')
  AND `identities`.`is_active` = true
  AND `identities`.`deleted_at` IS NULL
JOIN `shop_employees` AS `employees`
  ON `employees`.`shop_id` = `memberships`.`shop_id`
  AND `employees`.`user_id` = `identities`.`user_id`
  AND `employees`.`deleted_at` IS NULL
JOIN `shop_employee_roles` AS `roles`
  ON `roles`.`active_key` = CASE
    WHEN `identities`.`type` IN ('merchant_owner', 'owner', 'o') THEN 'system:OWNER'
    ELSE 'system:ADMINISTRATOR'
  END
WHERE `memberships`.`starts_at` <= UTC_TIMESTAMP(3)
  AND (`memberships`.`ends_at` IS NULL OR `memberships`.`ends_at` > UTC_TIMESTAMP(3))
  AND `memberships`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;

-- Assign the technician role only when the employee has a current formal
-- TechnicianShopAffiliation.
INSERT INTO `shop_employee_role_assignments` (
  `shop_employee_id`, `shop_employee_role_id`, `starts_at`, `ends_at`, `active_key`,
  `created_at`, `updated_at`, `deleted_at`
)
SELECT
  `employees`.`id`,
  `roles`.`id`,
  `affiliations`.`starts_at`,
  `affiliations`.`ends_at`,
  CONCAT('employee:', `employees`.`id`, ':role:', `roles`.`id`),
  UTC_TIMESTAMP(3),
  UTC_TIMESTAMP(3),
  NULL
FROM `shop_employees` AS `employees`
JOIN `technician_shop_affiliations` AS `affiliations`
  ON `affiliations`.`id` = `employees`.`technician_shop_affiliation_id`
  AND `affiliations`.`work_status` IN ('active', 'on_leave', 'suspended')
  AND (`affiliations`.`ends_at` IS NULL OR `affiliations`.`ends_at` > UTC_TIMESTAMP(3))
  AND `affiliations`.`deleted_at` IS NULL
JOIN `shop_employee_roles` AS `roles` ON `roles`.`active_key` = 'system:TECHNICIAN'
WHERE `employees`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `starts_at` = VALUES(`starts_at`),
  `ends_at` = VALUES(`ends_at`),
  `updated_at` = UTC_TIMESTAMP(3),
  `deleted_at` = NULL;
