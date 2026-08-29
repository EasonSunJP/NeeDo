import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import {
  AffiliatePlatformFeeService,
  type AffiliatePlatformFeeRepositoryPort,
  type AffiliatePlatformFeeRuleRecord
} from "../src/services/affiliate-platform-fee.service";

const now = new Date("2026-08-30T02:00:00.000Z");
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };
const financeActor = {
  userId: 3,
  email: "finance@example.test",
  accessTokenJti: "finance-jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityScopeType: "platform",
  currentIdentityScopeId: null,
  roles: ["finance"],
  permissions: ["button:backoffice-affiliate-fee-rule-create"]
} as AuthenticatedAccessContext;
const merchantActor = {
  ...financeActor,
  userId: 7,
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"]
} as AuthenticatedAccessContext;

const globalRule: AffiliatePlatformFeeRuleRecord = {
  id: 41,
  scopeType: "global",
  scopeKey: "global",
  shopId: null,
  feeBps: 1000,
  version: 1,
  effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
  effectiveTo: null,
  activeKey: "global",
  reason: "initial",
  createdByNeedoId: null,
  updatedByNeedoId: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z")
};

const createRepository = (): jest.Mocked<AffiliatePlatformFeeRepositoryPort> =>
  ({
    withTransactionClient: jest.fn(),
    findActiveShopIds: jest.fn(async (shopIds: number[]) => shopIds),
    findEffectiveRules: jest.fn(async (shopIds: number[], effectiveAt: Date) => {
      void shopIds;
      void effectiveAt;
      return [globalRule];
    }),
    listRules: jest.fn(async (input) => {
      void input;
      return { list: [globalRule], total: 1, page: 1, page_size: 20 };
    }),
    createRuleVersion: jest.fn(async (input) => ({
      kind: "created" as const,
      value: {
        ...globalRule,
        feeBps: input.feeBps,
        version: input.expectedVersion + 1,
        effectiveFrom: input.effectiveFrom,
        reason: input.reason,
        createdByNeedoId: "u0000000003",
        updatedByNeedoId: "u0000000003"
      }
    }))
  }) as unknown as jest.Mocked<AffiliatePlatformFeeRepositoryPort>;

const createAudit = () => ({
  createInput: jest.fn(
    (input: AuditLogRecordInput): AuditLogCreateInput => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    })
  )
});

describe("AffiliatePlatformFeeService", () => {
  it("resolves one global fee snapshot for a real shop through the supplied transaction", async () => {
    const repository = createRepository();
    const transactionRepository = createRepository();
    const transactionClient = { name: "task-submit" };
    repository.withTransactionClient.mockReturnValue(transactionRepository);
    const service = new AffiliatePlatformFeeService(repository, createAudit());

    await expect(service.resolveForTask([11], now, transactionClient)).resolves.toEqual({
      ruleId: 41,
      ruleIds: [41],
      feeBps: 1000,
      source: "global",
      shopIds: [11],
      effectiveAt: now
    });
    expect(repository.withTransactionClient).toHaveBeenCalledWith(transactionClient);
    expect(transactionRepository.findActiveShopIds).toHaveBeenCalledWith([11]);
    expect(transactionRepository.findEffectiveRules).toHaveBeenCalledWith([11], now);
  });

  it("prefers a shop rule and rejects different rates across a multi-shop task", async () => {
    const repository = createRepository();
    repository.findEffectiveRules.mockResolvedValue([
      globalRule,
      { ...globalRule, id: 42, scopeType: "shop", scopeKey: "shop:11", shopId: 11, feeBps: 1200 },
      { ...globalRule, id: 43, scopeType: "shop", scopeKey: "shop:12", shopId: 12, feeBps: 1500 }
    ]);
    const service = new AffiliatePlatformFeeService(repository, createAudit());

    await expect(service.resolveForTask([11, 12], now)).rejects.toMatchObject({
      message: "error.affiliate.platform_fee_rate_mismatch",
      statusCode: 409
    });
  });

  it("rejects duplicate or inactive shops before returning a fee snapshot", async () => {
    const repository = createRepository();
    const service = new AffiliatePlatformFeeService(repository, createAudit());

    await expect(service.resolveForTask([11, 11], now)).rejects.toMatchObject({
      message: "error.validation"
    });
    expect(repository.findActiveShopIds).not.toHaveBeenCalled();

    repository.findActiveShopIds.mockResolvedValue([11]);
    await expect(service.resolveForTask([11, 12], now)).rejects.toMatchObject({
      message: "error.affiliate.platform_fee_shop_not_found",
      statusCode: 404
    });
    expect(repository.findEffectiveRules).not.toHaveBeenCalled();
  });

  it("requires a platform identity for listing and version creation", async () => {
    const repository = createRepository();
    const service = new AffiliatePlatformFeeService(repository, createAudit());

    await expect(service.listRules(merchantActor, { page: 1, pageSize: 20 })).rejects.toMatchObject(
      {
        message: "error.identity_forbidden",
        statusCode: 403
      }
    );
    await expect(
      service.createRuleVersion(merchantActor, context, {
        scopeType: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        effectiveFrom: now,
        reason: "adjust"
      })
    ).rejects.toMatchObject({ message: "error.identity_forbidden", statusCode: 403 });
    expect(repository.listRules).not.toHaveBeenCalled();
    expect(repository.createRuleVersion).not.toHaveBeenCalled();
  });

  it("creates an audited immutable version with the operator reason", async () => {
    const repository = createRepository();
    const audit = createAudit();
    const service = new AffiliatePlatformFeeService(repository, audit);

    await service.createRuleVersion(financeActor, context, {
      scopeType: "global",
      shopId: null,
      feeBps: 1100,
      expectedVersion: 1,
      effectiveFrom: now,
      reason: "业务费率调整"
    });

    expect(repository.createRuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 3,
        scopeType: "global",
        scopeKey: "global",
        shopId: null,
        feeBps: 1100,
        expectedVersion: 1,
        reason: "业务费率调整",
        audit: expect.objectContaining({
          action: "backoffice.affiliate_platform_fee_rule.version_created",
          metadata: expect.objectContaining({
            scopeType: "global",
            feeBps: 1100,
            expectedVersion: 1,
            reason: "业务费率调整"
          })
        })
      })
    );
  });
});
