import type { Language } from "../../i18n/translations";

type FriendDeletionCopy = {
  title: string;
  description: string;
};

const friendDeletionCopy: Record<Language, FriendDeletionCopy> = {
  zh: {
    title: "确认删除好友？",
    description: "删除后，你与对方的好友关系将解除。你的聊天记录以及双方的动态关注关系将被永久删除，且无法恢复。确定删除该好友吗？",
  },
  "zh-Hant": {
    title: "確認刪除好友？",
    description: "刪除後，你與對方的好友關係將解除。你的聊天記錄以及雙方的動態追蹤關係將被永久刪除，且無法復原。確定要刪除這位好友嗎？",
  },
  ja: {
    title: "友だちを削除しますか？",
    description: "削除すると、相手との友だち関係が解除されます。あなたのチャット履歴と双方の投稿フォロー関係は完全に削除され、元に戻せません。この友だちを削除しますか？",
  },
  en: {
    title: "Delete this friend?",
    description: "Deleting this friend will end your friend relationship. Your chat history and both users’ activity follows will be permanently deleted and cannot be restored. Delete this friend?",
  },
  ko: {
    title: "친구를 삭제할까요?",
    description: "삭제하면 상대방과의 친구 관계가 해제됩니다. 내 채팅 기록과 양쪽의 활동 팔로우 관계가 영구적으로 삭제되며 복구할 수 없습니다. 이 친구를 삭제할까요?",
  },
};

export function getFriendDeletionCopy(language: Language) {
  return friendDeletionCopy[language];
}
