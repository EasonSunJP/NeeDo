export type BusinessCpsRole = "creator" | "merchant" | "bd" | "agent" | "platform";

export type BusinessCpsCampaignStatus =
  | "draft"
  | "reviewing"
  | "scheduled"
  | "active"
  | "paused"
  | "budget_exhausted"
  | "risk_paused"
  | "ended"
  | "archived";

export type BusinessCpsCampaignType =
  | "user_acquisition"
  | "merchant_recruit"
  | "technician_recruit"
  | "membership"
  | "merchant_self";

export type CommissionModel = "CPA" | "CPS" | "CPL" | "CPR" | "NDP" | "tiered" | "hybrid" | "assist";

export type CommissionStatus =
  | "estimated"
  | "pending"
  | "locked"
  | "withdrawable"
  | "withdrawing"
  | "paid"
  | "risk_frozen"
  | "cancelled"
  | "clawed_back";

export type MerchantLeadStatus =
  | "lead"
  | "contacted"
  | "docs_submitted"
  | "onboarded"
  | "first_order"
  | "saas_purchased";

export type RiskSeverity = "low" | "medium" | "high";
export type BusinessCpsCarrierStatus = "active" | "paused" | "expired" | "discarded" | "risk_frozen";
export type BusinessCpsBudgetMode = "inherit_parent" | "independent";
export type BusinessCpsCommissionBasis = "net_revenue" | "order_amount" | "gross_margin" | "fixed_reward";
export type BusinessCpsSettlementBatchStatus = "draft" | "reviewing" | "approved" | "paid" | "rejected";
export type BusinessCpsCommissionConditionRuleStatus = "draft" | "active" | "paused" | "archived";
export type BusinessCpsServiceRuleStatus = "active" | "draft" | "paused";
export type BusinessCpsTrackingEventType =
  | "impression"
  | "click"
  | "scan"
  | "landing_view"
  | "register"
  | "ekyc_submit"
  | "ekyc_complete"
  | "shop_apply"
  | "shop_approved"
  | "cast_apply"
  | "cast_approved"
  | "first_order"
  | "order_complete"
  | "payment"
  | "membership_purchase"
  | "boost_spend"
  | "refund"
  | "commission_created"
  | "commission_frozen"
  | "commission_cancelled"
  | "commission_settled";

export interface BusinessCpsRuleTemplate {
  id: string;
  model: CommissionModel;
  scene: string;
  trigger: string;
  rewardTarget: string;
  releaseCondition: string;
  settlementDelayDays: number;
  rate?: number;
  fixedAmount?: number;
  ndpAmount?: number;
  capAmount?: number;
}

export interface BusinessCpsAttributionConfig {
  carrier: string;
  usage: string;
  priority: number;
  windowDays: number;
  requiresAuditLog: boolean;
}

export interface BusinessCpsCampaign {
  id: string;
  name: string;
  type: BusinessCpsCampaignType;
  sponsor: "platform" | "merchant" | "joint";
  status: BusinessCpsCampaignStatus;
  region: string;
  category: string;
  period: string;
  target: string;
  participants: string;
  ruleTemplateIds: string[];
  commissionSummary: string;
  userBenefit: string;
  budgetTotal: number;
  budgetUsed: number;
  dailyCap: number;
  attributionWindowDays: number;
  riskRules: string[];
  complianceNotes: string[];
  materialIds: string[];
  version: string;
  clicks: number;
  registrations: number;
  firstOrders: number;
  attributedOrders: number;
  gmv: number;
  commissionCost: number;
  roi: number;
  requestRatio: number;
}

export interface BusinessCpsPromoter {
  id: string;
  name: string;
  role: BusinessCpsRole;
  roleLabel: string;
  identity: string;
  region: string;
  inviteCode: string;
  primaryChannel: string;
  monthIncome: number;
  withdrawable: number;
  frozen: number;
  clicksToday: number;
  registrationsToday: number;
  firstOrdersToday: number;
  commissionToday: number;
  riskScore: number;
  status: "active" | "reviewing" | "restricted";
}

export interface BusinessCpsPromoterPermission {
  promoterId: string;
  canCreateLink: boolean;
  canCreateCode: boolean;
  canCreateQr: boolean;
  canCreateSubPromoter: boolean;
  canViewSubData: boolean;
  canViewCommission: boolean;
  canWithdraw: boolean;
  canUploadMaterial: boolean;
}

export interface BusinessCpsCommissionTierRequirements {
  registrations: number;
  activeShops: number;
  activeShopWeeklyOrders: number;
  firstOrders: number;
  paymentGmv: number;
}

export interface BusinessCpsCommissionTierRule {
  id: string;
  name: string;
  level: number;
  commissionRate: number;
  requirements: BusinessCpsCommissionTierRequirements;
}

export interface BusinessCpsPreferentialCondition {
  enabled: boolean;
  validFrom: string;
  validTo: string;
  baseCommissionRate: number;
  extraCommissionRate: number;
  note: string;
}

export interface BusinessCpsDowngradeCondition {
  enabled: boolean;
  missedCycleCount: number;
  fallbackTierLevel: number;
  note: string;
}

export interface BusinessCpsLevelPromotionCondition {
  enabled: boolean;
  consecutiveCycles: number;
  requiredTierLevel: number;
  targetLevel: number;
  note: string;
}

export interface BusinessCpsPromoterTeamNode {
  id: string;
  promoterId: string;
  parentPromoterId: string | null;
  campaignId: string;
  level: number;
  teamSize: number;
  directChildren: number;
  budgetMode: BusinessCpsBudgetMode;
  budgetTotal: number;
  budgetUsed: number;
  targetRegisters: number;
  targetActiveShops: number;
  targetFirstOrders: number;
  targetPaymentGmv: number;
  completedRegisters: number;
  completedActiveShops: number;
  completedFirstOrders: number;
  completedPaymentGmv: number;
  commissionConditionRuleId: string | null;
  commissionRate: number;
  commissionBasis: BusinessCpsCommissionBasis;
  commissionTiers: BusinessCpsCommissionTierRule[];
  preferentialCondition: BusinessCpsPreferentialCondition;
  downgradeCondition: BusinessCpsDowngradeCondition;
  promotionCondition: BusinessCpsLevelPromotionCondition;
  releaseCondition: string;
  riskCondition: string;
  settlementDelayDays: number;
  validFrom: string;
  validTo: string;
  riskLevel: RiskSeverity;
}

export interface BusinessCpsServiceRule {
  id: string;
  name: string;
  activeShopWeeklyOrders: number;
  validFrom: string;
  validTo: string;
  status: BusinessCpsServiceRuleStatus;
  description: string;
}

export interface BusinessCpsCommissionConditionRule {
  id: string;
  name: string;
  status: BusinessCpsCommissionConditionRuleStatus;
  appliesToLevel: number;
  commissionBasis: BusinessCpsCommissionBasis;
  settlementDelayDays: number;
  validFrom: string;
  validTo: string;
  releaseCondition: string;
  riskCondition: string;
  commissionTiers: BusinessCpsCommissionTierRule[];
  preferentialCondition: BusinessCpsPreferentialCondition;
  downgradeCondition: BusinessCpsDowngradeCondition;
  promotionCondition: BusinessCpsLevelPromotionCondition;
}

export interface BusinessCpsMaterial {
  id: string;
  campaignId: string;
  type: "shop_poster" | "technician_card" | "line_copy" | "x_copy" | "short_video_script" | "field_qr";
  title: string;
  scene: string;
  requiredFields: string[];
  prRequired: boolean;
  status: "approved" | "reviewing" | "rejected";
  channelId?: string;
  language?: string;
  usageCount?: number;
  clicks?: number;
  scans?: number;
  registrations?: number;
  firstOrders?: number;
  gmv?: number;
  commission?: number;
  roi?: number;
  anomalyRate?: number;
}

export interface BusinessCpsChannel {
  id: string;
  name: string;
  code: string;
  type: "sns" | "private" | "offline" | "owned" | "partner";
  status: "active" | "paused";
  description: string;
  clicks: number;
  scans: number;
  registrations: number;
  firstOrders: number;
  orders: number;
  gmv: number;
  commission: number;
  roi: number;
  anomalyRate: number;
}

export interface BusinessCpsPromotionLink {
  id: string;
  name: string;
  shortUrl: string;
  campaignId: string;
  promoterId: string;
  parentPromoterId?: string;
  materialId: string;
  channelId: string;
  landingType: "app_register" | "shop_apply" | "cast_apply" | "booking" | "membership";
  landingUrl: string;
  status: BusinessCpsCarrierStatus;
  allowCommission: boolean;
  validTo: string;
  clicks: number;
  registrations: number;
  firstOrders: number;
  orders: number;
  gmv: number;
  commission: number;
  riskEvents: number;
  createdAt: string;
  signature: string;
}

export interface BusinessCpsPromotionCode {
  id: string;
  code: string;
  campaignId: string;
  promoterId: string;
  purpose: "register" | "shop_apply" | "cast_apply" | "order_manual" | "support_bind";
  status: BusinessCpsCarrierStatus;
  validTo: string;
  usedCount: number;
  registrations: number;
  firstOrders: number;
  orders: number;
  gmv: number;
  commission: number;
  riskEvents: number;
}

export interface BusinessCpsQrCode {
  id: string;
  linkId: string;
  campaignId: string;
  promoterId: string;
  styleType: "plain" | "needo_logo" | "user_invite" | "cast_recruit" | "shop_apply" | "shop_poster";
  qrUrl: string;
  status: BusinessCpsCarrierStatus;
  scans: number;
  registrations: number;
  ekycCompletions: number;
  firstOrders: number;
  orders: number;
  gmv: number;
  commission: number;
  abnormalScans: number;
}

export interface BusinessCpsAttributionRecord {
  id: string;
  campaignId: string;
  sourcePath: string;
  subject: string;
  subjectType: "user" | "merchant" | "technician" | "membership";
  carrier: string;
  clickAt: string;
  conversionAt: string;
  orderId: string;
  orderType: "Booking" | "Request" | "SaaS" | "Membership" | "Lead";
  orderAmount: number;
  netRevenue: number;
  primaryPromoterId: string;
  assistPromoterIds: string[];
  commissionRecordId: string;
  evidence: string[];
  status: "tracking" | "confirmed" | "risk_hold" | "settled";
}

export interface BusinessCpsTrackingEvent {
  id: string;
  eventType: BusinessCpsTrackingEventType;
  campaignId: string;
  promoterId: string;
  parentPromoterId?: string;
  linkId?: string;
  codeId?: string;
  qrId?: string;
  materialId?: string;
  channelId?: string;
  subjectId: string;
  subjectType: "user" | "merchant" | "technician" | "order" | "wallet";
  orderId?: string;
  deviceId: string;
  ip: string;
  region: string;
  userAgent: string;
  referrer: string;
  landingUrl: string;
  riskScore: number;
  createdAt: string;
}

export interface BusinessCpsCommissionRecord {
  id: string;
  campaignId: string;
  promoterId: string;
  sourceOrder: string;
  model: CommissionModel;
  baseAmount: number;
  commissionAmount: number;
  ndpCouponAmount: number;
  status: CommissionStatus;
  expectedSettlementDate: string;
  riskReason?: string;
}

export interface BusinessCpsMerchantLead {
  id: string;
  storeName: string;
  region: string;
  category: string;
  contact: string;
  source: string;
  owner: string;
  status: MerchantLeadStatus;
  nextFollowUpAt: string;
  ekycStatus: "not_started" | "submitted" | "approved";
  estimatedCommission: number;
  saasPlan?: string;
}

export interface BusinessCpsRiskEvent {
  id: string;
  type: string;
  severity: RiskSeverity;
  subject: string;
  example: string;
  systemAction: string;
  amountFrozen: number;
  owner: string;
  status: "new" | "reviewing" | "released" | "rejected";
}

export interface BusinessCpsRiskRule {
  id: string;
  name: string;
  code: string;
  targetType: "promoter" | "user" | "order" | "link" | "material" | "team";
  condition: string;
  score: number;
  action: string;
  enabled: boolean;
}

export interface BusinessCpsWalletLedger {
  id: string;
  wallet: string;
  purpose: string;
  balance: number;
  frozen: number;
  inflow: number;
  outflow: number;
}

export interface BusinessCpsSettlementBatch {
  id: string;
  cycle: string;
  promoterId: string;
  campaignId: string;
  commissionIds: string[];
  grossAmount: number;
  frozenAmount: number;
  payableAmount: number;
  adjustmentAmount: number;
  status: BusinessCpsSettlementBatchStatus;
  reviewer: string;
  payoutMethod: "bank" | "ndp_wallet" | "manual";
  exportedAt?: string;
}

export interface BusinessCpsAdjustment {
  id: string;
  commissionId: string;
  promoterId: string;
  type: "refund_clawback" | "risk_cancel" | "manual_bonus" | "manual_deduction";
  amount: number;
  reason: string;
  operator: string;
  createdAt: string;
}

export interface BusinessCpsAuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  targetType: "campaign" | "promoter" | "link" | "code" | "qr" | "material" | "rule" | "commission" | "settlement" | "risk";
  reason: string;
  beforeValue?: string;
  afterValue?: string;
  ip: string;
  createdAt: string;
}

export const campaignTypeLabels: Record<BusinessCpsCampaignType, string> = {
  user_acquisition: "用户拉新",
  merchant_recruit: "商户招商",
  technician_recruit: "技师招募",
  membership: "会员推广",
  merchant_self: "商户自营"
};

export const sponsorLabels: Record<BusinessCpsCampaign["sponsor"], string> = {
  platform: "本平台",
  merchant: "商户",
  joint: "本平台+商户联合"
};

export const commissionBasisLabels: Record<BusinessCpsCommissionBasis, string> = {
  net_revenue: "按净收入",
  order_amount: "按订单金额",
  gross_margin: "按毛利",
  fixed_reward: "固定奖励"
};

export const businessCpsMaxCommissionTierCount = 15;

export const businessCpsTierRequirementLabels: Record<keyof BusinessCpsCommissionTierRequirements, string> = {
  registrations: "目标注册人数",
  activeShops: "店铺活跃数",
  activeShopWeeklyOrders: "单店每周订单",
  firstOrders: "用户首单量",
  paymentGmv: "流水额度"
};

export const businessCpsDefaultServiceRules: BusinessCpsServiceRule[] = [
  {
    id: "service-rule-active-shop-weekly-orders",
    name: "店铺活跃数判定",
    activeShopWeeklyOrders: 5,
    validFrom: "2026-05-01",
    validTo: "2026-12-31",
    status: "active",
    description: "店铺在 1 周内完成 5 单及以上，计入 Afirieito 阶梯分成的店铺活跃数。"
  }
];

export function createBusinessCpsDefaultPreferentialCondition(rate: number): BusinessCpsPreferentialCondition {
  return {
    enabled: false,
    validFrom: "2026-05-01",
    validTo: "2026-05-31",
    baseCommissionRate: rate,
    extraCommissionRate: 0,
    note: "指定日期内达到起始分成比例后，可在阶梯比例基础上增加优待比例。"
  };
}

export function createBusinessCpsDefaultDowngradeCondition(): BusinessCpsDowngradeCondition {
  return {
    enabled: true,
    missedCycleCount: 1,
    fallbackTierLevel: 1,
    note: "结算周期内未达成当前阶梯条件时，自动降到下一可结算阶梯。"
  };
}

export function createBusinessCpsDefaultPromotionCondition(): BusinessCpsLevelPromotionCondition {
  return {
    enabled: false,
    consecutiveCycles: 3,
    requiredTierLevel: 3,
    targetLevel: 1,
    note: "连续多个周期达到指定阶梯后，可升级为 1 级账号。"
  };
}

export function createBusinessCpsDefaultCommissionTiers(input: {
  nodeId: string;
  commissionRate: number;
  targetRegisters: number;
  targetActiveShops?: number;
  targetFirstOrders: number;
  targetPaymentGmv?: number;
  activeShopWeeklyOrders?: number;
}): BusinessCpsCommissionTierRule[] {
  const weeklyOrders = Math.max(0, input.activeShopWeeklyOrders ?? businessCpsDefaultServiceRules[0].activeShopWeeklyOrders);
  const baseRequirements: BusinessCpsCommissionTierRequirements = {
    registrations: Math.max(0, input.targetRegisters),
    activeShops: Math.max(0, input.targetActiveShops ?? 0),
    activeShopWeeklyOrders: weeklyOrders,
    firstOrders: Math.max(0, input.targetFirstOrders),
    paymentGmv: Math.max(0, input.targetPaymentGmv ?? 0)
  };

  return [
    {
      id: `${input.nodeId}-tier-1`,
      name: "阶梯 1",
      level: 1,
      commissionRate: input.commissionRate,
      requirements: baseRequirements
    },
    {
      id: `${input.nodeId}-tier-2`,
      name: "阶梯 2",
      level: 2,
      commissionRate: Math.min(100, input.commissionRate + 2),
      requirements: {
        registrations: Math.ceil(baseRequirements.registrations * 1.35),
        activeShops: Math.ceil(baseRequirements.activeShops * 1.3),
        activeShopWeeklyOrders: weeklyOrders,
        firstOrders: Math.ceil(baseRequirements.firstOrders * 1.35),
        paymentGmv: Math.ceil(baseRequirements.paymentGmv * 1.35)
      }
    },
    {
      id: `${input.nodeId}-tier-3`,
      name: "阶梯 3",
      level: 3,
      commissionRate: Math.min(100, input.commissionRate + 4),
      requirements: {
        registrations: Math.ceil(baseRequirements.registrations * 1.7),
        activeShops: Math.ceil(baseRequirements.activeShops * 1.6),
        activeShopWeeklyOrders: weeklyOrders,
        firstOrders: Math.ceil(baseRequirements.firstOrders * 1.7),
        paymentGmv: Math.ceil(baseRequirements.paymentGmv * 1.7)
      }
    }
  ];
}

export const businessCpsCommissionConditionRules: BusinessCpsCommissionConditionRule[] = [
  {
    id: "condition-level-1-growth-standard",
    name: "1级全局阶梯条件：标准增长",
    status: "active",
    appliesToLevel: 1,
    commissionBasis: "net_revenue",
    settlementDelayDays: 7,
    validFrom: "2026-05-01",
    validTo: "2026-06-30",
    releaseCondition: "归因订单完成支付且 7 天内无退款后释放",
    riskCondition: "同设备、同电话、异常 LBS 或重复支付命中后冻结",
    commissionTiers: [
      {
        id: "condition-level-1-growth-standard-tier-1",
        name: "阶梯 1",
        level: 1,
        commissionRate: 8,
        requirements: {
          registrations: 180,
          activeShops: 8,
          activeShopWeeklyOrders: businessCpsDefaultServiceRules[0].activeShopWeeklyOrders,
          firstOrders: 40,
          paymentGmv: 1800000
        }
      },
      {
        id: "condition-level-1-growth-standard-tier-2",
        name: "阶梯 2",
        level: 2,
        commissionRate: 10,
        requirements: {
          registrations: 260,
          activeShops: 12,
          activeShopWeeklyOrders: businessCpsDefaultServiceRules[0].activeShopWeeklyOrders,
          firstOrders: 58,
          paymentGmv: 2600000
        }
      },
      {
        id: "condition-level-1-growth-standard-tier-3",
        name: "阶梯 3",
        level: 3,
        commissionRate: 12,
        requirements: {
          registrations: 360,
          activeShops: 18,
          activeShopWeeklyOrders: businessCpsDefaultServiceRules[0].activeShopWeeklyOrders,
          firstOrders: 82,
          paymentGmv: 3600000
        }
      }
    ],
    preferentialCondition: {
      enabled: true,
      validFrom: "2026-05-20",
      validTo: "2026-06-20",
      baseCommissionRate: 10,
      extraCommissionRate: 1.5,
      note: "活动期内达到 10% 起始分成后，在已完成阶梯比例上追加 1.5%。"
    },
    downgradeCondition: createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: createBusinessCpsDefaultPromotionCondition()
  },
  {
    id: "condition-level-1-merchant-boost",
    name: "1级全局阶梯条件：店铺活跃优先",
    status: "draft",
    appliesToLevel: 1,
    commissionBasis: "gross_margin",
    settlementDelayDays: 10,
    validFrom: "2026-06-01",
    validTo: "2026-07-31",
    releaseCondition: "店铺支付完成、周活跃订单达标且售后期结束后释放",
    riskCondition: "异常取消、虚假订单、同 IP 批量注册或支付异常冻结",
    commissionTiers: [
      {
        id: "condition-level-1-merchant-boost-tier-1",
        name: "阶梯 1",
        level: 1,
        commissionRate: 9,
        requirements: {
          registrations: 120,
          activeShops: 10,
          activeShopWeeklyOrders: 6,
          firstOrders: 36,
          paymentGmv: 1600000
        }
      },
      {
        id: "condition-level-1-merchant-boost-tier-2",
        name: "阶梯 2",
        level: 2,
        commissionRate: 11,
        requirements: {
          registrations: 180,
          activeShops: 16,
          activeShopWeeklyOrders: 6,
          firstOrders: 52,
          paymentGmv: 2400000
        }
      }
    ],
    preferentialCondition: createBusinessCpsDefaultPreferentialCondition(9),
    downgradeCondition: createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: {
      ...createBusinessCpsDefaultPromotionCondition(),
      enabled: true,
      consecutiveCycles: 2,
      requiredTierLevel: 2
    }
  }
];

function clampRequirement(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

export function normalizeBusinessCpsCommissionTiers(
  node: Pick<
    BusinessCpsPromoterTeamNode,
    "id" | "commissionRate" | "targetRegisters" | "targetActiveShops" | "targetFirstOrders" | "targetPaymentGmv" | "commissionTiers"
  >
): BusinessCpsCommissionTierRule[] {
  const fallback = createBusinessCpsDefaultCommissionTiers({
    nodeId: node.id,
    commissionRate: node.commissionRate,
    targetRegisters: node.targetRegisters,
    targetActiveShops: node.targetActiveShops,
    targetFirstOrders: node.targetFirstOrders,
    targetPaymentGmv: node.targetPaymentGmv
  });
  const rawTiers = Array.isArray(node.commissionTiers) && node.commissionTiers.length > 0 ? node.commissionTiers : fallback;

  return rawTiers
    .slice(0, businessCpsMaxCommissionTierCount)
    .map((tier, index) => ({
      id: tier.id || `${node.id}-tier-${index + 1}`,
      name: tier.name || `阶梯 ${index + 1}`,
      level: Math.max(1, Math.floor(Number(tier.level) || index + 1)),
      commissionRate: Math.min(100, Math.max(0, Number(tier.commissionRate) || 0)),
      requirements: {
        registrations: clampRequirement(tier.requirements?.registrations ?? 0),
        activeShops: clampRequirement(tier.requirements?.activeShops ?? 0),
        activeShopWeeklyOrders: clampRequirement(tier.requirements?.activeShopWeeklyOrders ?? businessCpsDefaultServiceRules[0].activeShopWeeklyOrders),
        firstOrders: clampRequirement(tier.requirements?.firstOrders ?? 0),
        paymentGmv: clampRequirement(tier.requirements?.paymentGmv ?? 0)
      }
    }))
    .sort((a, b) => a.level - b.level);
}

export function getActiveBusinessCpsLevelOneCommissionConditionRule(
  rules: BusinessCpsCommissionConditionRule[] = businessCpsCommissionConditionRules
) {
  return rules.find((rule) => rule.appliesToLevel === 1 && rule.status === "active") ?? rules.find((rule) => rule.appliesToLevel === 1) ?? null;
}

export function getBusinessCpsTeamNodeCommissionProfile(
  node: BusinessCpsPromoterTeamNode,
  rules: BusinessCpsCommissionConditionRule[] = businessCpsCommissionConditionRules
) {
  const attachedRule = node.commissionConditionRuleId ? rules.find((rule) => rule.id === node.commissionConditionRuleId) ?? null : null;
  const levelOneRule = node.level === 1 ? getActiveBusinessCpsLevelOneCommissionConditionRule(rules) : null;
  const rule = levelOneRule ?? attachedRule;

  if (!rule) {
    return {
      source: "node" as const,
      name: "账号单独分成条件",
      commissionBasis: node.commissionBasis,
      settlementDelayDays: node.settlementDelayDays,
      releaseCondition: node.releaseCondition,
      riskCondition: node.riskCondition,
      commissionTiers: normalizeBusinessCpsCommissionTiers(node),
      preferentialCondition: node.preferentialCondition,
      downgradeCondition: node.downgradeCondition,
      promotionCondition: node.promotionCondition
    };
  }

  return {
    source: "rule" as const,
    rule,
    name: rule.name,
    commissionBasis: rule.commissionBasis,
    settlementDelayDays: rule.settlementDelayDays,
    releaseCondition: rule.releaseCondition,
    riskCondition: rule.riskCondition,
    commissionTiers: normalizeBusinessCpsCommissionTiers({
      ...node,
      commissionRate: rule.commissionTiers[0]?.commissionRate ?? node.commissionRate,
      commissionTiers: rule.commissionTiers
    }),
    preferentialCondition: rule.preferentialCondition,
    downgradeCondition: rule.downgradeCondition,
    promotionCondition: rule.promotionCondition
  };
}

export function getBusinessCpsTierConditionSnapshot(
  node: BusinessCpsPromoterTeamNode,
  rules: BusinessCpsCommissionConditionRule[] = businessCpsCommissionConditionRules
) {
  const profile = getBusinessCpsTeamNodeCommissionProfile(node, rules);
  const tiers = profile.commissionTiers;
  const metrics: Omit<BusinessCpsCommissionTierRequirements, "activeShopWeeklyOrders"> = {
    registrations: node.completedRegisters,
    activeShops: node.completedActiveShops,
    firstOrders: node.completedFirstOrders,
    paymentGmv: node.completedPaymentGmv
  };
  const getTierProgress = (tier: BusinessCpsCommissionTierRule) => {
    const ratios = [
      tier.requirements.registrations > 0 ? metrics.registrations / tier.requirements.registrations : null,
      tier.requirements.activeShops > 0 ? metrics.activeShops / tier.requirements.activeShops : null,
      tier.requirements.firstOrders > 0 ? metrics.firstOrders / tier.requirements.firstOrders : null,
      tier.requirements.paymentGmv > 0 ? metrics.paymentGmv / tier.requirements.paymentGmv : null
    ].filter((ratio): ratio is number => ratio !== null);

    if (ratios.length === 0) {
      return 100;
    }

    return Math.round(Math.min(1, Math.min(...ratios)) * 100);
  };
  const completedTiers = tiers.filter((tier) => getTierProgress(tier) >= 100);
  const currentTier = tiers.find((tier) => getTierProgress(tier) < 100) ?? tiers[tiers.length - 1];
  const settledTier = completedTiers[completedTiers.length - 1] ?? null;
  const previousTierIndex = currentTier ? Math.max(0, tiers.findIndex((tier) => tier.id === currentTier.id) - 1) : -1;
  const fallbackTier = settledTier ?? (previousTierIndex >= 0 ? tiers[previousTierIndex] : null);
  const progress = currentTier ? getTierProgress(currentTier) : 0;

  return {
    tiers,
    currentTier,
    settledTier: fallbackTier,
    completedTiers,
    progress,
    metrics,
    profile
  };
}

export const campaignStatusLabels: Record<BusinessCpsCampaignStatus, string> = {
  draft: "草稿",
  reviewing: "审核中",
  scheduled: "待开始",
  active: "进行中",
  paused: "暂停中",
  budget_exhausted: "预算耗尽",
  risk_paused: "风控暂停",
  ended: "已终止",
  archived: "已归档"
};

export const campaignStatusActions: Record<BusinessCpsCampaignStatus, string[]> = {
  draft: ["编辑", "删除", "预览"],
  reviewing: ["撤回", "查看"],
  scheduled: ["提前开始", "编辑", "复制"],
  active: ["暂停", "复制", "查看数据"],
  paused: ["恢复", "复制", "终止"],
  budget_exhausted: ["充值预算", "复制"],
  risk_paused: ["查看风险", "人工复核"],
  ended: ["复制新建", "查看历史"],
  archived: ["只读查看", "复制新建"]
};

export const carrierStatusLabels: Record<BusinessCpsCarrierStatus, string> = {
  active: "启用",
  paused: "暂停",
  expired: "过期",
  discarded: "作废",
  risk_frozen: "风控冻结"
};

export const commissionStatusLabels: Record<CommissionStatus, string> = {
  estimated: "预估佣金",
  pending: "待确认",
  locked: "已锁定",
  withdrawable: "可提现",
  withdrawing: "提现中",
  paid: "已支付",
  risk_frozen: "风控冻结",
  cancelled: "已取消",
  clawed_back: "已追回"
};

export const commissionStatusDescriptions: Record<CommissionStatus, string> = {
  estimated: "转化已产生但尚未确认",
  pending: "订单完成但仍在退款或投诉期",
  locked: "已确认但未到结算日",
  withdrawable: "可申请提现到银行或转入 NDP 钱包",
  withdrawing: "财务处理中",
  paid: "提现或发佣已到账",
  risk_frozen: "命中风险规则，需人工复核",
  cancelled: "未支付前因退款、作弊或规则不满足取消",
  clawed_back: "因退款、作弊或投诉追回"
};

export const trackingEventLabels: Record<BusinessCpsTrackingEventType, string> = {
  impression: "曝光",
  click: "点击",
  scan: "扫码",
  landing_view: "落地页访问",
  register: "注册",
  ekyc_submit: "eKYC 提交",
  ekyc_complete: "eKYC 通过",
  shop_apply: "商户入驻申请",
  shop_approved: "商户审核通过",
  cast_apply: "技师入驻申请",
  cast_approved: "技师审核通过",
  first_order: "首单",
  order_complete: "订单完成",
  payment: "支付",
  membership_purchase: "会员购买",
  boost_spend: "Boost 消耗",
  refund: "退款",
  commission_created: "返佣生成",
  commission_frozen: "返佣冻结",
  commission_cancelled: "返佣取消",
  commission_settled: "返佣结算"
};

export const settlementBatchStatusLabels: Record<BusinessCpsSettlementBatchStatus, string> = {
  draft: "草稿",
  reviewing: "审核中",
  approved: "已通过",
  paid: "已支付",
  rejected: "已驳回"
};

export const merchantLeadStatusLabels: Record<MerchantLeadStatus, string> = {
  lead: "线索",
  contacted: "已联系",
  docs_submitted: "资料提交",
  onboarded: "已入驻",
  first_order: "已完成首单",
  saas_purchased: "已购买 SaaS"
};

export const businessCpsRuleTemplates: BusinessCpsRuleTemplate[] = [
  {
    id: "rule-user-ekyc",
    model: "CPA",
    scene: "用户拉新",
    trigger: "eKYC 通过",
    rewardTarget: "推广者",
    releaseCondition: "实名审核通过且手机号、设备、账号去重",
    settlementDelayDays: 1,
    fixedAmount: 300
  },
  {
    id: "rule-booking-first",
    model: "CPS",
    scene: "用户拉新",
    trigger: "Booking 首单完成",
    rewardTarget: "推广者",
    releaseCondition: "订单完成，无退款投诉，服务时长和 LBS 正常",
    settlementDelayDays: 7,
    rate: 0.08
  },
  {
    id: "rule-request-first",
    model: "CPS",
    scene: "高价值 Request",
    trigger: "Request 首单完成",
    rewardTarget: "推广者",
    releaseCondition: "Request 完成并通过风控",
    settlementDelayDays: 7,
    rate: 0.12
  },
  {
    id: "rule-merchant-docs",
    model: "CPL",
    scene: "商户招商",
    trigger: "商户资料提交",
    rewardTarget: "BD / 区域代理",
    releaseCondition: "资料完整且未命中重复线索",
    settlementDelayDays: 0,
    fixedAmount: 1200
  },
  {
    id: "rule-merchant-first-order",
    model: "CPA",
    scene: "商户招商",
    trigger: "商户完成首单",
    rewardTarget: "BD / 区域代理",
    releaseCondition: "无重大投诉或退款",
    settlementDelayDays: 14,
    fixedAmount: 30000
  },
  {
    id: "rule-saas-subscribe",
    model: "CPR",
    scene: "SaaS 首购与续费",
    trigger: "商户 SaaS 购买或续费",
    rewardTarget: "BD / 区域代理",
    releaseCondition: "支付成功且未退款，续费最多 6 个月",
    settlementDelayDays: 7,
    rate: 0.15
  },
  {
    id: "rule-technician-first-order",
    model: "CPA",
    scene: "技师招募",
    trigger: "技师首单完成",
    rewardTarget: "招募者",
    releaseCondition: "服务完成、LBS 正常、eKYC 通过",
    settlementDelayDays: 7,
    fixedAmount: 8000
  },
  {
    id: "rule-new-user-ndp",
    model: "NDP",
    scene: "用户激励",
    trigger: "新用户注册",
    rewardTarget: "新用户",
    releaseCondition: "邀请码、二维码或短链注册去重",
    settlementDelayDays: 0,
    ndpAmount: 500
  }
];

export const businessCpsAttributionConfigs: BusinessCpsAttributionConfig[] = [
  { carrier: "手动邀请码", usage: "朋友邀请、达人口播、线下介绍", priority: 1, windowDays: 60, requiresAuditLog: false },
  { carrier: "专属二维码", usage: "地推、桌牌、海报、商户招商", priority: 2, windowDays: 60, requiresAuditLog: false },
  { carrier: "短链接", usage: "X、LINE、Instagram、TikTok 简介", priority: 3, windowDays: 60, requiresAuditLog: false },
  { carrier: "UTM 参数", usage: "广告投放和渠道分析", priority: 4, windowDays: 30, requiresAuditLog: false },
  { carrier: "商户导入线索", usage: "BD / 区域代理招商", priority: 5, windowDays: 180, requiresAuditLog: true },
  { carrier: "客服手动绑定", usage: "特殊线下订单", priority: 6, windowDays: 90, requiresAuditLog: true }
];

export const businessCpsCampaigns: BusinessCpsCampaign[] = [
  {
    id: "cps-campaign-01",
    name: "港区高端按摩新客推广",
    type: "user_acquisition",
    sponsor: "platform",
    status: "active",
    region: "港区 / 六本木 / 麻布",
    category: "上门按摩",
    period: "2026-05-01 - 2026-05-31",
    target: "新用户注册、eKYC、Booking / Request 首单",
    participants: "认证达人、星级技师、指定社群 Partner",
    ruleTemplateIds: ["rule-user-ekyc", "rule-booking-first", "rule-request-first", "rule-new-user-ndp"],
    commissionSummary: "eKYC ¥300 + Booking 净收入 8% + Request 净收入 12%",
    userBenefit: "500 NDP Request 抵扣券",
    budgetTotal: 3600000,
    budgetUsed: 2140000,
    dailyCap: 180000,
    attributionWindowDays: 60,
    riskRules: ["同设备多号冻结", "服务时长不足驳回", "退款投诉期 7 天"],
    complianceNotes: ["达人商业合作素材必须标注 PR / 広告", "不得承诺具体疗效"],
    materialIds: ["mat-shop-poster", "mat-line-copy", "mat-x-copy", "mat-video"],
    version: "v1.4",
    clicks: 18420,
    registrations: 1260,
    firstOrders: 218,
    attributedOrders: 342,
    gmv: 8460000,
    commissionCost: 486000,
    roi: 5.8,
    requestRatio: 32
  },
  {
    id: "cps-campaign-02",
    name: "新宿深夜 Request 高佣任务",
    type: "user_acquisition",
    sponsor: "joint",
    status: "active",
    region: "新宿 / 歌舞伎町",
    category: "深夜急单",
    period: "2026-05-08 - 2026-06-07",
    target: "Request 首单、复购、会员首购",
    participants: "高信用达人、区域社群 Partner",
    ruleTemplateIds: ["rule-request-first", "rule-saas-subscribe"],
    commissionSummary: "Request 净收入 15%，会员首购 10%",
    userBenefit: "高峰期 800 NDP 抵扣券",
    budgetTotal: 1800000,
    budgetUsed: 720000,
    dailyCap: 90000,
    attributionWindowDays: 60,
    riskRules: ["LBS 摘要异常冻结", "订单完成过快驳回", "退款率过高自动暂停"],
    complianceNotes: ["限制投放夸张广告", "必须展示适用地区"],
    materialIds: ["mat-field-qr", "mat-video", "mat-request-line-copy"],
    version: "v1.2",
    clicks: 8200,
    registrations: 510,
    firstOrders: 94,
    attributedOrders: 128,
    gmv: 3920000,
    commissionCost: 318000,
    roi: 4.2,
    requestRatio: 61
  },
  {
    id: "cps-campaign-03",
    name: "东京商户招商 BD 奖励",
    type: "merchant_recruit",
    sponsor: "platform",
    status: "reviewing",
    region: "东京 23 区",
    category: "商户招商",
    period: "2026-05-15 - 2026-08-15",
    target: "资料提交、商户入驻、首单、SaaS 购买",
    participants: "BD、区域代理、商户老板推荐",
    ruleTemplateIds: ["rule-merchant-docs", "rule-merchant-first-order", "rule-saas-subscribe"],
    commissionSummary: "CPL ¥1,200 + 首单 CPA ¥30,000 + SaaS 首购 15%",
    userBenefit: "商户 SaaS 首月 20% 优惠",
    budgetTotal: 5200000,
    budgetUsed: 860000,
    dailyCap: 240000,
    attributionWindowDays: 180,
    riskRules: ["重复法人/电话合并线索", "虚假招商降低 BD 信用", "线下现金异常冻结预算"],
    complianceNotes: ["所有人工改归因必须写入审计日志"],
    materialIds: ["mat-shop-poster", "mat-field-qr"],
    version: "v0.9",
    clicks: 3320,
    registrations: 0,
    firstOrders: 18,
    attributedOrders: 26,
    gmv: 12600000,
    commissionCost: 612000,
    roi: 7.1,
    requestRatio: 24
  },
  {
    id: "cps-campaign-04",
    name: "技师好友招募计划",
    type: "technician_recruit",
    sponsor: "platform",
    status: "paused",
    region: "东京 / 横滨 / 埼玉",
    category: "技师供给",
    period: "2026-04-20 - 2026-07-20",
    target: "技师 eKYC、上线、首单、30 日留存",
    participants: "星级技师、店铺老板、区域代理",
    ruleTemplateIds: ["rule-technician-first-order"],
    commissionSummary: "技师首单完成 ¥8,000，30 日留存后追加 ¥5,000",
    userBenefit: "新技师 Boost 曝光券",
    budgetTotal: 2200000,
    budgetUsed: 1190000,
    dailyCap: 80000,
    attributionWindowDays: 90,
    riskRules: ["同银行卡重复注册冻结", "首单服务时长不足驳回"],
    complianceNotes: ["不得虚假承诺月收入", "招募文案需过审"],
    materialIds: ["mat-technician-card", "mat-line-copy"],
    version: "v1.1",
    clicks: 5620,
    registrations: 188,
    firstOrders: 46,
    attributedOrders: 52,
    gmv: 2860000,
    commissionCost: 368000,
    roi: 3.4,
    requestRatio: 18
  }
];

export const businessCpsPromoters: BusinessCpsPromoter[] = [
  {
    id: "promoter-aya",
    name: "Aya Tokyo Fit",
    role: "creator",
    roleLabel: "CPS 认证推广者",
    identity: "美容探店达人 / Instagram 12.8 万粉",
    region: "港区",
    inviteCode: "AYA500",
    primaryChannel: "Instagram / TikTok",
    monthIncome: 86200,
    withdrawable: 46800,
    frozen: 9400,
    clicksToday: 842,
    registrationsToday: 38,
    firstOrdersToday: 9,
    commissionToday: 12600,
    riskScore: 18,
    status: "active"
  },
  {
    id: "promoter-ken",
    name: "LINE 社群合伙人 Ken",
    role: "agent",
    roleLabel: "区域推广者",
    identity: "LINE OpenChat / 港区夜间服务社群",
    region: "新宿",
    inviteCode: "KEN-RQ",
    primaryChannel: "LINE OpenChat",
    monthIncome: 124000,
    withdrawable: 72000,
    frozen: 16800,
    clicksToday: 520,
    registrationsToday: 22,
    firstOrdersToday: 6,
    commissionToday: 18400,
    riskScore: 32,
    status: "active"
  },
  {
    id: "promoter-misaki",
    name: "佐藤 美咲",
    role: "creator",
    roleLabel: "技师招募者",
    identity: "头部技师 / 固定客转介绍",
    region: "涩谷",
    inviteCode: "MISAKI20",
    primaryChannel: "技师 IM 分享",
    monthIncome: 51600,
    withdrawable: 21400,
    frozen: 5800,
    clicksToday: 164,
    registrationsToday: 9,
    firstOrdersToday: 2,
    commissionToday: 6800,
    riskScore: 12,
    status: "reviewing"
  }
];

export const businessCpsPromoterPermissions: BusinessCpsPromoterPermission[] = [
  {
    promoterId: "promoter-aya",
    canCreateLink: true,
    canCreateCode: true,
    canCreateQr: true,
    canCreateSubPromoter: true,
    canViewSubData: true,
    canViewCommission: true,
    canWithdraw: true,
    canUploadMaterial: true
  },
  {
    promoterId: "promoter-ken",
    canCreateLink: true,
    canCreateCode: true,
    canCreateQr: true,
    canCreateSubPromoter: true,
    canViewSubData: true,
    canViewCommission: true,
    canWithdraw: true,
    canUploadMaterial: false
  },
  {
    promoterId: "promoter-misaki",
    canCreateLink: true,
    canCreateCode: false,
    canCreateQr: true,
    canCreateSubPromoter: false,
    canViewSubData: false,
    canViewCommission: true,
    canWithdraw: false,
    canUploadMaterial: false
  }
];

export const businessCpsPromoterTeamNodes: BusinessCpsPromoterTeamNode[] = [
  {
    id: "team-aya-root",
    promoterId: "promoter-aya",
    parentPromoterId: null,
    campaignId: "cps-campaign-01",
    level: 1,
    teamSize: 18,
    directChildren: 7,
    budgetMode: "independent",
    budgetTotal: 620000,
    budgetUsed: 348000,
    targetRegisters: 420,
    targetActiveShops: 18,
    targetFirstOrders: 72,
    targetPaymentGmv: 3600000,
    completedRegisters: 261,
    completedActiveShops: 12,
    completedFirstOrders: 44,
    completedPaymentGmv: 2480000,
    commissionConditionRuleId: "condition-level-1-growth-standard",
    commissionRate: 8,
    commissionBasis: "net_revenue",
    commissionTiers: createBusinessCpsDefaultCommissionTiers({
      nodeId: "team-aya-root",
      commissionRate: 8,
      targetRegisters: 420,
      targetActiveShops: 18,
      targetFirstOrders: 72,
      targetPaymentGmv: 3600000
    }),
    preferentialCondition: createBusinessCpsDefaultPreferentialCondition(8),
    downgradeCondition: createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: createBusinessCpsDefaultPromotionCondition(),
    releaseCondition: "归因用户完成支付且 7 天内无退款后释放",
    riskCondition: "同设备、同电话、异常 LBS 或重复支付命中后冻结",
    settlementDelayDays: 7,
    validFrom: "2026-05-01",
    validTo: "2026-05-31",
    riskLevel: "low"
  },
  {
    id: "team-ken-root",
    promoterId: "promoter-ken",
    parentPromoterId: null,
    campaignId: "cps-campaign-02",
    level: 1,
    teamSize: 31,
    directChildren: 12,
    budgetMode: "independent",
    budgetTotal: 820000,
    budgetUsed: 516000,
    targetRegisters: 360,
    targetActiveShops: 16,
    targetFirstOrders: 96,
    targetPaymentGmv: 4200000,
    completedRegisters: 188,
    completedActiveShops: 9,
    completedFirstOrders: 52,
    completedPaymentGmv: 2860000,
    commissionConditionRuleId: "condition-level-1-growth-standard",
    commissionRate: 12,
    commissionBasis: "net_revenue",
    commissionTiers: createBusinessCpsDefaultCommissionTiers({
      nodeId: "team-ken-root",
      commissionRate: 12,
      targetRegisters: 360,
      targetActiveShops: 16,
      targetFirstOrders: 96,
      targetPaymentGmv: 4200000
    }),
    preferentialCondition: createBusinessCpsDefaultPreferentialCondition(12),
    downgradeCondition: createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: createBusinessCpsDefaultPromotionCondition(),
    releaseCondition: "Request 完单并通过服务时长、支付和评价复核后释放",
    riskCondition: "夜间同 IP 批量注册、异常取消或虚假订单冻结",
    settlementDelayDays: 10,
    validFrom: "2026-05-08",
    validTo: "2026-06-07",
    riskLevel: "medium"
  },
  {
    id: "team-misaki-child",
    promoterId: "promoter-misaki",
    parentPromoterId: "promoter-aya",
    campaignId: "cps-campaign-04",
    level: 2,
    teamSize: 6,
    directChildren: 2,
    budgetMode: "inherit_parent",
    budgetTotal: 160000,
    budgetUsed: 62000,
    targetRegisters: 80,
    targetActiveShops: 6,
    targetFirstOrders: 20,
    targetPaymentGmv: 720000,
    completedRegisters: 38,
    completedActiveShops: 4,
    completedFirstOrders: 9,
    completedPaymentGmv: 318000,
    commissionConditionRuleId: null,
    commissionRate: 20,
    commissionBasis: "gross_margin",
    commissionTiers: createBusinessCpsDefaultCommissionTiers({
      nodeId: "team-misaki-child",
      commissionRate: 20,
      targetRegisters: 80,
      targetActiveShops: 6,
      targetFirstOrders: 20,
      targetPaymentGmv: 720000
    }),
    preferentialCondition: createBusinessCpsDefaultPreferentialCondition(20),
    downgradeCondition: createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: createBusinessCpsDefaultPromotionCondition(),
    releaseCondition: "技师 eKYC 通过、首单完成且 30 日留存达标后释放",
    riskCondition: "银行卡重复、首单服务时长不足或招募资料不实冻结",
    settlementDelayDays: 30,
    validFrom: "2026-04-20",
    validTo: "2026-07-20",
    riskLevel: "low"
  }
];

export const businessCpsChannels: BusinessCpsChannel[] = [
  {
    id: "channel-instagram",
    name: "Instagram",
    code: "ig",
    type: "sns",
    status: "active",
    description: "达人 Story、Reels、个人简介短链",
    clicks: 10240,
    scans: 420,
    registrations: 688,
    firstOrders: 104,
    orders: 168,
    gmv: 4680000,
    commission: 286000,
    roi: 5.9,
    anomalyRate: 2.8
  },
  {
    id: "channel-line",
    name: "LINE OpenChat",
    code: "line",
    type: "private",
    status: "active",
    description: "私域社群、好友转发、邀请码口播",
    clicks: 7820,
    scans: 1360,
    registrations: 524,
    firstOrders: 88,
    orders: 126,
    gmv: 3920000,
    commission: 242000,
    roi: 4.7,
    anomalyRate: 6.4
  },
  {
    id: "channel-field",
    name: "线下地推",
    code: "field",
    type: "offline",
    status: "active",
    description: "桌牌、传单、店铺海报、BD 名片 QR",
    clicks: 940,
    scans: 2880,
    registrations: 218,
    firstOrders: 42,
    orders: 55,
    gmv: 1760000,
    commission: 118000,
    roi: 3.8,
    anomalyRate: 4.1
  },
  {
    id: "channel-x",
    name: "X / Twitter",
    code: "x",
    type: "sns",
    status: "paused",
    description: "公开文案、PR 标识素材、话题转化",
    clicks: 2380,
    scans: 120,
    registrations: 88,
    firstOrders: 9,
    orders: 12,
    gmv: 420000,
    commission: 36000,
    roi: 2.4,
    anomalyRate: 12.6
  }
];

export const businessCpsMaterials: BusinessCpsMaterial[] = [
  {
    id: "mat-shop-poster",
    campaignId: "cps-campaign-01",
    type: "shop_poster",
    title: "港区新客 500 NDP 海报",
    scene: "商户新客活动、达人探店",
    requiredFields: ["店铺名", "优惠", "二维码", "PR 标识"],
    prRequired: true,
    status: "approved",
    channelId: "channel-instagram",
    language: "ja",
    usageCount: 182,
    clicks: 4720,
    scans: 630,
    registrations: 316,
    firstOrders: 52,
    gmv: 1680000,
    commission: 96000,
    roi: 5.2,
    anomalyRate: 2.2
  },
  {
    id: "mat-technician-card",
    campaignId: "cps-campaign-04",
    type: "technician_card",
    title: "技师招募名片",
    scene: "技师个人推广",
    requiredFields: ["头像", "标签", "近期可约", "二维码"],
    prRequired: false,
    status: "reviewing",
    channelId: "channel-line",
    language: "ja",
    usageCount: 44,
    clicks: 880,
    scans: 210,
    registrations: 92,
    firstOrders: 18,
    gmv: 560000,
    commission: 68000,
    roi: 3.6,
    anomalyRate: 4.8
  },
  {
    id: "mat-line-copy",
    campaignId: "cps-campaign-01",
    type: "line_copy",
    title: "LINE 社群转发文案",
    scene: "社群 / 私域转发",
    requiredFields: ["短文案", "链接", "优惠说明"],
    prRequired: false,
    status: "approved",
    channelId: "channel-line",
    language: "zh",
    usageCount: 260,
    clicks: 6120,
    scans: 0,
    registrations: 404,
    firstOrders: 66,
    gmv: 2240000,
    commission: 136000,
    roi: 4.9,
    anomalyRate: 5.5
  },
  {
    id: "mat-request-line-copy",
    campaignId: "cps-campaign-02",
    type: "line_copy",
    title: "深夜 Request LINE 社群文案",
    scene: "LINE OpenChat / 私域社群转发",
    requiredFields: ["短文案", "深夜适用地区", "短链", "优惠说明"],
    prRequired: false,
    status: "approved",
    channelId: "channel-line",
    language: "ja",
    usageCount: 142,
    clicks: 4720,
    scans: 0,
    registrations: 226,
    firstOrders: 44,
    gmv: 2260000,
    commission: 164000,
    roi: 4.4,
    anomalyRate: 6.4
  },
  {
    id: "mat-x-copy",
    campaignId: "cps-campaign-01",
    type: "x_copy",
    title: "X 公开传播文案",
    scene: "公开传播",
    requiredFields: ["短文案", "标签", "PR 标识"],
    prRequired: true,
    status: "approved",
    channelId: "channel-x",
    language: "ja",
    usageCount: 68,
    clicks: 2380,
    scans: 0,
    registrations: 88,
    firstOrders: 9,
    gmv: 420000,
    commission: 36000,
    roi: 2.4,
    anomalyRate: 12.6
  },
  {
    id: "mat-video",
    campaignId: "cps-campaign-02",
    type: "short_video_script",
    title: "深夜 Request 短视频脚本",
    scene: "TikTok / Instagram Reels",
    requiredFields: ["开头钩子", "服务卖点", "行动号召"],
    prRequired: true,
    status: "approved",
    channelId: "channel-instagram",
    language: "ja",
    usageCount: 76,
    clicks: 2960,
    scans: 0,
    registrations: 164,
    firstOrders: 31,
    gmv: 1260000,
    commission: 112000,
    roi: 4.1,
    anomalyRate: 3.4
  },
  {
    id: "mat-field-qr",
    campaignId: "cps-campaign-03",
    type: "field_qr",
    title: "BD 地推二维码桌牌",
    scene: "桌牌、传单、名片",
    requiredFields: ["渠道码", "地区码", "活动码"],
    prRequired: false,
    status: "approved",
    channelId: "channel-field",
    language: "ja",
    usageCount: 120,
    clicks: 940,
    scans: 2880,
    registrations: 218,
    firstOrders: 42,
    gmv: 1760000,
    commission: 118000,
    roi: 3.8,
    anomalyRate: 4.1
  }
];

export const businessCpsPromotionLinks: BusinessCpsPromotionLink[] = [
  {
    id: "link-aya-ig-01",
    name: "Aya 港区 Story 短链",
    shortUrl: "https://needo.jp/r/AyM500",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    materialId: "mat-shop-poster",
    channelId: "channel-instagram",
    landingType: "app_register",
    landingUrl: "https://needo.jp/app/register?campaign=cps-campaign-01",
    status: "active",
    allowCommission: true,
    validTo: "2026-05-31 23:59",
    clicks: 6820,
    registrations: 402,
    firstOrders: 71,
    orders: 108,
    gmv: 3180000,
    commission: 188000,
    riskEvents: 2,
    createdAt: "2026-05-01 09:20",
    signature: "sig_aya_ig_01"
  },
  {
    id: "link-ken-line-01",
    name: "Ken Request LINE 群链接",
    shortUrl: "https://needo.jp/r/KenRQ",
    campaignId: "cps-campaign-02",
    promoterId: "promoter-ken",
    parentPromoterId: "promoter-aya",
    materialId: "mat-request-line-copy",
    channelId: "channel-line",
    landingType: "booking",
    landingUrl: "https://needo.jp/request/new?campaign=cps-campaign-02",
    status: "active",
    allowCommission: true,
    validTo: "2026-06-07 23:59",
    clicks: 4720,
    registrations: 226,
    firstOrders: 44,
    orders: 62,
    gmv: 2260000,
    commission: 164000,
    riskEvents: 5,
    createdAt: "2026-05-08 18:12",
    signature: "sig_ken_line_01"
  },
  {
    id: "link-field-shop-01",
    name: "东京 BD 商户招商二维码落地页",
    shortUrl: "https://needo.jp/r/BdShop",
    campaignId: "cps-campaign-03",
    promoterId: "promoter-ken",
    materialId: "mat-field-qr",
    channelId: "channel-field",
    landingType: "shop_apply",
    landingUrl: "https://needo.jp/shop/apply?source=field",
    status: "paused",
    allowCommission: false,
    validTo: "2026-08-15 23:59",
    clicks: 920,
    registrations: 0,
    firstOrders: 18,
    orders: 26,
    gmv: 12600000,
    commission: 612000,
    riskEvents: 1,
    createdAt: "2026-05-10 10:00",
    signature: "sig_bd_shop_01"
  },
  {
    id: "link-misaki-cast-01",
    name: "技师好友招募邀请页",
    shortUrl: "https://needo.jp/r/MskCast",
    campaignId: "cps-campaign-04",
    promoterId: "promoter-misaki",
    parentPromoterId: "promoter-aya",
    materialId: "mat-technician-card",
    channelId: "channel-line",
    landingType: "cast_apply",
    landingUrl: "https://needo.jp/cast/apply?invite=MISAKI20",
    status: "risk_frozen",
    allowCommission: false,
    validTo: "2026-07-20 23:59",
    clicks: 1180,
    registrations: 68,
    firstOrders: 18,
    orders: 21,
    gmv: 780000,
    commission: 92000,
    riskEvents: 3,
    createdAt: "2026-04-20 12:30",
    signature: "sig_misaki_cast_01"
  }
];

export const businessCpsPromotionCodes: BusinessCpsPromotionCode[] = [
  {
    id: "code-aya500",
    code: "AYA500",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    purpose: "register",
    status: "active",
    validTo: "2026-05-31 23:59",
    usedCount: 286,
    registrations: 214,
    firstOrders: 36,
    orders: 54,
    gmv: 1420000,
    commission: 82000,
    riskEvents: 1
  },
  {
    id: "code-ken-rq",
    code: "KEN-RQ",
    campaignId: "cps-campaign-02",
    promoterId: "promoter-ken",
    purpose: "order_manual",
    status: "active",
    validTo: "2026-06-07 23:59",
    usedCount: 148,
    registrations: 96,
    firstOrders: 24,
    orders: 38,
    gmv: 1640000,
    commission: 128000,
    riskEvents: 4
  },
  {
    id: "code-bdshop",
    code: "BDSHOP",
    campaignId: "cps-campaign-03",
    promoterId: "promoter-ken",
    purpose: "shop_apply",
    status: "paused",
    validTo: "2026-08-15 23:59",
    usedCount: 42,
    registrations: 0,
    firstOrders: 12,
    orders: 18,
    gmv: 8840000,
    commission: 390000,
    riskEvents: 1
  }
];

export const businessCpsQrCodes: BusinessCpsQrCode[] = [
  {
    id: "qr-aya-shop-poster",
    linkId: "link-aya-ig-01",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    styleType: "needo_logo",
    qrUrl: "https://needo.jp/qr/aya-shop-poster.svg",
    status: "active",
    scans: 630,
    registrations: 118,
    ekycCompletions: 82,
    firstOrders: 21,
    orders: 32,
    gmv: 760000,
    commission: 44000,
    abnormalScans: 8
  },
  {
    id: "qr-ken-field-shop",
    linkId: "link-field-shop-01",
    campaignId: "cps-campaign-03",
    promoterId: "promoter-ken",
    styleType: "shop_apply",
    qrUrl: "https://needo.jp/qr/ken-field-shop.svg",
    status: "paused",
    scans: 1740,
    registrations: 0,
    ekycCompletions: 0,
    firstOrders: 14,
    orders: 22,
    gmv: 10800000,
    commission: 520000,
    abnormalScans: 38
  },
  {
    id: "qr-misaki-cast",
    linkId: "link-misaki-cast-01",
    campaignId: "cps-campaign-04",
    promoterId: "promoter-misaki",
    styleType: "cast_recruit",
    qrUrl: "https://needo.jp/qr/misaki-cast.svg",
    status: "risk_frozen",
    scans: 210,
    registrations: 58,
    ekycCompletions: 42,
    firstOrders: 18,
    orders: 21,
    gmv: 780000,
    commission: 92000,
    abnormalScans: 12
  }
];

export const businessCpsAttributionRecords: BusinessCpsAttributionRecord[] = [
  {
    id: "attr-1001",
    campaignId: "cps-campaign-01",
    sourcePath: "Instagram Story -> 短链接 -> App 注册 -> Booking 首单",
    subject: "高桥 由美",
    subjectType: "user",
    carrier: "短链接",
    clickAt: "2026-05-16 09:18",
    conversionAt: "2026-05-16 11:42",
    orderId: "BK-260516-0088",
    orderType: "Booking",
    orderAmount: 23800,
    netRevenue: 7140,
    primaryPromoterId: "promoter-aya",
    assistPromoterIds: [],
    commissionRecordId: "com-1001",
    evidence: ["UTM source=instagram", "注册设备一致", "首单支付完成"],
    status: "confirmed"
  },
  {
    id: "attr-1002",
    campaignId: "cps-campaign-02",
    sourcePath: "LINE OpenChat -> 专属邀请码 -> Request 发布 -> 完单",
    subject: "田中 美绪",
    subjectType: "user",
    carrier: "手动邀请码",
    clickAt: "2026-05-16 01:06",
    conversionAt: "2026-05-16 03:24",
    orderId: "RQ-260516-0031",
    orderType: "Request",
    orderAmount: 48600,
    netRevenue: 14580,
    primaryPromoterId: "promoter-ken",
    assistPromoterIds: ["promoter-aya"],
    commissionRecordId: "com-1002",
    evidence: ["邀请码 KEN-RQ", "LBS 摘要正常", "服务时长 92 分钟"],
    status: "tracking"
  },
  {
    id: "attr-1003",
    campaignId: "cps-campaign-03",
    sourcePath: "BD 表单 -> 商户资料提交 -> 审核通过 -> SaaS 首购",
    subject: "Aoyama Aroma Room",
    subjectType: "merchant",
    carrier: "商户导入线索",
    clickAt: "2026-05-10 15:12",
    conversionAt: "2026-05-15 18:32",
    orderId: "SAAS-260515-0019",
    orderType: "SaaS",
    orderAmount: 128000,
    netRevenue: 128000,
    primaryPromoterId: "promoter-ken",
    assistPromoterIds: [],
    commissionRecordId: "com-1003",
    evidence: ["法人电话去重通过", "eKYC approved", "SaaS 付款成功"],
    status: "settled"
  },
  {
    id: "attr-1004",
    campaignId: "cps-campaign-04",
    sourcePath: "技师 IM 分享 -> 邀请码注册 -> eKYC -> 首单",
    subject: "山口 彩",
    subjectType: "technician",
    carrier: "专属二维码",
    clickAt: "2026-05-13 20:16",
    conversionAt: "2026-05-16 13:05",
    orderId: "BK-260516-0112",
    orderType: "Booking",
    orderAmount: 19800,
    netRevenue: 5940,
    primaryPromoterId: "promoter-misaki",
    assistPromoterIds: [],
    commissionRecordId: "com-1004",
    evidence: ["eKYC approved", "首单完成", "银行卡未重复"],
    status: "risk_hold"
  }
];

export const businessCpsTrackingEvents: BusinessCpsTrackingEvent[] = [
  {
    id: "evt-260516-0001",
    eventType: "click",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    linkId: "link-aya-ig-01",
    materialId: "mat-shop-poster",
    channelId: "channel-instagram",
    subjectId: "user-temp-7781",
    subjectType: "user",
    deviceId: "ios-fp-71a2",
    ip: "126.156.44.18",
    region: "港区",
    userAgent: "Mobile Safari / iOS 18.4",
    referrer: "instagram://story",
    landingUrl: "https://needo.jp/app/register?campaign=cps-campaign-01",
    riskScore: 8,
    createdAt: "2026-05-16 09:18:22"
  },
  {
    id: "evt-260516-0002",
    eventType: "register",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    linkId: "link-aya-ig-01",
    codeId: "code-aya500",
    materialId: "mat-shop-poster",
    channelId: "channel-instagram",
    subjectId: "user-yumi",
    subjectType: "user",
    deviceId: "ios-fp-71a2",
    ip: "126.156.44.18",
    region: "港区",
    userAgent: "Mobile Safari / iOS 18.4",
    referrer: "last_click",
    landingUrl: "https://needo.jp/app/register?campaign=cps-campaign-01",
    riskScore: 12,
    createdAt: "2026-05-16 09:24:31"
  },
  {
    id: "evt-260516-0003",
    eventType: "scan",
    campaignId: "cps-campaign-03",
    promoterId: "promoter-ken",
    linkId: "link-field-shop-01",
    qrId: "qr-ken-field-shop",
    materialId: "mat-field-qr",
    channelId: "channel-field",
    subjectId: "merchant-aoyama",
    subjectType: "merchant",
    deviceId: "android-fp-8c19",
    ip: "133.32.91.44",
    region: "青山",
    userAgent: "Chrome Android 125",
    referrer: "offline_poster",
    landingUrl: "https://needo.jp/shop/apply?source=field",
    riskScore: 18,
    createdAt: "2026-05-16 10:06:11"
  },
  {
    id: "evt-260516-0004",
    eventType: "order_complete",
    campaignId: "cps-campaign-02",
    promoterId: "promoter-ken",
    parentPromoterId: "promoter-aya",
    linkId: "link-ken-line-01",
    codeId: "code-ken-rq",
    materialId: "mat-line-copy",
    channelId: "channel-line",
    subjectId: "user-mio",
    subjectType: "order",
    orderId: "RQ-260516-0031",
    deviceId: "ios-fp-22c0",
    ip: "126.212.90.61",
    region: "新宿",
    userAgent: "NeeDo App / iOS",
    referrer: "line_openchat",
    landingUrl: "https://needo.jp/request/new?campaign=cps-campaign-02",
    riskScore: 26,
    createdAt: "2026-05-16 03:24:04"
  },
  {
    id: "evt-260516-0005",
    eventType: "commission_frozen",
    campaignId: "cps-campaign-04",
    promoterId: "promoter-misaki",
    parentPromoterId: "promoter-aya",
    linkId: "link-misaki-cast-01",
    qrId: "qr-misaki-cast",
    materialId: "mat-technician-card",
    channelId: "channel-line",
    subjectId: "com-1004",
    subjectType: "wallet",
    orderId: "BK-260516-0112",
    deviceId: "ios-fp-cast42",
    ip: "126.99.18.72",
    region: "涩谷",
    userAgent: "NeeDo App / iOS",
    referrer: "risk_rule",
    landingUrl: "https://needo.jp/cast/apply?invite=MISAKI20",
    riskScore: 68,
    createdAt: "2026-05-16 13:24:16"
  }
];

export const businessCpsCommissionRecords: BusinessCpsCommissionRecord[] = [
  {
    id: "com-1001",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    sourceOrder: "BK-260516-0088",
    model: "CPS",
    baseAmount: 7140,
    commissionAmount: 571,
    ndpCouponAmount: 500,
    status: "pending",
    expectedSettlementDate: "2026-05-23"
  },
  {
    id: "com-1002",
    campaignId: "cps-campaign-02",
    promoterId: "promoter-ken",
    sourceOrder: "RQ-260516-0031",
    model: "CPS",
    baseAmount: 14580,
    commissionAmount: 2187,
    ndpCouponAmount: 800,
    status: "estimated",
    expectedSettlementDate: "2026-05-23"
  },
  {
    id: "com-1003",
    campaignId: "cps-campaign-03",
    promoterId: "promoter-ken",
    sourceOrder: "SAAS-260515-0019",
    model: "CPR",
    baseAmount: 128000,
    commissionAmount: 19200,
    ndpCouponAmount: 0,
    status: "withdrawable",
    expectedSettlementDate: "2026-05-16"
  },
  {
    id: "com-1004",
    campaignId: "cps-campaign-04",
    promoterId: "promoter-misaki",
    sourceOrder: "BK-260516-0112",
    model: "CPA",
    baseAmount: 19800,
    commissionAmount: 8000,
    ndpCouponAmount: 0,
    status: "risk_frozen",
    expectedSettlementDate: "2026-05-23",
    riskReason: "新技师首单 LBS 摘要存在 420m 偏移，等待人工复核"
  },
  {
    id: "com-1005",
    campaignId: "cps-campaign-01",
    promoterId: "promoter-aya",
    sourceOrder: "BK-260510-0042",
    model: "CPS",
    baseAmount: 9800,
    commissionAmount: 784,
    ndpCouponAmount: 500,
    status: "paid",
    expectedSettlementDate: "2026-05-15"
  }
];

export const businessCpsMerchantLeads: BusinessCpsMerchantLead[] = [
  {
    id: "lead-1",
    storeName: "Aoyama Aroma Room",
    region: "港区",
    category: "按摩 / SPA",
    contact: "田村 / 080-1234-1001",
    source: "BD 表单",
    owner: "Ken",
    status: "saas_purchased",
    nextFollowUpAt: "2026-05-20 11:00",
    ekycStatus: "approved",
    estimatedCommission: 49200,
    saasPlan: "Business Pro 月付"
  },
  {
    id: "lead-2",
    storeName: "Shibuya Nail Lab",
    region: "涩谷",
    category: "美容美甲",
    contact: "佐藤 / 080-2234-8891",
    source: "LINE 私聊",
    owner: "Aya",
    status: "docs_submitted",
    nextFollowUpAt: "2026-05-17 16:00",
    ekycStatus: "submitted",
    estimatedCommission: 1200
  },
  {
    id: "lead-3",
    storeName: "Roppongi Night Care",
    region: "六本木",
    category: "酒店合作",
    contact: "高桥 / 03-5566-1002",
    source: "区域代理拜访",
    owner: "Ken",
    status: "first_order",
    nextFollowUpAt: "2026-05-19 21:30",
    ekycStatus: "approved",
    estimatedCommission: 30000
  },
  {
    id: "lead-4",
    storeName: "Yokohama Clean Plus",
    region: "横滨",
    category: "家政清洁",
    contact: "王 / 080-9944-2811",
    source: "地推二维码",
    owner: "东京 BD 组",
    status: "contacted",
    nextFollowUpAt: "2026-05-18 10:30",
    ekycStatus: "not_started",
    estimatedCommission: 0
  }
];

export const businessCpsRiskEvents: BusinessCpsRiskEvent[] = [
  {
    id: "risk-1",
    type: "多账号作弊",
    severity: "high",
    subject: "promoter-ken / 6 个新注册",
    example: "同设备、同 IP 在 18 分钟内批量注册并领取 NDP 券",
    systemAction: "冻结佣金与赠送 NDP，进入人工复核",
    amountFrozen: 16800,
    owner: "平台风控",
    status: "reviewing"
  },
  {
    id: "risk-2",
    type: "刷单",
    severity: "medium",
    subject: "BK-260516-0112",
    example: "订单完成过快，服务时长不足，LBS 摘要偏移",
    systemAction: "冻结技师招募 CPA",
    amountFrozen: 8000,
    owner: "风控 + 技师运营",
    status: "new"
  },
  {
    id: "risk-3",
    type: "违规素材",
    severity: "low",
    subject: "X 公开传播文案",
    example: "未标注 PR / 広告，含夸大承诺词",
    systemAction: "下架素材并警告推广者",
    amountFrozen: 0,
    owner: "增长运营",
    status: "released"
  }
];

export const businessCpsRiskRules: BusinessCpsRiskRule[] = [
  {
    id: "risk-rule-ip-burst",
    name: "同 IP 24 小时注册超过 5 个账号",
    code: "IP_REGISTER_BURST",
    targetType: "user",
    condition: "same_ip.register_count_24h > 5",
    score: 20,
    action: "标记观察并延长结算周期",
    enabled: true
  },
  {
    id: "risk-rule-device-burst",
    name: "同设备 7 天注册超过 3 个账号",
    code: "DEVICE_REGISTER_BURST",
    targetType: "user",
    condition: "same_device.register_count_7d > 3",
    score: 30,
    action: "自动冻结返佣并进入人工审核",
    enabled: true
  },
  {
    id: "risk-rule-self-device",
    name: "推广者与被邀请人同设备",
    code: "PROMOTER_INVITEE_SAME_DEVICE",
    targetType: "promoter",
    condition: "promoter.device_id == invitee.device_id",
    score: 50,
    action: "冻结推广者收益，暂停相关链接",
    enabled: true
  },
  {
    id: "risk-rule-refund-fast",
    name: "订单完成后 10 分钟内退款",
    code: "FAST_REFUND_AFTER_COMPLETE",
    targetType: "order",
    condition: "refund_minutes_after_complete <= 10",
    score: 40,
    action: "取消返佣并生成冲正候选",
    enabled: true
  },
  {
    id: "risk-rule-team-burst",
    name: "同组织 1 小时新增下级超过 20 个",
    code: "TEAM_SUB_PROMOTER_BURST",
    targetType: "team",
    condition: "team.children_created_1h > 20",
    score: 40,
    action: "限制添加下级并提醒运营复核",
    enabled: false
  }
];

export const businessCpsWalletLedgers: BusinessCpsWalletLedger[] = [
  {
    id: "wallet-promoter-income",
    wallet: "推广者收益钱包",
    purpose: "可提现、冻结中、预估、已提现、已追回",
    balance: 468000,
    frozen: 34200,
    inflow: 184000,
    outflow: 93000
  },
  {
    id: "wallet-merchant-budget",
    wallet: "商户推广预算钱包",
    purpose: "商户自助推广活动、达人佣金和优惠成本",
    balance: 1260000,
    frozen: 82000,
    inflow: 520000,
    outflow: 318000
  },
  {
    id: "wallet-platform-growth",
    wallet: "平台增长预算池",
    purpose: "平台拉新、招商、技师招募、区域补贴",
    balance: 6820000,
    frozen: 580000,
    inflow: 2400000,
    outflow: 1468000
  },
  {
    id: "wallet-ndp-ledger",
    wallet: "NDP 点数账本",
    purpose: "付费 NDP、赠送 NDP、抵扣券、冻结 NDP 分账",
    balance: 9180000,
    frozen: 126000,
    inflow: 1880000,
    outflow: 742000
  }
];

export const businessCpsSettlementBatches: BusinessCpsSettlementBatch[] = [
  {
    id: "settle-202605-w2-aya",
    cycle: "2026-05 第 2 周 / T+7",
    promoterId: "promoter-aya",
    campaignId: "cps-campaign-01",
    commissionIds: ["com-1001", "com-1005"],
    grossAmount: 47555,
    frozenAmount: 9400,
    payableAmount: 38155,
    adjustmentAmount: 0,
    status: "reviewing",
    reviewer: "财务 Mary",
    payoutMethod: "bank",
    exportedAt: "2026-05-16 18:00"
  },
  {
    id: "settle-202605-w2-ken",
    cycle: "2026-05 第 2 周 / T+7",
    promoterId: "promoter-ken",
    campaignId: "cps-campaign-02",
    commissionIds: ["com-1002", "com-1003"],
    grossAmount: 91387,
    frozenAmount: 16800,
    payableAmount: 72187,
    adjustmentAmount: -2400,
    status: "approved",
    reviewer: "增长运营 Archer",
    payoutMethod: "ndp_wallet"
  },
  {
    id: "settle-202605-w2-misaki",
    cycle: "2026-05 第 2 周 / T+7",
    promoterId: "promoter-misaki",
    campaignId: "cps-campaign-04",
    commissionIds: ["com-1004"],
    grossAmount: 8000,
    frozenAmount: 8000,
    payableAmount: 0,
    adjustmentAmount: 0,
    status: "reviewing",
    reviewer: "风控管理员 Mina",
    payoutMethod: "manual"
  }
];

export const businessCpsAdjustments: BusinessCpsAdjustment[] = [
  {
    id: "adj-1001",
    commissionId: "com-1002",
    promoterId: "promoter-ken",
    type: "risk_cancel",
    amount: -2400,
    reason: "同 IP 短时间注册命中观察规则，扣回可疑子订单返佣",
    operator: "风控管理员 Mina",
    createdAt: "2026-05-16 15:40"
  },
  {
    id: "adj-1002",
    commissionId: "com-1005",
    promoterId: "promoter-aya",
    type: "manual_bonus",
    amount: 1200,
    reason: "活动首周素材 PR 标识合规率达标，运营手动奖励",
    operator: "增长运营 Archer",
    createdAt: "2026-05-15 17:20"
  }
];

export const businessCpsAuditLogs: BusinessCpsAuditLog[] = [
  {
    id: "audit-1",
    actor: "风控管理员 Mina",
    action: "冻结佣金",
    target: "com-1004",
    targetType: "commission",
    reason: "首单 LBS 摘要异常，等待技师运营复核",
    beforeValue: "status=pending",
    afterValue: "status=risk_frozen; frozen_reason=LBS 摘要异常",
    ip: "10.0.4.18",
    createdAt: "2026-05-16 13:24"
  },
  {
    id: "audit-2",
    actor: "增长运营 Archer",
    action: "修改归因主推广者",
    target: "attr-1003",
    targetType: "rule",
    reason: "商户导入线索与客服手动绑定冲突，以首次有效提交为准",
    beforeValue: "primary_promoter_id=support-bind",
    afterValue: "primary_promoter_id=promoter-ken",
    ip: "10.0.2.22",
    createdAt: "2026-05-15 19:08"
  },
  {
    id: "audit-3",
    actor: "财务 Mary",
    action: "释放可提现",
    target: "com-1003",
    targetType: "settlement",
    reason: "SaaS 首购已过退款检查，风控通过",
    beforeValue: "status=locked",
    afterValue: "status=withdrawable",
    ip: "10.0.8.11",
    createdAt: "2026-05-16 09:12"
  },
  {
    id: "audit-4",
    actor: "增长运营 Archer",
    action: "暂停推广链接",
    target: "link-field-shop-01",
    targetType: "link",
    reason: "预算接近 100%，继续追踪但暂不新增返佣",
    beforeValue: "status=active; allow_commission=true",
    afterValue: "status=paused; allow_commission=false",
    ip: "10.0.2.22",
    createdAt: "2026-05-16 18:20"
  }
];

export const businessCpsFlowSteps = [
  { step: "推广触达", detail: "短链 / 二维码 / 邀请码 / UTM / 线索导入" },
  { step: "点击访问", detail: "记录渠道码、地区码、活动码和设备摘要" },
  { step: "注册转化", detail: "用户 / 商户 / 技师身份创建并去重" },
  { step: "有效动作", detail: "eKYC、Booking、Request、商户首单、SaaS 购买" },
  { step: "佣金快照", detail: "按发布版本锁定 CPA / CPS / CPR / 混合规则" },
  { step: "风控确认", detail: "退款投诉期、LBS、服务时长、设备账号校验" },
  { step: "结算提现", detail: "NDP / 现金分账，可提现后进入财务批次" }
];

export type PlanWizardLocale = "ja" | "en" | "ko" | "zh-Hant" | "zh";
export type PlanWizardLocalizedText = Record<"zh" | "en" | "ja", string> & Partial<Record<"ko" | "zh-Hant", string>>;
export type PlanWizardFieldType = "text" | "url" | "number" | "textarea" | "select";

export interface PlanWizardFieldConfig {
  key?: string;
  label: PlanWizardLocalizedText;
  description: PlanWizardLocalizedText;
  defaultValue: PlanWizardLocalizedText;
  inputType: PlanWizardFieldType;
  options?: PlanWizardLocalizedText[];
  allowOptionManagement?: boolean;
}

export interface PlanWizardStepConfig {
  step: PlanWizardLocalizedText;
  caption: PlanWizardLocalizedText;
  summary: PlanWizardLocalizedText;
  fields: PlanWizardFieldConfig[];
  aiChecks: PlanWizardLocalizedText[];
  output: PlanWizardLocalizedText;
}

export type PlanWizardFlatRatePayoutKey = "firstOrder" | "periodOrder" | "periodSpend";
export type PlanWizardFlatRatePeriodKey = "30" | "60" | "90" | "180" | "forever";
export type PlanWizardPayoutValueMode = "amount" | "percentage";

export type PlanWizardFlatRatePayoutDraft = Record<
  PlanWizardFlatRatePayoutKey,
  {
    mode: PlanWizardPayoutValueMode;
    amountValue: string;
    percentageValue: string;
    period: PlanWizardFlatRatePeriodKey;
  }
>;

export const planWizardFlatRatePeriodOptions: Array<{ value: PlanWizardFlatRatePeriodKey; label: PlanWizardLocalizedText }> = [
  {
    value: "30",
    label: { ja: "30日", en: "30 days", ko: "30일", "zh-Hant": "30 天", zh: "30 天" }
  },
  {
    value: "60",
    label: { ja: "60日", en: "60 days", ko: "60일", "zh-Hant": "60 天", zh: "60 天" }
  },
  {
    value: "90",
    label: { ja: "90日", en: "90 days", ko: "90일", "zh-Hant": "90 天", zh: "90 天" }
  },
  {
    value: "180",
    label: { ja: "180日", en: "180 days", ko: "180일", "zh-Hant": "180 天", zh: "180 天" }
  },
  {
    value: "forever",
    label: { ja: "永久", en: "Forever", ko: "영구", "zh-Hant": "永久", zh: "永久" }
  }
];

export const planWizardPayoutValueModeOptions: Array<{ value: PlanWizardPayoutValueMode; label: PlanWizardLocalizedText }> = [
  {
    value: "amount",
    label: { ja: "金額", en: "Amount", ko: "금액", "zh-Hant": "金額", zh: "金额" }
  },
  {
    value: "percentage",
    label: { ja: "パーセント", en: "Percentage", ko: "퍼센트", "zh-Hant": "百分比", zh: "百分比" }
  }
];

export const planWizardFlatRatePayoutItems: Array<{
  key: PlanWizardFlatRatePayoutKey;
  label: PlanWizardLocalizedText;
  description: PlanWizardLocalizedText;
  defaultMode: PlanWizardPayoutValueMode;
  defaultAmountValue: string;
  defaultPercentageValue: string;
  defaultPeriod: PlanWizardFlatRatePeriodKey;
  allowPeriod: boolean;
}> = [
  {
    key: "firstOrder",
    label: { ja: "初回", en: "First order", ko: "첫 주문", "zh-Hant": "首單", zh: "首单" },
    description: {
      ja: "ログイン後の初回サービス利用で、事業者またはスタッフの支払いが完了した時。",
      en: "First paid service use after login, completed by the merchant or technician.",
      ko: "로그인 후 첫 서비스 이용에서 사업자 또는 기사 결제가 완료된 경우.",
      "zh-Hant": "登入後第一次使用服務，商戶或技師完成付費。",
      zh: "登录后第一次使用服务，商户或技师完成付费。"
    },
    defaultMode: "amount",
    defaultAmountValue: "1000",
    defaultPercentageValue: "10",
    defaultPeriod: "forever",
    allowPeriod: false
  },
  {
    key: "periodOrder",
    label: { ja: "期間内の各注文", en: "Per order in period", ko: "기간 내 매 주문", "zh-Hant": "期間每單", zh: "期间每单" },
    description: {
      ja: "設定した期間内で、サービス利用ごとに事業者またはスタッフの支払いが完了した時。",
      en: "Every paid service use completed by the merchant or technician within the configured period.",
      ko: "설정 기간 내 매 서비스 이용마다 사업자 또는 기사 결제가 완료된 경우.",
      "zh-Hant": "設定時間區間內，每一次使用服務，商戶或技師完成付費。",
      zh: "设定时间区间内，每一次使用服务，商户或技师完成付费。"
    },
    defaultMode: "amount",
    defaultAmountValue: "300",
    defaultPercentageValue: "10",
    defaultPeriod: "90",
    allowPeriod: true
  },
  {
    key: "periodSpend",
    label: { ja: "期間内消費", en: "Period spend", ko: "기간 내 소비", "zh-Hant": "期間消費", zh: "期间消费" },
    description: {
      ja: "設定した期間内の会費。期間は永久にも設定できます。",
      en: "Membership fee spend within the configured period. The period can be set to forever.",
      ko: "설정 기간 내 회원비 소비. 기간은 영구로도 설정할 수 있습니다.",
      "zh-Hant": "設定時間區間內的會員費，時間可設定為永久。",
      zh: "设定时间区间内的会员费，时间可设定为永久。"
    },
    defaultMode: "amount",
    defaultAmountValue: "500",
    defaultPercentageValue: "10",
    defaultPeriod: "forever",
    allowPeriod: true
  }
];

export function createInitialPlanWizardFlatRatePayoutDraft(): PlanWizardFlatRatePayoutDraft {
  return planWizardFlatRatePayoutItems.reduce((draft, item) => {
    draft[item.key] = {
      mode: item.defaultMode,
      amountValue: item.defaultAmountValue,
      percentageValue: item.defaultPercentageValue,
      period: item.defaultPeriod
    };
    return draft;
  }, {} as PlanWizardFlatRatePayoutDraft);
}

export function getPlanWizardCopy(copy: PlanWizardLocalizedText, language: string) {
  if (language === "ja") {
    return copy.ja;
  }

  if (language === "ko") {
    return copy.ko ?? copy.en;
  }

  if (language === "zh-Hant") {
    return copy["zh-Hant"] ?? copy.zh;
  }

  if (language === "en") {
    return copy.en;
  }

  return copy.zh;
}

const planWizardCategoryLocaleOrder: PlanWizardLocale[] = ["ja", "en", "ko", "zh-Hant", "zh"];

function normalizePlanWizardCategoryText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getPlanWizardCategorySource(draft: PlanWizardLocalizedText) {
  const sourceLocale = planWizardCategoryLocaleOrder.find((locale) => normalizePlanWizardCategoryText(draft[locale] ?? ""));

  if (!sourceLocale) {
    return null;
  }

  const sourceText = (draft[sourceLocale] ?? "").trim();

  return sourceText ? { sourceLocale, sourceText } : null;
}

export function autoTranslatePlanCategoryDraft(
  draft: PlanWizardLocalizedText,
  options: PlanWizardLocalizedText[] = []
): PlanWizardLocalizedText {
  const source = getPlanWizardCategorySource(draft);

  if (!source) {
    return draft;
  }

  const sourceText = normalizePlanWizardCategoryText(source.sourceText);
  const matchedOption = options.find((option) =>
    planWizardCategoryLocaleOrder.some((locale) => normalizePlanWizardCategoryText(option[locale] ?? "") === sourceText)
  );

  return {
    ja: draft.ja.trim() || matchedOption?.ja || source.sourceText,
    en: draft.en.trim() || matchedOption?.en || source.sourceText,
    ko: draft.ko?.trim() || matchedOption?.ko || source.sourceText,
    "zh-Hant": draft["zh-Hant"]?.trim() || matchedOption?.["zh-Hant"] || source.sourceText,
    zh: draft.zh.trim() || matchedOption?.zh || source.sourceText
  };
}

function getGooglePlanWizardLocale(locale: PlanWizardLocale) {
  if (locale === "zh") {
    return "zh-CN";
  }

  if (locale === "zh-Hant") {
    return "zh-TW";
  }

  return locale;
}

function parseGoogleTranslateResponse(payload: unknown) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return "";
  }

  return payload[0]
    .map((segment) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : ""))
    .join("")
    .trim();
}

async function translatePlanTextWithGooglePublicEndpoint(text: string, sourceLocale: PlanWizardLocale, targetLocale: PlanWizardLocale) {
  if (sourceLocale === targetLocale) {
    return text;
  }

  const url = new URL("https://translate.googleapis.com/translate_a/single");

  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", getGooglePlanWizardLocale(sourceLocale));
  url.searchParams.set("tl", getGooglePlanWizardLocale(targetLocale));
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Translate failed: ${response.status}`);
  }

  return parseGoogleTranslateResponse(await response.json());
}

function getPlanWizardTranslateApiUrls() {
  const urls = ["/api/translate"];

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;

    if (hostname === "127.0.0.1" || hostname === "localhost") {
      urls.push(`${protocol}//${hostname}:4176/api/translate`);

      if (hostname === "127.0.0.1") {
        urls.push(`${protocol}//localhost:4176/api/translate`);
      } else {
        urls.push(`${protocol}//127.0.0.1:4176/api/translate`);
      }
    }
  }

  return Array.from(new Set(urls));
}

async function translatePlanCategoryWithBackend(sourceLocale: PlanWizardLocale, sourceText: string) {
  const body = JSON.stringify({
    source: sourceLocale,
    text: sourceText,
    targets: planWizardCategoryLocaleOrder
  });

  for (const url of getPlanWizardTranslateApiUrls()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json() as { translations?: Partial<Record<PlanWizardLocale, string>> };

      if (payload.translations) {
        return payload.translations;
      }
    } catch {
      // Try the next local endpoint before falling back to the browser-side public endpoint.
    }
  }

  return null;
}

async function translatePlanCategoryWithGoogle(sourceLocale: PlanWizardLocale, sourceText: string) {
  const entries = await Promise.all(
    planWizardCategoryLocaleOrder.map(async (targetLocale) => {
      const translated = await translatePlanTextWithGooglePublicEndpoint(sourceText, sourceLocale, targetLocale);
      return [targetLocale, translated || sourceText] as const;
    })
  );

  return Object.fromEntries(entries) as Partial<Record<PlanWizardLocale, string>>;
}

function mergePlanCategoryTranslations(
  draft: PlanWizardLocalizedText,
  translations: Partial<Record<PlanWizardLocale, string>>,
  fallback: PlanWizardLocalizedText
): PlanWizardLocalizedText {
  return {
    ja: draft.ja.trim() || translations.ja?.trim() || fallback.ja,
    en: draft.en.trim() || translations.en?.trim() || fallback.en,
    ko: draft.ko?.trim() || translations.ko?.trim() || fallback.ko || fallback.en,
    "zh-Hant": draft["zh-Hant"]?.trim() || translations["zh-Hant"]?.trim() || fallback["zh-Hant"] || fallback.zh,
    zh: draft.zh.trim() || translations.zh?.trim() || fallback.zh
  };
}

export async function translatePlanCategoryDraft(
  draft: PlanWizardLocalizedText,
  options: PlanWizardLocalizedText[] = []
): Promise<PlanWizardLocalizedText> {
  const fallback = autoTranslatePlanCategoryDraft(draft, options);
  const source = getPlanWizardCategorySource(draft);

  if (!source || typeof fetch === "undefined") {
    return fallback;
  }

  const backendTranslations = await translatePlanCategoryWithBackend(source.sourceLocale, source.sourceText);

  if (backendTranslations) {
    return mergePlanCategoryTranslations(draft, backendTranslations, fallback);
  }

  try {
    const googleTranslations = await translatePlanCategoryWithGoogle(source.sourceLocale, source.sourceText);

    return mergePlanCategoryTranslations(draft, googleTranslations, fallback);
  } catch {
    return fallback;
  }
}

export const planWizardSteps: PlanWizardStepConfig[] = [
  {
    step: {
      zh: "填写基本信息",
      en: "Basic information",
      ja: "基本情報を入力"
    },
    caption: {
      zh: "Offer 档案",
      en: "Offer profile",
      ja: "Offer プロファイル"
    },
    summary: {
      zh: "先让推广者能快速辨识活动，再让 AI 按行业、受众、卖点和禁投规则补全草稿。",
      en: "Start with a clear offer profile so affiliates can recognize the campaign and AI can draft the industry, audience, selling points, and restrictions.",
      ja: "アフィリエイトが識別しやすい Offer 情報を先に整え、AI が業種、対象、訴求点、禁止事項を補完できるようにします。"
    },
    fields: [
      {
        label: {
          zh: "Offer 名称 (Name)",
          en: "Offer name (Name)",
          ja: "Offer 名（Name）"
        },
        description: {
          zh: "简洁明了的活动名称，方便推广者（Affiliate）辨识。",
          en: "Use a short, clear campaign name that affiliates can recognize at a glance.",
          ja: "アフィリエイトがすぐ識別できる、短く分かりやすいキャンペーン名にします。"
        },
        defaultValue: {
          zh: "港区高端按摩新客推广",
          en: "Minato premium massage new-customer offer",
          ja: "港区プレミアムマッサージ新規顧客 Offer"
        },
        inputType: "text"
      },
      {
        key: "category",
        label: {
          zh: "类别 (Category)",
          en: "Category",
          ja: "カテゴリー"
        },
        description: {
          zh: "选择产品所属产业，如 3C、服饰、美妆、软件或生活服务。",
          en: "Choose the product industry, such as electronics, apparel, beauty, software, or local services.",
          ja: "3C、アパレル、美容、ソフトウェア、生活サービスなど、商品が属する業種を選びます。"
        },
        defaultValue: {
          zh: "生活服务 / 上门按摩",
          en: "Local services / in-home massage",
          ja: "生活サービス / 出張マッサージ"
        },
        inputType: "select",
        allowOptionManagement: true,
        options: [
          {
            ja: "生活サービス / 出張マッサージ",
            en: "Local services / in-home massage",
            ko: "생활 서비스 / 방문 마사지",
            "zh-Hant": "生活服務 / 上門按摩",
            zh: "生活服务 / 上门按摩"
          },
          {
            ja: "3C / デジタル製品",
            en: "Electronics / devices",
            ko: "3C / 디지털 제품",
            "zh-Hant": "3C / 數位產品",
            zh: "3C / 数码产品"
          },
          {
            ja: "アパレル / 美容",
            en: "Apparel / beauty",
            ko: "패션 / 뷰티",
            "zh-Hant": "服飾 / 美妝",
            zh: "服饰 / 美妆"
          },
          {
            ja: "ソフトウェア / SaaS",
            en: "Software / SaaS",
            ko: "소프트웨어 / SaaS",
            "zh-Hant": "軟體 / SaaS",
            zh: "软件 / SaaS"
          }
        ]
      },
      {
        label: {
          zh: "描述 (Description)",
          en: "Description",
          ja: "説明"
        },
        description: {
          zh: "详细说明产品特色、目标受众、卖点及推广禁忌，例如不可使用品牌词投放搜索广告。",
          en: "Describe product strengths, target audience, selling points, and promotion restrictions, such as no brand-keyword search ads.",
          ja: "商品の特徴、対象ユーザー、訴求点、プロモーション禁止事項（例：ブランドキーワードでの検索広告禁止）を記載します。"
        },
        defaultValue: {
          zh: "面向东京高信用用户，主推安心预约、首单优惠和优质技师；禁止品牌词搜索投放与夸张疗效承诺。",
          en: "Target high-trust Tokyo users with safe booking, first-order benefits, and quality staff. Brand-keyword search ads and exaggerated treatment claims are prohibited.",
          ja: "東京の信頼度が高いユーザー向けに、安心予約、初回特典、質の高いスタッフを訴求します。ブランドキーワード広告や過度な効果保証は禁止です。"
        },
        inputType: "textarea"
      }
    ],
    aiChecks: [
      { zh: "AI 生成 120 字以内的 Offer 摘要", en: "AI drafts an offer summary under 120 characters", ja: "AI が120字以内の Offer 要約を作成" },
      { zh: "AI 标记品牌词、疗效承诺和高风险表达", en: "AI flags brand terms, treatment promises, and risky claims", ja: "AI がブランド語句、効果保証、リスク表現を検出" },
      { zh: "AI 对齐目标受众、行业和活动名称", en: "AI aligns audience, category, and campaign name", ja: "AI が対象、カテゴリー、キャンペーン名を整合" }
    ],
    output: {
      zh: "输出 Offer 基础档案，可保存为 AI 草稿。",
      en: "Outputs the offer profile and saves it as an AI draft.",
      ja: "Offer 基本情報を出力し、AI 下書きとして保存します。"
    }
  },
  {
    step: {
      zh: "设定追踪与链接",
      en: "Tracking and links",
      ja: "計測とリンク設定"
    },
    caption: {
      zh: "归因入口",
      en: "Attribution entry",
      ja: "アトリビューション入口"
    },
    summary: {
      zh: "配置顾客点击后的落地页、系统生成的专属追踪链接，以及归因有效天数。",
      en: "Set the landing page after click, the generated tracking link, and the valid attribution window.",
      ja: "クリック後のランディングページ、生成される専用計測リンク、アトリビューション有効期間を設定します。"
    },
    fields: [
      {
        label: {
          zh: "目标网址 (Destination URL)",
          en: "Destination URL",
          ja: "遷移先URL（Destination URL）"
        },
        description: {
          zh: "顾客点击推广链接后的落地页网址，可指向购买、预约、入驻或活动页面。",
          en: "The landing page customers reach after clicking the promotion link, such as checkout, booking, onboarding, or campaign pages.",
          ja: "顧客が紹介リンクをクリックした後に到達するページです。購入、予約、加盟申請、キャンペーンページなどを指定します。"
        },
        defaultValue: {
          zh: "https://needo.jp/app/register?campaign=minato-premium",
          en: "https://needo.jp/app/register?campaign=minato-premium",
          ja: "https://needo.jp/app/register?campaign=minato-premium"
        },
        inputType: "url"
      },
      {
        label: {
          zh: "追踪链接 (Tracking Link)",
          en: "Tracking link",
          ja: "計測リンク（Tracking Link）"
        },
        description: {
          zh: "系统生成的专属推广链接，用于记录流量来源、点击、注册、订单与佣金归因。",
          en: "A system-generated affiliate link used to record source, clicks, signups, orders, and commission attribution.",
          ja: "流入元、クリック、登録、注文、報酬帰属を記録するためにシステムが生成する専用紹介リンクです。"
        },
        defaultValue: {
          zh: "https://needo.jp/ref/aya-fit?offer=minato-premium",
          en: "https://needo.jp/ref/aya-fit?offer=minato-premium",
          ja: "https://needo.jp/ref/aya-fit?offer=minato-premium"
        },
        inputType: "url"
      },
      {
        label: {
          zh: "归因天数 (Cookie Duration)",
          en: "Cookie duration",
          ja: "Cookie 有効期間"
        },
        description: {
          zh: "设置顾客点击后多少天内完成购买都算作推广者业绩，常用 30 天或 90 天。",
          en: "Define how many days after click a purchase still counts for the affiliate, commonly 30 or 90 days.",
          ja: "クリック後、何日以内の購入をアフィリエイト成果として扱うかを設定します。一般的には30日または90日です。"
        },
        defaultValue: {
          zh: "60 天",
          en: "60 days",
          ja: "60日"
        },
        inputType: "select",
        options: [
          { zh: "30 天", en: "30 days", ja: "30日" },
          { zh: "60 天", en: "60 days", ja: "60日" },
          { zh: "90 天", en: "90 days", ja: "90日" }
        ]
      }
    ],
    aiChecks: [
      { zh: "AI 检查 URL 是否带有活动参数", en: "AI checks whether URLs include campaign parameters", ja: "AI がURLにキャンペーンパラメータがあるか確認" },
      { zh: "AI 验证追踪链接与 Offer 一一对应", en: "AI verifies the tracking link maps to this offer", ja: "AI が計測リンクと Offer の対応を確認" },
      { zh: "AI 根据品类建议 30 / 60 / 90 天窗口", en: "AI suggests a 30 / 60 / 90 day window by category", ja: "AI がカテゴリーに応じて30 / 60 / 90日の期間を提案" }
    ],
    output: {
      zh: "输出可复制的追踪链接与归因窗口。",
      en: "Outputs a copy-ready tracking link and attribution window.",
      ja: "コピー可能な計測リンクとアトリビューション期間を出力します。"
    }
  },
  {
    step: {
      zh: "设定计费与佣金",
      en: "Payout settings",
      ja: "報酬設定"
    },
    caption: {
      zh: "Payout 规则",
      en: "Payout rules",
      ja: "報酬ルール"
    },
    summary: {
      zh: "把 CPS / CPA 计费模式、金额/抽成规则和售后验证期集中放在同一步。",
      en: "Keep CPS / CPA billing, amount/percentage payout rules, and post-sale hold period in one step.",
      ja: "CPS / CPA 課金方式、金額・料率の報酬ルール、購入後の保留期間を同じステップで設定します。"
    },
    fields: [
      {
        label: {
          zh: "计费模式",
          en: "Billing model",
          ja: "課金モデル"
        },
        description: {
          zh: "选择 CPS（依成交付费）或 CPA（依动作付费），按有效成交或有效动作进入佣金计算。",
          en: "Choose CPS (cost per sale) or CPA (cost per action) so commissions are calculated by valid sales or valid actions.",
          ja: "CPS（成果報酬型）または CPA（アクション課金）を選び、有効な成約または有効アクションで報酬計算します。"
        },
        defaultValue: {
          zh: "CPS（依成交付费）",
          en: "CPS (cost per sale)",
          ja: "CPS（成果報酬型）"
        },
        inputType: "select",
        options: [
          { zh: "CPS（依成交付费）", en: "CPS (cost per sale)", ja: "CPS（成果報酬型）" },
          { zh: "CPA（依动作付费）", en: "CPA (cost per action)", ja: "CPA（アクション課金）" }
        ]
      },
      {
        label: {
          zh: "售后验证期 (Hold Period)",
          en: "Hold period",
          ja: "保留期間（Hold Period）"
        },
        description: {
          zh: "预留退换货和投诉处理时间，通常 30-60 天后确认无误再拨款给推广者。",
          en: "Reserve time for refunds, returns, and complaints. Payout is usually released after 30-60 days.",
          ja: "返品、返金、苦情対応の期間を確保します。通常30-60日後に問題がなければ支払います。"
        },
        defaultValue: {
          zh: "45 天",
          en: "45 days",
          ja: "45日"
        },
        inputType: "select",
        options: [
          { zh: "30 天", en: "30 days", ja: "30日" },
          { zh: "45 天", en: "45 days", ja: "45日" },
          { zh: "60 天", en: "60 days", ja: "60日" }
        ]
      },
      {
        key: "flatRatePayout",
        label: {
          zh: "金额和抽成",
          en: "Amount / percentage payout",
          ko: "금액 / 비율 수수료",
          "zh-Hant": "金額和抽成",
          ja: "金額・料率報酬"
        },
        description: {
          zh: "使用固定财务字段设定佣金，首单、期间每单和期间消费分别可选择金额或百分比，只输入数值。",
          en: "Use fixed finance-ready fields for first order, per order in period, and period spend. Each item can be amount or percentage; enter the value only.",
          ko: "첫 주문, 기간 내 매 주문, 기간 내 소비를 고정 재무 필드로 설정합니다. 각 항목은 금액 또는 퍼센트를 선택하고 숫자만 입력합니다.",
          "zh-Hant": "使用固定財務欄位設定佣金，首單、期間每單和期間消費分別可選擇金額或百分比，只輸入數值。",
          ja: "初回、期間内の各注文、期間内消費を固定フィールドで設定します。各項目は金額または料率を選び、数値のみ入力します。"
        },
        defaultValue: {
          zh: "首单 / 期间每单 / 期间消费",
          en: "First order / per order in period / period spend",
          ko: "첫 주문 / 기간 내 매 주문 / 기간 내 소비",
          "zh-Hant": "首單 / 期間每單 / 期間消費",
          ja: "初回 / 期間内の各注文 / 期間内消費"
        },
        inputType: "number"
      }
    ],
    aiChecks: [
      { zh: "AI 对比预算、ROI 和佣金率是否过高", en: "AI checks budget, ROI, and whether payout is too high", ja: "AI が予算、ROI、報酬率の過大設定を確認" },
      { zh: "AI 判断金额型与百分比型规则是否会重复发放", en: "AI detects duplicate amount and percentage payout rules", ja: "AI が金額型と料率型の報酬ルールの重複支払いを検出" },
      { zh: "AI 按退款风险建议验证期", en: "AI suggests a hold period based on refund risk", ja: "AI が返金リスクに応じた保留期間を提案" }
    ],
    output: {
      zh: "输出 CPS 佣金结构与冻结释放规则。",
      en: "Outputs the CPS payout structure and release rules.",
      ja: "CPS 報酬構造と保留解除ルールを出力します。"
    }
  },
  {
    step: {
      zh: "准备推广素材",
      en: "Prepare creatives",
      ja: "素材を準備"
    },
    caption: {
      zh: "Creatives",
      en: "Creatives",
      ja: "クリエイティブ"
    },
    summary: {
      zh: "把广告主视觉图、Banner、文字链结、折价券代码和专属落地页准备好，帮助推广者提升转化率。",
      en: "Prepare visuals, banners, text links, coupon codes, and dedicated landing pages so affiliates can improve conversion.",
      ja: "広告主のビジュアル、バナー、テキストリンク、クーポンコード、専用LPを準備し、アフィリエイトのCVR向上を支援します。"
    },
    fields: [
      {
        key: "creativeDimensions",
        label: {
          zh: "视觉图 / Banner",
          en: "Visuals / banners",
          ja: "ビジュアル / バナー"
        },
        description: {
          zh: "上传广告主视觉图、Banner、门店海报或视频，可自由设定宽高，并用常用广告尺寸快捷选择。",
          en: "Upload brand visuals, banners, shop posters, or videos, set width and height freely, and pick common ad sizes quickly.",
          ja: "広告主ビジュアル、バナー、店舗ポスター、動画をアップロードし、幅と高さを自由設定。主要広告サイズもすぐ選択できます。"
        },
        defaultValue: {
          zh: "1080x1350 SNS Banner / PR 标识已开",
          en: "1080x1350 SNS banner / PR label enabled",
          ja: "1080x1350 SNS バナー / PR 表記オン"
        },
        inputType: "text"
      },
      {
        label: {
          zh: "文字链结 (Text links)",
          en: "Text links",
          ja: "テキストリンク"
        },
        description: {
          zh: "准备可复制的推广文案和文字链结，适合 LINE、X、Instagram 简介或社群发布。",
          en: "Prepare copy-ready text links for LINE, X, Instagram profiles, or community posts.",
          ja: "LINE、X、Instagram プロフィール、コミュニティ投稿に使えるコピー可能なテキストリンクを用意します。"
        },
        defaultValue: {
          zh: "安心预约，首单可用 500 NDP：https://needo.jp/ref/aya-fit",
          en: "Book safely and use 500 NDP on your first order: https://needo.jp/ref/aya-fit",
          ja: "安心予約、初回500 NDP利用可：https://needo.jp/ref/aya-fit"
        },
        inputType: "textarea"
      },
      {
        label: {
          zh: "折价券代码 (Coupon Code)",
          en: "Coupon code",
          ja: "クーポンコード"
        },
        description: {
          zh: "配置可追踪的折价券或 NDP 代码，方便线下和社群场景归因。",
          en: "Set a trackable coupon or NDP code for offline and community attribution.",
          ja: "オフラインやコミュニティでの帰属計測に使えるクーポンコードまたは NDP コードを設定します。"
        },
        defaultValue: {
          zh: "MINATO500",
          en: "MINATO500",
          ja: "MINATO500"
        },
        inputType: "text"
      },
      {
        label: {
          zh: "专属推广落地页",
          en: "Dedicated landing page",
          ja: "専用ランディングページ"
        },
        description: {
          zh: "给重点推广者或渠道配置专属落地页，承接视觉、优惠和预约入口。",
          en: "Assign a dedicated landing page for key affiliates or channels to host visuals, offers, and booking entry points.",
          ja: "重点アフィリエイトやチャネル向けに専用LPを設定し、ビジュアル、特典、予約導線をまとめます。"
        },
        defaultValue: {
          zh: "Akira 落地页 / 首单优惠版",
          en: "Akira landing page / first-order offer",
          ja: "Akira LP / 初回特典版"
        },
        inputType: "select",
        options: [
          { zh: "Akira 落地页 / 首单优惠版", en: "Akira landing page / first-order offer", ja: "Akira LP / 初回特典版" },
          { zh: "Experience 落地页 / 预约版", en: "Experience landing page / booking", ja: "Experience LP / 予約版" },
          { zh: "商户入驻落地页", en: "Merchant onboarding landing page", ja: "加盟店申請 LP" }
        ]
      }
    ],
    aiChecks: [
      { zh: "AI 检查素材是否绑定 Offer 和追踪链接", en: "AI checks whether creatives are bound to the offer and link", ja: "AI が素材と Offer / 計測リンクの紐付けを確認" },
      { zh: "AI 检查文案是否含 PR / 广告标识", en: "AI checks whether copy includes PR / ad disclosure", ja: "AI が PR / 広告表記を確認" },
      { zh: "AI 为不同渠道生成短文案版本", en: "AI creates short-copy variants by channel", ja: "AI がチャネル別の短文案を生成" }
    ],
    output: {
      zh: "输出素材包、文字链结、券码和落地页配置。",
      en: "Outputs the creative pack, text links, coupon code, and landing page setup.",
      ja: "素材パック、テキストリンク、クーポンコード、LP設定を出力します。"
    }
  },
  {
    step: {
      zh: "测试与上线",
      en: "Test and launch",
      ja: "テストと公開"
    },
    caption: {
      zh: "发布前检查",
      en: "Pre-launch check",
      ja: "公開前チェック"
    },
    summary: {
      zh: "正式发布前用测试链接模拟购买，确认销售额、佣金、状态和公开范围都正确。",
      en: "Before publishing, run a test purchase with the test link and confirm sales, commission, status, and visibility.",
      ja: "公開前にテストリンクで購入をシミュレーションし、売上、報酬、ステータス、公開範囲が正しいか確認します。"
    },
    fields: [
      {
        label: {
          zh: "测试链接",
          en: "Test link",
          ja: "テストリンク"
        },
        description: {
          zh: "正式发布前使用测试链接模拟购买，确认系统能正确记录销售额与佣金。",
          en: "Use a test link before launch to simulate a purchase and confirm sales and commission tracking.",
          ja: "公開前にテストリンクで購入をシミュレーションし、売上と報酬が正しく記録されるか確認します。"
        },
        defaultValue: {
          zh: "https://needo.jp/ref/test-minato?debug=1",
          en: "https://needo.jp/ref/test-minato?debug=1",
          ja: "https://needo.jp/ref/test-minato?debug=1"
        },
        inputType: "url"
      },
      {
        label: {
          zh: "模拟购买结果",
          en: "Simulated purchase result",
          ja: "テスト購入結果"
        },
        description: {
          zh: "检查点击、注册、订单金额、佣金快照和售后验证期是否写入系统。",
          en: "Check whether clicks, signups, order value, commission snapshot, and hold period are recorded.",
          ja: "クリック、登録、注文金額、報酬スナップショット、保留期間が記録されているか確認します。"
        },
        defaultValue: {
          zh: "点击已记录 / 订单 ¥18,000 / 佣金 ¥1,440 / Hold 45 天",
          en: "Click recorded / order ¥18,000 / commission ¥1,440 / 45-day hold",
          ja: "クリック記録済み / 注文 ¥18,000 / 報酬 ¥1,440 / Hold 45日"
        },
        inputType: "text"
      },
      {
        key: "virtualTestPayment",
        label: {
          zh: "申请虚拟测试款",
          en: "Request virtual test payment",
          ja: "仮想テスト決済を申請"
        },
        description: {
          zh: "测试款会加入真实数据，但不会被结算，并会在 24 小时后自动删除。",
          en: "The test payment is written into real data, is excluded from settlement, and is automatically deleted after 24 hours.",
          ja: "テスト決済は実データに追加されますが、精算対象外となり、24時間後に自動削除されます。"
        },
        defaultValue: {
          zh: "申请虚拟测试款",
          en: "Request virtual test payment",
          ja: "仮想テスト決済を申請"
        },
        inputType: "select",
        options: [
          { zh: "申请虚拟测试款", en: "Request virtual test payment", ja: "仮想テスト決済を申請" },
          { zh: "暂不申请", en: "Do not request now", ja: "今は申請しない" }
        ]
      },
      {
        key: "virtualTestPaymentReceiver",
        label: {
          zh: "测试款接收账户 ID / 邮箱",
          en: "Test payment receiver account ID / email",
          ja: "テスト決済の受取アカウントID / メール"
        },
        description: {
          zh: "填写接收虚拟测试款的账户 ID 或邮箱，用于生成真实数据链路并标记为测试款。",
          en: "Enter the account ID or email that receives the virtual test payment so the real data path can be generated and marked as test-only.",
          ja: "仮想テスト決済を受け取るアカウントIDまたはメールを入力し、実データ経路を生成してテスト扱いにします。"
        },
        defaultValue: {
          zh: "cps-test@needo.jp",
          en: "cps-test@needo.jp",
          ja: "cps-test@needo.jp"
        },
        inputType: "text"
      },
      {
        label: {
          zh: "状态设置",
          en: "Status setting",
          ja: "ステータス設定"
        },
        description: {
          zh: "将 Offer 状态改为“有效/公开”，推广者即可领取链接并开始推广。",
          en: "Set the offer status to Active / Public so affiliates can claim links and start promotion.",
          ja: "Offer ステータスを「有効 / 公開」にすると、アフィリエイトがリンクを取得して紹介を開始できます。"
        },
        defaultValue: {
          zh: "有效 / 公开",
          en: "Active / Public",
          ja: "有効 / 公開"
        },
        inputType: "select",
        options: [
          { zh: "草稿", en: "Draft", ja: "下書き" },
          { zh: "审核中", en: "In review", ja: "審査中" },
          { zh: "有效 / 公开", en: "Active / Public", ja: "有効 / 公開" }
        ]
      }
    ],
    aiChecks: [
      { zh: "AI 运行点击到佣金的完整链路测试", en: "AI runs the full click-to-commission path test", ja: "AI がクリックから報酬までの全経路をテスト" },
      { zh: "AI 确认发布状态、公开对象和风险提示", en: "AI confirms launch status, visibility, and risk notices", ja: "AI が公開状態、公開対象、リスク表示を確認" },
      { zh: "AI 生成发布版本号和上线记录", en: "AI creates the release version and launch log", ja: "AI がリリースバージョンと公開ログを生成" }
    ],
    output: {
      zh: "输出上线检查单，确认后 Offer 进入有效 / 公开状态。",
      en: "Outputs a launch checklist. After confirmation, the offer becomes Active / Public.",
      ja: "公開チェックリストを出力します。確認後、Offer は有効 / 公開になります。"
    }
  }
];

export const phaseOneAcceptanceItems = [
  "推广者可以注册、认证、获得邀请码、生成短链接和二维码",
  "推广链接注册后可记录点击、注册、eKYC、首单、复购链路",
  "商户线索进入招商 CRM 状态流",
  "Booking / Request 完成后按规则生成预估佣金",
  "佣金进入状态机，不允许直接提现",
  "NDP 抵扣券、赠送 NDP、付费 NDP、商户预算分账",
  "产运后台可查看计划、推广者、归因订单、佣金、风险事件",
  "人工改归因、改佣金、冻结、解冻、追回写入审计日志"
];

export const businessCpsMobileTasks = [
  {
    campaignId: "cps-campaign-01",
    title: "港区高端按摩新客推广",
    tag: "高佣任务",
    commission: "Booking 净收入 8% / Request 12%",
    benefit: "500 NDP 抵扣券",
    region: "港区",
    action: "立即推广"
  },
  {
    campaignId: "cps-campaign-03",
    title: "东京商户招商 BD 奖励",
    tag: "招商任务",
    commission: "资料 ¥1,200 + 首单 ¥30,000",
    benefit: "SaaS 首月优惠",
    region: "东京 23 区",
    action: "提交线索"
  },
  {
    campaignId: "cps-campaign-04",
    title: "技师好友招募计划",
    tag: "供给招募",
    commission: "首单 ¥8,000 + 留存追加",
    benefit: "Boost 曝光券",
    region: "东京 / 横滨",
    action: "复制链接"
  }
];

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export const businessCpsDashboard = {
  todayClicks: sum(businessCpsPromotionLinks.map((link) => Math.round(link.clicks / 30))),
  todayScans: sum(businessCpsQrCodes.map((qr) => Math.round(qr.scans / 30))),
  todayRegistrations: sum(businessCpsPromotionLinks.map((link) => Math.round(link.registrations / 30))),
  todayValidRegistrations: Math.round(sum(businessCpsPromotionLinks.map((link) => link.registrations)) / 30 * 0.78),
  todayEkyc: sum(businessCpsQrCodes.map((qr) => Math.round(qr.ekycCompletions / 30))),
  todayFirstOrders: sum(businessCpsPromotionLinks.map((link) => Math.round(link.firstOrders / 30))),
  todayGmv: sum(businessCpsCampaigns.map((campaign) => Math.round(campaign.gmv / 30))),
  todayPlatformRevenue: sum(businessCpsAttributionRecords.map((record) => Math.round(record.netRevenue / 7))),
  cpsOrders: sum(businessCpsCampaigns.map((campaign) => campaign.attributedOrders)),
  newUsers: sum(businessCpsCampaigns.map((campaign) => campaign.registrations)),
  newMerchants: businessCpsMerchantLeads.filter((lead) => ["onboarded", "first_order", "saas_purchased"].includes(lead.status)).length,
  newTechnicians: 46,
  commissionSpend: sum(businessCpsCommissionRecords.map((record) => record.commissionAmount)),
  estimatedCommission: sum(businessCpsCommissionRecords.filter((record) => record.status === "estimated").map((record) => record.commissionAmount)),
  pendingCommission: sum(businessCpsCommissionRecords.filter((record) => record.status === "pending" || record.status === "locked").map((record) => record.commissionAmount)),
  withdrawableCommission: sum(businessCpsCommissionRecords.filter((record) => record.status === "withdrawable").map((record) => record.commissionAmount)),
  settledCommission: sum(businessCpsCommissionRecords.filter((record) => record.status === "paid").map((record) => record.commissionAmount)),
  roi: 5.2,
  requestRatio: 38,
  riskFrozenAmount: sum(businessCpsRiskEvents.map((event) => event.amountFrozen)),
  budgetUsageRate: Math.round((sum(businessCpsCampaigns.map((campaign) => campaign.budgetUsed)) / sum(businessCpsCampaigns.map((campaign) => campaign.budgetTotal))) * 100),
  targetCompletionRate: Math.round((sum(businessCpsPromoterTeamNodes.map((node) => node.completedFirstOrders)) / sum(businessCpsPromoterTeamNodes.map((node) => node.targetFirstOrders))) * 100),
  abnormalPromoters: businessCpsPromoters.filter((promoter) => promoter.riskScore >= 30).length,
  abnormalOrders: businessCpsRiskEvents.filter((event) => event.subject.includes("BK-") || event.subject.includes("RQ-")).length
};

export const businessCpsMobileSummary = {
  currentIdentity: "认证达人 / Aya Tokyo Fit",
  monthIncome: 86200,
  withdrawable: 46800,
  frozen: 9400,
  todayClicks: 842,
  todayRegistrations: 38,
  todayFirstOrders: 9,
  todayCommission: 12600
};

export function getBudgetUsage(campaign: BusinessCpsCampaign) {
  if (campaign.budgetTotal <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((campaign.budgetUsed / campaign.budgetTotal) * 100));
}

export function getCampaignById(campaignId: string) {
  return businessCpsCampaigns.find((campaign) => campaign.id === campaignId);
}

export function getPromoterById(promoterId: string) {
  return businessCpsPromoters.find((promoter) => promoter.id === promoterId);
}

export function getPromoterPermission(promoterId: string) {
  return businessCpsPromoterPermissions.find((permission) => permission.promoterId === promoterId);
}

export function getPromoterTeamNode(promoterId: string) {
  return businessCpsPromoterTeamNodes.find((node) => node.promoterId === promoterId);
}

export function getPromoterChildren(promoterId: string) {
  return businessCpsPromoterTeamNodes.filter((node) => node.parentPromoterId === promoterId);
}

export function getChannelById(channelId: string | undefined) {
  return channelId ? businessCpsChannels.find((channel) => channel.id === channelId) : undefined;
}

export function getMaterialById(materialId: string | undefined) {
  return materialId ? businessCpsMaterials.find((material) => material.id === materialId) : undefined;
}

export function getPromotionLinkById(linkId: string | undefined) {
  return linkId ? businessCpsPromotionLinks.find((link) => link.id === linkId) : undefined;
}

export function getCampaignRules(campaign: BusinessCpsCampaign) {
  return campaign.ruleTemplateIds
    .map((ruleId) => businessCpsRuleTemplates.find((rule) => rule.id === ruleId))
    .filter((rule): rule is BusinessCpsRuleTemplate => Boolean(rule));
}

export function getCampaignMaterials(campaign: BusinessCpsCampaign) {
  return campaign.materialIds
    .map((materialId) => businessCpsMaterials.find((material) => material.id === materialId))
    .filter((material): material is BusinessCpsMaterial => Boolean(material));
}

export function getCommissionTotalByStatus(statuses: CommissionStatus[]) {
  return sum(
    businessCpsCommissionRecords
      .filter((record) => statuses.includes(record.status))
      .map((record) => record.commissionAmount)
  );
}
