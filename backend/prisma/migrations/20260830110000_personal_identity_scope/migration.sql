-- Add identity ownership columns without deleting or rewriting historical records.
ALTER TABLE `conversations`
  ADD COLUMN `created_by_identity_id` INTEGER NULL;

ALTER TABLE `conversation_participants`
  ADD COLUMN `identity_id` INTEGER NULL;

ALTER TABLE `messages`
  ADD COLUMN `sender_identity_id` INTEGER NULL;

ALTER TABLE `message_user_deletions`
  ADD COLUMN `identity_id` INTEGER NULL;

ALTER TABLE `message_reactions`
  ADD COLUMN `identity_id` INTEGER NULL;

ALTER TABLE `contacts`
  ADD COLUMN `owner_identity_id` INTEGER NULL,
  ADD COLUMN `contact_identity_id` INTEGER NULL;

ALTER TABLE `friend_requests`
  ADD COLUMN `requester_identity_id` INTEGER NULL,
  ADD COLUMN `target_identity_id` INTEGER NULL;

-- Historical account-scoped records belong to the account's active customer identity.
-- Accounts without a customer identity fall back to their active default/oldest identity.
UPDATE `conversations` AS `row`
SET `row`.`created_by_identity_id` = (
  SELECT `candidate`.`id`
  FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`created_by_user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY
    CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
)
WHERE `row`.`created_by_user_id` IS NOT NULL;

UPDATE `conversation_participants` AS `row`
SET `row`.`identity_id` = (
  SELECT `candidate`.`id`
  FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY
    CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
);

UPDATE `messages` AS `row`
SET `row`.`sender_identity_id` = (
  SELECT `candidate`.`id`
  FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`sender_user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY
    CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
)
WHERE `row`.`sender_user_id` IS NOT NULL;

UPDATE `message_user_deletions` AS `row`
SET `row`.`identity_id` = (
  SELECT `candidate`.`id`
  FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY
    CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
);

UPDATE `message_reactions` AS `row`
SET `row`.`identity_id` = (
  SELECT `candidate`.`id`
  FROM `user_identities` AS `candidate`
  WHERE `candidate`.`user_id` = `row`.`user_id`
    AND `candidate`.`is_active` = true
    AND `candidate`.`deleted_at` IS NULL
  ORDER BY
    CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
    `candidate`.`is_default` DESC,
    `candidate`.`id` ASC
  LIMIT 1
);

UPDATE `contacts` AS `row`
SET
  `row`.`owner_identity_id` = (
    SELECT `candidate`.`id`
    FROM `user_identities` AS `candidate`
    WHERE `candidate`.`user_id` = `row`.`owner_user_id`
      AND `candidate`.`is_active` = true
      AND `candidate`.`deleted_at` IS NULL
    ORDER BY
      CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
      `candidate`.`is_default` DESC,
      `candidate`.`id` ASC
    LIMIT 1
  ),
  `row`.`contact_identity_id` = (
    SELECT `candidate`.`id`
    FROM `user_identities` AS `candidate`
    WHERE `candidate`.`user_id` = `row`.`contact_user_id`
      AND `candidate`.`is_active` = true
      AND `candidate`.`deleted_at` IS NULL
    ORDER BY
      CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
      `candidate`.`is_default` DESC,
      `candidate`.`id` ASC
    LIMIT 1
  );

UPDATE `friend_requests` AS `row`
SET
  `row`.`requester_identity_id` = (
    SELECT `candidate`.`id`
    FROM `user_identities` AS `candidate`
    WHERE `candidate`.`user_id` = `row`.`requester_user_id`
      AND `candidate`.`is_active` = true
      AND `candidate`.`deleted_at` IS NULL
    ORDER BY
      CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
      `candidate`.`is_default` DESC,
      `candidate`.`id` ASC
    LIMIT 1
  ),
  `row`.`target_identity_id` = (
    SELECT `candidate`.`id`
    FROM `user_identities` AS `candidate`
    WHERE `candidate`.`user_id` = `row`.`target_user_id`
      AND `candidate`.`is_active` = true
      AND `candidate`.`deleted_at` IS NULL
    ORDER BY
      CASE WHEN `candidate`.`type` IN ('customer', 'user', 'u') THEN 0 ELSE 1 END,
      `candidate`.`is_default` DESC,
      `candidate`.`id` ASC
    LIMIT 1
  );

-- NOT NULL conversion is an intentional fail-closed guard for unresolved historical actors.
ALTER TABLE `conversation_participants`
  MODIFY `identity_id` INTEGER NOT NULL;
ALTER TABLE `message_user_deletions`
  MODIFY `identity_id` INTEGER NOT NULL;
ALTER TABLE `message_reactions`
  MODIFY `identity_id` INTEGER NOT NULL;
ALTER TABLE `contacts`
  MODIFY `owner_identity_id` INTEGER NOT NULL,
  MODIFY `contact_identity_id` INTEGER NOT NULL;
ALTER TABLE `friend_requests`
  MODIFY `requester_identity_id` INTEGER NOT NULL,
  MODIFY `target_identity_id` INTEGER NOT NULL;

DROP INDEX `conversation_participants_conversation_id_user_id_key` ON `conversation_participants`;
DROP INDEX `message_user_deletions_user_id_message_id_key` ON `message_user_deletions`;
DROP INDEX `message_reactions_message_id_user_id_emoji_key` ON `message_reactions`;
DROP INDEX `contacts_owner_user_id_contact_user_id_key` ON `contacts`;

CREATE UNIQUE INDEX `conversation_participants_conversation_id_identity_id_key`
  ON `conversation_participants`(`conversation_id`, `identity_id`);
CREATE UNIQUE INDEX `message_user_deletions_identity_id_message_id_key`
  ON `message_user_deletions`(`identity_id`, `message_id`);
CREATE UNIQUE INDEX `message_reactions_message_id_identity_id_emoji_key`
  ON `message_reactions`(`message_id`, `identity_id`, `emoji`);
CREATE UNIQUE INDEX `contacts_owner_identity_id_contact_identity_id_key`
  ON `contacts`(`owner_identity_id`, `contact_identity_id`);

CREATE INDEX `conversations_created_by_identity_id_idx` ON `conversations`(`created_by_identity_id`);
CREATE INDEX `conversation_participants_identity_id_idx` ON `conversation_participants`(`identity_id`);
CREATE INDEX `messages_sender_identity_id_idx` ON `messages`(`sender_identity_id`);
CREATE INDEX `message_user_deletion_identity_idx` ON `message_user_deletions`(`identity_id`, `deleted_at`);
CREATE INDEX `message_reactions_identity_id_idx` ON `message_reactions`(`identity_id`);
CREATE INDEX `contacts_owner_identity_id_idx` ON `contacts`(`owner_identity_id`);
CREATE INDEX `contacts_contact_identity_id_idx` ON `contacts`(`contact_identity_id`);
CREATE INDEX `friend_requests_requester_identity_id_idx` ON `friend_requests`(`requester_identity_id`);
CREATE INDEX `friend_requests_target_identity_id_idx` ON `friend_requests`(`target_identity_id`);

ALTER TABLE `conversations`
  ADD CONSTRAINT `conversations_created_by_identity_id_fkey`
  FOREIGN KEY (`created_by_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `conversation_participants`
  ADD CONSTRAINT `conversation_participants_identity_id_fkey`
  FOREIGN KEY (`identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `messages`
  ADD CONSTRAINT `messages_sender_identity_id_fkey`
  FOREIGN KEY (`sender_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `message_user_deletions`
  ADD CONSTRAINT `message_user_deletions_identity_id_fkey`
  FOREIGN KEY (`identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `message_reactions`
  ADD CONSTRAINT `message_reactions_identity_id_fkey`
  FOREIGN KEY (`identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `contacts`
  ADD CONSTRAINT `contacts_owner_identity_id_fkey`
  FOREIGN KEY (`owner_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `contacts_contact_identity_id_fkey`
  FOREIGN KEY (`contact_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `friend_requests`
  ADD CONSTRAINT `friend_requests_requester_identity_id_fkey`
  FOREIGN KEY (`requester_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `friend_requests_target_identity_id_fkey`
  FOREIGN KEY (`target_identity_id`) REFERENCES `user_identities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
