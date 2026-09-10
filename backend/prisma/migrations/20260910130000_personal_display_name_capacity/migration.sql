ALTER TABLE `users`
  MODIFY `username` VARCHAR(120) NOT NULL;

ALTER TABLE `user_identities`
  MODIFY `display_name` VARCHAR(120) NULL;
