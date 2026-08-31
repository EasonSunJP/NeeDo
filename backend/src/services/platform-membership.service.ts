import { ERROR_CODES } from "../constants/error-codes";
import type { PlatformMembershipRepositoryPort } from "../repositories/platform-membership.repository";
import { AppError } from "../utils/app-error";

export class PlatformMembershipService {
  public constructor(private readonly repository: PlatformMembershipRepositoryPort) {}

  public async resolveMembershipAt(userId: number, occurredAt: Date) {
    if (!Number.isInteger(userId) || userId <= 0 || Number.isNaN(occurredAt.getTime())) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }

    if (!(await this.repository.hasActiveCustomerProfile(userId))) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.platform_membership.customer_required",
        statusCode: 422
      });
    }

    const entitlement = await this.repository.findActiveEntitlementAt(userId, occurredAt);
    if (entitlement) return entitlement;

    const freeTier = await this.repository.findPublishedTierAt("free", occurredAt);
    if (freeTier) return freeTier;

    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.platform_membership.free_version_unavailable",
      statusCode: 500
    });
  }
}
