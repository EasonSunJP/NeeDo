import assert from "node:assert/strict";
import { Prisma, type PrismaClient } from "@prisma/client";
import { AgentCommissionRuleRepository } from "../src/repositories/agent-commission-rule.repository";
import { AgentSettlementRepository } from "../src/repositories/agent-settlement.repository";
import { AuditLogRepository } from "../src/repositories/audit-log.repository";
import { OperatingCostRepository } from "../src/repositories/operating-cost.repository";
import { PlatformPartnerRepository } from "../src/repositories/platform-partner.repository";
import { AgentCommissionRuleService } from "../src/services/agent-commission-rule.service";
import { AgentSettlementService } from "../src/services/agent-settlement.service";
import { AuditLogService } from "../src/services/audit-log.service";
import type {
  AuthRequestContext,
  AuthenticatedAccessContext
} from "../src/services/auth.service";
import {
  OperatingCostService,
  type OperatingCostAllocationMode,
  type OperatingCostItemPayload
} from "../src/services/operating-cost.service";
import { PlatformPartnerService } from "../src/services/platform-partner.service";
import { createTransactionBoundPrismaFacade } from "./check-order-fulfillment-checkout-flow";
import {
  assertPersistedSettlementEvidenceUnchanged,
  assertSettlementSnapshotUnchanged,
  expectedSettlementEvidence
} from "./check-agent-settlement-flow";

const BASELINE_TABLES = [
  "users",
  "shops",
  "public_identifiers",
  "schedule_slots",
  "booking_orders",
  "order_checkouts",
  "order_financials",
  "ndp_exchange_rate_rules",
  "saas_invoices",
  "saas_invoice_lines",
  "saas_payments",
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

export async function captureAgentSettlementExternalBaseline(
  client: Pick<PrismaClient, "$queryRaw">
) {
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
    "backoffice:operating-cost:write",
    "backoffice:agent-settlement:write",
    "backoffice:agent-settlement:pay"
  ]
});

const context: AuthRequestContext = {
  ip: "127.0.0.1",
  userAgent: "needo-agent-settlement-rollback-checker"
};

async function createFinancialEvidence(
  transaction: Prisma.TransactionClient,
  input: {
    actorUserId: number;
    marker: string;
    shopId: number;
    periodStart: Date;
  }
): Promise<void> {
  await transaction.$queryRaw<Array<{ id: number }>>(
    Prisma.sql`SELECT id FROM ndp_exchange_rate_rules ORDER BY version DESC LIMIT 1 FOR UPDATE`
  );
  const rateEffectiveFrom = new Date();
  const activeRates = await transaction.ndpExchangeRateRule.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { effectiveFrom: true }
  });
  if (activeRates.some((row) => row.effectiveFrom >= rateEffectiveFrom)) {
    throw new Error(
      "Formal agent settlement checker requires no future active exchange rate inside its isolated transaction"
    );
  }
  await transaction.ndpExchangeRateRule.updateMany({
    where: { status: "ACTIVE", deletedAt: null },
    data: { status: "SUPERSEDED", activeKey: null, effectiveTo: rateEffectiveFrom }
  });
  const latestRate = await transaction.ndpExchangeRateRule.findFirst({
    orderBy: [{ version: "desc" }, { id: "desc" }],
    select: { version: true }
  });
  const rate = await transaction.ndpExchangeRateRule.create({
    data: {
      version: (latestRate?.version ?? 0) + 1,
      ndpUnits: 1,
      jpyUnits: 1,
      status: "ACTIVE",
      effectiveFrom: rateEffectiveFrom,
      activeKey: "ndp_exchange_rate",
      idempotencyKey: `rollback-rate-${input.marker}`,
      reason: "rollback settlement 1:1 evidence rate",
      createdById: input.actorUserId
    }
  });

  const createOrder = async (suffix: string, refunded: boolean) => {
    const startsAt = new Date(
      refunded ? "2020-01-15T09:00:00.000Z" : "2020-01-10T09:00:00.000Z"
    );
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const schedule = await transaction.scheduleSlot.create({
      data: {
        shopId: input.shopId,
        startsAt,
        endsAt,
        capacity: 1,
        bookedCount: 1,
        status: "BOOKED"
      }
    });
    const booking = await transaction.bookingOrder.create({
      data: {
        orderNo: `RB-${suffix}-${input.marker}`.slice(0, 40),
        customerUserId: input.actorUserId,
        shopId: input.shopId,
        scheduleSlotId: schedule.id,
        status: "COMPLETED",
        priceAmount: 20_000,
        startsAt,
        endsAt,
        paymentMethod: "NDP",
        paymentStatus: refunded ? "REFUNDED" : "CONFIRMED",
        paymentAmountJpy: 20_000,
        paymentConfirmedById: refunded ? null : input.actorUserId,
        paymentConfirmedAt: refunded ? null : startsAt,
        paymentReference: refunded ? null : `rollback-confirmed-${input.marker}`,
        paymentRefundedById: refunded ? input.actorUserId : null,
        paymentRefundedAt: refunded ? startsAt : null,
        paymentRefundReference: refunded ? `rollback-refund-${input.marker}` : null,
        paymentRefundReason: refunded ? "rollback settlement reversal evidence" : null
      }
    });
    await transaction.orderCheckout.create({
      data: {
        bookingOrderId: booking.id,
        baseAmountJpy: 20_000,
        checkoutAmountJpy: 20_000,
        payableNdp: 20_000,
        ndpRateRuleId: rate.id,
        rateSnapshotJson: { ndpUnits: 1, jpyUnits: 1 },
        calculationSnapshotJson: { source: "rollback_agent_settlement" },
        paymentMethod: "NDP"
      }
    });
    await transaction.orderFinancial.create({
      data: {
        bookingOrderId: booking.id,
        customerUserId: input.actorUserId,
        shopId: input.shopId,
        serviceAmountJpy: 20_000,
        platformCollectedServiceAmountJpy: 20_000,
        paymentChannel: "ndp",
        serviceIncomeStatus: "confirmed",
        bPlatformFeeActualNdp: refunded ? 300 : 10_000,
        cRequestFeeActualNdp: refunded ? 200 : 2_000,
        userRewardNdp: refunded ? 0 : 500,
        settlementStatus: refunded ? "refunded" : "settled"
      }
    });
  };

  await createOrder("settled", false);
  await createOrder("refunded", true);

  const invoice = await transaction.saasInvoice.create({
    data: {
      invoiceNo: `rollback-invoice-${input.marker}`,
      payerType: "shop",
      shopId: input.shopId,
      billingCadence: "monthly",
      periodStartsAt: input.periodStart,
      periodEndsAt: new Date("2020-01-31T00:00:00.000Z"),
      dueAt: new Date("2020-01-31T00:00:00.000Z"),
      amountJpy: 3_000,
      status: "paid",
      idempotencyKey: `rollback-invoice-${input.marker}`
    }
  });
  await transaction.saasInvoiceLine.create({
    data: {
      invoiceId: invoice.id,
      subjectType: "shop",
      shopId: input.shopId,
      description: "Rollback settlement SaaS evidence",
      monthlyFeeJpy: 3_000,
      amountJpy: 3_000,
      periodStartsAt: input.periodStart,
      periodEndsAt: new Date("2020-01-31T00:00:00.000Z"),
      idempotencyKey: `rollback-invoice-line-${input.marker}`
    }
  });
  await transaction.saasPayment.create({
    data: {
      invoiceId: invoice.id,
      provider: "manual",
      externalReference: `rollback-saas-${input.marker}`,
      amountJpy: 3_000,
      receivedAt: new Date("2020-01-12T00:00:00.000Z"),
      status: "confirmed",
      reviewedById: input.actorUserId,
      reviewedAt: new Date("2020-01-12T00:00:00.000Z"),
      idempotencyKey: `rollback-saas-payment-${input.marker}`
    }
  });
}

export type AllocationEvidenceRow = {
  shopId: number;
  amountJpy: bigint;
  calculationSnapshotJson: Prisma.JsonValue;
};

const snapshotRecord = (value: Prisma.JsonValue): Record<string, unknown> => {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
};

export function assertAllocationEvidence(
  rows: AllocationEvidenceRow[],
  mode: OperatingCostAllocationMode,
  expectedTotalJpy: number,
  expectedDirectShopId?: number
): void {
  assert(rows.length > 0);
  assert.equal(rows.reduce((sum, row) => sum + row.amountJpy, 0n), BigInt(expectedTotalJpy));
  for (const row of rows) {
    const snapshot = snapshotRecord(row.calculationSnapshotJson);
    assert.equal(snapshot.allocationMode, mode);
    assert.equal(snapshot.costAmountJpy, expectedTotalJpy);
    assert.equal(snapshot.allocatedAmountJpy, Number(row.amountJpy));
    assert.equal(snapshot.remainderPolicy, "shop_numeric_id_ascending");
  }

  if (mode === "equal_active_shops") {
    const base = Math.floor(expectedTotalJpy / rows.length);
    const remainder = expectedTotalJpy % rows.length;
    rows.forEach((row, index) => {
      assert.equal(Number(row.amountJpy), base + (index < remainder ? 1 : 0));
    });
  }
  if (mode === "platform_income_proportional") {
    const bases = rows.map((row) => {
      const snapshot = snapshotRecord(row.calculationSnapshotJson);
      const basis = Number(snapshot.settledPlatformIncomeJpy);
      const totalBasis = Number(snapshot.totalBasisJpy);
      assert(Number.isSafeInteger(basis) && basis > 0);
      assert(Number.isSafeInteger(totalBasis) && totalBasis > 0);
      return { basis, totalBasis };
    });
    assert(bases.every((row) => row.totalBasis === bases[0].totalBasis));
    const floorAllocations = bases.map((row) =>
      Math.floor((expectedTotalJpy * row.basis) / row.totalBasis)
    );
    let remainder = expectedTotalJpy - floorAllocations.reduce((sum, value) => sum + value, 0);
    rows.forEach((row, index) => {
      const expected = floorAllocations[index] + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      assert.equal(Number(row.amountJpy), expected);
    });
    assert.equal(remainder, 0);
  }
  if (mode === "direct_shops") {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].shopId, expectedDirectShopId);
    assert.equal(rows[0].amountJpy, BigInt(expectedTotalJpy));
  }
}

async function assertPublishedAllocation(
  transaction: Prisma.TransactionClient,
  item: OperatingCostItemPayload,
  mode: OperatingCostAllocationMode,
  expectedTotalJpy: number,
  expectedDirectShopId?: number
): Promise<void> {
  assert.equal(item.status, "published");
  assert.equal(item.allocationMode, mode);
  assert(item.allocations.length > 0);
  assert.equal(
    item.allocations.reduce((sum, row) => sum + row.amountJpy, 0),
    expectedTotalJpy
  );
  const storedItem = await transaction.operatingCostItem.findUniqueOrThrow({
    where: { publicId: item.publicId },
    select: {
      allocations: {
        where: { deletedAt: null },
        orderBy: [{ shopId: "asc" }, { id: "asc" }],
        select: {
          shopId: true,
          amountJpy: true,
          calculationSnapshotJson: true
        }
      }
    }
  });
  assertAllocationEvidence(
    storedItem.allocations as AllocationEvidenceRow[],
    mode,
    expectedTotalJpy,
    expectedDirectShopId
  );
}

async function captureImmutableSettlementEvidence(
  transaction: Prisma.TransactionClient,
  publicId: string
) {
  return transaction.agentSettlement.findUniqueOrThrow({
    where: { publicId },
    select: {
      publicId: true,
      agentProfileId: true,
      ruleVersionId: true,
      periodStart: true,
      periodEnd: true,
      currency: true,
      orderPlatformFeesJpy: true,
      saasFeesJpy: true,
      userRebatesJpy: true,
      refundsAndReversalsJpy: true,
      channelFeesJpy: true,
      consumptionTaxJpy: true,
      allocatedOperatingCostsJpy: true,
      pureProfitJpy: true,
      fixedSuccessRewardJpy: true,
      profitShareRateBps: true,
      profitShareAmountJpy: true,
      totalAmountJpy: true,
      calculationSnapshotJson: true,
      idempotencyKey: true,
      confirmedAt: true,
      confirmedById: true,
      ruleVersion: {
        select: {
          publicId: true,
          version: true,
          fixedSuccessRewardJpy: true,
          profitShareRateBps: true,
          paymentMethod: true,
          paymentDetailsJson: true,
          effectiveFrom: true,
          publishedAt: true,
          publishedById: true
        }
      },
      lines: {
        where: { deletedAt: null },
        orderBy: [{ shopId: "asc" }, { lineType: "asc" }, { id: "asc" }],
        select: {
          id: true,
          referralId: true,
          shopId: true,
          lineType: true,
          orderPlatformFeesJpy: true,
          saasFeesJpy: true,
          userRebatesJpy: true,
          refundsAndReversalsJpy: true,
          channelFeesJpy: true,
          consumptionTaxJpy: true,
          allocatedOperatingCostsJpy: true,
          shopPureProfitJpy: true,
          fixedSuccessRewardJpy: true,
          profitShareRateBps: true,
          amountJpy: true,
          calculationSnapshotJson: true,
          createdAt: true
        }
      }
    }
  });
}

export async function runFormalAgentSettlementFlow(
  transaction: Prisma.TransactionClient
): Promise<void> {
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
      publicId: `shop${numericSuffix}`,
      numberPart: numericSuffix,
      kind: "SHOP",
      shopId: shop.id,
      searchable: true,
      status: "ACTIVE"
    }
  });
  const publishedShops = await transaction.shop.findMany({
    where: { status: "published", deletedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      publicIdentifier: {
        select: { kind: true, status: true, deletedAt: true }
      }
    }
  });
  let candidateNumber = BigInt(numericSuffix);
  for (const publishedShop of publishedShops) {
    if (
      publishedShop.publicIdentifier &&
      (publishedShop.publicIdentifier.kind !== "SHOP" ||
        publishedShop.publicIdentifier.status !== "ACTIVE" ||
        publishedShop.publicIdentifier.deletedAt !== null)
    ) {
      throw new Error(
        `Published shop ${publishedShop.id} has an invalid canonical public identifier`
      );
    }
    if (!publishedShop.publicIdentifier) {
      let temporaryNumberPart: string | null = null;
      for (let attempt = 0; attempt < 10_000; attempt += 1) {
        candidateNumber = (candidateNumber % 9_999_999_999n) + 1n;
        const candidate = candidateNumber.toString().padStart(10, "0");
        const occupied = await transaction.publicIdentifier.findUnique({
          where: { publicId: `shop${candidate}` },
          select: { id: true }
        });
        if (!occupied) {
          temporaryNumberPart = candidate;
          break;
        }
      }
      if (!temporaryNumberPart) {
        throw new Error("Unable to reserve a rollback-only shop public identifier");
      }
      await transaction.publicIdentifier.create({
        data: {
          publicId: `shop${temporaryNumberPart}`,
          numberPart: temporaryNumberPart,
          kind: "SHOP",
          shopId: publishedShop.id,
          searchable: true,
          status: "ACTIVE"
        }
      });
    }
  }

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

  await createFinancialEvidence(transaction, {
    actorUserId: actorUser.id,
    marker,
    shopId: shop.id,
    periodStart
  });

  const costDefinitions = [
    {
      mode: "equal_active_shops" as const,
      amountJpy: 1_001,
      name: "Rollback equal allocation"
    },
    {
      mode: "platform_income_proportional" as const,
      amountJpy: 1_103,
      name: "Rollback proportional allocation"
    },
    {
      mode: "direct_shops" as const,
      amountJpy: 907,
      name: "Rollback direct allocation"
    }
  ];
  const publishedCosts: OperatingCostItemPayload[] = [];
  for (const definition of costDefinitions) {
    const draft = await costService.createCost(
      actor,
      {
        costCode: `rollback-${definition.mode}-${marker}`,
        categoryCode: "server",
        name: definition.name,
        amountJpy: definition.amountJpy,
        periodStart,
        periodEnd,
        allocationMode: definition.mode,
        ...(definition.mode === "direct_shops"
          ? {
              directAssignments: [
                { shopPublicId: shopIdentifier.publicId, amountJpy: definition.amountJpy }
              ]
            }
          : {}),
        effectiveAt: periodStart,
        reason: "rollback flow allocation coverage"
      },
      context
    );
    const published = await costService.publishCost(
      actor,
      draft.publicId,
      `rollback flow publish ${definition.mode}`,
      context
    );
    await assertPublishedAllocation(
      transaction,
      published,
      definition.mode,
      definition.amountJpy,
      definition.mode === "direct_shops" ? shop.id : undefined
    );
    publishedCosts.push(published);
  }
  const allocatedOperatingCostsJpy = publishedCosts.reduce(
    (sum, item) =>
      sum +
      item.allocations
        .filter((allocation) => allocation.shopPublicId === shopIdentifier.publicId)
        .reduce((subtotal, allocation) => subtotal + allocation.amountJpy, 0),
    0
  );
  assert(allocatedOperatingCostsJpy >= 907);

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
  const expected = expectedSettlementEvidence({
    orderPlatformFeesJpy: 12_000,
    saasFeesJpy: 3_000,
    userRebatesJpy: 500,
    refundsAndReversalsJpy: 500,
    channelFeesJpy: 200,
    consumptionTaxJpy: 300,
    allocatedOperatingCostsJpy,
    fixedSuccessRewardJpy: 1_000,
    profitShareRateBps: 1_000
  });
  const preview = await settlementService.previewSettlement(actor, agent.publicId, settlementInput);
  assertSettlementSnapshotUnchanged(expected, preview.totals);

  const confirmed = await settlementService.confirmSettlement(
    actor,
    agent.publicId,
    { ...settlementInput, idempotencyKey: `rollback-confirm-${marker}` },
    context
  );
  assert.equal(confirmed.applied, true);
  assertSettlementSnapshotUnchanged(expected, confirmed.settlement);
  const beforeConfigurationChanges = await captureImmutableSettlementEvidence(
    transaction,
    confirmed.settlement.publicId
  );
  assert.equal(beforeConfigurationChanges.ruleVersion.paymentMethod, "BANK_TRANSFER");
  assert(beforeConfigurationChanges.lines.some((line) => line.lineType === "SUCCESS_REWARD"));
  assert(beforeConfigurationChanges.lines.some((line) => line.lineType === "PROFIT_SHARE"));

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
  const closedInitialRule = await transaction.agentCommissionRuleVersion.findUniqueOrThrow({
    where: { id: beforeConfigurationChanges.ruleVersionId },
    select: { effectiveTo: true }
  });
  assert.equal(closedInitialRule.effectiveTo?.toISOString(), laterEffectiveFrom.toISOString());
  const laterCost = await costService.createCost(
    actor,
    {
      costCode: publishedCosts[2].costCode,
      categoryCode: "server",
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
      categoryCode: "server",
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
  assertPersistedSettlementEvidenceUnchanged(
    beforeConfigurationChanges,
    await captureImmutableSettlementEvidence(transaction, confirmed.settlement.publicId)
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
  assert.equal(paid.settlement.paymentMethod, "bank_transfer");
  assertPersistedSettlementEvidenceUnchanged(
    beforeConfigurationChanges,
    await captureImmutableSettlementEvidence(transaction, confirmed.settlement.publicId)
  );
}
