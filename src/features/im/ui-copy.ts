import { type Language, translateText } from "../../i18n/translations";

type ImUiTranslation = Partial<Record<Exclude<Language, "zh">, string>>;

const imUiTranslations: Record<string, ImUiTranslation> = {
  "翻译": { "zh-Hant": "翻譯", ja: "翻訳", en: "Translate", ko: "번역" },
  "隐藏译文": { "zh-Hant": "隱藏譯文", ja: "翻訳を非表示", en: "Hide translation", ko: "번역 숨기기" },
  "多选": { "zh-Hant": "多選", ja: "複数選択", en: "Select multiple", ko: "여러 개 선택" },
  "已选择 {count} 条信息": { "zh-Hant": "已選擇 {count} 則訊息", ja: "{count}件のメッセージを選択済み", en: "{count} messages selected", ko: "메시지 {count}개 선택됨" },
  "选择到这里": { "zh-Hant": "選擇到這裡", ja: "ここまで", en: "Select to here", ko: "여기까지 선택" },
  "转发": { "zh-Hant": "轉發", ja: "シェア", en: "Forward", ko: "전달" },
  "复制": { "zh-Hant": "複製", ja: "コピー", en: "Copy", ko: "복사" },
  "收藏": { "zh-Hant": "收藏", ja: "お気に入り", en: "Favorite", ko: "즐겨찾기" },
  "删除": { "zh-Hant": "刪除", ja: "削除", en: "Delete", ko: "삭제" },
  "聊天记录": { "zh-Hant": "聊天記錄", ja: "チャット履歴", en: "Chat history", ko: "채팅 기록" },
  "最多选择100条信息": { "zh-Hant": "最多選擇100則訊息", ja: "メッセージは最大100件まで選択できます", en: "You can select up to 100 messages", ko: "메시지는 최대 100개까지 선택할 수 있습니다" },
  "本月免费翻译额度已用完": { "zh-Hant": "本月免費翻譯額度已用完", ja: "今月の無料翻訳上限に達しました", en: "This month's free translation quota has been used up", ko: "이번 달 무료 번역 한도를 모두 사용했습니다" },
  "翻译请求较多，请稍后重试": { "zh-Hant": "翻譯請求較多，請稍後再試", ja: "翻訳リクエストが多すぎます。しばらくしてからもう一度お試しください", en: "Too many translation requests. Try again later.", ko: "번역 요청이 많습니다. 잠시 후 다시 시도해 주세요" },
  "翻译服务暂不可用，请稍后重试": { "zh-Hant": "翻譯服務暫不可用，請稍後再試", ja: "翻訳サービスを一時的に利用できません。しばらくしてからもう一度お試しください", en: "Translation service is temporarily unavailable. Try again later.", ko: "번역 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요" },
  "翻译失败，请稍后重试": { "zh-Hant": "翻譯失敗，請稍後再試", ja: "翻訳に失敗しました。しばらくしてからもう一度お試しください", en: "Translation failed. Try again later.", ko: "번역에 실패했습니다. 잠시 후 다시 시도해 주세요" },
  "将从你的聊天记录中删除 {count} 条信息，不影响对方。": { "zh-Hant": "將從你的聊天記錄中刪除 {count} 則訊息，不影響對方。", ja: "チャット履歴から{count}件のメッセージを削除します。相手側には影響しません。", en: "Delete {count} messages from your chat history. This won't affect the other person.", ko: "채팅 기록에서 메시지 {count}개를 삭제합니다. 상대방에게는 영향을 주지 않습니다." },
  "聊天记录不可用": { "zh-Hant": "聊天記錄不可用", ja: "チャット履歴を利用できません", en: "Chat record unavailable", ko: "채팅 기록을 사용할 수 없습니다" },
  "转发内容已失效，请重新选择": { "zh-Hant": "轉發內容已失效，請重新選擇", ja: "シェアする内容の有効期限が切れました。もう一度選択してください", en: "Forwarding selection expired. Select the messages again.", ko: "전달할 내용이 만료되었습니다. 다시 선택해 주세요" },
};

export function translateImUiText(source: string, language: Language): string {
  if (language === "zh") return source;
  return imUiTranslations[source]?.[language] ?? translateText(source, language);
}
