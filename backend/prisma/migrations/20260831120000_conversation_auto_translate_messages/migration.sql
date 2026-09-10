ALTER TABLE `conversation_participants`
  ADD COLUMN `auto_translate_messages` BOOLEAN NOT NULL DEFAULT FALSE;
