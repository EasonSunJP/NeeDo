CREATE INDEX `social_posts_author_user_id_deleted_at_created_at_idx`
  ON `social_posts`(`author_user_id`, `deleted_at`, `created_at`);
