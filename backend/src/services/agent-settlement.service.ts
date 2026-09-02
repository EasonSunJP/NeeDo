const calculationError = "agent_settlement_calculation_invalid";

export interface ShopPureProfitInput {
  orderPlatformFeesJpy: number;
  saasFeesJpy: number;
  userRebatesJpy: number;
  refundsAndReversalsJpy: number;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  allocatedOperatingCostsJpy: number;
}

const safeNonnegative = (value: number): bigint => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(calculationError);
  return BigInt(value);
};

const safeSignedResult = (value: bigint): number => {
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(calculationError);
  }
  return Number(value);
};

export const calculatePureProfit = (input: ShopPureProfitInput): number => {
  const income = safeNonnegative(input.orderPlatformFeesJpy) + safeNonnegative(input.saasFeesJpy);
  const deductions =
    safeNonnegative(input.userRebatesJpy) +
    safeNonnegative(input.refundsAndReversalsJpy) +
    safeNonnegative(input.channelFeesJpy) +
    safeNonnegative(input.consumptionTaxJpy) +
    safeNonnegative(input.allocatedOperatingCostsJpy);
  return safeSignedResult(income - deductions);
};

export const calculateProfitShare = (profitShareRateBps: number, pureProfitJpy: number): number => {
  if (
    !Number.isSafeInteger(profitShareRateBps) ||
    profitShareRateBps < 0 ||
    profitShareRateBps > 10_000 ||
    !Number.isSafeInteger(pureProfitJpy)
  ) {
    throw new RangeError(calculationError);
  }
  const positiveProfit = BigInt(Math.max(0, pureProfitJpy));
  return safeSignedResult((positiveProfit * BigInt(profitShareRateBps)) / 10_000n);
};

export const calculateAgentCommission = (
  fixedSuccessRewardJpy: number,
  profitShareRateBps: number,
  pureProfitJpy: number
): number => {
  const fixed = safeNonnegative(fixedSuccessRewardJpy);
  const share = BigInt(calculateProfitShare(profitShareRateBps, pureProfitJpy));
  return safeSignedResult(fixed + share);
};

export type AgentSettlementPayload = Omit<AgentSettlementRecord, "id">;

export interface AgentSettlementPeriodRequest {
  periodStart: Date;
  periodEnd: Date;
  externalDeductions: AgentSettlementExternalDeduction[];
}

export interface AgentSettlementConfirmationRequest extends AgentSettlementPeriodRequest {
  idempotencyKey: string;
}

export interface AgentSettlementPaymentRequest {
  paymentMethod: AgentSettlementPaymentMethod;
  paymentReference: string;
  reason: string;
}

export class AgentSettlementService {
  public constructor(
    private readonly repository: AgentSettlementRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public async previewSettlement(
    actor: AuthenticatedAccessContext,
    agentPublicId: string,
    input: AgentSettlementPeriodRequest
  ) {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.preview({ agentPublicId, ...input });
    if (result.outcome === "ready") return result.preview;
    throw this.previewError(result.outcome);
  }

  public async confirmSettlement(
    actor: AuthenticatedAccessContext,
    agentPublicId: string,
    input: AgentSettlementConfirmationRequest,
    context: AuthRequestContext
  ): Promise<{ settlement: AgentSettlementPayload; applied: boolean }> {
    this.assertPlatformIdentity(actor);
    const repositoryInput: AgentSettlementConfirmInput = {
      agentPublicId,
      ...input,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.agent_settlement.confirmed",
        targetType: "AgentSettlement",
        context,
        metadata: {
          agentPublicId,
          periodStart: input.periodStart.toISOString().slice(0, 10),
          periodEnd: input.periodEnd.toISOString().slice(0, 10),
          idempotencyKey: input.idempotencyKey,
          externalEvidenceReferences: input.externalDeductions.map((row) => ({
            shopPublicId: row.shopPublicId,
            evidenceReference: row.evidenceReference
          }))
        }
      })
    };
    const result = await this.repository.confirm(repositoryInput);
    if (result.outcome === "confirmed") {
      return { settlement: this.serialize(result.settlement), applied: result.applied };
    }
    if (result.outcome === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.AGENT_SETTLEMENT_IDEMPOTENCY_CONFLICT,
        message: "error.agent_settlement.idempotency_conflict",
        statusCode: 409
      });
    }
    if (result.outcome === "conflict") throw this.conflict();
    throw this.previewError(result.outcome);
  }

  public async listSettlements(
    actor: AuthenticatedAccessContext,
    input: AgentSettlementListInput
  ): Promise<PaginatedResponse<AgentSettlementPayload>> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.list(input);
    return { ...result, list: result.list.map((settlement) => this.serialize(settlement)) };
  }

  public async markPaid(
    actor: AuthenticatedAccessContext,
    agentPublicId: string,
    settlementPublicId: string,
    input: AgentSettlementPaymentRequest,
    context: AuthRequestContext
  ): Promise<{ settlement: AgentSettlementPayload; applied: boolean }> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.markPaid({
      agentPublicId,
      settlementPublicId,
      ...input,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.agent_settlement.paid",
        targetType: "AgentSettlement",
        context,
        metadata: {
          agentPublicId,
          settlementPublicId,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference,
          reason: input.reason
        }
      })
    });
    if (result.outcome === "paid") {
      return { settlement: this.serialize(result.settlement), applied: result.applied };
    }
    if (result.outcome === "agent_not_found" || result.outcome === "not_found") {
      throw this.notFound();
    }
    if (result.outcome === "payment_method_mismatch") {
      throw new AppError({
        code: ERROR_CODES.AGENT_SETTLEMENT_PAYMENT_METHOD_MISMATCH,
        message: "error.agent_settlement.payment_method_mismatch",
        statusCode: 409
      });
    }
    throw this.conflict();
  }

  private previewError(
    outcome:
      | "agent_not_found"
      | "rule_not_found"
      | "rule_window_invalid"
      | "no_referrals"
      | "external_evidence_mismatch"
      | "financial_evidence_invalid"
  ): AppError {
    if (outcome === "agent_not_found") return this.notFound();
    if (outcome === "rule_not_found" || outcome === "rule_window_invalid") {
      return new AppError({
        code: ERROR_CODES.AGENT_SETTLEMENT_RULE_UNAVAILABLE,
        message: "error.agent_settlement.rule_unavailable",
        statusCode: 422
      });
    }
    return new AppError({
      code: ERROR_CODES.AGENT_SETTLEMENT_EVIDENCE_INVALID,
      message: `error.agent_settlement.${outcome}`,
      statusCode: 422
    });
  }

  private serialize(settlement: AgentSettlementRecord): AgentSettlementPayload {
    const { id, ...payload } = settlement;
    void id;
    return payload;
  }

  private assertPlatformIdentity(actor: AuthenticatedAccessContext): void {
    if (
      actor.currentIdentityScopeType !== "global" &&
      actor.currentIdentityScopeType !== "platform"
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.AGENT_SETTLEMENT_NOT_FOUND,
      message: "error.agent_settlement.not_found",
      statusCode: 404
    });
  }

  private conflict(): AppError {
    return new AppError({
      code: ERROR_CODES.AGENT_SETTLEMENT_CONFLICT,
      message: "error.agent_settlement.conflict",
      statusCode: 409
    });
  }
}
import { ERROR_CODES } from "../constants/error-codes";
import type {
  AgentSettlementConfirmInput,
  AgentSettlementExternalDeduction,
  AgentSettlementListInput,
  AgentSettlementPaymentMethod,
  AgentSettlementRecord,
  AgentSettlementRepositoryPort
} from "../repositories/agent-settlement.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
