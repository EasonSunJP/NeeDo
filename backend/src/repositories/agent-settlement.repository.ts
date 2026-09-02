import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  calculateProfitShare,
  calculatePureProfit,
  type ShopPureProfitInput
} from "../services/agent-settlement.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

export type AgentSettlementStatus = "confirmed" | "paid";
export type AgentSettlementPaymentMethod = "bank_transfer" | "ndp" | "other";

export interface AgentSettlementExternalDeduction {
  shopPublicId: string;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  evidenceReference: string;
  reason: string;
}

export interface AgentSettlementRuleSummary {
  publicId: string;
  version: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  paymentMethod: AgentSettlementPaymentMethod;
}

export interface AgentSettlementTotals extends ShopPureProfitInput {
  pureProfitJpy: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  profitShareAmountJpy: number;
  totalAmountJpy: number;
}

export interface AgentSettlementShopPreview extends AgentSettlementTotals {
  referralPublicId: string;
  shopPublicId: string;
  shopName: string;
  successRewardEligible: boolean;
  externalEvidenceReference: string;
  externalEvidenceReason: string;
}

export interface AgentSettlementPreview {
  agentPublicId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: "JPY";
  rule: AgentSettlementRuleSummary;
  totals: AgentSettlementTotals;
  shops: AgentSettlementShopPreview[];
  generatedAt: Date;
}

export type AgentSettlementLineType = "success_reward" | "profit_share";

export interface AgentSettlementLineRecord extends ShopPureProfitInput {
  lineType: AgentSettlementLineType;
  referralPublicId: string;
  shopPublicId: string;
  shopName: string;
  pureProfitJpy: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  amountJpy: number;
}

export interface AgentSettlementRecord extends AgentSettlementTotals {
  id: number;
  publicId: string;
  agentPublicId: string;
  periodStart: Date;
  periodEnd: Date;
  status: AgentSettlementStatus;
  currency: "JPY";
  rule: AgentSettlementRuleSummary;
  idempotencyKey: string;
  confirmedAt: Date;
  confirmedById: number;
  paidAt: Date | null;
  paidById: number | null;
  paymentMethod: AgentSettlementPaymentMethod | null;
  paymentReference: string | null;
  lines: AgentSettlementLineRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentSettlementPeriodInput {
  agentPublicId: string;
  periodStart: Date;
  periodEnd: Date;
  externalDeductions: AgentSettlementExternalDeduction[];
}

export interface AgentSettlementConfirmInput extends AgentSettlementPeriodInput {
  idempotencyKey: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export interface AgentSettlementListInput extends PaginationInput {
  agentPublicId: string;
  status?: AgentSettlementStatus;
  periodStart?: Date;
  periodEnd?: Date;
}

export interface AgentSettlementPaymentInput {
  agentPublicId: string;
  settlementPublicId: string;
  paymentMethod: AgentSettlementPaymentMethod;
  paymentReference: string;
  reason: string;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type AgentSettlementPreviewResult =
  | { outcome: "ready"; preview: AgentSettlementPreview }
  | {
      outcome:
        | "agent_not_found"
        | "rule_not_found"
        | "rule_window_invalid"
        | "no_referrals"
        | "external_evidence_mismatch"
        | "financial_evidence_invalid";
    };
export type AgentSettlementConfirmResult =
  | { outcome: "confirmed"; settlement: AgentSettlementRecord; applied: boolean }
  | Exclude<AgentSettlementPreviewResult, { outcome: "ready" }>
  | { outcome: "conflict" | "idempotency_conflict" };
export type AgentSettlementPaymentResult =
  | { outcome: "paid"; settlement: AgentSettlementRecord; applied: boolean }
  | { outcome: "agent_not_found" | "not_found" | "conflict" | "payment_method_mismatch" };

export interface AgentSettlementRepositoryPort {
  preview: (input: AgentSettlementPeriodInput) => Promise<AgentSettlementPreviewResult>;
  confirm: (input: AgentSettlementConfirmInput) => Promise<AgentSettlementConfirmResult>;
  list: (input: AgentSettlementListInput) => Promise<PaginatedResponse<AgentSettlementRecord>>;
  markPaid: (input: AgentSettlementPaymentInput) => Promise<AgentSettlementPaymentResult>;
}

const ruleSelect = {
  id: true,
  publicId: true,
  version: true,
  fixedSuccessRewardJpy: true,
  profitShareRateBps: true,
  paymentMethod: true,
  effectiveFrom: true,
  effectiveTo: true
} as const satisfies Prisma.AgentCommissionRuleVersionSelect;

const lineSelect = {
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
  referral: { select: { publicId: true } },
  shop: {
    select: {
      name: true,
      publicIdentifier: { select: { publicId: true, deletedAt: true } }
    }
  }
} as const satisfies Prisma.AgentSettlementLineSelect;

const settlementSelect = {
  id: true,
  publicId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
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
  paidAt: true,
  paidById: true,
  paymentMethod: true,
  paymentReference: true,
  createdAt: true,
  updatedAt: true,
  agentProfile: { select: { publicId: true } },
  ruleVersion: { select: ruleSelect },
  lines: {
    where: { deletedAt: null },
    orderBy: [{ shopId: "asc" as const }, { lineType: "asc" as const }],
    select: lineSelect
  }
} as const satisfies Prisma.AgentSettlementSelect;

type StoredSettlement = Prisma.AgentSettlementGetPayload<{ select: typeof settlementSelect }>;
type StoredRule = Prisma.AgentCommissionRuleVersionGetPayload<{ select: typeof ruleSelect }>;
type SettlementClient = PrismaClient | Prisma.TransactionClient;
type ReferralRow = {
  id: number;
  publicId: string;
  status: "ACTIVE" | "QUALIFIED" | "REVOKED";
  confirmedAt: Date;
  successQualifiedAt: Date | null;
  shop: {
    id: number;
    name: string;
    publicIdentifier: {
      publicId: string;
      status: "ACTIVE" | "INACTIVE";
      deletedAt: Date | null;
    } | null;
  };
};
type FinancialFactsRow = {
  shopId?: number;
  shop_id?: number;
  orderPlatformFeesJpy?: bigint | Prisma.Decimal | number | string;
  order_platform_fees_jpy?: bigint | Prisma.Decimal | number | string;
  saasFeesJpy?: bigint | Prisma.Decimal | number | string;
  saas_fees_jpy?: bigint | Prisma.Decimal | number | string;
  userRebatesJpy?: bigint | Prisma.Decimal | number | string;
  user_rebates_jpy?: bigint | Prisma.Decimal | number | string;
  refundsAndReversalsJpy?: bigint | Prisma.Decimal | number | string;
  refunds_and_reversals_jpy?: bigint | Prisma.Decimal | number | string;
  allocatedOperatingCostsJpy?: bigint | Prisma.Decimal | number | string;
  allocated_operating_costs_jpy?: bigint | Prisma.Decimal | number | string;
};
type PreviewInternal = {
  preview: AgentSettlementPreview;
  agentProfileId: number;
  ruleVersionId: number;
  shops: Array<AgentSettlementShopPreview & { referralId: number; shopId: number }>;
};

class AgentSettlementConflict extends Error {}
class AgentSettlementIdempotencyConflict extends Error {}

export class AgentSettlementRepository implements AgentSettlementRepositoryPort {
  public constructor(
    private readonly client: SettlementClient = prisma,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async preview(input: AgentSettlementPeriodInput): Promise<AgentSettlementPreviewResult> {
    const result = await this.buildPreview(this.client, input);
    return "outcome" in result ? result : { outcome: "ready", preview: result.preview };
  }

  public async list(
    input: AgentSettlementListInput
  ): Promise<PaginatedResponse<AgentSettlementRecord>> {
    const agent = await this.client.platformPartnerProfile.findFirst({
      where: {
        publicId: input.agentPublicId,
        partnerType: "AGENT",
        deletedAt: null,
        user: { deletedAt: null, isActive: true }
      },
      select: { id: true }
    });
    if (!agent) return buildPaginatedResponse([], 0, input);
    const pagination = toPrismaPagination(input);
    const where: Prisma.AgentSettlementWhereInput = {
      agentProfileId: agent.id,
      deletedAt: null,
      ...(input.status ? { status: statusToRecord(input.status) } : {}),
      ...(input.periodStart ? { periodEnd: { gte: input.periodStart } } : {}),
      ...(input.periodEnd ? { periodStart: { lte: input.periodEnd } } : {})
    };
    const [rows, total] = await Promise.all([
      this.client.agentSettlement.findMany({
        where,
        orderBy: [{ periodStart: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        select: settlementSelect
      }),
      this.client.agentSettlement.count({ where })
    ]);
    return buildPaginatedResponse(
      rows.map((row) => this.mapSettlement(row)),
      total,
      pagination
    );
  }

  public async confirm(input: AgentSettlementConfirmInput): Promise<AgentSettlementConfirmResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.agent_settlement.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.confirmInTransaction(transaction, input))
      );
    } catch (error) {
      if (error instanceof AgentSettlementIdempotencyConflict) {
        return { outcome: "idempotency_conflict" };
      }
      if (
        error instanceof AgentSettlementConflict ||
        isRetryableTransactionConflict(error) ||
        isUniqueConflict(error)
      ) {
        return { outcome: "conflict" };
      }
      throw error;
    }
  }

  public async markPaid(input: AgentSettlementPaymentInput): Promise<AgentSettlementPaymentResult> {
    if (!("$transaction" in this.client))
      throw new Error("error.agent_settlement.transaction_required");
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.markPaidInTransaction(transaction, input))
      );
    } catch (error) {
      if (
        error instanceof AgentSettlementConflict ||
        isRetryableTransactionConflict(error) ||
        isUniqueConflict(error)
      ) {
        return { outcome: "conflict" };
      }
      throw error;
    }
  }

  private async confirmInTransaction(
    transaction: Prisma.TransactionClient,
    input: AgentSettlementConfirmInput
  ): Promise<AgentSettlementConfirmResult> {
    const locked = await this.lockAgent(transaction, input.agentPublicId);
    if (!locked) return { outcome: "agent_not_found" };
    const fingerprint = requestFingerprint(input);
    const replay = await transaction.agentSettlement.findFirst({
      where: {
        agentProfileId: locked.id,
        idempotencyKey: input.idempotencyKey,
        deletedAt: null
      },
      select: settlementSelect
    });
    if (replay) {
      const storedFingerprint = readSnapshotString(
        replay.calculationSnapshotJson,
        "requestFingerprint"
      );
      if (storedFingerprint !== fingerprint) throw new AgentSettlementIdempotencyConflict();
      return { outcome: "confirmed", settlement: this.mapSettlement(replay), applied: false };
    }
    const periodConflict = await transaction.agentSettlement.findFirst({
      where: {
        agentProfileId: locked.id,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        deletedAt: null
      },
      select: { id: true }
    });
    if (periodConflict) return { outcome: "conflict" };

    const preview = await this.buildPreview(transaction, input, locked.id);
    if ("outcome" in preview) return preview;
    const created = await transaction.agentSettlement.create({
      data: {
        agentProfileId: preview.agentProfileId,
        ruleVersionId: preview.ruleVersionId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: "CONFIRMED",
        currency: "JPY",
        ...totalsToCreateData(preview.preview.totals),
        calculationSnapshotJson: {
          schemaVersion: 1,
          requestFingerprint: fingerprint,
          preview: serializePreview(preview.preview)
        } as unknown as Prisma.InputJsonObject,
        idempotencyKey: input.idempotencyKey,
        confirmedAt: this.now(),
        confirmedById: input.actorUserId
      },
      select: { id: true }
    });

    for (const shop of preview.shops) {
      if (shop.successRewardEligible) {
        await transaction.agentSettlementLine.create({
          data: lineCreateData(created.id, shop, "SUCCESS_REWARD", shop.fixedSuccessRewardJpy)
        });
      }
      await transaction.agentSettlementLine.create({
        data: lineCreateData(created.id, shop, "PROFIT_SHARE", shop.profitShareAmountJpy)
      });
    }
    await this.writeAudit(transaction, input.audit, created.id, {
      agentPublicId: input.agentPublicId,
      periodStart: input.periodStart.toISOString().slice(0, 10),
      periodEnd: input.periodEnd.toISOString().slice(0, 10),
      requestFingerprint: fingerprint,
      totals: preview.preview.totals,
      shopCount: preview.shops.length,
      idempotencyKey: input.idempotencyKey
    });
    const settlement = await transaction.agentSettlement.findFirst({
      where: { id: created.id, deletedAt: null },
      select: settlementSelect
    });
    if (!settlement) throw new AgentSettlementConflict();
    return { outcome: "confirmed", settlement: this.mapSettlement(settlement), applied: true };
  }

  private async markPaidInTransaction(
    transaction: Prisma.TransactionClient,
    input: AgentSettlementPaymentInput
  ): Promise<AgentSettlementPaymentResult> {
    const agent = await this.lockAgent(transaction, input.agentPublicId);
    if (!agent) return { outcome: "agent_not_found" };
    const locked = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM agent_settlements WHERE public_id = ${input.settlementPublicId} AND agent_profile_id = ${agent.id} AND deleted_at IS NULL FOR UPDATE`
    );
    if (locked.length !== 1) return { outcome: "not_found" };
    const current = await transaction.agentSettlement.findFirst({
      where: { id: locked[0].id, agentProfileId: agent.id, deletedAt: null },
      select: settlementSelect
    });
    if (!current) return { outcome: "not_found" };
    const expectedMethod = paymentMethodFromRecord(current.ruleVersion.paymentMethod);
    if (expectedMethod !== input.paymentMethod) return { outcome: "payment_method_mismatch" };
    if (current.status === "PAID") {
      return current.paymentMethod === paymentMethodToRecord(input.paymentMethod) &&
        current.paymentReference === input.paymentReference
        ? { outcome: "paid", settlement: this.mapSettlement(current), applied: false }
        : { outcome: "conflict" };
    }
    const paidAt = this.now();
    const updated = await transaction.agentSettlement.updateMany({
      where: { id: current.id, status: "CONFIRMED", paidAt: null, deletedAt: null },
      data: {
        status: "PAID",
        paidAt,
        paidById: input.actorUserId,
        paymentMethod: paymentMethodToRecord(input.paymentMethod),
        paymentReference: input.paymentReference
      }
    });
    if (updated.count !== 1) throw new AgentSettlementConflict();
    await this.writeAudit(transaction, input.audit, current.id, {
      agentPublicId: input.agentPublicId,
      settlementPublicId: input.settlementPublicId,
      previousStatus: "confirmed",
      nextStatus: "paid",
      paymentMethod: input.paymentMethod,
      paymentReference: input.paymentReference,
      paidAt: paidAt.toISOString(),
      reason: input.reason
    });
    const paid = await transaction.agentSettlement.findFirst({
      where: { id: current.id, deletedAt: null },
      select: settlementSelect
    });
    if (!paid) throw new AgentSettlementConflict();
    return { outcome: "paid", settlement: this.mapSettlement(paid), applied: true };
  }

  private async buildPreview(
    client: SettlementClient,
    input: AgentSettlementPeriodInput,
    lockedAgentId?: number
  ): Promise<PreviewInternal | Exclude<AgentSettlementPreviewResult, { outcome: "ready" }>> {
    const agent = await client.platformPartnerProfile.findFirst({
      where: {
        ...(lockedAgentId ? { id: lockedAgentId } : {}),
        publicId: input.agentPublicId,
        partnerType: "AGENT",
        deletedAt: null,
        user: { deletedAt: null, isActive: true }
      },
      select: { id: true }
    });
    if (!agent) return { outcome: "agent_not_found" };
    const periodEndExclusive = addUtcDays(input.periodEnd, 1);
    const rules = await client.agentCommissionRuleVersion.findMany({
      where: {
        agentProfileId: agent.id,
        effectiveFrom: { lte: input.periodStart },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodEndExclusive } }],
        deletedAt: null
      },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      take: 2,
      select: ruleSelect
    });
    if (rules.length === 0) return { outcome: "rule_not_found" };
    if (rules.length !== 1) return { outcome: "rule_window_invalid" };
    const rule = rules[0];

    const referrals = (await client.agentShopReferral.findMany({
      where: {
        agentProfileId: agent.id,
        status: { in: ["ACTIVE", "QUALIFIED"] },
        confirmedAt: { lt: periodEndExclusive },
        deletedAt: null,
        shop: { status: "published", deletedAt: null }
      },
      orderBy: [{ shopId: "asc" }, { id: "asc" }],
      select: {
        id: true,
        publicId: true,
        status: true,
        confirmedAt: true,
        successQualifiedAt: true,
        shop: {
          select: {
            id: true,
            name: true,
            publicIdentifier: {
              select: { publicId: true, status: true, deletedAt: true }
            }
          }
        }
      }
    })) as ReferralRow[];
    if (referrals.length === 0) return { outcome: "no_referrals" };
    if (
      referrals.some(
        (referral) =>
          !referral.shop.publicIdentifier ||
          referral.shop.publicIdentifier.status !== "ACTIVE" ||
          referral.shop.publicIdentifier.deletedAt !== null
      )
    ) {
      return { outcome: "financial_evidence_invalid" };
    }
    const deductionByShop = new Map(
      input.externalDeductions.map((deduction) => [deduction.shopPublicId, deduction])
    );
    const referralPublicIds = referrals.map(
      (referral) => referral.shop.publicIdentifier?.publicId ?? ""
    );
    if (
      deductionByShop.size !== referrals.length ||
      referralPublicIds.some((publicId) => !deductionByShop.has(publicId))
    ) {
      return { outcome: "external_evidence_mismatch" };
    }
    const priorRewardLines = await client.agentSettlementLine.findMany({
      where: {
        referralId: { in: referrals.map((referral) => referral.id) },
        lineType: "SUCCESS_REWARD",
        deletedAt: null,
        settlement: { deletedAt: null }
      },
      select: { referralId: true }
    });
    const rewardedReferralIds = new Set(priorRewardLines.map((line) => line.referralId));
    const factsResult = await this.loadFinancialFacts(
      client,
      referrals.map((referral) => ({
        shopId: referral.shop.id,
        effectiveFrom: referral.confirmedAt
      })),
      input.periodStart,
      periodEndExclusive,
      input.periodEnd
    );
    if (!factsResult) return { outcome: "financial_evidence_invalid" };

    let shops: PreviewInternal["shops"];
    try {
      shops = referrals.map((referral) => {
        const identifier = referral.shop.publicIdentifier;
        if (!identifier) throw new RangeError("agent_settlement_calculation_invalid");
        const facts = factsResult.get(referral.shop.id) ?? zeroFacts();
        const external = deductionByShop.get(identifier.publicId);
        if (!external) throw new RangeError("agent_settlement_calculation_invalid");
        const components: ShopPureProfitInput = {
          ...facts,
          channelFeesJpy: external.channelFeesJpy,
          consumptionTaxJpy: external.consumptionTaxJpy
        };
        const pureProfitJpy = calculatePureProfit(components);
        const successRewardEligible =
          referral.status === "QUALIFIED" &&
          referral.successQualifiedAt !== null &&
          referral.successQualifiedAt < periodEndExclusive &&
          !rewardedReferralIds.has(referral.id);
        const fixedSuccessRewardJpy = successRewardEligible
          ? toSafeJpy(rule.fixedSuccessRewardJpy)
          : 0;
        const profitShareAmountJpy = calculateProfitShare(rule.profitShareRateBps, pureProfitJpy);
        return {
          referralId: referral.id,
          shopId: referral.shop.id,
          referralPublicId: referral.publicId,
          shopPublicId: identifier.publicId,
          shopName: referral.shop.name,
          successRewardEligible,
          ...components,
          pureProfitJpy,
          fixedSuccessRewardJpy,
          profitShareRateBps: rule.profitShareRateBps,
          profitShareAmountJpy,
          totalAmountJpy: safeSum([fixedSuccessRewardJpy, profitShareAmountJpy]),
          externalEvidenceReference: external.evidenceReference,
          externalEvidenceReason: external.reason
        };
      });
    } catch (error) {
      if (error instanceof RangeError) return { outcome: "financial_evidence_invalid" };
      throw error;
    }
    const totals = sumShopTotals(shops);
    return {
      agentProfileId: agent.id,
      ruleVersionId: rule.id,
      shops,
      preview: {
        agentPublicId: input.agentPublicId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: "JPY",
        rule: mapRule(rule),
        totals,
        shops: shops.map((shop) => {
          const { referralId, shopId, ...payload } = shop;
          void referralId;
          void shopId;
          return payload;
        }),
        generatedAt: this.now()
      }
    };
  }

  private async loadFinancialFacts(
    client: SettlementClient,
    referralScopes: Array<{ shopId: number; effectiveFrom: Date }>,
    periodStart: Date,
    periodEndExclusive: Date,
    periodEndInclusive: Date
  ): Promise<Map<number, ShopPureProfitInput> | null> {
    const shopIds = referralScopes.map((scope) => scope.shopId);
    const rows = await client.$queryRaw<FinancialFactsRow[]>(Prisma.sql`
      /* agent_settlement_shop_financial_facts */
      WITH referral_scope AS (
        ${Prisma.join(
          referralScopes.map(
            (scope) =>
              Prisma.sql`SELECT ${scope.shopId} AS shop_id, ${scope.effectiveFrom} AS effective_from`
          ),
          " UNION ALL "
        )}
      ),
      settled_orders AS (
        SELECT financial.shop_id,
          SUM(FLOOR(CAST(financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp AS DECIMAL(65, 0))
            * rate.jpy_units / rate.ndp_units)) AS order_platform_fees_jpy,
          SUM(FLOOR(CAST(financial.user_reward_ndp AS DECIMAL(65, 0))
            * rate.jpy_units / rate.ndp_units)) AS user_rebates_jpy
        FROM referral_scope AS scope
        INNER JOIN order_financials AS financial ON financial.shop_id = scope.shop_id
        INNER JOIN booking_orders AS booking
          ON booking.id = financial.booking_order_id
          AND booking.shop_id = financial.shop_id
          AND booking.status = ${"completed"}
          AND booking.payment_status = ${"confirmed"}
          AND booking.payment_confirmed_at >= ${periodStart}
          AND booking.payment_confirmed_at >= scope.effective_from
          AND booking.payment_confirmed_at < ${periodEndExclusive}
          AND booking.payment_confirmed_by_id IS NOT NULL
          AND booking.payment_refunded_at IS NULL
          AND booking.payment_refunded_by_id IS NULL
          AND booking.payment_refund_reference IS NULL
          AND booking.payment_refund_reason IS NULL
          AND booking.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        INNER JOIN ndp_exchange_rate_rules AS rate
          ON rate.id = checkout.ndp_rate_rule_id
          AND rate.ndp_units > 0 AND rate.jpy_units > 0 AND rate.deleted_at IS NULL
        WHERE financial.shop_id IN (${Prisma.join(shopIds)})
          AND financial.ndp_currency = ${"NDP"}
          AND financial.settlement_status = ${"settled"}
          AND financial.b_platform_fee_actual_ndp >= 0
          AND financial.c_request_fee_actual_ndp >= 0
          AND financial.user_reward_ndp >= 0
          AND financial.deleted_at IS NULL
        GROUP BY financial.shop_id
      ),
      settled_refunds AS (
        SELECT financial.shop_id,
          SUM(FLOOR(CAST(financial.b_platform_fee_actual_ndp + financial.c_request_fee_actual_ndp AS DECIMAL(65, 0))
            * rate.jpy_units / rate.ndp_units)) AS refunds_and_reversals_jpy
        FROM referral_scope AS scope
        INNER JOIN order_financials AS financial ON financial.shop_id = scope.shop_id
        INNER JOIN booking_orders AS booking
          ON booking.id = financial.booking_order_id
          AND booking.shop_id = financial.shop_id
          AND booking.payment_status = ${"refunded"}
          AND booking.payment_refunded_at >= ${periodStart}
          AND booking.payment_refunded_at >= scope.effective_from
          AND booking.payment_refunded_at < ${periodEndExclusive}
          AND booking.payment_refunded_by_id IS NOT NULL
          AND booking.payment_refund_reason IS NOT NULL
          AND TRIM(booking.payment_refund_reason) <> ${""}
          AND booking.deleted_at IS NULL
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        INNER JOIN ndp_exchange_rate_rules AS rate
          ON rate.id = checkout.ndp_rate_rule_id
          AND rate.ndp_units > 0 AND rate.jpy_units > 0 AND rate.deleted_at IS NULL
        WHERE financial.shop_id IN (${Prisma.join(shopIds)})
          AND financial.ndp_currency = ${"NDP"}
          AND financial.settlement_status = ${"refunded"}
          AND financial.b_platform_fee_actual_ndp >= 0
          AND financial.c_request_fee_actual_ndp >= 0
          AND financial.deleted_at IS NULL
        GROUP BY financial.shop_id
      ),
      settled_saas AS (
        SELECT COALESCE(line.shop_id, invoice.shop_id) AS shop_id,
          SUM(CAST(line.amount_jpy AS DECIMAL(65, 0))) AS saas_fees_jpy
        FROM saas_invoice_lines AS line
        INNER JOIN saas_invoices AS invoice
          ON invoice.id = line.invoice_id AND invoice.status = ${"paid"} AND invoice.deleted_at IS NULL
        INNER JOIN referral_scope AS scope
          ON scope.shop_id = COALESCE(line.shop_id, invoice.shop_id)
        WHERE COALESCE(line.shop_id, invoice.shop_id) IN (${Prisma.join(shopIds)})
          AND line.amount_jpy >= 0 AND line.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM saas_payments AS payment
            WHERE payment.invoice_id = invoice.id
              AND payment.status = ${"confirmed"}
              AND payment.amount_jpy = invoice.amount_jpy
              AND payment.received_at >= ${periodStart}
              AND payment.received_at >= scope.effective_from
              AND payment.received_at < ${periodEndExclusive}
              AND payment.deleted_at IS NULL
          )
        GROUP BY COALESCE(line.shop_id, invoice.shop_id)
      ),
      allocated_costs AS (
        SELECT allocation.shop_id,
          SUM(CAST(allocation.amount_jpy AS DECIMAL(65, 0))) AS allocated_operating_costs_jpy
        FROM referral_scope AS scope
        INNER JOIN operating_cost_allocations AS allocation ON allocation.shop_id = scope.shop_id
        INNER JOIN operating_cost_items AS item
          ON item.id = allocation.operating_cost_item_id
          AND item.status = ${"published"}
          AND item.currency = ${"JPY"}
          AND item.period_start >= ${periodStart}
          AND item.period_start >= scope.effective_from
          AND item.period_end <= ${periodEndInclusive}
          AND item.effective_at <= ${this.now()}
          AND item.deleted_at IS NULL
        WHERE allocation.shop_id IN (${Prisma.join(shopIds)})
          AND allocation.amount_jpy >= 0 AND allocation.deleted_at IS NULL
        GROUP BY allocation.shop_id
      )
      SELECT shop.id AS shopId,
        CAST(COALESCE(orders.order_platform_fees_jpy, 0) AS DECIMAL(65, 0)) AS orderPlatformFeesJpy,
        CAST(COALESCE(saas.saas_fees_jpy, 0) AS DECIMAL(65, 0)) AS saasFeesJpy,
        CAST(COALESCE(orders.user_rebates_jpy, 0) AS DECIMAL(65, 0)) AS userRebatesJpy,
        CAST(COALESCE(refunds.refunds_and_reversals_jpy, 0) AS DECIMAL(65, 0)) AS refundsAndReversalsJpy,
        CAST(COALESCE(costs.allocated_operating_costs_jpy, 0) AS DECIMAL(65, 0)) AS allocatedOperatingCostsJpy
      FROM shops AS shop
      LEFT JOIN settled_orders AS orders ON orders.shop_id = shop.id
      LEFT JOIN settled_refunds AS refunds ON refunds.shop_id = shop.id
      LEFT JOIN settled_saas AS saas ON saas.shop_id = shop.id
      LEFT JOIN allocated_costs AS costs ON costs.shop_id = shop.id
      WHERE shop.id IN (${Prisma.join(shopIds)}) AND shop.deleted_at IS NULL
      ORDER BY shop.id ASC
    `);
    if (rows.length !== shopIds.length) return null;
    try {
      return new Map(
        rows.map((row) => [
          toSafeId(row.shopId ?? row.shop_id),
          {
            orderPlatformFeesJpy: toSafeAggregate(
              row.orderPlatformFeesJpy ?? row.order_platform_fees_jpy
            ),
            saasFeesJpy: toSafeAggregate(row.saasFeesJpy ?? row.saas_fees_jpy),
            userRebatesJpy: toSafeAggregate(row.userRebatesJpy ?? row.user_rebates_jpy),
            refundsAndReversalsJpy: toSafeAggregate(
              row.refundsAndReversalsJpy ?? row.refunds_and_reversals_jpy
            ),
            channelFeesJpy: 0,
            consumptionTaxJpy: 0,
            allocatedOperatingCostsJpy: toSafeAggregate(
              row.allocatedOperatingCostsJpy ?? row.allocated_operating_costs_jpy
            )
          }
        ])
      );
    } catch (error) {
      if (error instanceof RangeError) return null;
      throw error;
    }
  }

  private async lockAgent(
    transaction: Prisma.TransactionClient,
    agentPublicId: string
  ): Promise<{ id: number } | null> {
    const rows = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM platform_partner_profiles WHERE public_id = ${agentPublicId} AND partner_type = 'agent' AND deleted_at IS NULL FOR UPDATE`
    );
    if (rows.length > 1) throw new AgentSettlementConflict();
    return rows[0] ?? null;
  }

  private async writeAudit(
    transaction: Prisma.TransactionClient,
    input: AuditLogCreateInput,
    targetId: number,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const base = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({ ...input, targetId, metadata: { ...base, ...metadata } })
    });
  }

  private mapSettlement(settlement: StoredSettlement): AgentSettlementRecord {
    const snapshotAgentPublicId = readSnapshotAgentPublicId(settlement.calculationSnapshotJson);
    return {
      id: settlement.id,
      publicId: settlement.publicId,
      agentPublicId: snapshotAgentPublicId ?? settlement.agentProfile.publicId,
      periodStart: settlement.periodStart,
      periodEnd: settlement.periodEnd,
      status: statusFromRecord(settlement.status),
      currency: currencyFromRecord(settlement.currency),
      orderPlatformFeesJpy: toSafeJpy(settlement.orderPlatformFeesJpy),
      saasFeesJpy: toSafeJpy(settlement.saasFeesJpy),
      userRebatesJpy: toSafeJpy(settlement.userRebatesJpy),
      refundsAndReversalsJpy: toSafeJpy(settlement.refundsAndReversalsJpy),
      channelFeesJpy: toSafeJpy(settlement.channelFeesJpy),
      consumptionTaxJpy: toSafeJpy(settlement.consumptionTaxJpy),
      allocatedOperatingCostsJpy: toSafeJpy(settlement.allocatedOperatingCostsJpy),
      pureProfitJpy: toSafeSignedJpy(settlement.pureProfitJpy),
      fixedSuccessRewardJpy: toSafeJpy(settlement.fixedSuccessRewardJpy),
      profitShareRateBps: settlement.profitShareRateBps,
      profitShareAmountJpy: toSafeJpy(settlement.profitShareAmountJpy),
      totalAmountJpy: toSafeJpy(settlement.totalAmountJpy),
      rule: mapRule(settlement.ruleVersion),
      idempotencyKey: settlement.idempotencyKey,
      confirmedAt: settlement.confirmedAt,
      confirmedById: settlement.confirmedById,
      paidAt: settlement.paidAt,
      paidById: settlement.paidById,
      paymentMethod: settlement.paymentMethod
        ? paymentMethodFromRecord(settlement.paymentMethod)
        : null,
      paymentReference: settlement.paymentReference,
      lines: settlement.lines.map((line) => {
        const snapshotIdentity = readLineIdentity(line.calculationSnapshotJson);
        const currentIdentifier = line.shop.publicIdentifier;
        if (!snapshotIdentity && (!currentIdentifier || currentIdentifier.deletedAt !== null)) {
          throw new Error("error.agent_settlement.shop_public_identifier_missing");
        }
        return {
          lineType: lineTypeFromRecord(line.lineType),
          referralPublicId: line.referral.publicId,
          shopPublicId: snapshotIdentity?.shopPublicId ?? currentIdentifier?.publicId ?? "",
          shopName: snapshotIdentity?.shopName ?? line.shop.name,
          orderPlatformFeesJpy: toSafeJpy(line.orderPlatformFeesJpy),
          saasFeesJpy: toSafeJpy(line.saasFeesJpy),
          userRebatesJpy: toSafeJpy(line.userRebatesJpy),
          refundsAndReversalsJpy: toSafeJpy(line.refundsAndReversalsJpy),
          channelFeesJpy: toSafeJpy(line.channelFeesJpy),
          consumptionTaxJpy: toSafeJpy(line.consumptionTaxJpy),
          allocatedOperatingCostsJpy: toSafeJpy(line.allocatedOperatingCostsJpy),
          pureProfitJpy: toSafeSignedJpy(line.shopPureProfitJpy),
          fixedSuccessRewardJpy: toSafeJpy(line.fixedSuccessRewardJpy),
          profitShareRateBps: line.profitShareRateBps,
          amountJpy: toSafeJpy(line.amountJpy)
        };
      }),
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt
    };
  }
}

const mapRule = (rule: StoredRule): AgentSettlementRuleSummary => ({
  publicId: rule.publicId,
  version: rule.version,
  fixedSuccessRewardJpy: toSafeJpy(rule.fixedSuccessRewardJpy),
  profitShareRateBps: rule.profitShareRateBps,
  paymentMethod: paymentMethodFromRecord(rule.paymentMethod)
});

const totalsToCreateData = (totals: AgentSettlementTotals) => ({
  orderPlatformFeesJpy: BigInt(totals.orderPlatformFeesJpy),
  saasFeesJpy: BigInt(totals.saasFeesJpy),
  userRebatesJpy: BigInt(totals.userRebatesJpy),
  refundsAndReversalsJpy: BigInt(totals.refundsAndReversalsJpy),
  channelFeesJpy: BigInt(totals.channelFeesJpy),
  consumptionTaxJpy: BigInt(totals.consumptionTaxJpy),
  allocatedOperatingCostsJpy: BigInt(totals.allocatedOperatingCostsJpy),
  pureProfitJpy: BigInt(totals.pureProfitJpy),
  fixedSuccessRewardJpy: BigInt(totals.fixedSuccessRewardJpy),
  profitShareRateBps: totals.profitShareRateBps,
  profitShareAmountJpy: BigInt(totals.profitShareAmountJpy),
  totalAmountJpy: BigInt(totals.totalAmountJpy)
});

const lineCreateData = (
  settlementId: number,
  shop: AgentSettlementShopPreview & { referralId: number; shopId: number },
  lineType: "SUCCESS_REWARD" | "PROFIT_SHARE",
  amountJpy: number
) => ({
  settlementId,
  referralId: shop.referralId,
  shopId: shop.shopId,
  lineType,
  orderPlatformFeesJpy: BigInt(shop.orderPlatformFeesJpy),
  saasFeesJpy: BigInt(shop.saasFeesJpy),
  userRebatesJpy: BigInt(shop.userRebatesJpy),
  refundsAndReversalsJpy: BigInt(shop.refundsAndReversalsJpy),
  channelFeesJpy: BigInt(shop.channelFeesJpy),
  consumptionTaxJpy: BigInt(shop.consumptionTaxJpy),
  allocatedOperatingCostsJpy: BigInt(shop.allocatedOperatingCostsJpy),
  shopPureProfitJpy: BigInt(shop.pureProfitJpy),
  fixedSuccessRewardJpy: BigInt(shop.fixedSuccessRewardJpy),
  profitShareRateBps: shop.profitShareRateBps,
  amountJpy: BigInt(amountJpy),
  calculationSnapshotJson: {
    schemaVersion: 1,
    lineType: lineTypeFromRecord(lineType),
    shopPublicIdAtConfirmation: shop.shopPublicId,
    shopNameAtConfirmation: shop.shopName,
    externalEvidenceReference: shop.externalEvidenceReference,
    externalEvidenceReason: shop.externalEvidenceReason,
    successRewardEligible: shop.successRewardEligible,
    components: {
      orderPlatformFeesJpy: shop.orderPlatformFeesJpy,
      saasFeesJpy: shop.saasFeesJpy,
      userRebatesJpy: shop.userRebatesJpy,
      refundsAndReversalsJpy: shop.refundsAndReversalsJpy,
      channelFeesJpy: shop.channelFeesJpy,
      consumptionTaxJpy: shop.consumptionTaxJpy,
      allocatedOperatingCostsJpy: shop.allocatedOperatingCostsJpy,
      pureProfitJpy: shop.pureProfitJpy
    }
  }
});

const sumShopTotals = (shops: Array<AgentSettlementShopPreview>): AgentSettlementTotals => ({
  orderPlatformFeesJpy: safeSum(shops.map((shop) => shop.orderPlatformFeesJpy)),
  saasFeesJpy: safeSum(shops.map((shop) => shop.saasFeesJpy)),
  userRebatesJpy: safeSum(shops.map((shop) => shop.userRebatesJpy)),
  refundsAndReversalsJpy: safeSum(shops.map((shop) => shop.refundsAndReversalsJpy)),
  channelFeesJpy: safeSum(shops.map((shop) => shop.channelFeesJpy)),
  consumptionTaxJpy: safeSum(shops.map((shop) => shop.consumptionTaxJpy)),
  allocatedOperatingCostsJpy: safeSum(shops.map((shop) => shop.allocatedOperatingCostsJpy)),
  pureProfitJpy: safeSignedSum(shops.map((shop) => shop.pureProfitJpy)),
  fixedSuccessRewardJpy: safeSum(shops.map((shop) => shop.fixedSuccessRewardJpy)),
  profitShareRateBps: shops[0]?.profitShareRateBps ?? 0,
  profitShareAmountJpy: safeSum(shops.map((shop) => shop.profitShareAmountJpy)),
  totalAmountJpy: safeSum(shops.map((shop) => shop.totalAmountJpy))
});

const zeroFacts = (): ShopPureProfitInput => ({
  orderPlatformFeesJpy: 0,
  saasFeesJpy: 0,
  userRebatesJpy: 0,
  refundsAndReversalsJpy: 0,
  channelFeesJpy: 0,
  consumptionTaxJpy: 0,
  allocatedOperatingCostsJpy: 0
});

const serializePreview = (preview: AgentSettlementPreview) => ({
  ...preview,
  periodStart: preview.periodStart.toISOString().slice(0, 10),
  periodEnd: preview.periodEnd.toISOString().slice(0, 10),
  generatedAt: preview.generatedAt.toISOString()
});

const requestFingerprint = (input: AgentSettlementPeriodInput): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        periodStart: input.periodStart.toISOString().slice(0, 10),
        periodEnd: input.periodEnd.toISOString().slice(0, 10),
        externalDeductions: [...input.externalDeductions].sort((left, right) =>
          left.shopPublicId.localeCompare(right.shopPublicId)
        )
      })
    )
    .digest("hex");

const readSnapshotString = (value: Prisma.JsonValue, key: string): string | null =>
  value && typeof value === "object" && !Array.isArray(value) && typeof value[key] === "string"
    ? (value[key] as string)
    : null;

const readSnapshotAgentPublicId = (value: Prisma.JsonValue): string | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const preview = value.preview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return null;
  return typeof preview.agentPublicId === "string" ? preview.agentPublicId : null;
};

const readLineIdentity = (
  value: Prisma.JsonValue
): { shopPublicId: string; shopName: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.shopPublicIdAtConfirmation === "string" &&
    typeof value.shopNameAtConfirmation === "string"
    ? {
        shopPublicId: value.shopPublicIdAtConfirmation,
        shopName: value.shopNameAtConfirmation
      }
    : null;
};

const addUtcDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime() + days * 86_400_000);
  if (Number.isNaN(result.getTime())) throw new RangeError("agent_settlement_calculation_invalid");
  return result;
};

const toSafeAggregate = (value: bigint | Prisma.Decimal | number | string | undefined): number => {
  if (value === undefined) throw new RangeError("agent_settlement_calculation_invalid");
  const text = value.toString();
  if (!/^\d+$/.test(text)) throw new RangeError("agent_settlement_calculation_invalid");
  const parsed = BigInt(text);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return Number(parsed);
};

const toSafeId = (value: number | undefined): number => {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return value as number;
};

const toSafeJpy = (value: bigint): number => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("error.agent_settlement.unsafe_amount");
  }
  return Number(value);
};

const toSafeSignedJpy = (value: bigint): number => {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("error.agent_settlement.unsafe_amount");
  }
  return Number(value);
};

const safeSum = (values: number[]): number => {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total < 0n || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return Number(total);
};

const safeSignedSum = (values: number[]): number => {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total < BigInt(Number.MIN_SAFE_INTEGER) || total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("agent_settlement_calculation_invalid");
  }
  return Number(total);
};

const paymentMethodToRecord = (method: AgentSettlementPaymentMethod) => {
  if (method === "bank_transfer") return "BANK_TRANSFER" as const;
  if (method === "ndp") return "NDP" as const;
  return "OTHER" as const;
};
const paymentMethodFromRecord = (
  method: "BANK_TRANSFER" | "NDP" | "OTHER"
): AgentSettlementPaymentMethod => {
  if (method === "BANK_TRANSFER") return "bank_transfer";
  if (method === "NDP") return "ndp";
  return "other";
};
const statusToRecord = (status: AgentSettlementStatus) =>
  status === "confirmed" ? ("CONFIRMED" as const) : ("PAID" as const);
const statusFromRecord = (status: "CONFIRMED" | "PAID"): AgentSettlementStatus =>
  status === "CONFIRMED" ? "confirmed" : "paid";
const lineTypeFromRecord = (
  lineType: "SUCCESS_REWARD" | "PROFIT_SHARE"
): AgentSettlementLineType => (lineType === "SUCCESS_REWARD" ? "success_reward" : "profit_share");
const currencyFromRecord = (currency: string): "JPY" => {
  if (currency !== "JPY") throw new Error("error.agent_settlement.invalid_currency");
  return "JPY";
};
const isUniqueConflict = (error: unknown): boolean =>
  Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
