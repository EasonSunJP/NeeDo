import { describe, expect, it } from "vitest";
import { businessCpsMaxCommissionTierCount } from "./model";
import {
  applyCreateSubPromoter,
  applyCampaignAction,
  applyCommissionAction,
  applyUpdatePromoter,
  applyRiskAction,
  applySettlementAction,
  buildBusinessCpsLogicDiagnostics,
  createInitialBusinessCpsState,
  validatePromotionLink
} from "./logic";

describe("business CPS logic", () => {
  it("pauses a campaign without deleting historical carriers and writes an audit log", () => {
    const state = createInitialBusinessCpsState();
    const activeLinkCount = state.promotionLinks.length;
    const result = applyCampaignAction(state, "cps-campaign-01", "pause", "预算接近上限，暂停新增返佣");
    const campaign = result.state.campaigns.find((item) => item.id === "cps-campaign-01");
    const relatedLink = result.state.promotionLinks.find((item) => item.campaignId === "cps-campaign-01" && item.status === "paused");

    expect(result.notice.tone).toBe("success");
    expect(campaign?.status).toBe("paused");
    expect(result.state.promotionLinks).toHaveLength(activeLinkCount);
    expect(relatedLink?.allowCommission).toBe(false);
    expect(result.state.auditLogs[0]?.target).toBe("cps-campaign-01");
  });

  it("blocks approved settlement when the payable amount is zero", () => {
    const state = createInitialBusinessCpsState();
    const result = applySettlementAction(state, "settle-202605-w2-misaki", "approve", "冻结金额未处理，不能进入支付");

    expect(result.notice.tone).toBe("error");
    expect(result.state.settlementBatches.find((item) => item.id === "settle-202605-w2-misaki")?.status).toBe("reviewing");
  });

  it("changes commission status through the state machine without changing the amount", () => {
    const state = createInitialBusinessCpsState();
    const before = state.commissionRecords.find((item) => item.id === "com-1002");
    const result = applyCommissionAction(state, "com-1002", "freeze", "命中同 IP 注册观察规则");
    const after = result.state.commissionRecords.find((item) => item.id === "com-1002");

    expect(result.notice.tone).toBe("success");
    expect(after?.status).toBe("risk_frozen");
    expect(after?.commissionAmount).toBe(before?.commissionAmount);
    expect(result.state.auditLogs[0]?.targetType).toBe("commission");
  });

  it("releases a risk event and links the related commission back to pending", () => {
    const state = createInitialBusinessCpsState();
    const reviewing = applyRiskAction(state, "risk-2", "start_review", "风控进入人工复核");
    const result = applyRiskAction(reviewing.state, "risk-2", "release", "技师运营复核通过，LBS 偏移可解释");

    expect(result.notice.tone).toBe("success");
    expect(result.state.riskEvents.find((item) => item.id === "risk-2")?.status).toBe("released");
    expect(result.state.commissionRecords.find((item) => item.id === "com-1004")?.status).toBe("pending");
  });

  it("creates a real sub-promoter with team node, permissions, commission conditions and audit log", () => {
    const state = createInitialBusinessCpsState();
    const parentBefore = state.promoterTeamNodes.find((item) => item.promoterId === "promoter-aya");
    const result = applyCreateSubPromoter(
      state,
      {
        parentPromoterId: "promoter-aya",
        name: "Tokyo Night BD",
        role: "bd",
        roleLabel: "下级推广者",
        identity: "线下 BD / 夜间店铺渠道",
        region: "六本木",
        inviteCode: "NIGHT-BD",
        primaryChannel: "线下地推",
        status: "active",
        campaignId: "cps-campaign-02",
        budgetMode: "inherit_parent",
        budgetTotal: 180000,
        targetRegisters: 80,
        targetFirstOrders: 16,
        commissionRate: 9.5,
        commissionBasis: "net_revenue",
        releaseCondition: "完单且 7 天无退款后释放",
        riskCondition: "同设备或异常 LBS 冻结",
        settlementDelayDays: 7,
        validFrom: "2026-05-17",
        validTo: "2026-12-31",
        permissions: {
          canCreateLink: true,
          canCreateCode: true,
          canCreateQr: true,
          canCreateSubPromoter: false,
          canViewSubData: true,
          canViewCommission: true,
          canWithdraw: false,
          canUploadMaterial: false
        }
      },
      "新增下级推广者测试"
    );
    const created = result.state.promoters.find((item) => item.inviteCode === "NIGHT-BD");
    const createdNode = result.state.promoterTeamNodes.find((item) => item.promoterId === created?.id);
    const parentAfter = result.state.promoterTeamNodes.find((item) => item.promoterId === "promoter-aya");

    expect(result.notice.tone).toBe("success");
    expect(created?.name).toBe("Tokyo Night BD");
    expect(createdNode?.parentPromoterId).toBe("promoter-aya");
    expect(createdNode?.level).toBe(2);
    expect(createdNode?.commissionRate).toBe(9.5);
    expect(createdNode?.releaseCondition).toBe("完单且 7 天无退款后释放");
    expect(result.state.promoterPermissions.find((item) => item.promoterId === created?.id)?.canCreateLink).toBe(true);
    expect(parentAfter?.directChildren).toBe((parentBefore?.directChildren ?? 0) + 1);
    expect(result.state.auditLogs[0]?.targetType).toBe("promoter");
  });

  it("can add a platform-owned level 1 organization node", () => {
    const state = createInitialBusinessCpsState();
    const result = applyCreateSubPromoter(
      state,
      {
        parentPromoterId: null,
        level: 1,
        name: "Needo Platform Growth",
        role: "platform",
        roleLabel: "本平台直营组织",
        identity: "平台直营投放团队",
        region: "东京",
        inviteCode: "PLATFORM-GROWTH",
        primaryChannel: "平台默认渠道",
        status: "active",
        campaignId: "cps-campaign-01",
        budgetMode: "independent",
        budgetTotal: 300000,
        targetRegisters: 100,
        targetFirstOrders: 20,
        commissionRate: 8,
        commissionBasis: "net_revenue",
        releaseCondition: "完单且 7 天无退款后释放",
        riskCondition: "异常设备或重复支付冻结",
        settlementDelayDays: 7,
        validFrom: "2026-05-17",
        validTo: "2026-12-31",
        permissions: {
          canCreateLink: true,
          canCreateCode: true,
          canCreateQr: true,
          canCreateSubPromoter: true,
          canViewSubData: true,
          canViewCommission: true,
          canWithdraw: false,
          canUploadMaterial: true
        }
      },
      "新增本平台一级组织"
    );
    const created = result.state.promoters.find((item) => item.inviteCode === "PLATFORM-GROWTH");
    const createdNode = result.state.promoterTeamNodes.find((item) => item.promoterId === created?.id);

    expect(result.notice.tone).toBe("success");
    expect(createdNode?.parentPromoterId).toBeNull();
    expect(createdNode?.level).toBe(1);
    expect(result.notice.message).toContain("本平台");
  });

  it("edits promoter profile, permissions and commission rule in runtime state", () => {
    const state = createInitialBusinessCpsState();
    const result = applyUpdatePromoter(
      state,
      {
        promoterId: "promoter-aya",
        name: "Aya Tokyo Growth",
        role: "creator",
        roleLabel: "CPS 认证推广者",
        identity: "美容探店达人 / Instagram 13 万粉",
        region: "港区",
        inviteCode: "AYA501",
        primaryChannel: "Instagram / TikTok",
        status: "active",
        campaignId: "cps-campaign-01",
        budgetMode: "independent",
        budgetTotal: 720000,
        targetRegisters: 500,
        targetFirstOrders: 90,
        commissionRate: 10,
        commissionBasis: "gross_margin",
        releaseCondition: "支付完成且风控期结束后释放",
        riskCondition: "退款、同卡或异常设备冻结",
        settlementDelayDays: 14,
        validFrom: "2026-05-17",
        validTo: "2026-12-31",
        permissions: {
          canCreateLink: true,
          canCreateCode: true,
          canCreateQr: true,
          canCreateSubPromoter: true,
          canViewSubData: true,
          canViewCommission: true,
          canWithdraw: true,
          canUploadMaterial: true
        }
      },
      "编辑推广者分成规则测试"
    );
    const promoter = result.state.promoters.find((item) => item.id === "promoter-aya");
    const node = result.state.promoterTeamNodes.find((item) => item.promoterId === "promoter-aya");

    expect(result.notice.tone).toBe("success");
    expect(promoter?.name).toBe("Aya Tokyo Growth");
    expect(promoter?.inviteCode).toBe("AYA501");
    expect(node?.commissionRate).toBe(10);
    expect(node?.commissionBasis).toBe("gross_margin");
    expect(node?.settlementDelayDays).toBe(14);
    expect(result.state.auditLogs[0]?.beforeValue).toContain("rate=8%");
  });

  it("keeps multiple level 1 commission condition rules but only one active at a time", () => {
    const state = createInitialBusinessCpsState();
    const activeBefore = state.commissionConditionRules.filter((rule) => rule.appliesToLevel === 1 && rule.status === "active");
    const draftRule = state.commissionConditionRules.find((rule) => rule.appliesToLevel === 1 && rule.status !== "active");

    expect(activeBefore).toHaveLength(1);
    expect(draftRule).toBeTruthy();

    const result = applyUpdatePromoter(
      state,
      {
        promoterId: "promoter-aya",
        name: "Aya Tokyo Fit",
        role: "creator",
        roleLabel: "CPS 认证推广者",
        identity: "美容探店达人 / Instagram 12.8 万粉",
        region: "港区",
        inviteCode: "AYA500",
        primaryChannel: "Instagram / TikTok",
        status: "active",
        campaignId: "cps-campaign-01",
        budgetMode: "independent",
        budgetTotal: 620000,
        targetRegisters: 420,
        targetActiveShops: 18,
        targetFirstOrders: 72,
        targetPaymentGmv: 3600000,
        commissionConditionRuleId: draftRule?.id ?? null,
        commissionRate: 9,
        commissionBasis: "gross_margin",
        commissionTiers: draftRule?.commissionTiers ?? [],
        preferentialCondition: draftRule?.preferentialCondition,
        downgradeCondition: draftRule?.downgradeCondition,
        promotionCondition: draftRule?.promotionCondition,
        releaseCondition: "店铺支付完成、周活跃订单达标且售后期结束后释放",
        riskCondition: "异常取消、虚假订单或支付异常冻结",
        settlementDelayDays: 10,
        validFrom: "2026-06-01",
        validTo: "2026-07-31",
        permissions: {
          canCreateLink: true,
          canCreateCode: true,
          canCreateQr: true,
          canCreateSubPromoter: true,
          canViewSubData: true,
          canViewCommission: true,
          canWithdraw: true,
          canUploadMaterial: true
        }
      },
      "切换1级全局分成条件"
    );
    const activeAfter = result.state.commissionConditionRules.filter((rule) => rule.appliesToLevel === 1 && rule.status === "active");

    expect(result.notice.tone).toBe("success");
    expect(result.state.commissionConditionRules.length).toBe(state.commissionConditionRules.length);
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0]?.id).toBe(draftRule?.id);
    expect(result.state.commissionConditionRules.find((rule) => rule.id === activeBefore[0]?.id)?.status).toBe("paused");
  });

  it("normalizes commission condition rules up to level 15", () => {
    const state = createInitialBusinessCpsState();
    const baseTier = state.commissionConditionRules[0].commissionTiers[0];
    const fifteenTiers = Array.from({ length: businessCpsMaxCommissionTierCount }, (_, index) => ({
      ...baseTier,
      id: `tier-${index + 1}`,
      name: `阶梯 ${index + 1}`,
      level: index + 1,
      commissionRate: 8 + index,
      requirements: {
        registrations: 100 + index * 10,
        activeShops: 5 + index,
        activeShopWeeklyOrders: 5,
        firstOrders: 20 + index * 2,
        paymentGmv: 100000 + index * 10000
      }
    }));
    const result = applyUpdatePromoter(
      state,
      {
        promoterId: "promoter-aya",
        name: "Aya Tokyo Fit",
        role: "creator",
        roleLabel: "CPS 认证推广者",
        identity: "美容探店达人 / Instagram 12.8 万粉",
        region: "港区",
        inviteCode: "AYA500",
        primaryChannel: "Instagram / TikTok",
        status: "active",
        campaignId: "cps-campaign-01",
        budgetMode: "independent",
        budgetTotal: 620000,
        targetRegisters: 420,
        targetActiveShops: 18,
        targetFirstOrders: 72,
        targetPaymentGmv: 3600000,
        commissionConditionRuleId: state.commissionConditionRules[0].id,
        commissionRate: 8,
        commissionBasis: "net_revenue",
        commissionTiers: fifteenTiers,
        preferentialCondition: state.commissionConditionRules[0].preferentialCondition,
        downgradeCondition: state.commissionConditionRules[0].downgradeCondition,
        promotionCondition: state.commissionConditionRules[0].promotionCondition,
        releaseCondition: "归因订单完成支付且 7 天内无退款后释放",
        riskCondition: "同设备、同电话、异常 LBS 或重复支付命中后冻结",
        settlementDelayDays: 7,
        validFrom: "2026-05-01",
        validTo: "2026-12-31",
        permissions: {
          canCreateLink: true,
          canCreateCode: true,
          canCreateQr: true,
          canCreateSubPromoter: true,
          canViewSubData: true,
          canViewCommission: true,
          canWithdraw: true,
          canUploadMaterial: true
        }
      },
      "设置15级阶梯"
    );
    const activeRule = result.state.commissionConditionRules.find((rule) => rule.id === state.commissionConditionRules[0].id);

    expect(result.notice.tone).toBe("success");
    expect(activeRule?.commissionTiers).toHaveLength(15);
    expect(activeRule?.commissionTiers.at(-1)?.level).toBe(15);
  });

  it("rejects arbitrary external landing pages", () => {
    const state = createInitialBusinessCpsState();
    const link = {
      ...state.promotionLinks[0],
      landingUrl: "https://example.com/untracked"
    };

    expect(validatePromotionLink(link, state)).toContain("落地页不是已批准 NeeDo 埋点页面");
  });

  it("starts with a clean logic diagnostic snapshot", () => {
    const state = createInitialBusinessCpsState();
    const diagnostics = buildBusinessCpsLogicDiagnostics(state);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.tone).toBe("success");
  });
});
