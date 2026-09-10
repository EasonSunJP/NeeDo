import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
const copy = {
  system: ["系统", "系統", "システム", "System", "시스템"],
  timeRange: ["时间范围", "時間範圍", "期間", "Date range", "기간"],
  affectedOrders: [
    "受影响预约",
    "受影響預約",
    "影響を受ける予約",
    "Affected bookings",
    "영향을 받는 예약",
  ],
  shopRequired: [
    "入住店铺后才可开启出勤与其他工作状态。",
    "入駐店鋪後才可開啟出勤與其他工作狀態。",
    "店舗への所属後に出勤などの勤務状況を開始できます。",
    "Join a shop before starting attendance or another work status.",
    "매장에 소속된 후 출근 및 기타 근무 상태를 시작할 수 있습니다.",
  ],
  title: ["状态同步", "狀態同步", "勤務状況の共有", "Work status", "근무 상태"],
  timeline: [
    "工作时间线",
    "工作時間線",
    "勤務タイムライン",
    "Work timeline",
    "근무 타임라인",
  ],
  unsynced: ["未同步", "未同步", "未報告", "Not reported", "미보고"],
  on_duty: ["出勤", "出勤", "出勤", "On duty", "출근"],
  traveling: ["移动中", "移動中", "移動中", "Traveling", "이동 중"],
  in_service: ["服务中", "服務中", "サービス中", "In service", "서비스 중"],
  resting: ["休息", "休息", "休憩", "On break", "휴식"],
  off_duty: ["退勤", "退勤", "退勤", "Off duty", "퇴근"],
  late: ["迟到", "遲到", "遅刻", "Late", "지각"],
  early_leave: ["早退", "早退", "早退", "Early departure", "조퇴"],
  incidents: [
    "迟到 / 早退",
    "遲到 / 早退",
    "遅刻 / 早退",
    "Lateness / early departure",
    "지각 / 조퇴",
  ],
  monthCaption: [
    "本月迟到 {late} 次 · 早退 {early} 次",
    "本月遲到 {late} 次 · 早退 {early} 次",
    "今月の遅刻 {late} 回 · 早退 {early} 回",
    "This month: {late} late · {early} early",
    "이번 달 지각 {late} 회 · 조퇴 {early} 회",
  ],
  schedule: ["排班", "排班", "シフト", "Schedule", "근무표"],
  shift: ["排班迟到", "排班遲到", "出勤遅刻", "Late for shift", "근무 지각"],
  booking: [
    "预约迟到",
    "預約遲到",
    "予約の開始遅延",
    "Late for booking",
    "예약 지각",
  ],
  comment: ["补充记录", "補充記錄", "記録を追加", "Add a note", "기록 추가"],
  loading: ["正在同步…", "正在同步…", "同期中…", "Syncing…", "동기화 중…"],
  saving: ["正在保存…", "正在儲存…", "保存中…", "Saving…", "저장 중…"],
  error: [
    "状态读取失败，请重试",
    "狀態讀取失敗，請重試",
    "状態を取得できません。再試行してください",
    "Could not load status. Retry",
    "상태를 불러오지 못했습니다. 다시 시도하세요",
  ],
  saveError: [
    "保存失败，请重试",
    "儲存失敗，請重試",
    "保存できません。再試行してください",
    "Could not save. Retry",
    "저장 실패. 다시 시도하세요",
  ],
  retry: ["重试", "重試", "再試行", "Retry", "다시 시도"],
  empty: [
    "没有符合条件的记录",
    "沒有符合條件的記錄",
    "該当する記録はありません",
    "No matching records",
    "해당 기록이 없습니다",
  ],
  all: ["全部", "全部", "すべて", "All", "전체"],
  today: ["今日", "今日", "今日", "Today", "오늘"],
  last7days: ["近 7 天", "近 7 天", "直近7日", "Last 7 days", "최근 7일"],
  last30days: ["近 30 天", "近 30 天", "直近30日", "Last 30 days", "최근 30일"],
  week: ["本周", "本週", "今週", "This week", "이번 주"],
  month: ["本月", "本月", "今月", "This month", "이번 달"],
  year: ["今年", "今年", "今年", "This year", "올해"],
  custom: ["自定义日期", "自訂日期", "日付指定", "Custom dates", "날짜 지정"],
  from: ["开始日期", "開始日期", "開始日", "From", "시작일"],
  to: ["结束日期", "結束日期", "終了日", "To", "종료일"],
  invalidRange: [
    "请选择有效的日期区间",
    "請選擇有效的日期區間",
    "有効な日付範囲を選択してください",
    "Select a valid date range",
    "올바른 날짜 범위를 선택하세요",
  ],
  planned: ["计划时间", "計畫時間", "予定時刻", "Planned", "예정 시간"],
  actual: ["实际时间", "實際時間", "実際の時刻", "Actual", "실제 시간"],
  waiting: [
    "等待到岗 / 开始服务",
    "等待到崗 / 開始服務",
    "出勤・サービス開始待ち",
    "Awaiting arrival / service start",
    "출근 / 서비스 시작 대기",
  ],
  deviation: [
    "偏差 {minutes} 分 {seconds} 秒",
    "偏差 {minutes} 分 {seconds} 秒",
    "差異 {minutes} 分 {seconds} 秒",
    "Deviation {minutes}m {seconds}s",
    "차이 {minutes}분 {seconds}초",
  ],
  leaveTitle: [
    "确认提前退勤",
    "確認提前退勤",
    "早退の確認",
    "Confirm early departure",
    "조퇴 확인",
  ],
  leaveInfo: [
    "当前班段尚未结束。退勤会记录早退，请填写原因。",
    "目前班段尚未結束。退勤會記錄早退，請填寫原因。",
    "勤務時間内です。早退が記録されます。理由を入力してください。",
    "Your shift has not ended. Early departure will be recorded. Enter a reason.",
    "근무 종료 전입니다. 조퇴로 기록됩니다. 사유를 입력하세요.",
  ],
  reason: ["原因", "原因", "理由", "Reason", "사유"],
  confirm: [
    "确认退勤",
    "確認退勤",
    "退勤を確定",
    "Confirm departure",
    "퇴근 확인",
  ],
  cancel: ["取消", "取消", "キャンセル", "Cancel", "취소"],
  submit: ["提交", "提交", "送信", "Submit", "제출"],
  synced: [
    "当前已同步状态",
    "目前已同步狀態",
    "共有済みの勤務状況",
    "Current reported status",
    "현재 보고 상태",
  ],
  service: [
    "服务记录",
    "服務記錄",
    "サービス記録",
    "Service record",
    "서비스 기록",
  ],
  status: ["状态变更", "狀態變更", "状態変更", "Status changed", "상태 변경"],
  changed: [
    "{from} → {to}",
    "{from} → {to}",
    "{from} → {to}",
    "{from} → {to}",
    "{from} → {to}",
  ],
} as const;
export type WorkTextKey = keyof typeof copy;
export function workText(
  key: WorkTextKey,
  language: Language,
  values: Record<string, string | number> = {},
) {
  const index =
    language === "zh-Hant"
      ? 1
      : language === "ja"
        ? 2
        : language === "en"
          ? 3
          : language === "ko"
            ? 4
            : 0;
  let value: string = copy[key][index];
  for (const [name, replacement] of Object.entries(values))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
export function useWorkText() {
  const { language } = useOptionalI18n();
  return {
    language,
    t: (key: WorkTextKey, values?: Record<string, string | number>) =>
      workText(key, language, values),
  };
}
