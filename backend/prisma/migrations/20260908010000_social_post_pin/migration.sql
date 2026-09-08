ALTER TABLE `user_identities`
  ADD COLUMN `pinned_social_post_id` INTEGER NULL;

CREATE UNIQUE INDEX `user_identities_pinned_social_post_id_key`
  ON `user_identities`(`pinned_social_post_id`);

ALTER TABLE `user_identities`
  ADD CONSTRAINT `user_identities_pinned_social_post_id_fkey`
  FOREIGN KEY (`pinned_social_post_id`) REFERENCES `social_posts`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
