import type { Language } from "../../i18n/translations";

const languageIndex: Record<Language, number> = { ja: 0, en: 1, ko: 2, "zh-Hant": 3, zh: 4 };
const rows = {
  title: ["会員還元プラットフォーム料金", "Membership reward platform fee", "회원 리워드 플랫폼 수수료", "會員返點平台費", "会员返点平台费"],
  description: ["会員向け NDP 還元に上乗せするプラットフォーム料率を、履歴を保持したバージョンとして管理します。", "Manage the additive platform fee for membership NDP rewards as immutable versions.", "회원 NDP 리워드에 추가되는 플랫폼 수수료율을 변경 불가 버전으로 관리합니다.", "以不可變版本管理會員 NDP 返點之外加收的平台費率。", "以不可变版本管理会员 NDP 返点之外加收的平台费率。"],
  warning: ["料金は顧客が受け取る NDP とは別に店舗へ加算されます。新しい料率は、その料率で新たに公開したカードプランのバージョンだけに適用され、既存の公開スナップショットは変更されません。", "The fee is charged to the store on top of the customer's NDP. A new rate applies only to card-plan versions published afterward and never changes existing published snapshots.", "수수료는 고객 NDP와 별도로 매장에 추가 청구됩니다. 새 요율은 이후 새로 게시된 카드 플랜 버전에만 적용되며 기존 게시 스냅샷은 변경되지 않습니다.", "平台費在客戶獲得的 NDP 之外向店鋪額外收取；新費率只影響之後新發布的卡方案版本，不改變既有發布快照。", "平台费在客户获得的 NDP 之外向店铺额外收取；新费率只影响之后新发布的卡方案版本，不改变既有发布快照。"],
  current: ["現在の料率", "Current rate", "현재 요율", "目前費率", "当前费率"],
  next: ["次回予定", "Next scheduled", "다음 예정", "下一排期", "下一排期"],
  latest: ["最新バージョン", "Latest version", "최신 버전", "最新版本", "最新版本"],
  history: ["変更不可の履歴", "Immutable history", "변경 불가 이력", "不可變歷史", "不可变历史"],
  create: ["新しい料率バージョン", "New fee version", "새 수수료 버전", "新增費率版本", "新建费率版本"],
  loading: ["正式データを読み込んでいます…", "Loading production data…", "정식 데이터를 불러오는 중…", "正在讀取正式資料…", "正在读取正式数据…"],
  loadFailed: ["料金データを読み込めませんでした", "Could not load fee data", "수수료 데이터를 불러오지 못했습니다", "平台費資料讀取失敗", "平台费数据读取失败"],
  retry: ["再試行", "Retry", "다시 시도", "重試", "重试"],
  empty: ["履歴はまだありません", "No history yet", "아직 이력이 없습니다", "尚無歷史版本", "暂无历史版本"],
  rate: ["料率", "Rate", "요율", "費率", "费率"],
  version: ["バージョン", "Version", "버전", "版本", "版本"],
  interval: ["適用期間", "Effective interval", "적용 기간", "生效區間", "生效区间"],
  operator: ["作成者", "Created by", "생성자", "建立者", "创建人"],
  reason: ["変更理由", "Change reason", "변경 사유", "變更原因", "变更原因"],
  status: ["状態", "Status", "상태", "狀態", "状态"],
  currentStatus: ["現在有効", "Current", "현재 적용", "目前生效", "当前生效"],
  scheduledStatus: ["予定", "Scheduled", "예정", "已排期", "已排期"],
  historicalStatus: ["履歴", "Historical", "이력", "歷史", "历史"],
  percent: ["プラットフォーム料率（%）", "Platform fee rate (%)", "플랫폼 수수료율(%)", "平台費率（%）", "平台费率（%）"],
  effectiveFrom: ["発効日時", "Effective from", "적용 시작", "生效時間", "生效时间"],
  reasonHelp: ["監査に残す業務上の理由（1〜500文字）", "Business reason for the audit trail (1–500 characters)", "감사 이력에 남길 업무 사유(1~500자)", "寫入審計的業務原因（1–500 字）", "写入审计的业务原因（1–500 字）"],
  preview: ["顧客還元 1,000 NDP の例", "Example: customer receives 1,000 NDP", "예시: 고객 1,000 NDP 수령", "範例：客戶獲得 1,000 NDP", "示例：客户获得 1,000 NDP"],
  customer: ["顧客", "Customer", "고객", "客戶", "客户"],
  platform: ["プラットフォーム料金", "Platform fee", "플랫폼 수수료", "平台費", "平台费"],
  shopTotal: ["店舗合計負担", "Total store cost", "매장 총부담", "店鋪總成本", "店铺总成本"],
  continueAction: ["確認へ", "Continue", "확인", "繼續確認", "继续确认"],
  confirmTitle: ["新しい料金バージョンを確認", "Confirm new fee version", "새 수수료 버전 확인", "確認新費率版本", "确认新费率版本"],
  confirm: ["この内容で作成", "Create version", "이 내용으로 생성", "依此建立版本", "按此创建版本"],
  cancel: ["キャンセル", "Cancel", "취소", "取消", "取消"],
  saving: ["保存中…", "Saving…", "저장 중…", "儲存中…", "保存中…"],
  success: ["新しい料金バージョンを作成しました", "New fee version created", "새 수수료 버전이 생성되었습니다", "已建立新費率版本", "已创建新费率版本"],
  percentInvalid: ["0〜100、小数第2位までで入力してください", "Enter 0–100 with up to two decimals", "0~100, 소수 둘째 자리까지 입력하세요", "請輸入 0–100，最多兩位小數", "请输入 0–100，最多两位小数"],
  futureInvalid: ["現在以降の日時を選択してください", "Choose a current or future time", "현재 이후 시간을 선택하세요", "請選擇目前或未來時間", "请选择当前或未来时间"],
  reasonInvalid: ["理由は1〜500文字で入力してください", "Enter a reason between 1 and 500 characters", "사유를 1~500자로 입력하세요", "原因須為 1–500 字", "原因须为 1–500 字"],
  permissionDenied: ["この操作の権限がありません", "You do not have permission for this action", "이 작업 권한이 없습니다", "沒有執行此操作的權限", "没有执行此操作的权限"],
  conflict: ["別の担当者が先に変更しました。最新データを確認してください", "Another operator changed the rate first. Review the latest data.", "다른 운영자가 먼저 변경했습니다. 최신 데이터를 확인하세요", "其他人已先修改費率，請確認最新資料", "其他人已先修改费率，请确认最新数据"],
  saveFailed: ["料金バージョンを保存できませんでした", "Could not save the fee version", "수수료 버전을 저장하지 못했습니다", "費率版本儲存失敗", "费率版本保存失败"],
  previous: ["前へ", "Previous", "이전", "上一頁", "上一页"],
  nextPage: ["次へ", "Next", "다음", "下一頁", "下一页"],
  none: ["なし", "None", "없음", "無", "无"]
} as const;

type CopyKey = keyof typeof rows;
export type MembershipRewardFeeCopy = Record<CopyKey, string>;

export function getMembershipRewardFeeCopy(language: Language): MembershipRewardFeeCopy {
  const index = languageIndex[language];
  return Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row[index]])) as MembershipRewardFeeCopy;
}
