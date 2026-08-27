-- CreateTable
CREATE TABLE `im_deletion_sync` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `message_id` INTEGER NOT NULL,
    `action` ENUM('STANDARD_RECALL', 'TRACELESS_RECALL', 'PRIVACY_EXPIRED', 'MEDIA_EXPIRED', 'SERVER_RETENTION_EXPIRED') NOT NULL,
    `media_kind` VARCHAR(20) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `im_deletion_sync_message_id_action_key`(`message_id`, `action`),
    INDEX `im_deletion_sync_conversation_id_id_idx`(`conversation_id`, `id`),
    INDEX `im_deletion_sync_occurred_at_idx`(`occurred_at`),
    INDEX `im_deletion_sync_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `im_deletion_sync`
    ADD CONSTRAINT `im_deletion_sync_conversation_id_fkey`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
