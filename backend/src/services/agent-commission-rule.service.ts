import { ERROR_CODES } from "../constants/error-codes";
import type {
  AgentCommissionPaymentDetails,
  AgentCommissionPaymentMethod,
  AgentCommissionRuleOverview,
  AgentCommissionRulePublishResult,
  AgentCommissionRuleRecord,
  AgentCommissionRuleRepositoryPort
} from "../repositories/agent-commission-rule.repository";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface AgentCommissionRulePublishRequest {
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  paymentMethod: AgentCommissionPaymentMethod;
  paymentDetails?: AgentCommissionPaymentDetails;
  effectiveFrom: Date;
  reason: string;
}

export interface AgentCommissionRuleListRequest {
  page?: number;
  pageSize?: number;
  at: Date;
}

export type AgentCommissionRulePayload = Omit<AgentCommissionRuleRecord, "id" | "agentProfileId">;

export interface AgentCommissionRuleOverviewPayload {
  current: AgentCommissionRulePayload | null;
  latestVersion: number;
  evaluatedAt: Date;
  history: {
    list: AgentCommissionRulePayload[];
    total: number;
    page: number;
    page_size: number;
  };
}

export class AgentCommissionRuleService {
  public constructor(
    private readonly repository: AgentCommissionRuleRepositoryPort,
    private readonly auditInputFactory: Pick<AuditLogService, "createInput">
  ) {}

  public async listRules(
    actor: AuthenticatedAccessContext,
    agentPublicId: string,
    input: AgentCommissionRuleListRequest
  ): Promise<AgentCommissionRuleOverviewPayload> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.getOverview({ agentPublicId, ...input });
    if (result.outcome === "found") return this.serializeOverview(result.overview);
    throw this.agentNotFound();
  }

  public async publishRule(
    actor: AuthenticatedAccessContext,
    agentPublicId: string,
    input: AgentCommissionRulePublishRequest,
    context: AuthRequestContext
  ): Promise<AgentCommissionRulePayload> {
    this.assertPlatformIdentity(actor);
    const result = await this.repository.publish({
      ...input,
      paymentDetails: input.paymentDetails ?? null,
      agentPublicId,
      actorUserId: actor.userId,
      audit: this.auditInputFactory.createInput({
        actor,
        action: "backoffice.agent_commission_rule.version_published",
        targetType: "AgentCommissionRuleVersion",
        context,
        metadata: {
          agentPublicId,
          fixedSuccessRewardJpy: input.fixedSuccessRewardJpy,
          profitShareRateBps: input.profitShareRateBps,
          paymentMethod: input.paymentMethod,
          effectiveFrom: input.effectiveFrom.toISOString(),
          reason: input.reason
        }
      })
    });
    return this.serializeRule(this.unwrapPublish(result));
  }

  private unwrapPublish(result: AgentCommissionRulePublishResult): AgentCommissionRuleRecord {
    if (result.outcome === "published") return result.rule;
    if (result.outcome === "agent_not_found") throw this.agentNotFound();
    throw new AppError({
      code: ERROR_CODES.AGENT_COMMISSION_RULE_CONFLICT,
      message: "error.agent_commission_rule.conflict",
      statusCode: 409
    });
  }

  private serializeOverview(
    overview: AgentCommissionRuleOverview
  ): AgentCommissionRuleOverviewPayload {
    return {
      ...overview,
      current: overview.current ? this.serializeRule(overview.current) : null,
      history: {
        ...overview.history,
        list: overview.history.list.map((rule) => this.serializeRule(rule))
      }
    };
  }

  private serializeRule(rule: AgentCommissionRuleRecord): AgentCommissionRulePayload {
    return {
      publicId: rule.publicId,
      version: rule.version,
      fixedSuccessRewardJpy: rule.fixedSuccessRewardJpy,
      profitShareRateBps: rule.profitShareRateBps,
      paymentMethod: rule.paymentMethod,
      paymentDetails: rule.paymentDetails,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      publishedAt: rule.publishedAt,
      publishedById: rule.publishedById,
      reason: rule.reason,
      createdAt: rule.createdAt
    };
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

  private agentNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.PLATFORM_PARTNER_PROFILE_NOT_FOUND,
      message: "error.platform_partner.agent_not_found",
      statusCode: 404
    });
  }
}
