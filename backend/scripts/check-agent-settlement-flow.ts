import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { AgentCommissionRuleRepository } from "../src/repositories/agent-commission-rule.repository";
import {
  AgentSettlementRepository,
  type AgentSettlementRecord
} from "../src/repositories/agent-settlement.repository";
import { OperatingCostRepository } from "../src/repositories/operating-cost.repository";
import { PlatformPartnerRepository } from "../src/repositories/platform-partner.repository";
import {
  AgentCommissionRuleService
} from "../src/services/agent-commission-rule.service";
import {
  AgentSettlementService,
  calculateAgentCommission,
  calculateProfitShare,
  calculatePureProfit,
  type AgentSettlementPayload,
  type ShopPureProfitInput
} from "../src/services/agent-settlement.service";
import { AuditLogService } from "../src/services/audit-log.service";
import type {
  AuthRequestContext,
  AuthenticatedAccessContext
} from "../src/services/auth.service";
import { OperatingCostService } from "../src/services/operating-cost.service";
import { PlatformPartnerService } from "../src/services/platform-partner.service";
import {
  createTransactionBoundPrismaFacade,
  loadAndValidateFormalEnvironment,
  runRollbackOnlyTransaction
} from "./check-order-fulfillment-checkout-flow";

type SettlementEvidenceInput = ShopPureProfitInput & {
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
};

export type SettlementSnapshotEvidence = SettlementEvidenceInput & {
  pureProfitJpy: number;
  profitShareAmountJpy: number;
  totalAmountJpy: number;
};

export function expectedSettlementEvidence(
  input: SettlementEvidenceInput
): SettlementSnapshotEvidence {
  const pureProfitJpy = calculatePureProfit(input);
  return {
    ...input,
    pureProfitJpy,
    profitShareAmountJpy: calculateProfitShare(input.profitShareRateBps, pureProfitJpy),
    totalAmountJpy: calculateAgentCommission(
      input.fixedSuccessRewardJpy,
      input.profitShareRateBps,
      pureProfitJpy
    )
  };
}

const stableJson = (value: unknown): string => {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export function assertSettlementSnapshotUnchanged(
  before: SettlementSnapshotEvidence,
  after: SettlementSnapshotEvidence
): void {
  if (stableJson(before) !== stableJson(after)) {
    throw new Error("Confirmed agent settlement snapshot changed");
  }
}

const toEvidence = (
  record: AgentSettlementRecord | AgentSettlementPayload
): SettlementSnapshotEvidence => ({
  orderPlatformFeesJpy: record.orderPlatformFeesJpy,
  saasFeesJpy: record.saasFeesJpy,
  userRebatesJpy: record.userRebatesJpy,
  refundsAndReversalsJpy: record.refundsAndReversalsJpy,
  channelFeesJpy: record.channelFeesJpy,
  consumptionTaxJpy: record.consumptionTaxJpy,
  allocatedOperatingCostsJpy: record.allocatedOperatingCostsJpy,
  pureProfitJpy: record.pureProfitJpy,
  fixedSuccessRewardJpy: record.fixedSuccessRewardJpy,
  profitShareRateBps: record.profitShareRateBps,
  profitShareAmountJpy: record.profitShareAmountJpy,
  totalAmountJpy: record.totalAmountJpy
});

const BASELINE_TABLES = [
  "users",
  "shops",
  "public_identifiers",
  "platform_partner_profiles",
  "agent_shop_referrals",
  "agent_commission_rule_versions",
  "operating_cost_items",
  "operating_cost_allocations",
  "agent_settlements",
  "agent_settlement_lines",
  "audit_logs"
] as const;

type BaselineRow = { tableName: string; rowCount: bigint | number | string };

async function captureExternalBaseline(client: Pick<PrismaClient, "$queryRaw">) {
  const rows: BaselineRow[] = [];
  for (const tableName of BASELINE_TABLES) {
    const result = await client.$queryRaw<BaselineRow[]>(
      Prisma.raw(`SELECT '${tableName}' AS tableName, COUNT(*) AS rowCount FROM \`${tableName}\``)
    );
    rows.push(result[0]);
  }
  return rows.map((row) => ({ tableName: row.tableName, rowCount: String(row.rowCount) }));
}

const createActor = (userId: number, email: string): AuthenticatedAccessContext => ({
  userId,
  email,
  accessTokenJti: "rollback-agent-settlement-check",
  accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
  currentIdentityScopeType: "platform",
  roles: ["platform_admin"],
  permissions: [
    "backoffice:agent:write",
    "backoffice:agent-commission:write",
    "backoffice:operating-cost:write",
    "backoffice:agent-settlement:write"
  ]
});

const context: AuthRequestContext = {
  ip: "127.0.0.1",
  userAgent: "needo-agent-settlement-rollback-checker"
};

async function runFormalAgentSettlementFlow(transaction: Prisma.TransactionClient): Promise<void> {
  const marker = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const numericSuffix = marker.slice(-10).padStart(10, "0");
  const periodStart = new Date("2020-01-01T00:00:00.000Z");
  const periodEnd = new Date("2020-01-31T00:00:00.000Z");
  const laterEffectiveFrom = new Date("2020-02-01T00:00:00.000Z");
  const facade = createTransactionBoundPrismaFacade(transaction) as unknown as PrismaClient;

  const [actorUser, agentUser] = await Promise.all([
    transaction.user.create({
      data: {
        needoId: `rollback-admin-${marker}`.slice(0, 32),
        email: `rollback-admin-${marker}@needo.local`,
        username: "Rollback settlement administrator",
        isTestAccount: true
      }
    }),
    transaction.user.create({
      data: {
        needoId: `rollback-agent-${marker}`.slice(0, 32),
        email: `rollback-agent-${marker}@needo.local`,
        username: "Rollback settlement agent",
        isTestAccount: true
      }
    })
  ]);
  const shop = await transaction.shop.create({
    data: {
      ownerUserId: actorUser.id,
      name: `Rollback settlement shop ${marker}`,
      city: "Tokyo",
      address: "Rollback-only fixture",
      status: "published"
    }
  });
  const shopIdentifier = await transaction.publicIdentifier.create({
    data: {
      publicId: `S${numericSuffix}`,
      numberPart: numericSuffix,
      kind: "SHOP",
      shopId: shop.id,
      searchable: true,
      status: "ACTIVE"
    }
  });

  const actor = createActor(actorUser.id, actorUser.email);
  const audit = new AuditLogService(new AuditLogRepository(facade));
  const partnerService = new PlatformPartnerService(
    new PlatformPartnerRepository(facade),
    audit
  );
  const ruleService = new AgentCommissionRuleService(
    new AgentCommissionRuleRepository(facade),
    audit
  );
  const costService = new OperatingCostService(new OperatingCostRepository(facade), audit);
  const settlementRepository = new AgentSettlementRepository(facade);
  const settlementService = new AgentSettlementService(settlementRepository, audit);

  const agent = await partnerService.markPartnerProfile(
    agentUser.id,
    { partnerType: "agent", activatedAt: periodStart, reason: "rollback flow agent" },
    actor,
    context
  );
  const referral = await partnerService.linkAgentShop(
    agent.publicId,
    {
      shopPublicId: shopIdentifier.publicId,
      source: "rollback_flow",
      confirmedAt: periodStart,
      reason: "rollback flow referral"
    },
    actor,
    context
  );
  await transaction.agentShopReferral.update({
    where: { publicId: referral.publicId },
    data: { status: "QUALIFIED", successQualifiedAt: new Date("2020-01-02T00:00:00.000Z") }
  });

  await ruleService.publishRule(
    actor,
    agent.publicId,
    {
      fixedSuccessRewardJpy: 1_000,
      profitShareRateBps: 1_000,
      paymentMethod: "bank_transfer",
      paymentDetails: { reference: "rollback-only" },
      effectiveFrom: periodStart,
      reason: "rollback flow initial rule"
    },
    context
  );

  const commonCost = {
    categoryCode: "server" as const,
    amountJpy: 900,
    periodStart,
    periodEnd,
    effectiveAt: periodStart,
    reason: "rollback flow allocation coverage"
  };
  await costService.createCost(
    actor,
    {
      ...commonCost,
      costCode: `rollback-equal-${marker}`,
      name: "Rollback equal allocation",
      allocationMode: "equal_active_shops"
    },
    context
  );
  await costService.createCost(
    actor,
    {
      ...commonCost,
      costCode: `rollback-proportional-${marker}`,
      name: "Rollback proportional allocation",
      allocationMode: "platform_income_proportional"
    },
    context
  );
  const directCost = await costService.createCost(
    actor,
    {
      ...commonCost,
      costCode: `rollback-direct-${marker}`,
      name: "Rollback direct allocation",
      allocationMode: "direct_shops",
      directAssignments: [{ shopPublicId: shopIdentifier.publicId, amountJpy: 900 }]
    },
    context
  );
  await costService.publishCost(
    actor,
    directCost.publicId,
    "rollback flow publish direct allocation",
    context
  );

  const settlementInput = {
    periodStart,
    periodEnd,
    externalDeductions: [
      {
        shopPublicId: shopIdentifier.publicId,
        channelFeesJpy: 200,
        consumptionTaxJpy: 300,
        evidenceReference: `rollback-evidence-${marker}`,
        reason: "rollback flow external deductions"
      }
    ]
  };
  const preview = await settlementService.previewSettlement(actor, agent.publicId, settlementInput);
  assert.equal(preview.totals.orderPlatformFeesJpy, 0);
  assert.equal(preview.totals.saasFeesJpy, 0);
  assert.equal(preview.totals.userRebatesJpy, 0);
  assert.equal(preview.totals.allocatedOperatingCostsJpy, 900);

  const confirmed = await settlementService.confirmSettlement(
    actor,
    agent.publicId,
    { ...settlementInput, idempotencyKey: `rollback-confirm-${marker}` },
    context
  );
  assert.equal(confirmed.applied, true);
  const beforeConfigurationChanges = toEvidence(confirmed.settlement);
  assertSettlementSnapshotUnchanged(
    expectedSettlementEvidence({
      orderPlatformFeesJpy: 0,
      saasFeesJpy: 0,
      userRebatesJpy: 0,
      refundsAndReversalsJpy: 0,
      channelFeesJpy: 200,
      consumptionTaxJpy: 300,
      allocatedOperatingCostsJpy: 900,
      fixedSuccessRewardJpy: 1_000,
      profitShareRateBps: 1_000
    }),
    beforeConfigurationChanges
  );

  await ruleService.publishRule(
    actor,
    agent.publicId,
    {
      fixedSuccessRewardJpy: 9_999,
      profitShareRateBps: 5_000,
      paymentMethod: "bank_transfer",
      paymentDetails: { reference: "later-rule" },
      effectiveFrom: laterEffectiveFrom,
      reason: "rollback flow later rule"
    },
    context
  );
  const laterCost = await costService.createCost(
    actor,
    {
      ...commonCost,
      costCode: directCost.costCode,
      name: "Rollback later cost version",
      amountJpy: 4_500,
      periodStart: laterEffectiveFrom,
      periodEnd: new Date("2020-02-29T00:00:00.000Z"),
      effectiveAt: laterEffectiveFrom,
      allocationMode: "direct_shops",
      directAssignments: [{ shopPublicId: shopIdentifier.publicId, amountJpy: 4_500 }],
      reason: "rollback flow later cost version"
    },
    context
  );
  await costService.updateCost(
    actor,
    laterCost.publicId,
    {
      ...commonCost,
      name: "Rollback edited later cost version",
      amountJpy: 5_000,
      periodStart: laterEffectiveFrom,
      periodEnd: new Date("2020-02-29T00:00:00.000Z"),
      effectiveAt: laterEffectiveFrom,
      allocationMode: "direct_shops",
      directAssignments: [{ shopPublicId: shopIdentifier.publicId, amountJpy: 5_000 }],
      reason: "rollback flow later cost edit"
    },
    context
  );

  const afterConfigurationChanges = await settlementRepository.list({
    agentPublicId: agent.publicId,
    page: 1,
    pageSize: 10
  });
  assert.equal(afterConfigurationChanges.total, 1);
  assertSettlementSnapshotUnchanged(
    beforeConfigurationChanges,
    toEvidence(afterConfigurationChanges.list[0])
  );

  const paid = await settlementService.markPaid(
    actor,
    agent.publicId,
    confirmed.settlement.publicId,
    {
      paymentMethod: "bank_transfer",
      paymentReference: `rollback-payment-${marker}`,
      reason: "rollback flow payment"
    },
    context
  );
  assert.equal(paid.applied, true);
  assert.equal(paid.settlement.status, "paid");
  assertSettlementSnapshotUnchanged(beforeConfigurationChanges, toEvidence(paid.settlement));
}

export async function runAgentSettlementCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;
  const { prisma } = await import("../src/prisma/client");
  try {
    await runRollbackOnlyTransaction(
      prisma,
      () => captureExternalBaseline(prisma),
      runFormalAgentSettlementFlow
    );
    process.stdout.write("Agent settlement flow verified; ROLLBACK completed.\n");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runAgentSettlementCheck().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Agent settlement check failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
