import { AgentSettlementRepository } from "../src/repositories/agent-settlement.repository";

const agentPublicId = "11111111-1111-4111-8111-111111111111";
const settlementPublicId = "22222222-2222-4222-8222-222222222222";
const rulePublicId = "33333333-3333-4333-8333-333333333333";
const referralPublicId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-10-02T00:00:00.000Z");
const periodStart = new Date("2026-09-01T00:00:00.000Z");
const periodEnd = new Date("2026-09-30T00:00:00.000Z");

const createHarness = (options: { auditFailure?: Error } = {}) => {
  const sqlEvidence: string[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const lines: Array<Record<string, unknown>> = [];
  let settlement: Record<string, unknown> | null = null;
  const rule = {
    id: 13,
    publicId: rulePublicId,
    version: 1,
    fixedSuccessRewardJpy: 50_000n,
    profitShareRateBps: 1_500,
    paymentMethod: "BANK_TRANSFER" as const,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null
  };
  const referral = {
    id: 21,
    publicId: referralPublicId,
    status: "QUALIFIED" as const,
    confirmedAt: new Date("2026-01-15T00:00:00.000Z"),
    successQualifiedAt: new Date("2026-09-10T00:00:00.000Z"),
    shop: {
      id: 8,
      name: "Ginza Shop",
      publicIdentifier: {
        publicId: "shop0000000008",
        status: "ACTIVE" as const,
        deletedAt: null
      }
    }
  };
  const storedSettlement = () => {
    if (!settlement) return null;
    return {
      ...settlement,
      agentProfile: { publicId: agentPublicId },
      ruleVersion: rule,
      lines: [...lines]
        .sort((left, right) => String(left.lineType).localeCompare(String(right.lineType)))
        .map((line) => ({
          ...line,
          referral: { publicId: referralPublicId },
          shop: {
            name: referral.shop.name,
            publicIdentifier: referral.shop.publicIdentifier
          }
        }))
    };
  };
  const transaction = {
    $queryRaw: jest.fn(async (sql: { strings?: readonly string[] }) => {
      const text = sql.strings?.join("?") ?? String(sql);
      sqlEvidence.push(text);
      if (text.includes("agent_settlement_shop_financial_facts")) {
        return [
          {
            shopId: 8,
            orderPlatformFeesJpy: 100_000n,
            saasFeesJpy: 20_000n,
            userRebatesJpy: 10_000n,
            refundsAndReversalsJpy: 5_000n,
            allocatedOperatingCostsJpy: 14_000n
          }
        ];
      }
      if (text.includes("agent_settlements WHERE public_id")) {
        return settlement ? [{ id: 71 }] : [];
      }
      return [{ id: 7 }];
    }),
    platformPartnerProfile: {
      findFirst: jest.fn(async () => ({ id: 7 }))
    },
    agentCommissionRuleVersion: {
      findMany: jest.fn(async () => [rule])
    },
    agentShopReferral: {
      findMany: jest.fn(async () => [referral])
    },
    agentSettlement: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown> }) => {
        if (!settlement) return null;
        if (
          args.where.idempotencyKey !== undefined &&
          args.where.idempotencyKey !== settlement.idempotencyKey
        ) {
          return null;
        }
        return storedSettlement();
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        settlement = {
          id: 71,
          publicId: settlementPublicId,
          ...data,
          createdAt: now,
          updatedAt: now,
          paidAt: null,
          paidById: null,
          paymentMethod: null,
          paymentReference: null
        };
        return { id: 71 };
      }),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!settlement) return { count: 0 };
        settlement = { ...settlement, ...data, updatedAt: now };
        return { count: 1 };
      })
    },
    agentSettlementLine: {
      findMany: jest.fn(async () =>
        lines
          .filter((line) => line.lineType === "SUCCESS_REWARD")
          .map((line) => ({ referralId: line.referralId }))
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        lines.push({ id: lines.length + 1, ...data });
        return data;
      })
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFailure) throw options.auditFailure;
        audits.push(data);
        return data;
      })
    }
  };
  const client = {
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => {
      const settlementSnapshot = settlement ? { ...settlement } : null;
      const lineSnapshot = lines.map((line) => ({ ...line }));
      const auditSnapshot = audits.map((audit) => ({ ...audit }));
      try {
        return await callback(transaction);
      } catch (error) {
        settlement = settlementSnapshot;
        lines.splice(0, lines.length, ...lineSnapshot);
        audits.splice(0, audits.length, ...auditSnapshot);
        throw error;
      }
    })
  };
  return {
    repository: new AgentSettlementRepository(client as never, () => now),
    getSettlement: () => settlement,
    lines,
    audits,
    sqlEvidence
  };
};

const audit = {
  actorId: 91,
  action: "backoffice.agent_settlement.confirmed",
  targetType: "AgentSettlement",
  targetId: null,
  ip: "127.0.0.1",
  userAgent: "agent-settlement-test",
  metadata: { agentPublicId }
};
const command = {
  agentPublicId,
  periodStart,
  periodEnd,
  externalDeductions: [
    {
      shopPublicId: "shop0000000008",
      channelFeesJpy: 3_000,
      consumptionTaxJpy: 8_000,
      evidenceReference: "processor-tax-statement-2026-09",
      reason: "September processor and tax statement"
    }
  ],
  idempotencyKey: "agent-settlement-2026-09",
  actorUserId: 91,
  audit
};

describe("AgentSettlementRepository transactions", () => {
  it("confirms evidence snapshots, one-time reward and profit share atomically", async () => {
    const harness = createHarness();
    await expect(harness.repository.confirm(command)).resolves.toMatchObject({
      outcome: "confirmed",
      applied: true,
      settlement: {
        pureProfitJpy: 80_000,
        fixedSuccessRewardJpy: 50_000,
        profitShareAmountJpy: 12_000,
        totalAmountJpy: 62_000,
        lines: [
          { lineType: "profit_share", amountJpy: 12_000 },
          { lineType: "success_reward", amountJpy: 50_000 }
        ]
      }
    });
    expect(harness.lines).toHaveLength(2);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "backoffice.agent_settlement.confirmed",
      metadata: { shopCount: 1, idempotencyKey: "agent-settlement-2026-09" }
    });
    const query = harness.sqlEvidence.find((text) =>
      text.includes("agent_settlement_shop_financial_facts")
    );
    expect(query).toContain("financial.settlement_status");
    expect(query).toContain("referral_scope");
    expect(query).toContain("scope.effective_from");
    expect(query).toContain("booking.payment_refunded_at IS NULL");
    expect(query).toContain("saas_payments");
    expect(query).toContain("operating_cost_allocations");
  });

  it("replays the same confirmation without duplicating rewards, lines or audit", async () => {
    const harness = createHarness();
    await harness.repository.confirm(command);
    await expect(harness.repository.confirm(command)).resolves.toMatchObject({
      outcome: "confirmed",
      applied: false,
      settlement: { totalAmountJpy: 62_000 }
    });
    expect(harness.lines).toHaveLength(2);
    expect(harness.audits).toHaveLength(1);
  });

  it("marks payment without rewriting immutable calculation lines", async () => {
    const harness = createHarness();
    await harness.repository.confirm(command);
    const lineSnapshot = structuredClone(harness.lines);
    await expect(
      harness.repository.markPaid({
        agentPublicId,
        settlementPublicId,
        paymentMethod: "bank_transfer",
        paymentReference: "bank-transfer-2026-09-71",
        reason: "bank statement reconciled",
        actorUserId: 92,
        audit: { ...audit, actorId: 92, action: "backoffice.agent_settlement.paid" }
      })
    ).resolves.toMatchObject({
      outcome: "paid",
      applied: true,
      settlement: {
        status: "paid",
        paymentMethod: "bank_transfer",
        paymentReference: "bank-transfer-2026-09-71"
      }
    });
    expect(harness.lines).toEqual(lineSnapshot);
    expect(harness.audits).toHaveLength(2);
  });

  it("rolls back settlement and lines if the atomic audit write fails", async () => {
    const harness = createHarness({ auditFailure: new Error("audit unavailable") });
    await expect(harness.repository.confirm(command)).rejects.toThrow("audit unavailable");
    expect(harness.getSettlement()).toBeNull();
    expect(harness.lines).toHaveLength(0);
    expect(harness.audits).toHaveLength(0);
  });
});
