CREATE TABLE `user_experience_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `public_id` CHAR(36) NOT NULL,
    `user_id` INTEGER NOT NULL,
    `current_level` INTEGER NOT NULL DEFAULT 1,
    `total_exp_units` BIGINT NOT NULL DEFAULT 0,
    `lock_version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    CONSTRAINT `user_experience_level_range_chk`
      CHECK (`current_level` >= 1 AND `current_level` <= 100),
    UNIQUE INDEX `user_experience_accounts_public_id_key`(`public_id`),
    UNIQUE INDEX `user_experience_accounts_user_id_key`(`user_id`),
    INDEX `user_experience_level_deleted_idx`(`current_level`, `deleted_at`),
    INDEX `user_experience_accounts_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `user_experience_accounts` (
    `public_id`,
    `user_id`,
    `current_level`,
    `total_exp_units`,
    `lock_version`,
    `created_at`,
    `updated_at`,
    `deleted_at`
)
SELECT
    UUID(),
    `customer_profiles`.`user_id`,
    1,
    0,
    1,
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3),
    NULL
FROM `customer_profiles`
INNER JOIN `users`
    ON `users`.`id` = `customer_profiles`.`user_id`
    AND `users`.`is_active` = TRUE
    AND `users`.`deleted_at` IS NULL
WHERE `customer_profiles`.`deleted_at` IS NULL;

ALTER TABLE `user_experience_accounts`
    ADD CONSTRAINT `user_experience_accounts_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `im_contact_card_send_commands` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `actor_user_id` INTEGER NOT NULL,
    `actor_identity_id` INTEGER NOT NULL,
    `target_user_id` INTEGER NOT NULL,
    `message_id` INTEGER NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `im_contact_card_send_commands_message_id_key`(`message_id`),
    UNIQUE INDEX `im_contact_card_send_actor_idempotency_key`(`actor_identity_id`, `idempotency_key`),
    INDEX `im_contact_card_command_conversation_actor_idx`(`conversation_id`, `actor_identity_id`, `deleted_at`),
    INDEX `im_contact_card_command_actor_user_idx`(`actor_user_id`, `deleted_at`),
    INDEX `im_contact_card_command_target_user_idx`(`target_user_id`, `deleted_at`),
    INDEX `im_contact_card_send_commands_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `im_contact_card_send_commands`
    ADD CONSTRAINT `im_contact_card_command_conversation_fk`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `im_contact_card_command_actor_user_fk`
    FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `im_contact_card_command_actor_identity_fk`
    FOREIGN KEY (`actor_identity_id`) REFERENCES `user_identities`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `im_contact_card_command_target_user_fk`
    FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `im_contact_card_command_message_fk`
    FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
