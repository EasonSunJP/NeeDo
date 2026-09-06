import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";

const copy = {
  send: ["发送 SOS 求救", "發送 SOS 求救", "SOSを送信", "Send SOS", "SOS 보내기"],
  sending: ["正在发送求救…", "正在發送求救…", "SOSを送信中…", "Sending SOS…", "SOS 전송 중…"],
  sent: ["求救已发送", "求救已發送", "SOSを送信しました", "SOS sent", "SOS 전송됨"],
  sendError: ["发送失败，请点击 SOS 重试", "發送失敗，請點擊 SOS 重試", "送信できませんでした。SOSを押して再試行してください", "Send failed. Press SOS to retry", "전송 실패. SOS를 눌러 다시 시도하세요"],
  unavailable: ["SOS 状态读取失败", "SOS 狀態讀取失敗", "SOSの状態を取得できません", "Cannot load SOS status", "SOS 상태를 불러올 수 없습니다"],
  title: ["求救通知", "求救通知", "SOS通知", "SOS alerts", "SOS 알림"],
  pending: ["待处理", "待處理", "未対応", "Pending", "처리 대기"],
  resolved: ["已处理", "已處理", "対応済み", "Resolved", "처리 완료"],
  resolve: ["标记已处理", "標記已處理", "対応済みにする", "Mark resolved", "처리 완료로 표시"],
  resolving: ["正在处理…", "正在處理…", "更新中…", "Resolving…", "처리 중…"],
  resolveError: ["处理失败，请重试", "處理失敗，請重試", "更新できませんでした。再試行してください", "Could not resolve. Please retry", "처리 실패. 다시 시도하세요"],
  connectionError: ["连接异常，正在重新同步求救通知", "連線異常，正在重新同步求救通知", "接続エラー。SOS通知を再同期しています", "Connection error. Resyncing SOS alerts", "연결 오류. SOS 알림을 다시 동기화합니다"],
  loadError: ["求救列表加载失败", "求救列表載入失敗", "SOS一覧を読み込めません", "Could not load SOS alerts", "SOS 목록을 불러올 수 없습니다"],
  loading: ["正在加载求救通知…", "正在載入求救通知…", "SOS通知を読み込み中…", "Loading SOS alerts…", "SOS 알림 불러오는 중…"],
  empty: ["没有符合条件的求救记录", "沒有符合條件的求救紀錄", "該当するSOSはありません", "No matching SOS alerts", "해당하는 SOS 기록이 없습니다"],
  retry: ["重试", "重試", "再試行", "Retry", "다시 시도"],
  customer: ["用户", "使用者", "お客様", "Customer", "고객"],
  technician: ["技师", "技師", "スタッフ", "Technician", "테크니션"],
  previous: ["上一页", "上一頁", "前へ", "Previous", "이전"],
  next: ["下一页", "下一頁", "次へ", "Next", "다음"],
  messages: ["消息", "訊息", "メッセージ", "Messages", "메시지"],
  support: ["客服", "客服", "サポート", "Support", "고객 지원"],
  close: ["关闭求救通知", "關閉求救通知", "SOS通知を閉じる", "Close SOS alerts", "SOS 알림 닫기"]
} as const;
export type SosTextKey = keyof typeof copy;
const languages: Language[] = ["zh", "zh-Hant", "ja", "en", "ko"];
export function sosText(key: SosTextKey, language: Language) { return copy[key][languages.indexOf(language)] ?? copy[key][0]; }
export function useSosText() {
  const { language } = useOptionalI18n();
  return (key: SosTextKey) => sosText(key, language);
}
