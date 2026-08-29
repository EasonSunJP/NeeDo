-- Exchange demand ownership follows the personal-data identity rule:
-- customer and Affiliate share the canonical customer identity, while every
-- other identity keeps its own records.
ALTER TABLE `exchange_posts`
  ADD COLUMN `owner_identity_id` INTEGER NULL;

UPDATE `exchange_posts` AS `row`
SET `row`.`owner_identity_id` = (
  SELECT `candidate`.`id` FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`author_user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
);

-- Fail closed if a historical author has no active identity instead of
-- silently exposing account-scoped data to an unrelated identity.
ALTER TABLE `exchange_posts`
  MODIFY `owner_identity_id` INTEGER NOT NULL;

DROP INDEX `exchange_likes_post_id_actor_user_id_key` ON `exchange_likes`;
DROP INDEX `exchange_shares_post_id_actor_user_id_key` ON `exchange_shares`;

CREATE UNIQUE INDEX `exchange_likes_post_id_actor_identity_id_key`
  ON `exchange_likes`(`post_id`, `actor_identity_id`);
CREATE UNIQUE INDEX `exchange_shares_post_id_actor_identity_id_key`
  ON `exchange_shares`(`post_id`, `actor_identity_id`);
CREATE INDEX `exchange_posts_owner_identity_id_created_at_idx`
  ON `exchange_posts`(`owner_identity_id`, `created_at`);

ALTER TABLE `exchange_posts`
  ADD CONSTRAINT `exchange_posts_owner_identity_id_fkey`
  FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
