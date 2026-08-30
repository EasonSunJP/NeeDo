import type { Language } from "../../i18n/translations";

export const affiliateFeeRuleLanguageOrder = ["ja", "en", "ko", "zh-Hant", "zh"] as const;

const copyRows = {
  title: ["アフィリエイト手数料ルール", "Affiliate fee rules", "제휴 마케팅 수수료 규칙", "聯盟行銷抽成規則", "联盟营销抽成规则"],
  description: ["加盟店負担のプラットフォーム手数料を、グローバルまたは店舗単位の履歴バージョンとして管理します。", "Manage merchant-paid platform fees as immutable global or shop-scoped versions.", "판매자 부담 플랫폼 수수료를 전체 또는 매장 범위의 변경 불가 버전으로 관리합니다.", "以不可變更的全域或店鋪版本管理商戶負擔的平台抽成。", "以不可变的全局或店铺版本管理商户承担的平台抽成。"],
  formalData: ["正式データベース", "Production database", "정식 데이터베이스", "正式資料庫", "正式数据库"],
  audit: ["監査ログ", "Immutable audit", "변경 불가 감사", "不可變審計", "不可变审计"],
  snapshot: ["タスク時点スナップショット", "Task-time snapshot", "작업 시점 스냅샷", "任務時點快照", "任务时点快照"],
  currentRate: ["現在のグローバル料率", "Current global rate", "현재 전체 요율", "目前全域費率", "当前全局费率"],
  nextRate: ["次回予定料率", "Next scheduled rate", "다음 예정 요율", "下一個排程費率", "下一排期费率"],
  latestVersion: ["最新バージョン", "Latest version", "최신 버전", "最新版本", "最新版本"],
  none: ["なし", "None", "없음", "無", "无"],
  lifecycleWarning: ["手数料は加盟店が報酬とは別に負担します。新しい料率は発効後に提出されたタスクだけに適用され、凍結済みタスクのスナップショットは変更されません。", "The merchant pays this fee separately from the reward. New rates apply only to tasks submitted after they take effect; funded-task snapshots never change.", "수수료는 판매자가 보상과 별도로 부담합니다. 새 요율은 적용 후 제출된 작업에만 적용되며 이미 자금이 동결된 작업의 스냅샷은 변경되지 않습니다.", "抽成由商戶在報酬之外另行負擔。新費率僅適用於生效後提交的任務，已凍結任務的快照不會變更。", "抽成由商户在报酬之外另行承担。新费率仅适用于生效后提交的任务，已冻结任务的快照不会改变。"],
  history: ["バージョン履歴", "Version history", "버전 이력", "版本歷史", "版本历史"],
  allScopes: ["すべての範囲", "All scopes", "모든 범위", "全部範圍", "全部范围"],
  global: ["グローバル", "Global", "전체", "全域", "全局"],
  shop: ["店舗", "Shop", "매장", "店鋪", "店铺"],
  selectedShop: ["選択中の店舗", "Selected shop", "선택한 매장", "已選店鋪", "已选店铺"],
  selectShop: ["店舗を選択", "Select shop", "매장 선택", "選擇店鋪", "选择店铺"],
  searchShops: ["店舗を検索", "Search shops", "매장 검색", "搜尋店鋪", "搜索店铺"],
  searchPlaceholder: ["店舗名または店舗 ID", "Shop name or shop ID", "매장명 또는 매장 ID", "店鋪名稱或店鋪 ID", "店铺名称或店铺 ID"],
  shopSearchLoading: ["正式な店舗を検索中...", "Searching production shops...", "정식 매장 검색 중...", "正在搜尋正式店鋪…", "正在搜索正式店铺…"],
  shopSearchFailed: ["店舗検索に失敗しました", "Shop search failed", "매장 검색에 실패했습니다", "店鋪搜尋失敗", "店铺搜索失败"],
  noShopResults: ["一致する公開店舗はありません", "No published shops match", "일치하는 공개 매장이 없습니다", "沒有相符的已發佈店鋪", "没有匹配的已发布店铺"],
  loading: ["正式な手数料ルールを読み込み中...", "Loading production fee rules...", "정식 수수료 규칙 불러오는 중...", "正在讀取正式抽成規則…", "正在读取正式抽成规则…"],
  loadFailed: ["手数料ルールを読み込めませんでした", "Couldn't load fee rules", "수수료 규칙을 불러오지 못했습니다", "抽成規則讀取失敗", "抽成规则读取失败"],
  retry: ["再試行", "Retry", "다시 시도", "重試", "重试"],
  empty: ["条件に一致する正式ルールはありません", "No production rules match these filters", "조건에 맞는 정식 규칙이 없습니다", "沒有符合條件的正式規則", "没有符合条件的正式规则"],
  rate: ["料率", "Rate", "요율", "費率", "费率"],
  version: ["バージョン", "Version", "버전", "版本", "版本"],
  effectiveRange: ["適用期間", "Effective interval", "적용 기간", "生效區間", "生效区间"],
  status: ["ステータス", "Status", "상태", "狀態", "状态"],
  reason: ["変更理由", "Change reason", "변경 사유", "變更原因", "变更原因"],
  operator: ["担当者 NeeDo ID", "Operator NeeDo ID", "운영자 NeeDo ID", "操作人 NeeDo ID", "操作人 NeeDo ID"],
  createdAt: ["作成日時", "Created at", "생성 일시", "建立時間", "创建时间"],
  current: ["現在有効", "Current", "현재 적용", "目前生效", "当前生效"],
  scheduled: ["予約済み", "Scheduled", "예약됨", "已排程", "已排期"],
  historical: ["履歴", "Historical", "이전 기록", "歷史版本", "历史版本"],
  create: ["新しいバージョンを作成", "Create new version", "새 버전 만들기", "建立新版本", "新建版本"],
  drawerTitle: ["手数料ルールの新規バージョン", "New fee-rule version", "새 수수료 규칙 버전", "新增抽成規則版本", "新建抽成规则版本"],
  scope: ["適用範囲", "Scope", "적용 범위", "適用範圍", "适用范围"],
  effectiveMode: ["発効方法", "Effective mode", "적용 방식", "生效方式", "生效方式"],
  immediately: ["すぐに発効", "Effective now", "즉시 적용", "立即生效", "立即生效"],
  scheduledAt: ["発効予定日時", "Scheduled time", "예약 적용 일시", "排程生效時間", "排期生效时间"],
  percent: ["手数料率（%）", "Fee rate (%)", "수수료율(%)", "抽成比例（%）", "抽成比例（%）"],
  reasonPlaceholder: ["変更の業務上の理由を入力してください（1〜500 文字）", "Enter the business reason for this change (1–500 characters)", "변경 사유를 입력하세요(1~500자)", "請輸入本次變更的業務原因（1–500 字）", "请输入本次变更的业务原因（1–500 字）"],
  continueAction: ["確認へ", "Continue", "확인", "繼續確認", "继续确认"],
  confirmTitle: ["新しいバージョンを確認", "Confirm new version", "새 버전 확인", "確認新版本", "确认新版本"],
  oldRate: ["変更前の料率", "Previous rate", "이전 요율", "原費率", "原费率"],
  newRate: ["新しい料率", "New rate", "새 요율", "新費率", "新费率"],
  confirmCreate: ["この内容で作成", "Create this version", "이 내용으로 생성", "依此內容建立", "按此内容创建"],
  cancel: ["キャンセル", "Cancel", "취소", "取消", "取消"],
  saving: ["保存中...", "Saving...", "저장 중...", "儲存中…", "保存中…"],
  success: ["新しい手数料バージョンを作成しました", "New fee-rule version created", "새 수수료 규칙 버전을 생성했습니다", "已建立新的抽成規則版本", "已创建新的抽成规则版本"],
  shopRequired: ["公開店舗を選択してください", "Select a published shop", "공개 매장을 선택하세요", "請選擇已發佈店鋪", "请选择已发布店铺"],
  percentInvalid: ["0〜100 の範囲で小数第 2 位まで入力してください", "Enter 0–100 with at most two decimals", "0~100 사이의 값을 소수 둘째 자리까지 입력하세요", "請輸入 0–100，最多兩位小數", "请输入 0–100，最多两位小数"],
  futureRequired: ["現在より後の日時を選択してください", "Choose a future time", "현재 이후 시간을 선택하세요", "請選擇未來時間", "请选择未来时间"],
  reasonInvalid: ["変更理由は 1〜500 文字で入力してください", "Enter a reason between 1 and 500 characters", "변경 사유를 1~500자로 입력하세요", "變更原因須為 1–500 字", "变更原因须为 1–500 字"],
  sessionExpired: ["ログインの有効期限が切れました。再度ログインしてください", "Your session expired. Please sign in again", "로그인이 만료되었습니다. 다시 로그인하세요", "登入已失效，請重新登入", "登录已失效，请重新登录"],
  permissionDenied: ["このアカウントには手数料ルールの変更権限がありません", "This account cannot change fee rules", "이 계정에는 수수료 규칙 변경 권한이 없습니다", "此帳號沒有變更抽成規則的權限", "当前账号没有修改抽成规则的权限"],
  shopUnavailable: ["選択した店舗は利用できなくなりました。別の店舗を選択してください", "The selected shop is no longer available. Choose another shop", "선택한 매장을 더 이상 사용할 수 없습니다. 다른 매장을 선택하세요", "所選店鋪已無法使用，請重新選擇", "所选店铺已不可用，请重新选择"],
  conflict: ["別の担当者が先にルールを変更しました。最新バージョンを確認してください", "Another operator changed the rule first. Review the latest version", "다른 운영자가 먼저 규칙을 변경했습니다. 최신 버전을 확인하세요", "其他營運人員已先修改規則，請確認最新版本", "其他运营人员已先修改规则，请确认最新版本"],
  policyConflict: ["適用期間が既存ルールと競合しています", "The effective interval conflicts with an existing rule", "적용 기간이 기존 규칙과 충돌합니다", "生效區間與既有規則衝突", "生效区间与现有规则冲突"],
  saveFailed: ["手数料ルールを保存できませんでした", "Couldn't save the fee rule", "수수료 규칙을 저장하지 못했습니다", "抽成規則儲存失敗", "抽成规则保存失败"],
  previous: ["前へ", "Previous", "이전", "上一頁", "上一页"],
  next: ["次へ", "Next", "다음", "下一頁", "下一页"]
} as const;

type CopyKey = keyof typeof copyRows;

export type AffiliateFeeRuleCopy = Record<CopyKey, string> & {
  pageSummary: (total: number, page: number, totalPages: number) => string;
};

const languageIndex: Record<Language, number> = {
  ja: 0,
  en: 1,
  ko: 2,
  "zh-Hant": 3,
  zh: 4
};

export function getAffiliateFeeRuleCopy(language: Language): AffiliateFeeRuleCopy {
  const index = languageIndex[language];
  const copy = Object.fromEntries(
    Object.entries(copyRows).map(([key, row]) => [key, row[index]])
  ) as Record<CopyKey, string>;
  const pageSummary = (total: number, page: number, totalPages: number) => {
    if (language === "ja") return `全 ${total} 件、${page} / ${totalPages} ページ`;
    if (language === "en") return `${total} records · page ${page} of ${totalPages}`;
    if (language === "ko") return `총 ${total}건 · ${page} / ${totalPages}페이지`;
    if (language === "zh-Hant") return `共 ${total} 筆，第 ${page} / ${totalPages} 頁`;
    return `共 ${total} 条，第 ${page} / ${totalPages} 页`;
  };
  return { ...copy, pageSummary };
}
