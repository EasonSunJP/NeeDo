import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export type PlatformPartnerType = "agent" | "franchisee" | "supplier";
export type PlatformPartnerTypeRecord = "AGENT" | "FRANCHISEE" | "SUPPLIER";
export type PlatformPartnerStatus = "active" | "inactive";
export type AgentReferralStatusRecord = "ACTIVE" | "QUALIFIED" | "REVOKED";

export interface PlatformPartnerUserRecord {
  id: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
}

export interface PlatformPartnerProfileRecord {
  id: number;
  publicId: string;
  partnerType: PlatformPartnerTypeRecord;
  activatedAt: Date;
  markedById: number;
  reason: string;
  createdAt: Date;
  user: PlatformPartnerUserRecord;
}

export interface AgentShopReferralRecord {
  id: number;
  publicId: string;
  agentProfileId: number;
  status: AgentReferralStatusRecord;
  source: string;
  confirmedAt: Date;
  confirmedById: number;
  successQualifiedAt: Date | null;
  reason: string;
  createdAt: Date;
  agentProfile: PlatformPartnerProfileRecord;
  shop: {
    id: number;
    publicId: string;
    name: string;
    city: string;
  };
}

export interface PlatformPartnerProfilePayload {
  publicId: string;
  partnerType: PlatformPartnerType;
  activatedAt: string;
  markedAt: string;
  reason: string;
  user: {
    id: number;
    needoId: string;
    nickname: string;
    avatarUrl: string | null;
    status: PlatformPartnerStatus;
  };
}

export interface AgentShopReferralPayload {
  publicId: string;
  agentPublicId: string;
  status: "active" | "qualified" | "revoked";
  source: string;
  confirmedAt: string;
  successQualifiedAt: string | null;
  reason: string;
  createdAt: string;
  shop: {
    publicId: string;
    name: string;
    city: string;
  };
}

export interface MarkPartnerProfileInput {
  partnerType: PlatformPartnerType;
  activatedAt: Date;
  reason: string;
}

export interface AgentListInput extends PaginationInput {
  keyword?: string;
  status?: PlatformPartnerStatus;
}

export interface LinkAgentShopInput {
  shopPublicId: string;
  source: string;
  confirmedAt: Date;
  reason: string;
}

export interface AgentShopReferralListInput extends PaginationInput {
  agentPublicId: string;
  status?: AgentShopReferralPayload["status"];
}

export type MarkPartnerProfileRepositoryResult =
  | { kind: "created"; profile: PlatformPartnerProfileRecord }
  | { kind: "user_not_found" }
  | { kind: "duplicate" };

export type LinkAgentShopRepositoryResult =
  | { kind: "created"; referral: AgentShopReferralRecord }
  | { kind: "agent_not_found" }
  | { kind: "shop_not_found" }
  | { kind: "shop_conflict" };

export type AgentShopReferralListRepositoryResult =
  | { kind: "found"; page: PaginatedResponse<AgentShopReferralRecord> }
  | { kind: "agent_not_found" };

export interface PlatformPartnerRepositoryPort {
  markPartnerProfile: (input: {
    userId: number;
    partnerType: PlatformPartnerTypeRecord;
    activatedAt: Date;
    markedById: number;
    reason: string;
  }) => Promise<MarkPartnerProfileRepositoryResult>;
  listAgents: (
    input: AgentListInput
  ) => Promise<PaginatedResponse<PlatformPartnerProfileRecord>>;
  listAgentShopReferrals: (
    input: AgentShopReferralListInput
  ) => Promise<AgentShopReferralListRepositoryResult>;
  linkAgentShop: (input: {
    agentPublicId: string;
    shopPublicId: string;
    source: string;
    confirmedAt: Date;
    confirmedById: number;
    reason: string;
  }) => Promise<LinkAgentShopRepositoryResult>;
}

const partnerTypeToRecord: Record<PlatformPartnerType, PlatformPartnerTypeRecord> = {
  agent: "AGENT",
  franchisee: "FRANCHISEE",
  supplier: "SUPPLIER"
};

const partnerTypeFromRecord: Record<PlatformPartnerTypeRecord, PlatformPartnerType> = {
  AGENT: "agent",
  FRANCHISEE: "franchisee",
  SUPPLIER: "supplier"
};

const referralStatusFromRecord = {
  ACTIVE: "active",
  QUALIFIED: "qualified",
  REVOKED: "revoked"
} as const satisfies Record<AgentReferralStatusRecord, AgentShopReferralPayload["status"]>;

export class PlatformPartnerService {
  public constructor(
    private readonly repository: PlatformPartnerRepositoryPort,
    private readonly auditLogService: Pick<AuditLogService, "record">
  ) {}

  public async markPartnerProfile(
    userId: number,
    input: MarkPartnerProfileInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PlatformPartnerProfilePayload> {
    const result = await this.repository.markPartnerProfile({
      userId,
      partnerType: partnerTypeToRecord[input.partnerType],
      activatedAt: input.activatedAt,
      markedById: actor.userId,
      reason: input.reason
    });

    if (result.kind === "user_not_found") {
      throw new AppError({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: "error.user.not_found",
        statusCode: 404
      });
    }
    if (result.kind === "duplicate") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_PARTNER_CONFLICT,
        message: "error.platform_partner.duplicate",
        statusCode: 409
      });
    }

    const payload = this.serializeProfile(result.profile);
    await this.auditLogService.record({
      actor,
      action: "backoffice.partner_profile.create",
      targetType: "platform_partner_profile",
      targetId: result.profile.id,
      context,
      metadata: {
        before: null,
        after: {
          publicId: payload.publicId,
          userId: payload.user.id,
          partnerType: payload.partnerType,
          activatedAt: payload.activatedAt
        },
        reason: input.reason
      }
    });

    return payload;
  }

  public async listAgents(
    input: AgentListInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PaginatedResponse<PlatformPartnerProfilePayload>> {
    const page = await this.repository.listAgents(input);
    await this.auditLogService.record({
      actor,
      action: "backoffice.agent.list",
      targetType: "platform_partner_profile",
      context,
      metadata: {
        page: page.page,
        pageSize: page.page_size,
        status: input.status ?? null,
        resultCount: page.list.length
      }
    });

    return {
      ...page,
      list: page.list.map((record) => this.serializeProfile(record))
    };
  }

  public async linkAgentShop(
    agentPublicId: string,
    input: LinkAgentShopInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<AgentShopReferralPayload> {
    const result = await this.repository.linkAgentShop({
      agentPublicId,
      shopPublicId: input.shopPublicId,
      source: input.source,
      confirmedAt: input.confirmedAt,
      confirmedById: actor.userId,
      reason: input.reason
    });

    if (result.kind === "agent_not_found") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_PARTNER_PROFILE_NOT_FOUND,
        message: "error.platform_partner.agent_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "shop_not_found") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_PARTNER_SHOP_NOT_FOUND,
        message: "error.platform_partner.shop_not_found",
        statusCode: 404
      });
    }
    if (result.kind === "shop_conflict") {
      throw new AppError({
        code: ERROR_CODES.AGENT_REFERRAL_CONFLICT,
        message: "error.platform_partner.shop_referral_conflict",
        statusCode: 409
      });
    }

    const payload = this.serializeReferral(result.referral);
    await this.auditLogService.record({
      actor,
      action: "backoffice.agent_shop_referral.create",
      targetType: "agent_shop_referral",
      targetId: result.referral.id,
      context,
      metadata: {
        before: null,
        after: {
          publicId: payload.publicId,
          agentPublicId: payload.agentPublicId,
          shopPublicId: payload.shop.publicId,
          status: payload.status,
          source: payload.source,
          confirmedAt: payload.confirmedAt
        },
        reason: input.reason
      }
    });

    return payload;
  }

  public async listAgentShopReferrals(
    agentPublicId: string,
    input: Omit<AgentShopReferralListInput, "agentPublicId">,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PaginatedResponse<AgentShopReferralPayload>> {
    const result = await this.repository.listAgentShopReferrals({ agentPublicId, ...input });
    if (result.kind === "agent_not_found") {
      throw new AppError({
        code: ERROR_CODES.PLATFORM_PARTNER_PROFILE_NOT_FOUND,
        message: "error.platform_partner.agent_not_found",
        statusCode: 404
      });
    }

    await this.auditLogService.record({
      actor,
      action: "backoffice.agent_shop_referral.list",
      targetType: "agent_shop_referral",
      context,
      metadata: {
        agentPublicId,
        page: result.page.page,
        pageSize: result.page.page_size,
        status: input.status ?? null,
        resultCount: result.page.list.length
      }
    });

    return {
      ...result.page,
      list: result.page.list.map((record) => this.serializeReferral(record))
    };
  }

  private serializeProfile(record: PlatformPartnerProfileRecord): PlatformPartnerProfilePayload {
    return {
      publicId: record.publicId,
      partnerType: partnerTypeFromRecord[record.partnerType],
      activatedAt: record.activatedAt.toISOString(),
      markedAt: record.createdAt.toISOString(),
      reason: record.reason,
      user: {
        id: record.user.id,
        needoId: record.user.needoId,
        nickname: record.user.username,
        avatarUrl: record.user.avatarUrl,
        status: record.user.isActive ? "active" : "inactive"
      }
    };
  }

  private serializeReferral(record: AgentShopReferralRecord): AgentShopReferralPayload {
    return {
      publicId: record.publicId,
      agentPublicId: record.agentProfile.publicId,
      status: referralStatusFromRecord[record.status],
      source: record.source,
      confirmedAt: record.confirmedAt.toISOString(),
      successQualifiedAt: record.successQualifiedAt?.toISOString() ?? null,
      reason: record.reason,
      createdAt: record.createdAt.toISOString(),
      shop: {
        publicId: record.shop.publicId,
        name: record.shop.name,
        city: record.shop.city
      }
    };
  }
}
