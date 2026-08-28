import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { IdentifierAllocator, PublicIdentifierRecord } from "./public-identifier.service";

export type EmployeeRelationshipType = "exclusive" | "partner";
export type EmployeeCurrentWorkStatus = "active" | "on_leave" | "suspended";
export type EmployeeWorkStatus = EmployeeCurrentWorkStatus | "ended";

export interface MerchantEmployeePayload {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  profileStatus: string;
  verifiedAt: string | null;
  profile: {
    bio: string | null;
    city: string;
    serviceArea: string | null;
    yearsExperience: number;
    updatedAt: string;
  };
  account: {
    isActive: boolean;
    lastLoginAt: string | null;
  };
  affiliation: {
    id: number;
    relationshipType: EmployeeRelationshipType;
    workStatus: EmployeeWorkStatus;
    startsAt: string;
    endsAt: string | null;
    shop: {
      id: number;
      publicId: string;
      name: string;
    };
  };
}

export interface EmployeeProfileUpdateInput {
  displayName?: string;
  bio?: string | null;
  city?: string;
  serviceArea?: string | null;
  yearsExperience?: number;
}

export interface EmployeeProfileUpdateRepositoryInput {
  shopId: number;
  technicianIdentityId: number;
  actorUserId: number;
  profile: EmployeeProfileUpdateInput;
}

export interface MerchantEmployeeListInput extends PaginationInput {
  keyword?: string;
  relationshipType?: EmployeeRelationshipType;
  workStatus?: EmployeeCurrentWorkStatus;
}

export interface EmployeeListRepositoryInput extends MerchantEmployeeListInput {
  shopId: number;
}

export interface EmployeeAffiliationMutationInput {
  relationshipType: EmployeeRelationshipType;
  workStatus: EmployeeWorkStatus;
  startsAt: Date;
  endsAt: Date | null;
}

export interface AffiliationMutationRepositoryInput extends EmployeeAffiliationMutationInput {
  shopId: number;
  technicianIdentityId: number;
  actorUserId: number;
}

export type AffiliationMutationRepositoryResult =
  | MerchantEmployeePayload
  | "not_found"
  | "exclusive_conflict";

export interface TechnicianShopAffiliationRepositoryPort {
  listCurrentShopEmployees(
    input: EmployeeListRepositoryInput
  ): Promise<PaginatedResponse<MerchantEmployeePayload>>;
  findCurrentShopEmployee(
    shopId: number,
    technicianIdentityId: number
  ): Promise<MerchantEmployeePayload | null>;
  updateCurrentShopEmployeeProfile(
    input: EmployeeProfileUpdateRepositoryInput
  ): Promise<MerchantEmployeePayload | null>;
  upsertCurrentAffiliation(
    input: AffiliationMutationRepositoryInput
  ): Promise<AffiliationMutationRepositoryResult>;
}

type IdentifierResolver = Pick<IdentifierAllocator, "resolve">;
type AuditRecorder = Pick<AuditLogService, "record">;

export class TechnicianShopAffiliationService {
  public constructor(
    private readonly repository: TechnicianShopAffiliationRepositoryPort,
    private readonly identifierResolver: IdentifierResolver,
    private readonly auditLogService: AuditRecorder
  ) {}

  public async listCurrentShopEmployees(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: MerchantEmployeeListInput
  ): Promise<PaginatedResponse<MerchantEmployeePayload>> {
    const shopId = this.requireMerchantShopScope(actor);
    const result = await this.repository.listCurrentShopEmployees({ shopId, ...input });
    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_affiliation.list",
      targetType: "technician_shop_affiliation",
      context,
      metadata: { shopId }
    });
    return result;
  }

  public async getCurrentShopEmployee(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string
  ): Promise<MerchantEmployeePayload> {
    const shopId = this.requireMerchantShopScope(actor);
    const technicianIdentityId = await this.resolveTechnicianIdentityId(publicId);
    const employee = await this.repository.findCurrentShopEmployee(shopId, technicianIdentityId);
    if (!employee) throw this.notFound();

    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_affiliation.read",
      targetType: "technician_shop_affiliation",
      targetId: employee.affiliation.id,
      context,
      metadata: { shopId }
    });
    return employee;
  }

  public async upsertCurrentShopAffiliation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: EmployeeAffiliationMutationInput
  ): Promise<MerchantEmployeePayload> {
    const shopId = this.requireMerchantShopScope(actor);
    if (actor.isReadOnlyMerchantPreview) {
      throw this.forbidden();
    }
    this.assertMutationDates(input);
    const technicianIdentityId = await this.resolveTechnicianIdentityId(publicId);
    const result = await this.repository.upsertCurrentAffiliation({
      shopId,
      technicianIdentityId,
      actorUserId: actor.userId,
      ...input
    });
    if (result === "not_found") throw this.notFound();
    if (result === "exclusive_conflict") throw this.exclusiveConflict();

    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_affiliation.update",
      targetType: "technician_shop_affiliation",
      targetId: result.affiliation.id,
      context,
      metadata: {
        shopId,
        relationshipType: result.affiliation.relationshipType,
        workStatus: result.affiliation.workStatus
      }
    });
    return result;
  }

  public async updateCurrentShopEmployeeProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    publicId: string,
    input: EmployeeProfileUpdateInput
  ): Promise<MerchantEmployeePayload> {
    const shopId = this.requireMerchantShopScope(actor);
    if (actor.isReadOnlyMerchantPreview) {
      throw this.forbidden();
    }
    const technicianIdentityId = await this.resolveTechnicianIdentityId(publicId);
    const employee = await this.repository.updateCurrentShopEmployeeProfile({
      shopId,
      technicianIdentityId,
      actorUserId: actor.userId,
      profile: input
    });
    if (!employee) throw this.notFound();

    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_profile.update",
      targetType: "technician_shop_affiliation",
      targetId: employee.affiliation.id,
      context,
      metadata: {
        shopId,
        changedFields: Object.keys(input).sort()
      }
    });
    return employee;
  }

  private async resolveTechnicianIdentityId(publicId: string): Promise<number> {
    let identifier: PublicIdentifierRecord | null;
    try {
      identifier = await this.identifierResolver.resolve(publicId);
    } catch {
      throw this.notFound();
    }
    if (!identifier || identifier.kind !== "S" || identifier.userIdentityId === null) {
      throw this.notFound();
    }
    return identifier.userIdentityId;
  }

  private requireMerchantShopScope(actor: AuthenticatedAccessContext): number {
    if (
      actor.currentIdentityScopeType === "shop" &&
      typeof actor.currentIdentityScopeId === "number" &&
      actor.currentIdentityScopeId > 0
    ) {
      return actor.currentIdentityScopeId;
    }
    throw this.forbidden();
  }

  private assertMutationDates(input: EmployeeAffiliationMutationInput): void {
    const ended = input.workStatus === "ended";
    if (
      (ended && input.endsAt === null) ||
      (!ended && input.endsAt !== null) ||
      (input.endsAt !== null && input.endsAt.getTime() < input.startsAt.getTime())
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_NOT_FOUND,
      message: "error.technician_affiliation.not_found",
      statusCode: 404
    });
  }

  private exclusiveConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.TECHNICIAN_AFFILIATION_CONFLICT,
      message: "error.technician_affiliation.exclusive_conflict",
      statusCode: 409
    });
  }

  private forbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }
}
