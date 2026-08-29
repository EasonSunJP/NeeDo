ALTER TABLE `messages`
  ADD COLUMN `reaction_version` INTEGER NOT NULL DEFAULT 0 AFTER `lifecycle_version`;
