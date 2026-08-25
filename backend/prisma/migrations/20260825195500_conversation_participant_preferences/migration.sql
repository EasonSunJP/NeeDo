-- Persist per-participant conversation list preferences without changing shared membership or messages.
ALTER TABLE `conversation_participants`
  ADD COLUMN `is_pinned` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `is_muted` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `hidden_at` DATETIME(3) NULL;

CREATE INDEX `conversation_participants_user_id_hidden_at_idx`
  ON `conversation_participants`(`user_id`, `hidden_at`);
