import type { Language } from "../../i18n/translations";

export interface AffiliateAdminCopy {
  title: string;
  description: string;
  formalData: string;
  rbac: string;
  audit: string;
  total: string;
  pending: string;
  frozen: string;
  keyword: string;
  allStatuses: string;
  allPublishers: string;
  merchant: string;
  shop: string;
  search: string;
  loading: string;
  loadFailed: string;
  reload: string;
  empty: string;
  task: string;
  publisher: string;
  reward: string;
  budget: string;
  window: string;
  status: string;
  detail: string;
  previous: string;
  next: string;
  pageSummary: (total: number, page: number, totalPages: number) => string;
  drawerTitle: string;
  detailLoading: string;
  detailFailed: string;
  taskCode: string;
  taskWindow: string;
  claimWindow: string;
  discount: string;
  minimumOrder: string;
  attribution: string;
  limits: string;
  budgetLifecycle: string;
  reserved: string;
  allocated: string;
  settled: string;
  released: string;
  shops: string;
  services: string;
  noShops: string;
  noServices: string;
  review: string;
  reviewedBy: string;
  rejectionReason: string;
  notReviewed: string;
  approve: string;
  approveConfirm: string;
  reject: string;
  rejectReason: string;
  rejectPlaceholder: string;
  rejectConfirm: string;
  cancel: string;
  saveFailed: string;
  permissionDenied: string;
  sessionExpired: string;
  conflict: string;
}

const zh: AffiliateAdminCopy = {
  title: "联盟营销",
  description: "运营审核商家提交的联盟营销任务；列表、预算、范围快照、审核结果与账本变更均来自正式 API。",
  formalData: "正式数据库",
  rbac: "范围 RBAC",
  audit: "不可变审计",
  total: "任务总数",
  pending: "本页待审核",
  frozen: "本页冻结预算",
  keyword: "搜索任务名或任务编号",
  allStatuses: "全部状态",
  allPublishers: "全部发布主体",
  merchant: "商家账号",
  shop: "店铺",
  search: "查询",
  loading: "正在读取正式联盟营销任务...",
  loadFailed: "联盟营销任务加载失败",
  reload: "重新加载",
  empty: "当前没有符合条件的正式联盟营销任务",
  task: "任务",
  publisher: "发布主体",
  reward: "每单奖励",
  budget: "预算",
  window: "任务期间",
  status: "状态",
  detail: "查看详情",
  previous: "上一页",
  next: "下一页",
  pageSummary: (total, page, totalPages) => `服务器共 ${total} 条，第 ${page} / ${totalPages} 页`,
  drawerTitle: "联盟营销任务详情",
  detailLoading: "正在读取任务正式详情...",
  detailFailed: "任务详情读取失败",
  taskCode: "任务编号",
  taskWindow: "任务期间",
  claimWindow: "领取期间",
  discount: "客户优惠",
  minimumOrder: "最低订单金额",
  attribution: "归因窗口",
  limits: "完成订单上限",
  budgetLifecycle: "预算生命周期",
  reserved: "已冻结",
  allocated: "已分配",
  settled: "已结算",
  released: "已释放",
  shops: "店铺范围快照",
  services: "服务范围快照",
  noShops: "没有店铺范围快照",
  noServices: "适用当前全部服务，或暂无服务快照",
  review: "审核记录",
  reviewedBy: "审核人",
  rejectionReason: "驳回原因",
  notReviewed: "尚未审核",
  approve: "通过任务",
  approveConfirm: "再次点击确认通过；任务将进入排期或生效状态。",
  reject: "驳回任务",
  rejectReason: "驳回原因",
  rejectPlaceholder: "说明需要商家修正的内容（1–500 字）",
  rejectConfirm: "再次点击确认驳回；未使用预算将由服务端事务完整解冻。",
  cancel: "取消",
  saveFailed: "审核操作失败，请重新读取后再试",
  permissionDenied: "当前身份没有联盟营销任务审核权限",
  sessionExpired: "登录状态已失效，请重新登录",
  conflict: "任务状态或预算已经变化，请重新加载"
};

const ja: AffiliateAdminCopy = {
  ...zh,
  title: "アフィリエイト",
  description: "加盟店が申請したアフィリエイトタスクを審査します。リスト、予算、対象スナップショット、審査結果、台帳更新は正式 API から取得します。",
  formalData: "正式データベース",
  rbac: "スコープ RBAC",
  audit: "監査ログ",
  total: "タスク総数",
  pending: "このページの審査待ち",
  frozen: "このページの凍結予算",
  keyword: "タスク名またはコードを検索",
  allStatuses: "すべてのステータス",
  allPublishers: "すべての発行者",
  merchant: "加盟店アカウント",
  shop: "店舗",
  search: "検索",
  loading: "正式なアフィリエイトタスクを読み込み中...",
  loadFailed: "アフィリエイトタスクを読み込めませんでした",
  reload: "再読み込み",
  empty: "条件に一致する正式なアフィリエイトタスクはありません",
  task: "タスク",
  publisher: "発行者",
  reward: "完了 1 件あたりの報酬",
  budget: "予算",
  window: "実施期間",
  status: "ステータス",
  detail: "詳細を見る",
  previous: "前へ",
  next: "次へ",
  pageSummary: (total, page, totalPages) => `全 ${total} 件、${page} / ${totalPages} ページ`,
  drawerTitle: "アフィリエイトタスク詳細",
  detailLoading: "正式なタスク詳細を読み込み中...",
  detailFailed: "タスク詳細を読み込めませんでした",
  taskCode: "タスクコード",
  taskWindow: "実施期間",
  claimWindow: "申請期間",
  discount: "顧客割引",
  minimumOrder: "最低注文金額",
  attribution: "アトリビューション期間",
  limits: "完了件数上限",
  budgetLifecycle: "予算の状態",
  reserved: "凍結済み",
  allocated: "割当済み",
  settled: "精算済み",
  released: "解放済み",
  shops: "店舗範囲スナップショット",
  services: "サービス範囲スナップショット",
  noShops: "店舗範囲スナップショットはありません",
  noServices: "現在の全サービスが対象、またはサービススナップショットがありません",
  review: "審査記録",
  reviewedBy: "審査担当者",
  rejectionReason: "却下理由",
  notReviewed: "未審査",
  approve: "承認する",
  approveConfirm: "もう一度クリックして承認します。タスクは予定または有効状態になります。",
  reject: "却下する",
  rejectReason: "却下理由",
  rejectPlaceholder: "修正が必要な内容を入力してください（1〜500 文字）",
  rejectConfirm: "もう一度クリックして却下します。未使用予算はサーバー側の取引で全額解放されます。",
  cancel: "キャンセル",
  saveFailed: "審査操作に失敗しました。再読み込みしてお試しください",
  permissionDenied: "このアカウントにはアフィリエイト審査権限がありません",
  sessionExpired: "ログインの有効期限が切れました。再度ログインしてください",
  conflict: "タスクまたは予算の状態が変更されました。再読み込みしてください"
};

const en: AffiliateAdminCopy = {
  ...zh,
  title: "Affiliate",
  description: "Review affiliate tasks submitted by merchants. Lists, budgets, scope snapshots, review results, and ledger changes come from the production API.",
  formalData: "Production database",
  rbac: "Scoped RBAC",
  audit: "Immutable audit",
  total: "Total tasks",
  pending: "Pending on this page",
  frozen: "Frozen budget on this page",
  keyword: "Search task name or code",
  allStatuses: "All statuses",
  allPublishers: "All publishers",
  merchant: "Merchant account",
  shop: "Shop",
  search: "Search",
  loading: "Loading production affiliate tasks...",
  loadFailed: "Couldn't load affiliate tasks",
  reload: "Reload",
  empty: "No production affiliate tasks match these filters",
  task: "Task",
  publisher: "Publisher",
  reward: "Reward per completed order",
  budget: "Budget",
  window: "Task window",
  status: "Status",
  detail: "View details",
  previous: "Previous",
  next: "Next",
  pageSummary: (total, page, totalPages) => `${total} server records · page ${page} of ${totalPages}`,
  drawerTitle: "Affiliate task details",
  detailLoading: "Loading production task details...",
  detailFailed: "Couldn't load task details",
  taskCode: "Task code",
  taskWindow: "Task window",
  claimWindow: "Claim window",
  discount: "Customer discount",
  minimumOrder: "Minimum order",
  attribution: "Attribution window",
  limits: "Completed-order limits",
  budgetLifecycle: "Budget lifecycle",
  reserved: "Frozen",
  allocated: "Allocated",
  settled: "Settled",
  released: "Released",
  shops: "Shop scope snapshot",
  services: "Service scope snapshot",
  noShops: "No shop scope snapshot",
  noServices: "All current services apply, or no service snapshot is available",
  review: "Review record",
  reviewedBy: "Reviewed by",
  rejectionReason: "Rejection reason",
  notReviewed: "Not reviewed",
  approve: "Approve task",
  approveConfirm: "Click again to approve. The task will become scheduled or active.",
  reject: "Reject task",
  rejectReason: "Rejection reason",
  rejectPlaceholder: "Describe what the merchant must correct (1–500 characters)",
  rejectConfirm: "Click again to reject. The server transaction will release the complete unused budget.",
  cancel: "Cancel",
  saveFailed: "Review failed. Reload the task and try again",
  permissionDenied: "This account cannot review affiliate tasks",
  sessionExpired: "Your session expired. Please sign in again",
  conflict: "The task or budget changed. Reload before reviewing"
};

export function getAffiliateAdminCopy(language: Language): AffiliateAdminCopy {
  if (language === "ja") return ja;
  if (language === "en" || language === "ko") return en;
  return language === "zh-Hant" ? { ...zh, title: "聯盟行銷" } : zh;
}

export function affiliateTaskStatusLabel(status: string, language: Language) {
  const labels: Record<string, [string, string, string]> = {
    draft: ["草稿", "下書き", "Draft"],
    pending_review: ["待审核", "審査待ち", "Pending review"],
    scheduled: ["已排期", "予定", "Scheduled"],
    active: ["进行中", "有効", "Active"],
    paused: ["已暂停", "一時停止", "Paused"],
    budget_exhausted: ["预算耗尽", "予算消化済み", "Budget exhausted"],
    ended: ["已结束", "終了", "Ended"],
    cancelled: ["已取消", "キャンセル済み", "Cancelled"],
    rejected: ["已驳回", "却下", "Rejected"]
  };
  const item = labels[status] ?? [status, status, status];
  if (language === "ja") return item[1];
  if (language === "en" || language === "ko") return item[2];
  return item[0];
}
