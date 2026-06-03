import { ERROR_CODES } from "../src/constants/error-codes";
import {
  MerchantFinanceRulesService,
  type MerchantFinanceRulesRepositoryPort,
  type ShopFinanceRuleSetPayload
} from "../src/services/merchant-finance-rules.service";

const now = new Date("2026-06-03T00:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "jest" };

const merchantActor = {
  userId: 7,
  email: "merchant@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:finance-rules:write"]
};

const otherShopActor = {
  ...merchantActor,
  currentIdentityScopeId: 12
};

const activeRuleSet: ShopFinanceRuleSetPayload = {
  id: 1,
  shopId: 11,
  name: "Aoyama finance rules",
  status: "active",
  wageMode: "base_plus_commission",
  baseSalaryJpy: 0,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 1000,
  commissionRatePercent: 50,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "split",
  technicianNdpSharePercent: 30,
  bonusRules: [
    {
      id: "monthly-100",
      name: "月 100 单突破奖金",
      triggerType: "monthly_order_count",
      threshold: 100,
      amountJpy: 3000,
      active: true
    }
  ],
  deductionRules: [],
  effectiveFrom: null,
  effectiveTo: null,
  createdById: 7,
  updatedById: 7,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
};

const createRepository = (): jest.Mocked<MerchantFinanceRulesRepositoryPort> =>
  ({
    findActiveRuleSet: jest.fn(async () => activeRuleSet),
    replaceActiveRuleSet: jest.fn(async (_shopId, input, actorUserId) => ({
      ...activeRuleSet,
      ...input,
      id: 2,
      shopId: 11,
      createdById: actorUserId,
      updatedById: actorUserId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }))
  }) as unknown as jest.Mocked<MerchantFinanceRulesRepositoryPort>;

describe("MerchantFinanceRulesService", () => {
  it("previews technician wage, bonus, NDP split, and shop margin from the active shop rules", async () => {
    const repository = createRepository();
    const service = new MerchantFinanceRulesService(repository, { record: jest.fn() });

    const result = await service.previewShopFinanceRule(merchantActor, context, 11, {
      serviceAmountJpy: 8800,
      platformFeeNdp: 500,
      workedMinutes: 60,
      monthlyCompletedOrders: 101,
      monthlyServiceGmvJpy: 900_000,
      ratingAverage: 4.8
    });

    expect(result.ruleSet.id).toBe(1);
    expect(result.preview).toMatchObject({
      serviceAmountJpy: 8800,
      platformFeeNdp: 500,
      basePayJpy: 1000,
      commissionPayJpy: 4400,
      bonusPayJpy: 3000,
      technicianGrossIncomeJpy: 8400,
      technicianNdpShareNdp: 150,
      shopNdpShareNdp: 350,
      technicianNetIncomeJpy: 8250,
      shopGrossMarginJpy: 50
    });
    expect(result.preview.appliedBonusRules).toEqual([
      expect.objectContaining({ id: "monthly-100", amountJpy: 3000 })
    ]);
  });

  it("stores a new active rule version and records an audit log", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new MerchantFinanceRulesService(repository, auditLogService);

    const result = await service.updateShopFinanceRuleSet(merchantActor, context, 11, {
      name: "Roppongi hybrid payout",
      wageMode: "commission",
      commissionRatePercent: 62.5,
      fixedOrderPayJpy: 0,
      guaranteedMinimumJpy: 4200,
      ndpFeeBearer: "technician",
      technicianNdpSharePercent: 100,
      bonusRules: [],
      deductionRules: []
    });

    expect(result).toMatchObject({
      id: 2,
      shopId: 11,
      name: "Roppongi hybrid payout",
      commissionRatePercent: 62.5,
      ndpFeeBearer: "technician"
    });
    expect(repository.replaceActiveRuleSet).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        name: "Roppongi hybrid payout",
        commissionRatePercent: 62.5,
        technicianNdpSharePercent: 100
      }),
      7
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: merchantActor,
        action: "merchant_admin.finance_rules.update",
        targetType: "shop",
        targetId: 11
      })
    );
  });

  it("rejects finance rule access outside the authenticated merchant shop scope", async () => {
    const service = new MerchantFinanceRulesService(createRepository(), { record: jest.fn() });

    await expect(service.getShopFinanceRuleSet(otherShopActor, context, 11)).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden"
    });
  });
});
