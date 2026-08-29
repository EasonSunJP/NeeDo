-- CreateTable
CREATE TABLE `affiliate_task_translations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `source_locale` ENUM('zh-CN', 'zh-TW', 'en', 'ja', 'ko') NOT NULL,
    `is_initial_copy` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `affiliate_task_translations_locale_deleted_at_idx`(`locale`, `deleted_at`),
    INDEX `affiliate_task_translations_deleted_at_idx`(`deleted_at`),
    UNIQUE INDEX `affiliate_task_translations_task_id_locale_key`(`task_id`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill every historical task with five independent rows. Existing task
-- columns remain the compatibility source snapshot and are not rewritten.
INSERT INTO `affiliate_task_translations` (
    `task_id`,
    `locale`,
    `name`,
    `description`,
    `source_locale`,
    `is_initial_copy`,
    `created_at`,
    `updated_at`,
    `deleted_at`
)
SELECT
    task.`id`,
    locale_source.`locale`,
    task.`name`,
    task.`description`,
    'zh-CN',
    locale_source.`locale` <> 'zh-CN',
    task.`created_at`,
    task.`updated_at`,
    task.`deleted_at`
FROM `affiliate_tasks` AS task
CROSS JOIN (
    SELECT 'zh-CN' AS `locale`
    UNION ALL SELECT 'zh-TW'
    UNION ALL SELECT 'en'
    UNION ALL SELECT 'ja'
    UNION ALL SELECT 'ko'
) AS locale_source;

SET @affiliate_task_translation_backfill_invalid := (
    SELECT COUNT(*)
    FROM (
        SELECT task.`id`
        FROM `affiliate_tasks` AS task
        LEFT JOIN `affiliate_task_translations` AS translation
          ON translation.`task_id` = task.`id`
        GROUP BY task.`id`
        HAVING COUNT(translation.`id`) <> 5
    ) AS incomplete_tasks
);
SET @affiliate_task_translation_guard_sql := IF(
    @affiliate_task_translation_backfill_invalid = 0,
    'SELECT 1',
    'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Affiliate task translation backfill is incomplete'''
);
PREPARE affiliate_task_translation_guard FROM @affiliate_task_translation_guard_sql;
EXECUTE affiliate_task_translation_guard;
DEALLOCATE PREPARE affiliate_task_translation_guard;

-- AddForeignKey
ALTER TABLE `affiliate_task_translations`
ADD CONSTRAINT `affiliate_task_translations_task_id_fkey`
FOREIGN KEY (`task_id`) REFERENCES `affiliate_tasks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
