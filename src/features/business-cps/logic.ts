import {
  businessCpsAuditLogs,
  businessCpsAttributionRecords,
  businessCpsCampaigns,
  businessCpsCommissionRecords,
  businessCpsCommissionConditionRules,
  businessCpsDefaultServiceRules,
  businessCpsMaxCommissionTierCount,
  businessCpsMerchantLeads,
  businessCpsPromoterPermissions,
  businessCpsPromoters,
  businessCpsPromoterTeamNodes,
  businessCpsPromotionCodes,
  businessCpsPromotionLinks,
  businessCpsQrCodes,
  businessCpsRiskEvents,
  businessCpsSettlementBatches,
  getBudgetUsage,
  getActiveBusinessCpsLevelOneCommissionConditionRule,
  getBusinessCpsTierConditionSnapshot,
  createBusinessCpsDefaultCommissionTiers,
  createBusinessCpsDefaultPreferentialCondition,
  createBusinessCpsDefaultDowngradeCondition,
  createBusinessCpsDefaultPromotionCondition,
  normalizeBusinessCpsCommissionTiers,
  getChannelById,
  getMaterialById,
  type BusinessCpsAuditLog,
  type BusinessCpsCampaign,
  type BusinessCpsCampaignStatus,
  type BusinessCpsCarrierStatus,
  type BusinessCpsCommissionRecord,
  type BusinessCpsCommissionConditionRule,
  type BusinessCpsCommissionBasis,
  type BusinessCpsCommissionTierRule,
  type BusinessCpsDowngradeCondition,
  type BusinessCpsLevelPromotionCondition,
  type BusinessCpsPreferentialCondition,
  type BusinessCpsPromoter,
  type BusinessCpsPromoterPermission,
  type BusinessCpsPromoterTeamNode,
  type BusinessCpsPromotionCode,
  type BusinessCpsPromotionLink,
  type BusinessCpsQrCode,
  type BusinessCpsRiskEvent,
  type BusinessCpsServiceRule,
  type BusinessCpsSettlementBatch,
  type BusinessCpsSettlementBatchStatus,
  type CommissionStatus
} from "./model";

export interface BusinessCpsRuntimeState {
  campaigns: BusinessCpsCampaign[];
  promoters: BusinessCpsPromoter[];
  promoterPermissions: BusinessCpsPromoterPermission[];
  promoterTeamNodes: BusinessCpsPromoterTeamNode[];
  commissionConditionRules: BusinessCpsCommissionConditionRule[];
  serviceRules: BusinessCpsServiceRule[];
  promotionLinks: BusinessCpsPromotionLink[];
  promotionCodes: BusinessCpsPromotionCode[];
  qrCodes: BusinessCpsQrCode[];
  commissionRecords: BusinessCpsCommissionRecord[];
  settlementBatches: BusinessCpsSettlementBatch[];
  riskEvents: BusinessCpsRiskEvent[];
  auditLogs: BusinessCpsAuditLog[];
}

export type BusinessCpsNoticeTone = "success" | "warning" | "error";
export const legacyBusinessCpsRuntimeStorageKey = "needo.business-cps.runtime.v1";
export const businessCpsRuntimeStorageKey = "needo.afirieito.runtime.v1";

export interface BusinessCpsActionResult {
  state: BusinessCpsRuntimeState;
  notice: {
    tone: BusinessCpsNoticeTone;
    message: string;
  };
}

export type BusinessCpsPromoterEditableFields = Pick<
  BusinessCpsPromoter,
  "name" | "role" | "roleLabel" | "identity" | "region" | "inviteCode" | "primaryChannel" | "status"
>;

type BusinessCpsTeamRuleBaseEditableFields = Pick<
  BusinessCpsPromoterTeamNode,
  | "campaignId"
  | "budgetMode"
  | "budgetTotal"
  | "targetRegisters"
  | "targetFirstOrders"
  | "commissionRate"
  | "commissionBasis"
  | "releaseCondition"
  | "riskCondition"
  | "settlementDelayDays"
  | "validFrom"
  | "validTo"
>;

export type BusinessCpsTeamRuleEditableFields = BusinessCpsTeamRuleBaseEditableFields &
  Partial<
    Pick<
      BusinessCpsPromoterTeamNode,
      | "targetActiveShops"
      | "targetPaymentGmv"
      | "commissionConditionRuleId"
      | "commissionTiers"
      | "preferentialCondition"
      | "downgradeCondition"
      | "promotionCondition"
    >
  >;

export type BusinessCpsPermissionEditableFields = Omit<BusinessCpsPromoterPermission, "promoterId">;

export interface BusinessCpsSubPromoterInput extends BusinessCpsPromoterEditableFields, BusinessCpsTeamRuleEditableFields {
  parentPromoterId: string | null;
  level?: number;
  allowAdminLevelOverride?: boolean;
  permissions: BusinessCpsPermissionEditableFields;
}

export interface BusinessCpsPromoterUpdateInput extends BusinessCpsPromoterEditableFields, BusinessCpsTeamRuleEditableFields {
  promoterId: string;
  permissions: BusinessCpsPermissionEditableFields;
}

export type BusinessCpsCampaignAction = "submit_review" | "approve" | "start" | "pause" | "resume" | "end" | "archive" | "resolve_risk";
export type BusinessCpsCarrierAction = "pause" | "resume" | "freeze" | "discard";
export type BusinessCpsCommissionAction = "confirm" | "lock" | "release" | "request_payout" | "pay" | "freeze" | "cancel" | "clawback";
export type BusinessCpsRiskAction = "start_review" | "release" | "freeze" | "reject";
export type BusinessCpsSettlementAction = "submit" | "approve" | "pay" | "reject";

type AuditTargetType = BusinessCpsAuditLog["targetType"];

type AuditInput = {
  action: string;
  target: string;
  targetType: AuditTargetType;
  reason: string;
  beforeValue?: string;
  afterValue?: string;
};

export const campaignActionLabels: Record<BusinessCpsCampaignAction, string> = {
  submit_review: "提交审核",
  approve: "审核通过",
  start: "开始",
  pause: "暂停",
  resume: "恢复",
  end: "终止",
  archive: "归档",
  resolve_risk: "风控解除"
};

export const carrierActionLabels: Record<BusinessCpsCarrierAction, string> = {
  pause: "暂停",
  resume: "恢复",
  freeze: "风控冻结",
  discard: "作废"
};

export const commissionActionLabels: Record<BusinessCpsCommissionAction, string> = {
  confirm: "确认",
  lock: "锁定",
  release: "释放可结算",
  request_payout: "申请提现",
  pay: "标记支付",
  freeze: "冻结",
  cancel: "取消",
  clawback: "冲正追回"
};

export const riskActionLabels: Record<BusinessCpsRiskAction, string> = {
  start_review: "开始复核",
  release: "通过并释放",
  freeze: "继续冻结",
  reject: "驳回并取消返佣"
};

export const settlementActionLabels: Record<BusinessCpsSettlementAction, string> = {
  submit: "提交审核",
  approve: "财务通过",
  pay: "确认支付",
  reject: "驳回"
};

const approvedLandingRules: Record<BusinessCpsPromotionLink["landingType"], string[]> = {
  app_register: ["/app/register", "/register/user"],
  shop_apply: ["/shop/apply", "/merchant/apply"],
  cast_apply: ["/cast/apply", "/technician/apply"],
  booking: ["/request/new", "/checkout", "/orders/new"],
  membership: ["/membership", "/member/subscribe"]
};

const approvedLandingHosts = new Set(["needo.jp", "www.needo.jp", "needo.dackou.com"]);

function cloneState(): BusinessCpsRuntimeState {
  return {
    campaigns: businessCpsCampaigns.map((item) => ({ ...item })),
    promoters: businessCpsPromoters.map((item) => ({ ...item })),
    promoterPermissions: businessCpsPromoterPermissions.map((item) => ({ ...item })),
    promoterTeamNodes: businessCpsPromoterTeamNodes.map((item) => ({
      ...item,
      commissionTiers: item.commissionTiers.map((tier) => ({ ...tier, requirements: { ...tier.requirements } })),
      preferentialCondition: { ...item.preferentialCondition },
      downgradeCondition: { ...item.downgradeCondition },
      promotionCondition: { ...item.promotionCondition }
    })),
    commissionConditionRules: businessCpsCommissionConditionRules.map((item) => ({
      ...item,
      commissionTiers: item.commissionTiers.map((tier) => ({ ...tier, requirements: { ...tier.requirements } })),
      preferentialCondition: { ...item.preferentialCondition },
      downgradeCondition: { ...item.downgradeCondition },
      promotionCondition: { ...item.promotionCondition }
    })),
    serviceRules: businessCpsDefaultServiceRules.map((item) => ({ ...item })),
    promotionLinks: businessCpsPromotionLinks.map((item) => ({ ...item })),
    promotionCodes: businessCpsPromotionCodes.map((item) => ({ ...item })),
    qrCodes: businessCpsQrCodes.map((item) => ({ ...item })),
    commissionRecords: businessCpsCommissionRecords.map((item) => ({ ...item })),
    settlementBatches: businessCpsSettlementBatches.map((item) => ({ ...item, commissionIds: [...item.commissionIds] })),
    riskEvents: businessCpsRiskEvents.map((item) => ({ ...item })),
    auditLogs: businessCpsAuditLogs.map((item) => ({ ...item }))
  };
}

export function createInitialBusinessCpsState(): BusinessCpsRuntimeState {
  return cloneState();
}

function normalizeCommissionConditionRules(snapshotRules: unknown, fallbackRules: BusinessCpsCommissionConditionRule[]) {
  const source = Array.isArray(snapshotRules) && snapshotRules.length > 0 ? snapshotRules : fallbackRules;
  const normalized = source.map((rule, index) => {
    const typedRule = rule as Partial<BusinessCpsCommissionConditionRule>;
    const fallback = fallbackRules[index] ?? fallbackRules[0];

    return {
      id: typedRule.id ?? `condition-level-1-${index + 1}`,
      name: typedRule.name ?? fallback?.name ?? `分成条件 ${index + 1}`,
      status: typedRule.status ?? (index === 0 ? "active" as const : "draft" as const),
      appliesToLevel: Math.max(1, Math.floor(Number(typedRule.appliesToLevel) || 1)),
      commissionBasis: typedRule.commissionBasis ?? fallback?.commissionBasis ?? "net_revenue",
      settlementDelayDays: Math.max(0, Number(typedRule.settlementDelayDays ?? fallback?.settlementDelayDays ?? 7)),
      validFrom: typedRule.validFrom ?? fallback?.validFrom ?? "2026-05-01",
      validTo: typedRule.validTo ?? fallback?.validTo ?? "2026-12-31",
      releaseCondition: typedRule.releaseCondition ?? fallback?.releaseCondition ?? "归因订单完成支付且未退款后释放",
      riskCondition: typedRule.riskCondition ?? fallback?.riskCondition ?? "同设备、同电话或异常 LBS 命中后冻结",
      commissionTiers: normalizeBusinessCpsCommissionTiers({
        id: typedRule.id ?? `condition-level-1-${index + 1}`,
        commissionRate: typedRule.commissionTiers?.[0]?.commissionRate ?? fallback?.commissionTiers[0]?.commissionRate ?? 8,
        targetRegisters: typedRule.commissionTiers?.[0]?.requirements?.registrations ?? fallback?.commissionTiers[0]?.requirements.registrations ?? 0,
        targetActiveShops: typedRule.commissionTiers?.[0]?.requirements?.activeShops ?? fallback?.commissionTiers[0]?.requirements.activeShops ?? 0,
        targetFirstOrders: typedRule.commissionTiers?.[0]?.requirements?.firstOrders ?? fallback?.commissionTiers[0]?.requirements.firstOrders ?? 0,
        targetPaymentGmv: typedRule.commissionTiers?.[0]?.requirements?.paymentGmv ?? fallback?.commissionTiers[0]?.requirements.paymentGmv ?? 0,
        commissionTiers: typedRule.commissionTiers ?? fallback?.commissionTiers ?? []
      }),
      preferentialCondition: typedRule.preferentialCondition ?? fallback?.preferentialCondition ?? createBusinessCpsDefaultPreferentialCondition(typedRule.commissionTiers?.[0]?.commissionRate ?? 8),
      downgradeCondition: typedRule.downgradeCondition ?? fallback?.downgradeCondition ?? createBusinessCpsDefaultDowngradeCondition(),
      promotionCondition: typedRule.promotionCondition ?? fallback?.promotionCondition ?? createBusinessCpsDefaultPromotionCondition()
    };
  });
  const activeLevelOneRule = normalized.find((rule) => rule.appliesToLevel === 1 && rule.status === "active");

  if (!activeLevelOneRule) {
    return normalized.map((rule, index) => rule.appliesToLevel === 1 && index === 0 ? { ...rule, status: "active" as const } : rule);
  }

  return normalized.map((rule) => rule.appliesToLevel === 1 && rule.id !== activeLevelOneRule.id && rule.status === "active" ? { ...rule, status: "paused" as const } : rule);
}

function normalizePromoterTeamNode(node: Partial<BusinessCpsPromoterTeamNode>, fallback?: BusinessCpsPromoterTeamNode): BusinessCpsPromoterTeamNode {
  const id = node.id ?? fallback?.id ?? `team-${node.promoterId ?? Date.now()}`;
  const commissionRate = Number(node.commissionRate ?? fallback?.commissionRate ?? 8);
  const targetRegisters = Math.max(0, Number(node.targetRegisters ?? fallback?.targetRegisters ?? 0));
  const targetActiveShops = Math.max(0, Number(node.targetActiveShops ?? fallback?.targetActiveShops ?? 0));
  const targetFirstOrders = Math.max(0, Number(node.targetFirstOrders ?? fallback?.targetFirstOrders ?? 0));
  const targetPaymentGmv = Math.max(0, Number(node.targetPaymentGmv ?? fallback?.targetPaymentGmv ?? 0));

  return {
    id,
    promoterId: node.promoterId ?? fallback?.promoterId ?? "",
    parentPromoterId: node.parentPromoterId ?? fallback?.parentPromoterId ?? null,
    campaignId: node.campaignId ?? fallback?.campaignId ?? "",
    level: Math.max(1, Number(node.level ?? fallback?.level ?? 1)),
    teamSize: Math.max(1, Number(node.teamSize ?? fallback?.teamSize ?? 1)),
    directChildren: Math.max(0, Number(node.directChildren ?? fallback?.directChildren ?? 0)),
    budgetMode: node.budgetMode ?? fallback?.budgetMode ?? "inherit_parent",
    budgetTotal: Math.max(0, Number(node.budgetTotal ?? fallback?.budgetTotal ?? 0)),
    budgetUsed: Math.max(0, Number(node.budgetUsed ?? fallback?.budgetUsed ?? 0)),
    targetRegisters,
    targetActiveShops,
    targetFirstOrders,
    targetPaymentGmv,
    completedRegisters: Math.max(0, Number(node.completedRegisters ?? fallback?.completedRegisters ?? 0)),
    completedActiveShops: Math.max(0, Number(node.completedActiveShops ?? fallback?.completedActiveShops ?? 0)),
    completedFirstOrders: Math.max(0, Number(node.completedFirstOrders ?? fallback?.completedFirstOrders ?? 0)),
    completedPaymentGmv: Math.max(0, Number(node.completedPaymentGmv ?? fallback?.completedPaymentGmv ?? 0)),
    commissionConditionRuleId: node.commissionConditionRuleId ?? fallback?.commissionConditionRuleId ?? null,
    commissionRate,
    commissionBasis: node.commissionBasis ?? fallback?.commissionBasis ?? "net_revenue",
    commissionTiers: normalizeBusinessCpsCommissionTiers({
      id,
      commissionRate,
      targetRegisters,
      targetActiveShops,
      targetFirstOrders,
      targetPaymentGmv,
      commissionTiers: node.commissionTiers ?? fallback?.commissionTiers ?? []
    }),
    preferentialCondition: node.preferentialCondition ?? fallback?.preferentialCondition ?? createBusinessCpsDefaultPreferentialCondition(commissionRate),
    downgradeCondition: node.downgradeCondition ?? fallback?.downgradeCondition ?? createBusinessCpsDefaultDowngradeCondition(),
    promotionCondition: node.promotionCondition ?? fallback?.promotionCondition ?? createBusinessCpsDefaultPromotionCondition(),
    releaseCondition: node.releaseCondition ?? fallback?.releaseCondition ?? "归因订单完成支付且未退款后释放",
    riskCondition: node.riskCondition ?? fallback?.riskCondition ?? "同设备、同电话或异常 LBS 命中后冻结",
    settlementDelayDays: Math.max(0, Number(node.settlementDelayDays ?? fallback?.settlementDelayDays ?? 7)),
    validFrom: node.validFrom ?? fallback?.validFrom ?? "2026-05-01",
    validTo: node.validTo ?? fallback?.validTo ?? "2026-12-31",
    riskLevel: node.riskLevel ?? fallback?.riskLevel ?? "low"
  };
}

export function normalizeBusinessCpsRuntimeState(snapshot: Partial<BusinessCpsRuntimeState> | null | undefined): BusinessCpsRuntimeState {
  const fallback = cloneState();

  if (!snapshot || typeof snapshot !== "object") {
    return fallback;
  }

  return {
    campaigns: Array.isArray(snapshot.campaigns) ? snapshot.campaigns : fallback.campaigns,
    promoters: Array.isArray(snapshot.promoters) ? snapshot.promoters : fallback.promoters,
    promoterPermissions: Array.isArray(snapshot.promoterPermissions) ? snapshot.promoterPermissions : fallback.promoterPermissions,
    promoterTeamNodes: Array.isArray(snapshot.promoterTeamNodes)
      ? snapshot.promoterTeamNodes.map((node, index) => normalizePromoterTeamNode(node, fallback.promoterTeamNodes[index]))
      : fallback.promoterTeamNodes,
    commissionConditionRules: normalizeCommissionConditionRules(snapshot.commissionConditionRules, fallback.commissionConditionRules),
    serviceRules: Array.isArray(snapshot.serviceRules) ? snapshot.serviceRules : fallback.serviceRules,
    promotionLinks: Array.isArray(snapshot.promotionLinks) ? snapshot.promotionLinks : fallback.promotionLinks,
    promotionCodes: Array.isArray(snapshot.promotionCodes) ? snapshot.promotionCodes : fallback.promotionCodes,
    qrCodes: Array.isArray(snapshot.qrCodes) ? snapshot.qrCodes : fallback.qrCodes,
    commissionRecords: Array.isArray(snapshot.commissionRecords) ? snapshot.commissionRecords : fallback.commissionRecords,
    settlementBatches: Array.isArray(snapshot.settlementBatches)
      ? snapshot.settlementBatches.map((item) => ({ ...item, commissionIds: Array.isArray(item.commissionIds) ? item.commissionIds : [] }))
      : fallback.settlementBatches,
    riskEvents: Array.isArray(snapshot.riskEvents) ? snapshot.riskEvents : fallback.riskEvents,
    auditLogs: Array.isArray(snapshot.auditLogs) ? snapshot.auditLogs : fallback.auditLogs
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function buildBusinessCpsDashboard(state: BusinessCpsRuntimeState) {
  return {
    todayClicks: sum(state.promotionLinks.map((link) => Math.round(link.clicks / 30))),
    todayScans: sum(state.qrCodes.map((qr) => Math.round(qr.scans / 30))),
    todayRegistrations: sum(state.promotionLinks.map((link) => Math.round(link.registrations / 30))),
    todayValidRegistrations: Math.round(sum(state.promotionLinks.map((link) => link.registrations)) / 30 * 0.78),
    todayEkyc: sum(state.qrCodes.map((qr) => Math.round(qr.ekycCompletions / 30))),
    todayFirstOrders: sum(state.promotionLinks.map((link) => Math.round(link.firstOrders / 30))),
    todayGmv: sum(state.campaigns.map((campaign) => Math.round(campaign.gmv / 30))),
    todayPlatformRevenue: sum(businessCpsAttributionRecords.map((record) => Math.round(record.netRevenue / 7))),
    cpsOrders: sum(state.campaigns.map((campaign) => campaign.attributedOrders)),
    newUsers: sum(state.campaigns.map((campaign) => campaign.registrations)),
    newMerchants: businessCpsMerchantLeads.filter((lead) => ["onboarded", "first_order", "saas_purchased"].includes(lead.status)).length,
    newTechnicians: 46,
    commissionSpend: sum(state.commissionRecords.map((record) => record.commissionAmount)),
    estimatedCommission: sum(state.commissionRecords.filter((record) => record.status === "estimated").map((record) => record.commissionAmount)),
    pendingCommission: sum(state.commissionRecords.filter((record) => record.status === "pending" || record.status === "locked").map((record) => record.commissionAmount)),
    withdrawableCommission: sum(state.commissionRecords.filter((record) => record.status === "withdrawable").map((record) => record.commissionAmount)),
    settledCommission: sum(state.commissionRecords.filter((record) => record.status === "paid").map((record) => record.commissionAmount)),
    roi: 5.2,
    requestRatio: 38,
    riskFrozenAmount: sum(state.riskEvents.filter((event) => event.status === "new" || event.status === "reviewing").map((event) => event.amountFrozen)),
    budgetUsageRate: Math.round((sum(state.campaigns.map((campaign) => campaign.budgetUsed)) / sum(state.campaigns.map((campaign) => campaign.budgetTotal))) * 100),
    targetCompletionRate: Math.round(sum(state.promoterTeamNodes.map((node) => getBusinessCpsTierConditionSnapshot(node, state.commissionConditionRules).progress)) / Math.max(1, state.promoterTeamNodes.length)),
    abnormalPromoters: state.promoters.filter((promoter) => promoter.riskScore >= 30).length,
    abnormalOrders: state.riskEvents.filter((event) => event.subject.includes("BK-") || event.subject.includes("RQ-")).length
  };
}

export type BusinessCpsDashboardSnapshot = ReturnType<typeof buildBusinessCpsDashboard>;

function requireReason(reason: string) {
  return reason.trim().length >= 4;
}

function nowLabel() {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function auditLog(input: AuditInput): BusinessCpsAuditLog {
  return {
    id: `audit-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    actor: "CPS 运营",
    action: input.action,
    target: input.target,
    targetType: input.targetType,
    reason: input.reason.trim(),
    beforeValue: input.beforeValue,
    afterValue: input.afterValue,
    ip: "127.0.0.1",
    createdAt: nowLabel()
  };
}

function withError(state: BusinessCpsRuntimeState, message: string): BusinessCpsActionResult {
  return {
    state,
    notice: {
      tone: "error",
      message
    }
  };
}

function withSuccess(state: BusinessCpsRuntimeState, message: string): BusinessCpsActionResult {
  return {
    state,
    notice: {
      tone: "success",
      message
    }
  };
}

function pushLog(state: BusinessCpsRuntimeState, input: AuditInput) {
  return {
    ...state,
    auditLogs: [auditLog(input), ...state.auditLogs]
  };
}

function updateCampaignCarriersForStatus(state: BusinessCpsRuntimeState, campaignId: string, nextStatus: BusinessCpsCampaignStatus) {
  const shouldPauseCommission = nextStatus !== "active";

  return {
    ...state,
    promotionLinks: state.promotionLinks.map((link) =>
      link.campaignId === campaignId
        ? {
            ...link,
            status: shouldPauseCommission && link.status === "active" ? "paused" as const : link.status,
            allowCommission: shouldPauseCommission ? false : link.status === "active"
          }
        : link
    ),
    promotionCodes: state.promotionCodes.map((code) =>
      code.campaignId === campaignId && shouldPauseCommission && code.status === "active" ? { ...code, status: "paused" as const } : code
    ),
    qrCodes: state.qrCodes.map((qr) =>
      qr.campaignId === campaignId && shouldPauseCommission && qr.status === "active" ? { ...qr, status: "paused" as const } : qr
    )
  };
}

export function getAvailableCampaignActions(campaign: BusinessCpsCampaign): BusinessCpsCampaignAction[] {
  if (campaign.status === "draft") {
    return ["submit_review"];
  }

  if (campaign.status === "reviewing") {
    return ["approve", "archive"];
  }

  if (campaign.status === "scheduled") {
    return ["start", "archive"];
  }

  if (campaign.status === "active") {
    return ["pause", "end"];
  }

  if (campaign.status === "paused") {
    return ["resume", "end", "archive"];
  }

  if (campaign.status === "risk_paused") {
    return ["resolve_risk", "end"];
  }

  if (campaign.status === "ended") {
    return ["archive"];
  }

  return [];
}

function getNextCampaignStatus(campaign: BusinessCpsCampaign, action: BusinessCpsCampaignAction): BusinessCpsCampaignStatus | null {
  const usage = getBudgetUsage(campaign);

  if (usage >= 100 && (action === "start" || action === "resume")) {
    return "budget_exhausted";
  }

  if (campaign.status === "draft" && action === "submit_review") {
    return "reviewing";
  }

  if (campaign.status === "reviewing" && action === "approve") {
    return "scheduled";
  }

  if (campaign.status === "scheduled" && action === "start") {
    return "active";
  }

  if (campaign.status === "active" && action === "pause") {
    return "paused";
  }

  if (campaign.status === "active" && action === "end") {
    return "ended";
  }

  if (campaign.status === "paused" && action === "resume") {
    return "active";
  }

  if (campaign.status === "paused" && action === "end") {
    return "ended";
  }

  if (campaign.status === "paused" && action === "archive") {
    return "archived";
  }

  if (campaign.status === "risk_paused" && action === "resolve_risk") {
    return "paused";
  }

  if (campaign.status === "risk_paused" && action === "end") {
    return "ended";
  }

  if ((campaign.status === "reviewing" || campaign.status === "scheduled" || campaign.status === "ended") && action === "archive") {
    return "archived";
  }

  return null;
}

export function applyCampaignAction(
  state: BusinessCpsRuntimeState,
  campaignId: string,
  action: BusinessCpsCampaignAction,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "危险操作必须填写 4 个字以上的原因，并写入操作日志。");
  }

  const campaign = state.campaigns.find((item) => item.id === campaignId);

  if (!campaign) {
    return withError(state, "未找到推广计划。");
  }

  const nextStatus = getNextCampaignStatus(campaign, action);

  if (!nextStatus) {
    return withError(state, `${campaignStatusForMessage(campaign.status)} 状态下不能执行「${campaignActionLabels[action]}」。`);
  }

  let nextState: BusinessCpsRuntimeState = {
    ...state,
    campaigns: state.campaigns.map((item) => (item.id === campaignId ? { ...item, status: nextStatus } : item))
  };

  nextState = updateCampaignCarriersForStatus(nextState, campaignId, nextStatus);
  nextState = pushLog(nextState, {
    action: campaignActionLabels[action],
    target: campaign.id,
    targetType: "campaign",
    reason,
    beforeValue: `status=${campaign.status}`,
    afterValue: `status=${nextStatus}`
  });

  return withSuccess(nextState, `${campaign.name} 已${campaignActionLabels[action]}，并已写入审计日志。`);
}

function campaignStatusForMessage(status: BusinessCpsCampaignStatus) {
  return status;
}

const commissionBases = new Set<BusinessCpsCommissionBasis>(["net_revenue", "order_amount", "gross_margin", "fixed_reward"]);

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeInviteCode(value: string) {
  return compactText(value).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
}

function createPromoterId(name: string, inviteCode: string) {
  const base = normalizeInviteCode(inviteCode) || compactText(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return `promoter-${base || "sub"}-${Date.now().toString(36)}`;
}

function validatePromoterInput(state: BusinessCpsRuntimeState, input: BusinessCpsPromoterEditableFields, currentPromoterId?: string) {
  const name = compactText(input.name);
  const inviteCode = normalizeInviteCode(input.inviteCode);

  if (name.length < 2) {
    return "推广者名称至少需要 2 个字符。";
  }

  if (!compactText(input.identity)) {
    return "需要填写推广者身份说明。";
  }

  if (!compactText(input.region)) {
    return "需要填写地区。";
  }

  if (inviteCode.length < 4) {
    return "邀请码至少需要 4 位，并且只能包含字母、数字、下划线或横线。";
  }

  const inviteCodeExists = state.promoters.some((promoter) => promoter.id !== currentPromoterId && normalizeInviteCode(promoter.inviteCode) === inviteCode);

  if (inviteCodeExists) {
    return "邀请码已经被其他推广者使用。";
  }

  return null;
}

function validateCommissionTiers(input: BusinessCpsTeamRuleEditableFields) {
  const tiers = Array.isArray(input.commissionTiers) ? input.commissionTiers : [];

  if (tiers.length === 0) {
    return null;
  }

  if (tiers.length > businessCpsMaxCommissionTierCount) {
    return "分成阶梯最多只能设置到 15 级。";
  }

  for (const tier of tiers) {
    if (tier.commissionRate < 0 || tier.commissionRate > 100) {
      return "每个阶梯的分成百分比必须在 0% 到 100% 之间。";
    }

    if (
      tier.requirements.registrations < 0 ||
      tier.requirements.activeShops < 0 ||
      tier.requirements.activeShopWeeklyOrders < 0 ||
      tier.requirements.firstOrders < 0 ||
      tier.requirements.paymentGmv < 0
    ) {
      return "阶梯条件不能为负数。";
    }
  }

  return null;
}

function validateTeamRuleInput(state: BusinessCpsRuntimeState, input: BusinessCpsTeamRuleEditableFields) {
  if (!state.campaigns.some((campaign) => campaign.id === input.campaignId)) {
    return "需要选择有效的推广计划。";
  }

  if (
    input.budgetTotal < 0 ||
    input.targetRegisters < 0 ||
    Number(input.targetActiveShops) < 0 ||
    input.targetFirstOrders < 0 ||
    Number(input.targetPaymentGmv) < 0
  ) {
    return "预算和目标不能为负数。";
  }

  if (input.commissionRate < 0 || input.commissionRate > 100) {
    return "分成百分比必须在 0% 到 100% 之间。";
  }

  if (!commissionBases.has(input.commissionBasis)) {
    return "需要选择有效的分成计算基准。";
  }

  const tierIssue = validateCommissionTiers(input);

  if (tierIssue) {
    return tierIssue;
  }

  if (!compactText(input.releaseCondition)) {
    return "需要填写返佣释放条件。";
  }

  if (!compactText(input.riskCondition)) {
    return "需要填写风控冻结条件。";
  }

  if (input.settlementDelayDays < 0 || input.settlementDelayDays > 365) {
    return "结算延迟天数必须在 0 到 365 天之间。";
  }

  if (!input.validFrom || !input.validTo) {
    return "需要填写规则有效期。";
  }

  return null;
}

function normalizePermissions(permissions: BusinessCpsPermissionEditableFields): BusinessCpsPermissionEditableFields {
  return {
    canCreateLink: Boolean(permissions.canCreateLink),
    canCreateCode: Boolean(permissions.canCreateCode),
    canCreateQr: Boolean(permissions.canCreateQr),
    canCreateSubPromoter: Boolean(permissions.canCreateSubPromoter),
    canViewSubData: Boolean(permissions.canViewSubData),
    canViewCommission: Boolean(permissions.canViewCommission),
    canWithdraw: Boolean(permissions.canWithdraw),
    canUploadMaterial: Boolean(permissions.canUploadMaterial)
  };
}

function normalizePreferentialCondition(input: BusinessCpsPreferentialCondition | undefined, rate: number): BusinessCpsPreferentialCondition {
  return input ? { ...input } : createBusinessCpsDefaultPreferentialCondition(rate);
}

function normalizeDowngradeCondition(input: BusinessCpsDowngradeCondition | undefined): BusinessCpsDowngradeCondition {
  return input ? { ...input } : createBusinessCpsDefaultDowngradeCondition();
}

function normalizePromotionCondition(input: BusinessCpsLevelPromotionCondition | undefined): BusinessCpsLevelPromotionCondition {
  return input ? { ...input } : createBusinessCpsDefaultPromotionCondition();
}

function normalizeInputCommissionTiers(input: BusinessCpsTeamRuleEditableFields, nodeId: string) {
  const commissionTiers = Array.isArray(input.commissionTiers) && input.commissionTiers.length > 0
    ? input.commissionTiers
    : createBusinessCpsDefaultCommissionTiers({
        nodeId,
        commissionRate: input.commissionRate,
        targetRegisters: Number(input.targetRegisters) || 0,
        targetActiveShops: Number(input.targetActiveShops) || 0,
        targetFirstOrders: Number(input.targetFirstOrders) || 0,
        targetPaymentGmv: Number(input.targetPaymentGmv) || 0
      });

  return normalizeBusinessCpsCommissionTiers({
    id: nodeId,
    commissionRate: input.commissionRate,
    targetRegisters: Number(input.targetRegisters) || 0,
    targetActiveShops: Number(input.targetActiveShops) || 0,
    targetFirstOrders: Number(input.targetFirstOrders) || 0,
    targetPaymentGmv: Number(input.targetPaymentGmv) || 0,
    commissionTiers
  });
}

function syncLevelOneCommissionConditionRule(
  state: BusinessCpsRuntimeState,
  input: BusinessCpsTeamRuleEditableFields,
  fallbackRuleName: string
) {
  const activeLevelOneRule = input.commissionConditionRuleId
    ? state.commissionConditionRules.find((rule) => rule.id === input.commissionConditionRuleId)
    : getActiveBusinessCpsLevelOneCommissionConditionRule(state.commissionConditionRules);
  const ruleId = activeLevelOneRule?.id ?? `condition-level-1-${Date.now().toString(36)}`;
  const nextRule: BusinessCpsCommissionConditionRule = {
    id: ruleId,
    name: activeLevelOneRule?.name ?? fallbackRuleName,
    status: "active",
    appliesToLevel: 1,
    commissionBasis: input.commissionBasis,
    settlementDelayDays: input.settlementDelayDays,
    validFrom: input.validFrom,
    validTo: input.validTo,
    releaseCondition: compactText(input.releaseCondition),
    riskCondition: compactText(input.riskCondition),
    commissionTiers: normalizeInputCommissionTiers(input, ruleId),
    preferentialCondition: normalizePreferentialCondition(input.preferentialCondition, input.commissionRate),
    downgradeCondition: normalizeDowngradeCondition(input.downgradeCondition),
    promotionCondition: normalizePromotionCondition(input.promotionCondition)
  };
  const hasRule = state.commissionConditionRules.some((rule) => rule.id === ruleId);

  return {
    ruleId,
    commissionConditionRules: hasRule
      ? state.commissionConditionRules.map((rule) =>
          rule.appliesToLevel === 1
            ? rule.id === ruleId
              ? nextRule
              : { ...rule, status: rule.status === "active" ? "paused" as const : rule.status }
            : rule
        )
      : [
          nextRule,
          ...state.commissionConditionRules.map((rule) =>
            rule.appliesToLevel === 1 && rule.status === "active" ? { ...rule, status: "paused" as const } : rule
          )
        ]
  };
}

function normalizeOrganizationLevel(level: number | null | undefined) {
  const normalized = Math.floor(Number(level));

  if (!Number.isFinite(normalized)) {
    return 1;
  }

  return Math.min(99, Math.max(1, normalized));
}

function collectTeamAncestorPromoterIds(state: BusinessCpsRuntimeState, promoterId: string) {
  const ancestors: string[] = [];
  let currentId: string | null = promoterId;

  while (currentId) {
    const node = state.promoterTeamNodes.find((item) => item.promoterId === currentId);

    if (!node || ancestors.includes(currentId)) {
      break;
    }

    ancestors.push(currentId);
    currentId = node.parentPromoterId;
  }

  return ancestors;
}

export function applyCreateSubPromoter(
  state: BusinessCpsRuntimeState,
  input: BusinessCpsSubPromoterInput,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "新增下级推广者必须填写 4 个字以上的原因，并写入操作日志。");
  }

  const parent = input.parentPromoterId ? state.promoters.find((promoter) => promoter.id === input.parentPromoterId) ?? null : null;

  if (input.parentPromoterId && !parent) {
    return withError(state, "未找到上级推广者。");
  }

  const parentNode = parent ? state.promoterTeamNodes.find((node) => node.promoterId === parent.id) ?? null : null;
  const requestedLevel = normalizeOrganizationLevel(input.level ?? (parentNode ? parentNode.level + 1 : 1));
  const resolvedParent = requestedLevel > 1 ? parent : null;

  if (requestedLevel > 1 && !resolvedParent) {
    return withError(state, "2级以上组织需要选择上一层组织。");
  }

  if (resolvedParent && !parentNode) {
    return withError(state, "未找到上级组织节点。");
  }

  if (resolvedParent && parentNode && parentNode.level !== requestedLevel - 1) {
    return withError(state, "所选上级组织必须位于目标层级的上一层。");
  }

  if (resolvedParent && !input.allowAdminLevelOverride) {
    const parentPermission = state.promoterPermissions.find((permission) => permission.promoterId === resolvedParent.id);

    if (!parentPermission?.canCreateSubPromoter) {
      return withError(state, "该上级推广者没有添加下级推广者权限。");
    }
  }

  const promoterIssue = validatePromoterInput(state, input);

  if (promoterIssue) {
    return withError(state, promoterIssue);
  }

  const ruleIssue = validateTeamRuleInput(state, input);

  if (ruleIssue) {
    return withError(state, ruleIssue);
  }

  const inviteCode = normalizeInviteCode(input.inviteCode);
  const promoterId = createPromoterId(input.name, inviteCode);
  const nodeId = `team-${promoterId}`;
  const levelOneConditionSync = requestedLevel === 1 ? syncLevelOneCommissionConditionRule(state, input, "1级全局阶梯条件") : null;
  const normalizedCommissionTiers = normalizeInputCommissionTiers(input, nodeId);
  const nextPromoter: BusinessCpsPromoter = {
    id: promoterId,
    name: compactText(input.name),
    role: input.role,
    roleLabel: compactText(input.roleLabel) || "下级推广者",
    identity: compactText(input.identity),
    region: compactText(input.region),
    inviteCode,
    primaryChannel: compactText(input.primaryChannel) || (resolvedParent?.primaryChannel ?? ""),
    monthIncome: 0,
    withdrawable: 0,
    frozen: 0,
    clicksToday: 0,
    registrationsToday: 0,
    firstOrdersToday: 0,
    commissionToday: 0,
    riskScore: 0,
    status: input.status
  };
  const nextNode: BusinessCpsPromoterTeamNode = {
    id: nodeId,
    promoterId,
    parentPromoterId: resolvedParent?.id ?? null,
    campaignId: input.campaignId,
    level: requestedLevel,
    teamSize: 1,
    directChildren: 0,
    budgetMode: input.budgetMode,
    budgetTotal: input.budgetTotal,
    budgetUsed: 0,
    targetRegisters: input.targetRegisters,
    targetActiveShops: Number(input.targetActiveShops) || 0,
    targetFirstOrders: input.targetFirstOrders,
    targetPaymentGmv: Number(input.targetPaymentGmv) || 0,
    completedRegisters: 0,
    completedActiveShops: 0,
    completedFirstOrders: 0,
    completedPaymentGmv: 0,
    commissionConditionRuleId: levelOneConditionSync?.ruleId ?? input.commissionConditionRuleId ?? null,
    commissionRate: input.commissionRate,
    commissionBasis: input.commissionBasis,
    commissionTiers: normalizedCommissionTiers,
    preferentialCondition: normalizePreferentialCondition(input.preferentialCondition, input.commissionRate),
    downgradeCondition: normalizeDowngradeCondition(input.downgradeCondition),
    promotionCondition: normalizePromotionCondition(input.promotionCondition),
    releaseCondition: compactText(input.releaseCondition),
    riskCondition: compactText(input.riskCondition),
    settlementDelayDays: input.settlementDelayDays,
    validFrom: input.validFrom,
    validTo: input.validTo,
    riskLevel: "low"
  };
  const resolvedParentId = resolvedParent?.id ?? "";
  const ancestorIds = resolvedParent ? collectTeamAncestorPromoterIds(state, resolvedParent.id) : [];
  const nextState = pushLog(
    {
      ...state,
      promoters: [nextPromoter, ...state.promoters],
      promoterPermissions: [{ promoterId, ...normalizePermissions(input.permissions) }, ...state.promoterPermissions],
      commissionConditionRules: levelOneConditionSync?.commissionConditionRules ?? state.commissionConditionRules,
      promoterTeamNodes: [
        ...state.promoterTeamNodes.map((node) =>
          ancestorIds.includes(node.promoterId)
            ? {
                ...node,
                teamSize: node.teamSize + 1,
                directChildren: node.promoterId === resolvedParentId ? node.directChildren + 1 : node.directChildren
              }
            : node
        ),
        nextNode
      ]
    },
    {
      action: "新增下级推广者",
      target: promoterId,
      targetType: "promoter",
      reason,
      afterValue: `parent=${resolvedParent?.id ?? "platform"}; level=${requestedLevel}; campaign=${input.campaignId}; rate=${input.commissionRate}%; basis=${input.commissionBasis}; release=${nextNode.releaseCondition}`
    }
  );

  return withSuccess(
    nextState,
    resolvedParent
      ? `${nextPromoter.name} 已添加为 ${resolvedParent.name} 的下级推广者，分成规则已生效。`
      : `${nextPromoter.name} 已添加为本平台的 ${requestedLevel}级组织推广者，分成规则已生效。`
  );
}

export function applyUpdatePromoter(
  state: BusinessCpsRuntimeState,
  input: BusinessCpsPromoterUpdateInput,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "编辑推广者资料和分成规则必须填写 4 个字以上的原因。");
  }

  const promoter = state.promoters.find((item) => item.id === input.promoterId);
  const teamNode = state.promoterTeamNodes.find((node) => node.promoterId === input.promoterId);

  if (!promoter || !teamNode) {
    return withError(state, "未找到可编辑的推广者或组织节点。");
  }

  const promoterIssue = validatePromoterInput(state, input, input.promoterId);

  if (promoterIssue) {
    return withError(state, promoterIssue);
  }

  const ruleIssue = validateTeamRuleInput(state, input);

  if (ruleIssue) {
    return withError(state, ruleIssue);
  }

  const inviteCode = normalizeInviteCode(input.inviteCode);
  const levelOneConditionSync = teamNode.level === 1 ? syncLevelOneCommissionConditionRule(state, input, "1级全局阶梯条件") : null;
  const normalizedCommissionTiers = normalizeInputCommissionTiers(input, teamNode.id);
  const nextState = pushLog(
    {
      ...state,
      promoters: state.promoters.map((item) =>
        item.id === input.promoterId
          ? {
              ...item,
              name: compactText(input.name),
              role: input.role,
              roleLabel: compactText(input.roleLabel) || item.roleLabel,
              identity: compactText(input.identity),
              region: compactText(input.region),
              inviteCode,
              primaryChannel: compactText(input.primaryChannel),
              status: input.status
            }
          : item
      ),
      promoterPermissions: state.promoterPermissions.map((permission) =>
        permission.promoterId === input.promoterId ? { promoterId: input.promoterId, ...normalizePermissions(input.permissions) } : permission
      ),
      commissionConditionRules: levelOneConditionSync?.commissionConditionRules ?? state.commissionConditionRules,
      promoterTeamNodes: state.promoterTeamNodes.map((node) =>
        node.promoterId === input.promoterId
          ? {
              ...node,
              campaignId: input.campaignId,
              budgetMode: input.budgetMode,
              budgetTotal: input.budgetTotal,
              targetRegisters: input.targetRegisters,
              targetActiveShops: Number(input.targetActiveShops) || 0,
              targetFirstOrders: input.targetFirstOrders,
              targetPaymentGmv: Number(input.targetPaymentGmv) || 0,
              commissionConditionRuleId: levelOneConditionSync?.ruleId ?? input.commissionConditionRuleId ?? null,
              commissionRate: input.commissionRate,
              commissionBasis: input.commissionBasis,
              commissionTiers: normalizedCommissionTiers,
              preferentialCondition: normalizePreferentialCondition(input.preferentialCondition, input.commissionRate),
              downgradeCondition: normalizeDowngradeCondition(input.downgradeCondition),
              promotionCondition: normalizePromotionCondition(input.promotionCondition),
              releaseCondition: compactText(input.releaseCondition),
              riskCondition: compactText(input.riskCondition),
              settlementDelayDays: input.settlementDelayDays,
              validFrom: input.validFrom,
              validTo: input.validTo
            }
          : node
      )
    },
    {
      action: "编辑推广者资料",
      target: promoter.id,
      targetType: "promoter",
      reason,
      beforeValue: `name=${promoter.name}; rate=${teamNode.commissionRate}%; campaign=${teamNode.campaignId}`,
      afterValue: `name=${compactText(input.name)}; rate=${input.commissionRate}%; campaign=${input.campaignId}`
    }
  );

  return withSuccess(nextState, `${compactText(input.name)} 的资料、权限和分成条件已更新。`);
}

export function getAvailableCarrierActions(status: BusinessCpsCarrierStatus): BusinessCpsCarrierAction[] {
  if (status === "active") {
    return ["pause", "freeze"];
  }

  if (status === "paused") {
    return ["resume", "freeze", "discard"];
  }

  if (status === "risk_frozen") {
    return ["resume", "discard"];
  }

  return [];
}

function getNextCarrierStatus(status: BusinessCpsCarrierStatus, action: BusinessCpsCarrierAction): BusinessCpsCarrierStatus | null {
  if (action === "pause" && status === "active") {
    return "paused";
  }

  if (action === "resume" && (status === "paused" || status === "risk_frozen")) {
    return "active";
  }

  if (action === "freeze" && (status === "active" || status === "paused")) {
    return "risk_frozen";
  }

  if (action === "discard" && (status === "paused" || status === "risk_frozen")) {
    return "discarded";
  }

  return null;
}

export function isApprovedLandingUrl(link: Pick<BusinessCpsPromotionLink, "landingType" | "landingUrl">) {
  try {
    const url = new URL(link.landingUrl);
    const paths = approvedLandingRules[link.landingType];

    return approvedLandingHosts.has(url.hostname) && paths.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`));
  } catch {
    return false;
  }
}

export function validatePromotionLink(link: BusinessCpsPromotionLink, state: BusinessCpsRuntimeState) {
  const issues: string[] = [];
  const campaign = state.campaigns.find((item) => item.id === link.campaignId);
  const material = getMaterialById(link.materialId);
  const channel = getChannelById(link.channelId);

  if (!campaign) {
    issues.push("未绑定有效活动");
  }

  if (!material) {
    issues.push("未绑定素材");
  }

  if (material && material.campaignId !== link.campaignId) {
    issues.push("素材与活动不一致");
  }

  if (!channel) {
    issues.push("未绑定渠道");
  }

  if (!isApprovedLandingUrl(link)) {
    issues.push("落地页不是已批准 NeeDo 埋点页面");
  }

  if (link.allowCommission && (link.status !== "active" || campaign?.status !== "active")) {
    issues.push("非启用状态仍允许新增返佣");
  }

  if (link.allowCommission && campaign && getBudgetUsage(campaign) >= 100) {
    issues.push("预算已达上限仍允许新增返佣");
  }

  return issues;
}

export function applyCarrierAction(
  state: BusinessCpsRuntimeState,
  linkId: string,
  action: BusinessCpsCarrierAction,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "暂停、恢复、冻结或作废链接必须填写操作原因。");
  }

  const link = state.promotionLinks.find((item) => item.id === linkId);

  if (!link) {
    return withError(state, "未找到推广链接。");
  }

  const nextStatus = getNextCarrierStatus(link.status, action);

  if (!nextStatus) {
    return withError(state, `${link.status} 状态下不能执行「${carrierActionLabels[action]}」。`);
  }

  const campaign = state.campaigns.find((item) => item.id === link.campaignId);
  const allowCommission = nextStatus === "active" && campaign?.status === "active" && getBudgetUsage(campaign) < 100;
  const nextState = pushLog(
    {
      ...state,
      promotionLinks: state.promotionLinks.map((item) =>
        item.id === linkId
          ? {
              ...item,
              status: nextStatus,
              allowCommission
            }
          : item
      )
    },
    {
      action: carrierActionLabels[action],
      target: link.id,
      targetType: "link",
      reason,
      beforeValue: `status=${link.status}; allow_commission=${link.allowCommission}`,
      afterValue: `status=${nextStatus}; allow_commission=${allowCommission}`
    }
  );

  return withSuccess(nextState, `${link.name} 已${carrierActionLabels[action]}。历史数据保留，后续追踪继续可查。`);
}

export function getAvailableCommissionActions(status: CommissionStatus): BusinessCpsCommissionAction[] {
  if (status === "estimated") {
    return ["confirm", "freeze", "cancel"];
  }

  if (status === "pending") {
    return ["lock", "freeze", "cancel"];
  }

  if (status === "locked") {
    return ["release", "freeze", "cancel"];
  }

  if (status === "withdrawable") {
    return ["request_payout", "freeze"];
  }

  if (status === "withdrawing") {
    return ["pay", "freeze"];
  }

  if (status === "risk_frozen") {
    return ["confirm", "cancel"];
  }

  if (status === "paid") {
    return ["clawback"];
  }

  return [];
}

function getNextCommissionStatus(status: CommissionStatus, action: BusinessCpsCommissionAction): CommissionStatus | null {
  if (action === "freeze" && status !== "paid" && status !== "clawed_back" && status !== "cancelled") {
    return "risk_frozen";
  }

  if (action === "cancel" && status !== "paid" && status !== "clawed_back" && status !== "cancelled") {
    return "cancelled";
  }

  if (status === "estimated" && action === "confirm") {
    return "pending";
  }

  if (status === "pending" && action === "lock") {
    return "locked";
  }

  if (status === "locked" && action === "release") {
    return "withdrawable";
  }

  if (status === "withdrawable" && action === "request_payout") {
    return "withdrawing";
  }

  if (status === "withdrawing" && action === "pay") {
    return "paid";
  }

  if (status === "risk_frozen" && action === "confirm") {
    return "pending";
  }

  if (status === "paid" && action === "clawback") {
    return "clawed_back";
  }

  return null;
}

export function applyCommissionAction(
  state: BusinessCpsRuntimeState,
  commissionId: string,
  action: BusinessCpsCommissionAction,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "佣金状态变更必须填写原因，不能直接改金额。");
  }

  const record = state.commissionRecords.find((item) => item.id === commissionId);

  if (!record) {
    return withError(state, "未找到佣金记录。");
  }

  const nextStatus = getNextCommissionStatus(record.status, action);

  if (!nextStatus) {
    return withError(state, `${record.status} 状态下不能执行「${commissionActionLabels[action]}」。`);
  }

  const nextState = pushLog(
    {
      ...state,
      commissionRecords: state.commissionRecords.map((item) =>
        item.id === commissionId
          ? {
              ...item,
              status: nextStatus,
              riskReason: nextStatus === "risk_frozen" ? reason.trim() : item.riskReason
            }
          : item
      )
    },
    {
      action: commissionActionLabels[action],
      target: record.id,
      targetType: "commission",
      reason,
      beforeValue: `status=${record.status}`,
      afterValue: `status=${nextStatus}`
    }
  );

  return withSuccess(nextState, `${record.id} 已${commissionActionLabels[action]}，金额未被直接改写。`);
}

export function getAvailableSettlementActions(status: BusinessCpsSettlementBatchStatus): BusinessCpsSettlementAction[] {
  if (status === "draft") {
    return ["submit", "reject"];
  }

  if (status === "reviewing") {
    return ["approve", "reject"];
  }

  if (status === "approved") {
    return ["pay", "reject"];
  }

  return [];
}

function getNextSettlementStatus(status: BusinessCpsSettlementBatchStatus, action: BusinessCpsSettlementAction): BusinessCpsSettlementBatchStatus | null {
  if (status === "draft" && action === "submit") {
    return "reviewing";
  }

  if (status === "reviewing" && action === "approve") {
    return "approved";
  }

  if (status === "approved" && action === "pay") {
    return "paid";
  }

  if ((status === "draft" || status === "reviewing" || status === "approved") && action === "reject") {
    return "rejected";
  }

  return null;
}

export function applySettlementAction(
  state: BusinessCpsRuntimeState,
  batchId: string,
  action: BusinessCpsSettlementAction,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "结算批次操作必须填写原因。");
  }

  const batch = state.settlementBatches.find((item) => item.id === batchId);

  if (!batch) {
    return withError(state, "未找到结算批次。");
  }

  const nextStatus = getNextSettlementStatus(batch.status, action);

  if (!nextStatus) {
    return withError(state, `${batch.status} 状态下不能执行「${settlementActionLabels[action]}」。`);
  }

  if ((action === "approve" || action === "pay") && batch.payableAmount <= 0) {
    return withError(state, "可支付金额为 0 的批次不能通过或支付，应先处理冻结/取消/冲正。");
  }

  const nextState = pushLog(
    {
      ...state,
      settlementBatches: state.settlementBatches.map((item) => (item.id === batchId ? { ...item, status: nextStatus } : item))
    },
    {
      action: settlementActionLabels[action],
      target: batch.id,
      targetType: "settlement",
      reason,
      beforeValue: `status=${batch.status}; payable=${batch.payableAmount}; frozen=${batch.frozenAmount}`,
      afterValue: `status=${nextStatus}`
    }
  );

  return withSuccess(nextState, `${batch.id} 已${settlementActionLabels[action]}。`);
}

function findCommissionByRiskSubject(state: BusinessCpsRuntimeState, risk: BusinessCpsRiskEvent) {
  return state.commissionRecords.find((record) => risk.subject.includes(record.id) || risk.subject.includes(record.sourceOrder));
}

export function getAvailableRiskActions(status: BusinessCpsRiskEvent["status"]): BusinessCpsRiskAction[] {
  if (status === "new") {
    return ["start_review", "freeze", "reject"];
  }

  if (status === "reviewing") {
    return ["release", "freeze", "reject"];
  }

  return [];
}

function getNextRiskStatus(status: BusinessCpsRiskEvent["status"], action: BusinessCpsRiskAction): BusinessCpsRiskEvent["status"] | null {
  if (status === "new" && action === "start_review") {
    return "reviewing";
  }

  if ((status === "new" || status === "reviewing") && action === "freeze") {
    return "reviewing";
  }

  if (status === "reviewing" && action === "release") {
    return "released";
  }

  if ((status === "new" || status === "reviewing") && action === "reject") {
    return "rejected";
  }

  return null;
}

export function applyRiskAction(
  state: BusinessCpsRuntimeState,
  riskId: string,
  action: BusinessCpsRiskAction,
  reason: string
): BusinessCpsActionResult {
  if (!requireReason(reason)) {
    return withError(state, "风控人工动作必须填写原因。");
  }

  const risk = state.riskEvents.find((item) => item.id === riskId);

  if (!risk) {
    return withError(state, "未找到风险事件。");
  }

  const nextStatus = getNextRiskStatus(risk.status, action);

  if (!nextStatus) {
    return withError(state, `${risk.status} 状态下不能执行「${riskActionLabels[action]}」。`);
  }

  const linkedCommission = findCommissionByRiskSubject(state, risk);
  let nextCommissionStatus: CommissionStatus | null = null;

  if (linkedCommission && action === "release") {
    nextCommissionStatus = "pending";
  }

  if (linkedCommission && action === "freeze") {
    nextCommissionStatus = "risk_frozen";
  }

  if (linkedCommission && action === "reject") {
    nextCommissionStatus = "cancelled";
  }

  const nextState = pushLog(
    {
      ...state,
      riskEvents: state.riskEvents.map((item) => (item.id === riskId ? { ...item, status: nextStatus } : item)),
      commissionRecords: nextCommissionStatus
        ? state.commissionRecords.map((item) =>
            item.id === linkedCommission?.id
              ? {
                  ...item,
                  status: nextCommissionStatus,
                  riskReason: action === "freeze" ? reason.trim() : item.riskReason
                }
              : item
          )
        : state.commissionRecords
    },
    {
      action: riskActionLabels[action],
      target: risk.id,
      targetType: "risk",
      reason,
      beforeValue: `risk_status=${risk.status}${linkedCommission ? `; commission=${linkedCommission.status}` : ""}`,
      afterValue: `risk_status=${nextStatus}${nextCommissionStatus ? `; commission=${nextCommissionStatus}` : ""}`
    }
  );

  return withSuccess(nextState, `${risk.type} 已${riskActionLabels[action]}，相关佣金状态已联动。`);
}

export function buildBusinessCpsLogicDiagnostics(state: BusinessCpsRuntimeState) {
  const diagnostics: Array<{ id: string; tone: BusinessCpsNoticeTone; title: string; detail: string }> = [];

  state.campaigns.forEach((campaign) => {
    const usage = getBudgetUsage(campaign);

    if (campaign.status === "active" && usage >= 100) {
      diagnostics.push({
        id: `campaign-budget-${campaign.id}`,
        tone: "error",
        title: "活动预算已达上限但仍在进行",
        detail: `${campaign.name} 预算消耗 ${usage}%，应停止新增返佣但保留追踪。`
      });
    }
  });

  state.promotionLinks.forEach((link) => {
    const issues = validatePromotionLink(link, state);

    issues.forEach((issue) => {
      diagnostics.push({
        id: `link-${link.id}-${issue}`,
        tone: issue.includes("落地页") || issue.includes("仍允许") ? "error" : "warning",
        title: link.name,
        detail: issue
      });
    });
  });

  state.settlementBatches.forEach((batch) => {
    const expectedPayable = batch.grossAmount - batch.frozenAmount + batch.adjustmentAmount;

    if (expectedPayable !== batch.payableAmount) {
      diagnostics.push({
        id: `settlement-payable-${batch.id}`,
        tone: "error",
        title: "结算可支付金额不一致",
        detail: `${batch.id} 应为 ${expectedPayable}，当前为 ${batch.payableAmount}。`
      });
    }
  });

  state.riskEvents
    .filter((event) => event.status === "new" || event.status === "reviewing")
    .forEach((event) => {
      const linkedCommission = findCommissionByRiskSubject(state, event);

      if (event.amountFrozen > 0 && linkedCommission && linkedCommission.status !== "risk_frozen") {
        diagnostics.push({
          id: `risk-commission-${event.id}`,
          tone: "warning",
          title: "风险事件与佣金冻结状态未对齐",
          detail: `${event.subject} 已冻结 ${event.amountFrozen}，但 ${linkedCommission.id} 当前为 ${linkedCommission.status}。`
        });
      }
    });

  if (diagnostics.length === 0) {
    diagnostics.push({
      id: "logic-ok",
      tone: "success",
      title: "核心逻辑校验通过",
      detail: "活动、链接、佣金、结算、风控和审计日志当前没有发现阻断问题。"
    });
  }

  return diagnostics;
}
