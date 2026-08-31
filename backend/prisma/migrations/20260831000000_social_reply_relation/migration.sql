ALTER TABLE `social_posts`
  ADD COLUMN `reply_to_post_id` INTEGER NULL;

UPDATE `social_posts` AS `reply`
INNER JOIN `social_posts` AS `parent`
  ON `parent`.`id` = CAST(JSON_UNQUOTE(JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')) AS UNSIGNED)
SET `reply`.`reply_to_post_id` = `parent`.`id`
WHERE JSON_EXTRACT(`reply`.`media`, '$.replyToPostId') IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(`reply`.`media`, '$.replyToPostId')) REGEXP '^[1-9][0-9]*$';

CREATE INDEX `social_posts_reply_parent_active_idx`
  ON `social_posts`(`reply_to_post_id`, `deleted_at`, `created_at`);

ALTER TABLE `social_posts`
  ADD CONSTRAINT `social_posts_reply_to_post_id_fkey`
  FOREIGN KEY (`reply_to_post_id`) REFERENCES `social_posts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
