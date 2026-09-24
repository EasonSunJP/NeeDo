import type { TranslationEntry } from "../../i18n/translations";

export const shopAnalyticsTranslations: Record<string, TranslationEntry> = {
  "订单数含已确认至已完成订单；营业额仅计已完成且未退款订单。": { "zh-Hant": "訂單數包含已確認至已完成的訂單；營業額僅計入已完成且未退款的訂單。", ja: "注文数には確定から完了までの注文を含みます。売上は完了済みで返金されていない注文のみ計上します。", en: "Order count includes confirmed through completed orders. Revenue includes only completed, non-refunded orders.", ko: "주문 수에는 확정부터 완료까지의 주문이 포함됩니다. 매출은 완료되고 환불되지 않은 주문만 집계합니다." },
  "搜索今日预约": { "zh-Hant": "搜尋今日預約", ja: "本日の予約を検索", en: "Search today's bookings", ko: "오늘 예약 검색" },
  "搜索预约、客户、员工、状态": { "zh-Hant": "搜尋預約、顧客、員工、狀態", ja: "予約、顧客、スタッフ、状態を検索", en: "Search bookings, customers, staff, or status", ko: "예약, 고객, 직원 또는 상태 검색" },
  "今日预约时间线": { "zh-Hant": "今日預約時間線", ja: "本日の予約タイムライン", en: "Today's booking timeline", ko: "오늘 예약 타임라인" },
  "正在加载今日预约": { "zh-Hant": "正在載入今日預約", ja: "本日の予約を読み込んでいます", en: "Loading today's bookings", ko: "오늘 예약을 불러오는 중입니다" },
  "本店今日预约加载失败": { "zh-Hant": "本店今日預約載入失敗", ja: "本日の予約を読み込めませんでした", en: "Today's bookings could not be loaded", ko: "오늘 예약을 불러오지 못했습니다" },
  "没有匹配的今日预约": { "zh-Hant": "沒有符合的今日預約", ja: "本日の予約はありません", en: "No matching bookings today", ko: "일치하는 오늘 예약이 없습니다" },
  "查看今日预约": { "zh-Hant": "查看今日預約", ja: "本日の予約を表示", en: "View today's bookings", ko: "오늘 예약 보기" },
  "查看营业额": { "zh-Hant": "查看營業額", ja: "売上を表示", en: "View revenue", ko: "매출 보기" },
  "查询营业额日期": { "zh-Hant": "查詢營業額日期", ja: "売上の日付を検索", en: "Query revenue dates", ko: "매출 날짜 조회" },
  "请选择开始日期和结束日期": { "zh-Hant": "請選擇開始日期和結束日期", ja: "開始日と終了日を選択してください", en: "Select a start and end date", ko: "시작일과 종료일을 선택하세요" },
  "开始日期不能晚于结束日期": { "zh-Hant": "開始日期不得晚於結束日期", ja: "開始日は終了日より後にできません", en: "The start date cannot be after the end date", ko: "시작일은 종료일보다 늦을 수 없습니다" },
  "选择数据期间": { "zh-Hant": "選擇資料期間", ja: "データ期間を選択", en: "Select data period", ko: "데이터 기간 선택" }
};
