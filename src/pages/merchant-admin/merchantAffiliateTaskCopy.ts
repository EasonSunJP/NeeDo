import type {
  MerchantAffiliateTaskStatus,
  MerchantAffiliatePublisherType
} from "../../api/merchantAffiliateTasks";
import { ApiClientError } from "../../api/httpClient";
import type { Language } from "../../i18n/translations";

export const merchantAffiliateTaskLanguages = ["ja", "en", "ko", "zh-Hant", "zh"] as const;

export interface MerchantAffiliateTaskCopy {
  locale: string;
  title: string;
  description: string;
  createTask: string;
  editTask: string;
  taskCode: string;
  taskName: string;
  contentLanguage: string;
  publisher: string;
  shops: string;
  shopPublicId: string;
  status: string;
  reward: string;
  fee: string;
  grossFreeze: string;
  window: string;
  updatedAt: string;
  searchPlaceholder: string;
  allStatuses: string;
  allPublishers: string;
  shopPublisher: string;
  merchantPublisher: string;
  loading: string;
  empty: string;
  loadFailed: string;
  retry: string;
  previousPage: string;
  nextPage: string;
  viewTask: string;
  pageLabel: (page: number, totalPages: number) => string;
  statusLabels: Record<MerchantAffiliateTaskStatus, string>;
}

const copies: Record<(typeof merchantAffiliateTaskLanguages)[number], MerchantAffiliateTaskCopy> = {
  zh: {
    locale: "zh-CN",
    title: "我的联盟营销",
    description: "创建、提交并跟踪正式联盟营销任务。店铺仅显示公开 ID，费用以服务端快照为准。",
    createTask: "创建任务",
    editTask: "编辑任务",
    taskCode: "任务 ID",
    taskName: "任务名称",
    contentLanguage: "内容语言",
    publisher: "发布主体",
    shops: "适用店铺",
    shopPublicId: "店铺公开 ID",
    status: "状态",
    reward: "单次奖励",
    fee: "平台费",
    grossFreeze: "冻结合计",
    window: "任务周期",
    updatedAt: "更新时间",
    searchPlaceholder: "搜索任务 ID 或任务名称",
    allStatuses: "全部状态",
    allPublishers: "全部发布主体",
    shopPublisher: "单店",
    merchantPublisher: "商户多店",
    loading: "正在加载联盟营销任务",
    empty: "暂无联盟营销任务",
    loadFailed: "联盟营销任务加载失败",
    retry: "重新加载",
    previousPage: "上一页",
    nextPage: "下一页",
    viewTask: "查看任务",
    pageLabel: (page, totalPages) => `第 ${page} / ${totalPages} 页`,
    statusLabels: {
      draft: "草稿",
      pending_review: "审核中",
      scheduled: "待开始",
      active: "进行中",
      paused: "已暂停",
      budget_exhausted: "预算已用尽",
      ended: "已结束",
      cancelled: "已取消",
      rejected: "已驳回"
    }
  },
  "zh-Hant": {
    locale: "zh-TW",
    title: "我的聯盟行銷",
    description: "建立、提交並追蹤正式聯盟行銷任務。店舖僅顯示公開 ID，費用以伺服器快照為準。",
    createTask: "建立任務",
    editTask: "編輯任務",
    taskCode: "任務 ID",
    taskName: "任務名稱",
    contentLanguage: "內容語言",
    publisher: "發布主體",
    shops: "適用店舖",
    shopPublicId: "店舖公開 ID",
    status: "狀態",
    reward: "單次獎勵",
    fee: "平台費",
    grossFreeze: "凍結合計",
    window: "任務週期",
    updatedAt: "更新時間",
    searchPlaceholder: "搜尋任務 ID 或任務名稱",
    allStatuses: "全部狀態",
    allPublishers: "全部發布主體",
    shopPublisher: "單店",
    merchantPublisher: "商戶多店",
    loading: "正在載入聯盟行銷任務",
    empty: "暫無聯盟行銷任務",
    loadFailed: "聯盟行銷任務載入失敗",
    retry: "重新載入",
    previousPage: "上一頁",
    nextPage: "下一頁",
    viewTask: "查看任務",
    pageLabel: (page, totalPages) => `第 ${page} / ${totalPages} 頁`,
    statusLabels: {
      draft: "草稿",
      pending_review: "審核中",
      scheduled: "待開始",
      active: "進行中",
      paused: "已暫停",
      budget_exhausted: "預算已用盡",
      ended: "已結束",
      cancelled: "已取消",
      rejected: "已駁回"
    }
  },
  ja: {
    locale: "ja-JP",
    title: "アフィリエイト管理",
    description: "正式なアフィリエイトタスクを作成・申請・追跡します。店舗には公開 ID のみを表示し、手数料はサーバーのスナップショットを使用します。",
    createTask: "タスクを作成",
    editTask: "タスクを編集",
    taskCode: "タスク ID",
    taskName: "タスク名",
    contentLanguage: "コンテンツ言語",
    publisher: "公開主体",
    shops: "対象店舗",
    shopPublicId: "店舗公開 ID",
    status: "ステータス",
    reward: "1件あたり報酬",
    fee: "プラットフォーム手数料",
    grossFreeze: "凍結合計",
    window: "タスク期間",
    updatedAt: "更新日時",
    searchPlaceholder: "タスク ID またはタスク名を検索",
    allStatuses: "すべてのステータス",
    allPublishers: "すべての公開主体",
    shopPublisher: "単一店舗",
    merchantPublisher: "複数店舗",
    loading: "アフィリエイトタスクを読み込み中",
    empty: "アフィリエイトタスクはありません",
    loadFailed: "アフィリエイトタスクを読み込めませんでした",
    retry: "再読み込み",
    previousPage: "前へ",
    nextPage: "次へ",
    viewTask: "タスクを表示",
    pageLabel: (page, totalPages) => `${page} / ${totalPages} ページ`,
    statusLabels: {
      draft: "下書き",
      pending_review: "審査中",
      scheduled: "開始待ち",
      active: "実施中",
      paused: "一時停止",
      budget_exhausted: "予算消化済み",
      ended: "終了",
      cancelled: "キャンセル",
      rejected: "差し戻し"
    }
  },
  en: {
    locale: "en-US",
    title: "My Affiliate Marketing",
    description: "Create, submit, and track formal Affiliate tasks. Shops show public IDs only; fees use the server snapshot.",
    createTask: "Create task",
    editTask: "Edit task",
    taskCode: "Task ID",
    taskName: "Task name",
    contentLanguage: "Content language",
    publisher: "Publisher",
    shops: "Shops",
    shopPublicId: "Shop public ID",
    status: "Status",
    reward: "Reward per order",
    fee: "Platform fee",
    grossFreeze: "Gross freeze",
    window: "Task window",
    updatedAt: "Updated",
    searchPlaceholder: "Search task ID or name",
    allStatuses: "All statuses",
    allPublishers: "All publishers",
    shopPublisher: "Single shop",
    merchantPublisher: "Multi-shop merchant",
    loading: "Loading Affiliate tasks",
    empty: "No Affiliate tasks yet",
    loadFailed: "Affiliate tasks could not be loaded",
    retry: "Retry",
    previousPage: "Previous",
    nextPage: "Next",
    viewTask: "View task",
    pageLabel: (page, totalPages) => `Page ${page} / ${totalPages}`,
    statusLabels: {
      draft: "Draft",
      pending_review: "In review",
      scheduled: "Scheduled",
      active: "Active",
      paused: "Paused",
      budget_exhausted: "Budget exhausted",
      ended: "Ended",
      cancelled: "Cancelled",
      rejected: "Rejected"
    }
  },
  ko: {
    locale: "ko-KR",
    title: "내 제휴 마케팅",
    description: "정식 제휴 마케팅 작업을 생성, 제출 및 추적합니다. 매장은 공개 ID만 표시하며 수수료는 서버 스냅샷을 사용합니다.",
    createTask: "작업 만들기",
    editTask: "작업 편집",
    taskCode: "작업 ID",
    taskName: "작업 이름",
    contentLanguage: "콘텐츠 언어",
    publisher: "게시 주체",
    shops: "대상 매장",
    shopPublicId: "매장 공개 ID",
    status: "상태",
    reward: "주문당 보상",
    fee: "플랫폼 수수료",
    grossFreeze: "총 동결액",
    window: "작업 기간",
    updatedAt: "업데이트",
    searchPlaceholder: "작업 ID 또는 이름 검색",
    allStatuses: "모든 상태",
    allPublishers: "모든 게시 주체",
    shopPublisher: "단일 매장",
    merchantPublisher: "다중 매장",
    loading: "제휴 마케팅 작업을 불러오는 중",
    empty: "제휴 마케팅 작업이 없습니다",
    loadFailed: "제휴 마케팅 작업을 불러오지 못했습니다",
    retry: "다시 시도",
    previousPage: "이전",
    nextPage: "다음",
    viewTask: "작업 보기",
    pageLabel: (page, totalPages) => `${page} / ${totalPages} 페이지`,
    statusLabels: {
      draft: "초안",
      pending_review: "검토 중",
      scheduled: "예약됨",
      active: "진행 중",
      paused: "일시 중지",
      budget_exhausted: "예산 소진",
      ended: "종료",
      cancelled: "취소",
      rejected: "반려"
    }
  }
};

export const getMerchantAffiliateTaskCopy = (language: Language): MerchantAffiliateTaskCopy =>
  copies[language];

export const merchantAffiliateTaskStatusLabel = (
  status: MerchantAffiliateTaskStatus,
  language: Language
): string => copies[language].statusLabels[status];

export const merchantAffiliatePublisherLabel = (
  publisherType: MerchantAffiliatePublisherType,
  language: Language
): string =>
  publisherType === "shop" ? copies[language].shopPublisher : copies[language].merchantPublisher;

const localizedErrors: Record<Language, Record<string, string>> = {
  zh: {
    unauthorized: "登录状态已失效，请重新登录",
    forbidden: "当前身份没有管理联盟营销任务的权限",
    conflict: "任务已被其他操作更新，请重新加载",
    scope: "发布主体、店铺或服务范围已变化，请重新选择",
    publicId: "店铺公开 ID 暂不可用，请联系平台处理",
    rateMismatch: "所选店铺的平台费率不一致，请调整店铺范围",
    wallet: "钱包可用 NDP 不足，无法提交任务",
    content: "任务内容尚未完整，请补齐后再保存",
    notEditable: "当前任务状态不可编辑",
    server: "联盟营销任务服务暂时不可用，请稍后重试",
    network: "联盟营销任务加载失败，请检查网络后重试"
  },
  "zh-Hant": {
    unauthorized: "登入狀態已失效，請重新登入",
    forbidden: "目前身分沒有管理聯盟行銷任務的權限",
    conflict: "任務已被其他操作更新，請重新載入",
    scope: "發布主體、店舖或服務範圍已變更，請重新選擇",
    publicId: "店舖公開 ID 暫不可用，請聯絡平台處理",
    rateMismatch: "所選店舖的平台費率不一致，請調整店舖範圍",
    wallet: "錢包可用 NDP 不足，無法提交任務",
    content: "任務內容尚未完整，請補齊後再儲存",
    notEditable: "目前任務狀態不可編輯",
    server: "聯盟行銷任務服務暫時不可用，請稍後重試",
    network: "聯盟行銷任務載入失敗，請檢查網路後重試"
  },
  ja: {
    unauthorized: "ログインの有効期限が切れました。再度ログインしてください",
    forbidden: "このアカウントにはアフィリエイトタスクを管理する権限がありません",
    conflict: "タスクが更新されています。再読み込みしてください",
    scope: "公開主体、店舗、またはサービス範囲が変更されました。再選択してください",
    publicId: "店舗公開 ID を利用できません。プラットフォームへお問い合わせください",
    rateMismatch: "選択した店舗の手数料率が一致しません。店舗範囲を調整してください",
    wallet: "ウォレットの利用可能 NDP が不足しています",
    content: "タスク内容をすべて入力してから保存してください",
    notEditable: "現在のステータスでは編集できません",
    server: "アフィリエイトタスクサービスは一時的に利用できません",
    network: "通信を確認して再度お試しください"
  },
  en: {
    unauthorized: "Your sign-in has expired. Please sign in again.",
    forbidden: "This identity does not have permission to manage Affiliate tasks.",
    conflict: "This task changed elsewhere. Reload before continuing.",
    scope: "The publisher, shop, or service scope changed. Select it again.",
    publicId: "A shop public ID is unavailable. Contact platform support.",
    rateMismatch: "Selected shops use different platform fee rates. Adjust the shop scope.",
    wallet: "The wallet does not have enough available NDP to submit this task.",
    content: "Complete the task content before saving.",
    notEditable: "This task cannot be edited in its current status.",
    server: "The Affiliate task service is temporarily unavailable.",
    network: "Affiliate tasks could not be loaded. Check the network and retry."
  },
  ko: {
    unauthorized: "로그인이 만료되었습니다. 다시 로그인해 주세요",
    forbidden: "현재 계정에는 제휴 작업 관리 권한이 없습니다",
    conflict: "작업이 다른 곳에서 변경되었습니다. 다시 불러와 주세요",
    scope: "게시 주체, 매장 또는 서비스 범위가 변경되었습니다. 다시 선택해 주세요",
    publicId: "매장 공개 ID를 사용할 수 없습니다. 플랫폼에 문의해 주세요",
    rateMismatch: "선택한 매장의 플랫폼 수수료율이 다릅니다. 매장 범위를 조정해 주세요",
    wallet: "작업 제출에 필요한 사용 가능 NDP가 부족합니다",
    content: "저장하기 전에 작업 내용을 완료해 주세요",
    notEditable: "현재 상태에서는 작업을 편집할 수 없습니다",
    server: "제휴 작업 서비스를 일시적으로 사용할 수 없습니다",
    network: "제휴 작업을 불러오지 못했습니다. 네트워크 확인 후 다시 시도해 주세요"
  }
};

export const describeMerchantAffiliateTaskError = (
  error: unknown,
  language: Language
): string => {
  const messages = localizedErrors[language];
  if (!(error instanceof ApiClientError)) return messages.network;
  if (error.status === 401) return messages.unauthorized;
  if (error.status === 403) return messages.forbidden;
  if (error.message === "error.affiliate.shop_public_id_unavailable") return messages.publicId;
  if (error.message === "error.affiliate.platform_fee_rate_mismatch") return messages.rateMismatch;
  if (error.message === "error.affiliate.publisher_scope_invalid") return messages.scope;
  if (error.message === "error.wallet.insufficient_available") return messages.wallet;
  if (error.message === "error.affiliate.content_missing") return messages.content;
  if (error.message === "error.affiliate.task_invalid_state") return messages.notEditable;
  if (error.status === 409) return messages.conflict;
  if (error.status >= 500) return messages.server;
  return messages.network;
};
