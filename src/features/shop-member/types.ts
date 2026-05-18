export type ShopMemberPermission =
  | "shop.member.view"
  | "shop.member.create"
  | "shop.member.update"
  | "shop.member.delete"
  | "shop.member.tag.manage"
  | "shop.member.card.template.manage"
  | "shop.member.card.issue"
  | "shop.member.card.topup"
  | "shop.member.card.consume"
  | "shop.member.card.refund.request"
  | "shop.member.card.refund.approve"
  | "shop.member.card.adjust"
  | "shop.member.card.freeze"
  | "shop.member.card.unfreeze"
  | "shop.member.coupon.issue"
  | "shop.member.analytics.view"
  | "shop.member.finance.view"
  | "shop.member.export"
  | "shop.member.operation_log.view";

export type ShopMemberRole = "owner" | "manager" | "staff" | "cast" | "accountant";
export type ShopMemberGender = "unknown" | "male" | "female" | "other";
export type ShopMemberLanguage = "ja" | "zh" | "en" | "ko" | "other";
export type ShopMemberSource =
  | "walk_in"
  | "staff_referral"
  | "member_referral"
  | "store_acquisition"
  | "platform"
  | "line"
  | "legacy_meiyi"
  | "other"
  | "unknown";
export type ShopMemberRiskStatus = "normal" | "watch" | "blacklisted";
export type ShopMemberLevelRule = "manual" | "total_spend" | "order_count" | "recent_order_count";
export type ShopMemberCardType = "stored_value" | "times" | "package" | "discount" | "benefit" | "trial" | "group";
export type ShopMemberCardTemplateStatus = "draft" | "active" | "disabled" | "archived";
export type ShopMemberCardStatus = "active" | "frozen" | "expired" | "used_up" | "refunding" | "refunded" | "cancelled";
export type ShopMemberPaymentMethod = "cash" | "card" | "stripe" | "offline_pos" | "bank_transfer" | "other" | "none";
export type ShopMemberConsumeOrder = "bonus_first" | "principal_first" | "manual";
export type ShopMemberLedgerType =
  | "OPEN_CARD"
  | "TOP_UP"
  | "BONUS_GRANT"
  | "CONSUME_PRINCIPAL"
  | "CONSUME_BONUS"
  | "CONSUME_TIMES"
  | "REFUND_REQUEST"
  | "REFUND_APPROVE"
  | "REFUND_REJECT"
  | "EXPIRE"
  | "ADJUST_ADD"
  | "ADJUST_DEDUCT"
  | "FREEZE"
  | "UNFREEZE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "CANCEL_CONSUME";
export type ShopMemberCouponType = "fixed_amount" | "percentage" | "free_service" | "upgrade";
export type ShopMemberCouponStatus = "unused" | "used" | "expired" | "cancelled";
export type ShopMemberAnalyticsDimension =
  | "gender"
  | "age"
  | "card_status"
  | "source"
  | "consume_count"
  | "recharge_count"
  | "card_count"
  | "total_spend";

export type ShopMemberAnalyticsChartType = "pie" | "bar";

export interface ShopMember {
  id: string;
  shopId: string;
  needoUserId?: string;
  name: string;
  nickname?: string;
  avatarUrl?: string;
  phoneEncrypted: string;
  phoneHash: string;
  lineId?: string;
  email?: string;
  birthday?: string;
  gender: ShopMemberGender;
  language: ShopMemberLanguage;
  source: ShopMemberSource;
  levelId?: string;
  tags: string[];
  notePrivate?: string;
  riskStatus: ShopMemberRiskStatus;
  firstVisitAt?: string;
  lastVisitAt?: string;
  totalOrders: number;
  totalSpend: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ShopMemberLevel {
  id: string;
  shopId: string;
  name: string;
  rank: number;
  upgradeRuleType: ShopMemberLevelRule;
  upgradeThreshold: number;
  benefits: string[];
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface ShopMemberCardTemplate {
  id: string;
  shopId: string;
  name: string;
  note?: string;
  cardType: ShopMemberCardType;
  price: number;
  principalAmount: number;
  bonusAmount: number;
  totalTimes: number;
  serviceScope: string[];
  validDays: number;
  refundRule: {
    refundablePrincipalOnly: boolean;
    feeRate: number;
  };
  consumeRule: {
    order: ShopMemberConsumeOrder;
    unitAmount?: number;
  };
  transferable: boolean;
  stackableWithCoupon: boolean;
  crossShopEnabled: boolean;
  status: ShopMemberCardTemplateStatus;
  issuedCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopMemberCard {
  id: string;
  shopId: string;
  memberId: string;
  templateId: string;
  cardNo: string;
  qrTokenHash: string;
  cardType: ShopMemberCardType;
  status: ShopMemberCardStatus;
  principalBalance: number;
  bonusBalance: number;
  remainingTimes: number;
  startAt: string;
  expireAt: string;
  issuedBy: string;
  issuedAt: string;
  lastUsedAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ShopMemberCardLedger {
  id: string;
  shopId: string;
  memberId: string;
  cardId: string;
  templateId?: string;
  orderId?: string;
  relatedLedgerId?: string;
  idempotencyKey?: string;
  type: ShopMemberLedgerType;
  amountDelta: number;
  timesDelta: number;
  principalBefore: number;
  principalAfter: number;
  bonusBefore: number;
  bonusAfter: number;
  timesBefore: number;
  timesAfter: number;
  paymentMethod: ShopMemberPaymentMethod;
  paymentRef?: string;
  operatorId: string;
  approvedBy?: string;
  reason: string;
  ip?: string;
  deviceId?: string;
  createdAt: string;
}

export interface ShopMemberCoupon {
  id: string;
  shopId: string;
  memberId?: string;
  batchId?: string;
  name: string;
  couponType: ShopMemberCouponType;
  amount: number;
  discountRate?: number;
  minSpend?: number;
  serviceScope: string[];
  startAt: string;
  expireAt: string;
  status: ShopMemberCouponStatus;
  usedOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopMemberOperationLog {
  id: string;
  shopId: string;
  operatorId: string;
  action: string;
  targetType: "member" | "card_template" | "member_card" | "coupon" | "export" | "ledger";
  targetId: string;
  before?: unknown;
  after?: unknown;
  reason: string;
  ip?: string;
  deviceId?: string;
  createdAt: string;
}

export interface ShopMemberActivity {
  id: string;
  shopId: string;
  memberId: string;
  title: string;
  detail: string;
  at: string;
  tone: "green" | "yellow" | "red" | "blue" | "neutral";
}

export interface ShopMemberReminder {
  id: string;
  shopId: string;
  title: string;
  detail: string;
  actionLabel: string;
  severity: "info" | "warning" | "danger";
  count: number;
}

export interface ShopMemberSnapshot {
  members: ShopMember[];
  levels: ShopMemberLevel[];
  templates: ShopMemberCardTemplate[];
  cards: ShopMemberCard[];
  ledgers: ShopMemberCardLedger[];
  coupons: ShopMemberCoupon[];
  operationLogs: ShopMemberOperationLog[];
  reminders: ShopMemberReminder[];
  activities: ShopMemberActivity[];
  revision: number;
}

export interface ShopMemberAnalyticsItem {
  key: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export interface ShopMemberAnalyticsResult {
  summary: {
    memberCount: number;
    avgTicket: number;
    totalSpend: number;
    paidOrderCount: number;
    cardUserCount: number;
  };
  dimension: ShopMemberAnalyticsDimension;
  chartType: ShopMemberAnalyticsChartType;
  total: number;
  items: ShopMemberAnalyticsItem[];
}

export interface ShopMemberListFilters {
  keyword?: string;
  levelId?: string;
  tag?: string;
  source?: ShopMemberSource | "all";
  hasCard?: boolean;
  riskStatus?: ShopMemberRiskStatus | "all";
  groupKey?: string;
  dimension?: ShopMemberAnalyticsDimension;
}
