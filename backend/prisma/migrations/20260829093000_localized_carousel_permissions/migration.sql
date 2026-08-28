-- Keep localized content-publication routes deployable before the next complete seed.
INSERT INTO `permissions` (
  `name`,
  `code`,
  `type`,
  `module`,
  `description`,
  `is_system`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
VALUES
  ('用户首页轮播读取', 'page:backoffice-user-home-carousel', 'page', 'content-publication', '查看用户首页轮播版本和预览', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户首页轮播编辑', 'button:backoffice-user-home-carousel-edit', 'button', 'content-publication', '创建和编辑用户首页轮播草稿', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('用户首页轮播发布', 'button:backoffice-user-home-carousel-publish', 'button', 'content-publication', '发布、定时、停用和回滚用户首页轮播', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告读取', 'page:backoffice-affiliate-announcement', 'page', 'content-publication', '查看联盟营销正式公告版本和预览', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告编辑', 'button:backoffice-affiliate-announcement-edit', 'button', 'content-publication', '创建和编辑联盟营销公告草稿', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告发布', 'button:backoffice-affiliate-announcement-publish', 'button', 'content-publication', '发布、定时、停用和回滚联盟营销公告', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告轮播读取', 'page:backoffice-affiliate-notice-carousel', 'page', 'content-publication', '查看联盟营销公告轮播版本和预览', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告轮播编辑', 'button:backoffice-affiliate-notice-carousel-edit', 'button', 'content-publication', '创建和编辑联盟营销公告轮播草稿', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('联盟公告轮播发布', 'button:backoffice-affiliate-notice-carousel-publish', 'button', 'content-publication', '发布、定时、停用和回滚联盟营销公告轮播', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL),
  ('内容媒体上传', 'button:backoffice-content-media-upload', 'button', 'content-publication', '上传正式内容发布媒体资源', TRUE, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), NULL)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `type` = VALUES(`type`),
  `module` = VALUES(`module`),
  `description` = VALUES(`description`),
  `is_system` = VALUES(`is_system`),
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Administrators and operators receive the complete content-operation surface.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'page:backoffice-user-home-carousel',
    'button:backoffice-user-home-carousel-edit',
    'button:backoffice-user-home-carousel-publish',
    'page:backoffice-affiliate-announcement',
    'button:backoffice-affiliate-announcement-edit',
    'button:backoffice-affiliate-announcement-publish',
    'page:backoffice-affiliate-notice-carousel',
    'button:backoffice-affiliate-notice-carousel-edit',
    'button:backoffice-affiliate-notice-carousel-publish',
    'button:backoffice-content-media-upload'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` IN ('admin', 'operator')
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;

-- Viewers can inspect and preview versions but cannot edit, publish, or upload.
INSERT INTO `role_permissions` (
  `role_id`,
  `permission_id`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  `roles`.`id`,
  `permissions`.`id`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `roles`
JOIN `permissions`
  ON `permissions`.`code` IN (
    'page:backoffice-user-home-carousel',
    'page:backoffice-affiliate-announcement',
    'page:backoffice-affiliate-notice-carousel'
  )
  AND `permissions`.`deleted_at` IS NULL
WHERE `roles`.`code` = 'viewer'
  AND `roles`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = VALUES(`updated_at`),
  `deleted_at` = NULL;
