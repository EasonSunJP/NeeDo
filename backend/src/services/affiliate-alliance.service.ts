import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type {
  AffiliateAllianceCreateBody,
  AffiliateAllianceInvitationCreateBody,
  AffiliateAllianceInvitationListQuery,
  AffiliateAllianceListQuery
} from "../validators/affiliate-alliance.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export type AffiliateAllianceStatus = "active" | "suspended" | "closed";
export type AffiliateAllianceMemberRole = "owner" | "partner" | "subordinate";
export type AffiliateAllianceInvitationRole = "partner" | "subordinate";
export type AffiliateAllianceInvitationStatus = "pending" | "accepted" | "rejected" | "expired";

const ALLIANCE_INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

export interface AffiliateAlliancePublicPerson {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
}

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
  owner: AffiliateAlliancePublicPerson;
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
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateAllianceMemberPayload {
  memberId: number;
  person: AffiliateAlliancePublicPerson;
  role: AffiliateAllianceMemberRole;
  parent: {
    memberId: number;
    person: AffiliateAlliancePublicPerson;
  } | null;
  promoterShareBpsOverride: number | null;
  permissions: AffiliateAlliancePermissionsPayload;
  joinedAt: string;
}

export interface AffiliateAllianceInvitationPayload {
  invitationId: number;
  alliance: {
    allianceId: number;
    name: string;
  };
  inviter: AffiliateAlliancePublicPerson;
  invitee: AffiliateAlliancePublicPerson;
  role: AffiliateAllianceInvitationRole;
  proposedParent: {
    memberId: number;
    person: AffiliateAlliancePublicPerson;
  } | null;
  status: AffiliateAllianceInvitationStatus;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
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

export interface AffiliateAllianceOwnerListInput extends AffiliateAllianceListQuery {
  allianceId: number;
}

export interface AffiliateAllianceEligibleContactInput extends AffiliateAllianceOwnerListInput {
  ownerUserId: number;
}

export interface AffiliateAllianceSentInvitationListInput extends AffiliateAllianceInvitationListQuery {
  allianceId: number;
}

export interface AffiliateAllianceReceivedInvitationListInput extends AffiliateAllianceInvitationListQuery {
  inviteeUserId: number;
}

export interface AffiliateAllianceCreateInvitationInput {
  allianceId: number;
  inviterMemberId: number;
  inviterUserId: number;
  inviteeNeedoId: string;
  role: AffiliateAllianceInvitationRole;
  proposedParentMemberId: number | null;
  now: () => Date;
  invitationTtlMs: number;
  auditLog: AuditLogCreateInput;
}

export interface AffiliateAllianceRespondInvitationInput {
  invitationId: number;
  inviteeUserId: number;
  now: Date;
  auditLog: AuditLogCreateInput;
  expiryAuditLog?: AuditLogCreateInput;
}

export type AffiliateAllianceCreateInvitationResult =
  | { kind: "created"; invitation: AffiliateAllianceInvitationPayload }
  | {
      kind:
        | "owner_required"
        | "invitee_not_eligible"
        | "mutual_contact_required"
        | "duplicate"
        | "parent_invalid"
        | "already_joined";
    };

export type AffiliateAllianceAcceptInvitationResult =
  | {
      kind: "accepted";
      invitation: AffiliateAllianceInvitationPayload;
      member: AffiliateAllianceMemberPayload;
    }
  | {
      kind:
        | "not_found"
        | "expired"
        | "state_conflict"
        | "owner_required"
        | "mutual_contact_required"
        | "invitee_not_eligible"
        | "parent_invalid"
        | "already_joined";
    };

export type AffiliateAllianceRejectInvitationResult =
  | { kind: "rejected"; invitation: AffiliateAllianceInvitationPayload }
  | { kind: "not_found" | "expired" | "state_conflict" };

export interface AffiliateAllianceRepositoryPort {
  findMine: (userId: number) => Promise<AffiliateAlliancePayload | null>;
  findCreationEligibility: (userId: number) => Promise<AffiliateAllianceCreationEligibility>;
  createOwned: (input: AffiliateAllianceCreateOwnedInput) => Promise<AffiliateAlliancePayload>;
  listMembers: (
    input: AffiliateAllianceOwnerListInput
  ) => Promise<PaginatedResponse<AffiliateAllianceMemberPayload>>;
  listEligibleContacts: (
    input: AffiliateAllianceEligibleContactInput
  ) => Promise<PaginatedResponse<AffiliateAlliancePublicPerson>>;
  listSentInvitations: (
    input: AffiliateAllianceSentInvitationListInput
  ) => Promise<PaginatedResponse<AffiliateAllianceInvitationPayload>>;
  createInvitation: (
    input: AffiliateAllianceCreateInvitationInput
  ) => Promise<AffiliateAllianceCreateInvitationResult>;
  listReceivedInvitations: (
    input: AffiliateAllianceReceivedInvitationListInput
  ) => Promise<PaginatedResponse<AffiliateAllianceInvitationPayload>>;
  acceptInvitation: (
    input: AffiliateAllianceRespondInvitationInput & { expiryAuditLog: AuditLogCreateInput }
  ) => Promise<AffiliateAllianceAcceptInvitationResult>;
  rejectInvitation: (
    input: AffiliateAllianceRespondInvitationInput
  ) => Promise<AffiliateAllianceRejectInvitationResult>;
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
    private readonly auditLogService: AuditRecorder,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<AffiliateAllianceMineResponse> {
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

  public async listMembers(
    actor: AuthenticatedAccessContext,
    query: AffiliateAllianceListQuery
  ): Promise<PaginatedResponse<AffiliateAllianceMemberPayload>> {
    const alliance = await this.requireOwnerAlliance(actor);
    return this.repository.listMembers({
      allianceId: alliance.allianceId,
      ...this.normalizeListQuery(query)
    });
  }

  public async listEligibleContacts(
    actor: AuthenticatedAccessContext,
    query: AffiliateAllianceListQuery
  ): Promise<PaginatedResponse<AffiliateAlliancePublicPerson>> {
    const alliance = await this.requireOwnerAlliance(actor);
    return this.repository.listEligibleContacts({
      allianceId: alliance.allianceId,
      ownerUserId: actor.userId,
      ...this.normalizeListQuery(query)
    });
  }

  public async listSentInvitations(
    actor: AuthenticatedAccessContext,
    query: AffiliateAllianceInvitationListQuery
  ): Promise<PaginatedResponse<AffiliateAllianceInvitationPayload>> {
    const alliance = await this.requireOwnerAlliance(actor);
    return this.repository.listSentInvitations({
      allianceId: alliance.allianceId,
      ...query
    });
  }

  public async createInvitation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AffiliateAllianceInvitationCreateBody
  ): Promise<{ invitation: AffiliateAllianceInvitationPayload }> {
    const alliance = await this.requireOwnerAlliance(actor);
    const proposedParentMemberId =
      input.role === "subordinate" ? input.proposedParentMemberId : null;
    const result = await this.repository.createInvitation({
      allianceId: alliance.allianceId,
      inviterMemberId: alliance.membership.memberId,
      inviterUserId: actor.userId,
      inviteeNeedoId: input.inviteeNeedoId,
      role: input.role,
      proposedParentMemberId,
      now: this.now,
      invitationTtlMs: ALLIANCE_INVITATION_TTL_MS,
      auditLog: this.auditLogService.createInput({
        actor,
        context,
        action: "affiliate_alliance.invitation_created",
        targetType: "AffiliateAllianceInvitation",
        targetId: null,
        metadata: {
          allianceId: alliance.allianceId,
          inviteeNeedoId: input.inviteeNeedoId,
          role: input.role,
          proposedParentMemberId
        }
      })
    });

    if (result.kind === "created") return { invitation: result.invitation };
    throw this.invitationResultError(result.kind);
  }

  public async listReceivedInvitations(
    actor: AuthenticatedAccessContext,
    query: AffiliateAllianceInvitationListQuery
  ): Promise<PaginatedResponse<AffiliateAllianceInvitationPayload>> {
    this.requireAffiliateIdentity(actor);
    return this.repository.listReceivedInvitations({
      inviteeUserId: actor.userId,
      ...query
    });
  }

  public async acceptInvitation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    invitationId: number
  ): Promise<{
    invitation: AffiliateAllianceInvitationPayload;
    member: AffiliateAllianceMemberPayload;
  }> {
    this.requireAffiliateIdentity(actor);
    const now = this.now();
    const result = await this.repository.acceptInvitation({
      invitationId,
      inviteeUserId: actor.userId,
      now,
      auditLog: this.auditLogService.createInput({
        actor,
        context,
        action: "affiliate_alliance.invitation_accepted",
        targetType: "AffiliateAllianceInvitation",
        targetId: invitationId
      }),
      expiryAuditLog: {
        actorId: null,
        action: "affiliate_alliance.invitation_expired",
        targetType: "AffiliateAllianceInvitation",
        targetId: invitationId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { source: "accept_guard" }
      }
    });

    if (result.kind !== "accepted") throw this.invitationResultError(result.kind);
    this.requireLeastPrivilege(result.member.permissions);
    return { invitation: result.invitation, member: result.member };
  }

  public async rejectInvitation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    invitationId: number
  ): Promise<{ invitation: AffiliateAllianceInvitationPayload }> {
    this.requireAffiliateIdentity(actor);
    const result = await this.repository.rejectInvitation({
      invitationId,
      inviteeUserId: actor.userId,
      now: this.now(),
      auditLog: this.auditLogService.createInput({
        actor,
        context,
        action: "affiliate_alliance.invitation_rejected",
        targetType: "AffiliateAllianceInvitation",
        targetId: invitationId
      }),
      expiryAuditLog: {
        actorId: null,
        action: "affiliate_alliance.invitation_expired",
        targetType: "AffiliateAllianceInvitation",
        targetId: invitationId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { source: "reject_guard" }
      }
    });

    if (result.kind !== "rejected") throw this.invitationResultError(result.kind);
    return { invitation: result.invitation };
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

  private async requireOwnerAlliance(
    actor: AuthenticatedAccessContext
  ): Promise<AffiliateAlliancePayload> {
    this.requireAffiliateIdentity(actor);
    const alliance = await this.repository.findMine(actor.userId);
    if (alliance === null || alliance.status !== "active" || alliance.membership.role !== "owner") {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_ALLIANCE_OWNER_REQUIRED,
        message: "error.affiliate_alliance.owner_required",
        statusCode: 403
      });
    }
    return alliance;
  }

  private normalizeListQuery(query: AffiliateAllianceListQuery): AffiliateAllianceListQuery {
    return {
      page: query.page,
      pageSize: query.pageSize,
      ...(query.q === undefined ? {} : { q: query.q.trim() })
    };
  }

  private requireLeastPrivilege(permissions: AffiliateAlliancePermissionsPayload): void {
    if (Object.values(permissions).some(Boolean)) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.internal_server_error",
        statusCode: 500
      });
    }
  }

  private invitationResultError(
    kind:
      | Exclude<AffiliateAllianceCreateInvitationResult["kind"], "created">
      | Exclude<AffiliateAllianceAcceptInvitationResult["kind"], "accepted">
      | Exclude<AffiliateAllianceRejectInvitationResult["kind"], "rejected">
  ): AppError {
    const errors = {
      owner_required: [
        ERROR_CODES.AFFILIATE_ALLIANCE_OWNER_REQUIRED,
        "error.affiliate_alliance.owner_required",
        403
      ],
      invitee_not_eligible: [
        ERROR_CODES.AFFILIATE_ALLIANCE_INVITEE_NOT_ELIGIBLE,
        "error.affiliate_alliance.invitee_not_eligible",
        403
      ],
      mutual_contact_required: [
        ERROR_CODES.AFFILIATE_ALLIANCE_MUTUAL_CONTACT_REQUIRED,
        "error.affiliate_alliance.mutual_contact_required",
        403
      ],
      duplicate: [
        ERROR_CODES.AFFILIATE_ALLIANCE_INVITATION_DUPLICATE,
        "error.affiliate_alliance.invitation_duplicate",
        409
      ],
      not_found: [
        ERROR_CODES.AFFILIATE_ALLIANCE_INVITATION_NOT_FOUND,
        "error.affiliate_alliance.invitation_not_found",
        404
      ],
      expired: [
        ERROR_CODES.AFFILIATE_ALLIANCE_INVITATION_EXPIRED,
        "error.affiliate_alliance.invitation_expired",
        409
      ],
      state_conflict: [
        ERROR_CODES.AFFILIATE_ALLIANCE_INVITATION_STATE_CONFLICT,
        "error.affiliate_alliance.invitation_state_conflict",
        409
      ],
      parent_invalid: [
        ERROR_CODES.AFFILIATE_ALLIANCE_PARENT_INVALID,
        "error.affiliate_alliance.parent_invalid",
        409
      ],
      already_joined: [
        ERROR_CODES.AFFILIATE_ALLIANCE_ALREADY_JOINED,
        "error.affiliate_alliance.already_joined",
        409
      ]
    } as const;
    const [code, message, statusCode] = errors[kind];
    return new AppError({ code, message, statusCode });
  }

  private alreadyJoined(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_ALLIANCE_ALREADY_JOINED,
      message: "error.affiliate_alliance.already_joined",
      statusCode: 409
    });
  }
}
