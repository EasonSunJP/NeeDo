import type { Language } from "../../i18n/translations";

type MarketplaceTranslations = Record<string, Record<Language, string>>;

export const affiliateMarketplaceTranslations = {
  推荐任务: {
    zh: "推荐任务",
    "zh-Hant": "推薦任務",
    ja: "おすすめタスク",
    en: "Recommended tasks",
    ko: "추천 작업"
  },
  正在读取推荐任务: {
    zh: "正在读取推荐任务",
    "zh-Hant": "正在讀取推薦任務",
    ja: "おすすめタスクを読み込んでいます",
    en: "Loading recommended tasks",
    ko: "추천 작업을 불러오는 중"
  },
  推荐任务读取失败: {
    zh: "推荐任务读取失败",
    "zh-Hant": "推薦任務讀取失敗",
    ja: "おすすめタスクを読み込めませんでした",
    en: "Couldn't load recommended tasks",
    ko: "추천 작업을 불러오지 못했습니다"
  },
  暂无符合条件的任务: {
    zh: "暂无符合条件的任务",
    "zh-Hant": "暫無符合條件的任務",
    ja: "条件に合うタスクはありません",
    en: "No matching tasks",
    ko: "조건에 맞는 작업이 없습니다"
  },
  "调整搜索词后再试，新的正式任务也会显示在这里。": {
    zh: "调整搜索词后再试，新的正式任务也会显示在这里。",
    "zh-Hant": "調整搜尋詞後再試，新的正式任務也會顯示在這裡。",
    ja: "検索語を変更してください。新しい正式タスクもここに表示されます。",
    en: "Try another search. New formal tasks will also appear here.",
    ko: "검색어를 바꿔 보세요. 새로운 정식 작업도 여기에 표시됩니다."
  },
  "共 {count} 个任务": {
    zh: "共 {count} 个任务",
    "zh-Hant": "共 {count} 個任務",
    ja: "{count} 件のタスク",
    en: "{count} tasks",
    ko: "작업 {count}개"
  },
  任务分页: {
    zh: "任务分页",
    "zh-Hant": "任務分頁",
    ja: "タスクページ",
    en: "Task pages",
    ko: "작업 페이지"
  },
  "剩余：{percent}%": {
    zh: "剩余：{percent}%",
    "zh-Hant": "剩餘：{percent}%",
    ja: "残り：{percent}%",
    en: "Remaining: {percent}%",
    ko: "잔여: {percent}%"
  },
  "当前最高收益：{amount} NDP": {
    zh: "当前最高收益：{amount} NDP",
    "zh-Hant": "目前最高收益：{amount} NDP",
    ja: "最大収益：{amount} NDP",
    en: "Maximum earnings: {amount} NDP",
    ko: "최대 수익: {amount} NDP"
  },
  查看任务详细: {
    zh: "查看任务详细",
    "zh-Hant": "查看任務詳細",
    ja: "タスク詳細を表示",
    en: "View task details",
    ko: "작업 상세 보기"
  },
  "每位顾客最多 {count} 单": {
    zh: "每位顾客最多 {count} 单",
    "zh-Hant": "每位顧客最多 {count} 單",
    ja: "顧客1人あたり最大 {count} 件",
    en: "Up to {count} orders per customer",
    ko: "고객 1명당 최대 {count}건"
  },
  "满 {amount} JPY 可参加": {
    zh: "满 {amount} JPY 可参加",
    "zh-Hant": "滿 {amount} JPY 可參加",
    ja: "{amount} JPY 以上で参加可能",
    en: "Join from {amount} JPY",
    ko: "{amount} JPY 이상 참여 가능"
  },
  "顾客优惠 {amount} JPY": {
    zh: "顾客优惠 {amount} JPY",
    "zh-Hant": "顧客優惠 {amount} JPY",
    ja: "お客様割引 {amount} JPY",
    en: "Customer discount {amount} JPY",
    ko: "고객 할인 {amount} JPY"
  },
  "顾客优惠 {percent}%": {
    zh: "顾客优惠 {percent}%",
    "zh-Hant": "顧客優惠 {percent}%",
    ja: "お客様割引 {percent}%",
    en: "Customer discount {percent}%",
    ko: "고객 할인 {percent}%"
  },
  高额报酬: {
    zh: "高额报酬",
    "zh-Hant": "高額報酬",
    ja: "高報酬",
    en: "High reward",
    ko: "고액 보상"
  },
  任务暂无图片: {
    zh: "任务暂无图片",
    "zh-Hant": "任務暫無圖片",
    ja: "タスク画像はありません",
    en: "No task image",
    ko: "작업 이미지 없음"
  },
  进入详细页查看任务内容与参加条件: {
    zh: "进入详细页查看任务内容与参加条件",
    "zh-Hant": "進入詳細頁查看任務內容與參加條件",
    ja: "詳細ページでタスク内容と参加条件を確認してください",
    en: "Open details to review the task and participation terms",
    ko: "상세 페이지에서 작업 내용과 참여 조건을 확인하세요"
  },
  "只展示 NeeDo 可验证任务数据": {
    zh: "只展示 NeeDo 可验证任务数据",
    "zh-Hant": "只顯示 NeeDo 可驗證任務資料",
    ja: "NeeDoで検証可能なタスクデータのみ表示",
    en: "Only NeeDo-verifiable task data is shown",
    ko: "NeeDo에서 검증 가능한 작업 데이터만 표시"
  },
  搜索任务名称或简介: {
    zh: "搜索任务名称或简介",
    "zh-Hant": "搜尋任務名稱或簡介",
    ja: "タスク名または説明を検索",
    en: "Search task name or introduction",
    ko: "작업 이름 또는 소개 검색"
  },
  任务名称: {
    zh: "任务名称",
    "zh-Hant": "任務名稱",
    ja: "タスク名",
    en: "Task name",
    ko: "작업 이름"
  },
  任务详细: {
    zh: "任务详细",
    "zh-Hant": "任務詳細",
    ja: "タスク詳細",
    en: "Task details",
    ko: "작업 상세"
  },
  任务详细读取失败: {
    zh: "任务详细读取失败",
    "zh-Hant": "任務詳細讀取失敗",
    ja: "タスク詳細を読み込めませんでした",
    en: "Couldn't load task details",
    ko: "작업 상세를 불러오지 못했습니다"
  },
  任务链接无效: {
    zh: "任务链接无效",
    "zh-Hant": "任務連結無效",
    ja: "タスクリンクが無効です",
    en: "Invalid task link",
    ko: "유효하지 않은 작업 링크"
  },
  "请从推荐任务列表重新进入。": {
    zh: "请从推荐任务列表重新进入。",
    "zh-Hant": "請從推薦任務列表重新進入。",
    ja: "おすすめタスク一覧から入り直してください。",
    en: "Open the task again from the recommended task list.",
    ko: "추천 작업 목록에서 다시 열어 주세요."
  },
  正在读取任务详细: {
    zh: "正在读取任务详细",
    "zh-Hant": "正在讀取任務詳細",
    ja: "タスク詳細を読み込んでいます",
    en: "Loading task details",
    ko: "작업 상세를 불러오는 중"
  },
  跳转到店铺: {
    zh: "跳转到店铺",
    "zh-Hant": "前往店鋪",
    ja: "店舗へ移動",
    en: "Go to store",
    ko: "매장으로 이동"
  },
  店铺暂不可跳转: {
    zh: "店铺暂不可跳转",
    "zh-Hant": "店鋪暫不可前往",
    ja: "店舗ページは現在利用できません",
    en: "Store page is currently unavailable",
    ko: "현재 매장 페이지로 이동할 수 없습니다"
  },
  切换任务图片: {
    zh: "切换任务图片",
    "zh-Hant": "切換任務圖片",
    ja: "タスク画像を切り替え",
    en: "Change task image",
    ko: "작업 이미지 전환"
  },
  本次总预算: {
    zh: "本次总预算",
    "zh-Hant": "本次總預算",
    ja: "今回の総予算",
    en: "Total budget",
    ko: "이번 총예산"
  },
  "目前剩余预算 {percent}%": {
    zh: "目前剩余预算 {percent}%",
    "zh-Hant": "目前剩餘預算 {percent}%",
    ja: "現在の残予算 {percent}%",
    en: "Remaining budget {percent}%",
    ko: "현재 잔여 예산 {percent}%"
  },
  开始日期时间: {
    zh: "开始日期时间",
    "zh-Hant": "開始日期時間",
    ja: "開始日時",
    en: "Start date and time",
    ko: "시작 일시"
  },
  截止日期时间: {
    zh: "截止日期时间",
    "zh-Hant": "截止日期時間",
    ja: "終了日時",
    en: "End date and time",
    ko: "종료 일시"
  },
  "请按照任务规则完成推广与订单归因。": {
    zh: "请按照任务规则完成推广与订单归因。",
    "zh-Hant": "請按照任務規則完成推廣與訂單歸因。",
    ja: "タスク規約に従って紹介と注文のアトリビューションを完了してください。",
    en: "Complete promotion and order attribution under the task rules.",
    ko: "작업 규칙에 따라 홍보와 주문 기여를 완료하세요."
  },
  用户获得单价: {
    zh: "用户获得单价",
    "zh-Hant": "用戶獲得單價",
    ja: "ユーザー獲得単価",
    en: "Reward per completed order",
    ko: "완료 주문당 사용자 보상"
  },
  立即参加: {
    zh: "立即参加",
    "zh-Hant": "立即參加",
    ja: "今すぐ参加",
    en: "Join now",
    ko: "지금 참여"
  },
  "参加中…": {
    zh: "参加中…",
    "zh-Hant": "參加中…",
    ja: "参加処理中…",
    en: "Joining…",
    ko: "참여 중…"
  },
  再次确认参加: {
    zh: "再次确认参加",
    "zh-Hant": "再次確認參加",
    ja: "参加内容を再確認",
    en: "Confirm participation again",
    ko: "참여 다시 확인"
  },
  "参加任务失败，请重试": {
    zh: "参加任务失败，请重试",
    "zh-Hant": "參加任務失敗，請重試",
    ja: "タスクに参加できませんでした。再試行してください",
    en: "Couldn't join the task. Try again",
    ko: "작업에 참여하지 못했습니다. 다시 시도하세요"
  },
  已参加任务: {
    zh: "已参加任务",
    "zh-Hant": "已參加任務",
    ja: "タスクに参加済み",
    en: "Task joined",
    ko: "작업 참여 완료"
  }
} satisfies MarketplaceTranslations;
