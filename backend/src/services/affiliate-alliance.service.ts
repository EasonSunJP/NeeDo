import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AffiliateAllianceCreateBody } from "../validators/affiliate-alliance.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export type AffiliateAllianceStatus = "active" | "suspended" | "closed";
export type AffiliateAllianceMemberRole = "owner" | "partner" | "subordinate";

export interface AffiliateAlliancePermissionsPayload {
  canClaimTasks: boolean;
  canViewAllianceOverview: boolean;
  canViewMemberDetails: boolean;
  canManageOwnSubordinates: boolean;
  canViewAllianceWallet: boolean;
}

export interface AffiliateAlliancePayload {
  allianceId: number;
  name: string;
  description: string | null;
  status: AffiliateAllianceStatus;
  version: number;
  defaultPromoterShareBps: number;
  owner: {
    needoId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  membership: {
    memberId: number;
    role: AffiliateAllianceMemberRole;
    managerNeedoId: string | null;
    promoterShareBpsOverride: number | null;
    permissions: AffiliateAlliancePermissionsPayload;
  };
  wallet: {
    currency: "NDP";
    availableBalance: number;
    frozenBalance: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateAllianceCreationEligibility {
  affiliateStatus: AffiliateAllianceStatus | null;
  hasActiveMembership: boolean;
}

export interface AffiliateAllianceCreateOwnedInput {
  userId: number;
  name: string;
  description: string | null;
  defaultPromoterShareBps: number;
  auditLog: AuditLogCreateInput;
}

export interface AffiliateAllianceRepositoryPort {
  findMine: (userId: number) => Promise<AffiliateAlliancePayload | null>;
  findCreationEligibility: (
    userId: number
  ) => Promise<AffiliateAllianceCreationEligibility>;
  createOwned: (input: AffiliateAllianceCreateOwnedInput) => Promise<AffiliateAlliancePayload>;
}

export interface AffiliateAllianceMineResponse {
  alliance: AffiliateAlliancePayload | null;
}

export interface AffiliateAllianceCreatedResponse {
  alliance: AffiliateAlliancePayload;
}

export class AffiliateAllianceService {
  public constructor(
    private readonly repository: AffiliateAllianceRepositoryPort,
    private readonly auditLogService: AuditRecorder
  ) {}

  public async getMine(
    actor: AuthenticatedAccessContext
  ): Promise<AffiliateAllianceMineResponse> {
    this.requireAffiliateIdentity(actor);
    return { alliance: await this.repository.findMine(actor.userId) };
  }

  public async createMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AffiliateAllianceCreateBody
  ): Promise<AffiliateAllianceCreatedResponse> {
    this.requireAffiliateIdentity(actor);
    const eligibility = await this.repository.findCreationEligibility(actor.userId);

    if (eligibility.affiliateStatus !== "active") {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_ALLIANCE_PROFILE_INACTIVE,
        message: "error.affiliate_alliance.profile_inactive",
        statusCode: 403
      });
    }
    if (eligibility.hasActiveMembership) {
      throw this.alreadyJoined();
    }

    const defaultPromoterShareBps = input.defaultPromoterShareBps;
    const alliance = await this.repository.createOwned({
      userId: actor.userId,
      name: input.name.trim(),
      description: input.description == null ? null : input.description.trim(),
      defaultPromoterShareBps,
      auditLog: this.auditLogService.createInput({
        actor,
        context,
        action: "affiliate_alliance.created",
        targetType: "AffiliateAlliance",
        targetId: null,
        metadata: { defaultPromoterShareBps }
      })
    });

    return { alliance };
  }

  private requireAffiliateIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityType !== "scout") {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.affiliate_alliance.identity_required",
        statusCode: 403
      });
    }
  }

  private alreadyJoined(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_ALLIANCE_ALREADY_JOINED,
      message: "error.affiliate_alliance.already_joined",
      statusCode: 409
    });
  }
}
