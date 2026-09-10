ALTER TABLE `platform_membership_benefits`
  MODIFY COLUMN `code` ENUM(
    'ndp_experience',
    'member_sign_in',
    'priority_request',
    'support_service',
    'exclusive_discount',
    'member_day',
    'birthday_gift',
    'traceless_recall'
  ) NOT NULL,
  DROP CHECK `platform_membership_benefits_sort_order_chk`,
  ADD CONSTRAINT `platform_membership_benefits_sort_order_chk`
    CHECK (`sort_order` BETWEEN 0 AND 7);

INSERT INTO `platform_membership_benefits` (
  `public_id`,
  `code`,
  `sort_order`,
  `is_globally_enabled`,
  `name_translations`,
  `description_translations`,
  `lock_version`,
  `created_at`,
  `updated_at`,
  `deleted_at`
) VALUES (
  UUID(),
  'traceless_recall',
  7,
  TRUE,
  JSON_OBJECT(
    'zh', '聊天无痕撤回',
    'zh-Hant', '聊天無痕撤回',
    'ja', '痕跡を残さない送信取消',
    'en', 'Traceless message recall',
    'ko', '흔적 없는 메시지 회수'
  ),
  JSON_OBJECT(
    'zh', '在有效撤回时限内撤回自己发送的消息时，双方聊天窗口均不保留“消息已撤回”提示。发送者权限、撤回时限和安全审计仍然适用。',
    'zh-Hant', '在有效撤回時限內撤回自己傳送的訊息時，雙方聊天視窗均不保留「訊息已撤回」提示。傳送者權限、撤回時限和安全稽核仍然適用。',
    'ja', '有効な取消期限内に自分が送信したメッセージを取り消すと、双方のチャット画面に「メッセージを取り消しました」という表示が残りません。送信者の権限、取消期限、セキュリティ監査は引き続き適用されます。',
    'en', 'When you recall your own message within the valid recall window, no “message recalled” notice remains in either participant''s chat. Sender authorization, the recall deadline, and security auditing still apply.',
    'ko', '유효한 회수 시간 안에 자신이 보낸 메시지를 회수하면 양쪽 채팅 화면에 “메시지가 회수되었습니다” 안내가 남지 않습니다. 발신자 권한, 회수 시간 제한 및 보안 감사는 계속 적용됩니다.'
  ),
  1,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
) ON DUPLICATE KEY UPDATE
  `sort_order` = 7,
  `name_translations` = VALUES(`name_translations`),
  `description_translations` = VALUES(`description_translations`),
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;

INSERT INTO `platform_membership_tier_benefits` (
  `public_id`,
  `tier_version_id`,
  `benefit_id`,
  `is_enabled`,
  `configuration_json`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  UUID(),
  `version`.`id`,
  `benefit`.`id`,
  CASE
    WHEN `tier`.`code` = 'free' THEN FALSE
    ELSE TRUE
  END,
  JSON_OBJECT(),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM `platform_membership_tier_versions` AS `version`
INNER JOIN `platform_membership_tiers` AS `tier`
  ON `tier`.`id` = `version`.`tier_id`
  AND `tier`.`deleted_at` IS NULL
INNER JOIN `platform_membership_benefits` AS `benefit`
  ON `benefit`.`code` = 'traceless_recall'
  AND `benefit`.`deleted_at` IS NULL
WHERE `version`.`deleted_at` IS NULL
ON DUPLICATE KEY UPDATE
  `updated_at` = CURRENT_TIMESTAMP(3),
  `deleted_at` = NULL;
