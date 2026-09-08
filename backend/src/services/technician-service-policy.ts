import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const TECHNICIAN_SERVICE_LIMIT = 5;

export type TechnicianServiceEligibilityInput = {
  id: number;
  isActive: boolean;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  sortOrder: number;
  deletedAt: Date | null;
};

export const isPublicEligibleTechnicianService = (
  service: TechnicianServiceEligibilityInput
): boolean => service.deletedAt === null && service.isActive && service.reviewStatus === "APPROVED";

export const selectPrimaryTechnicianService = <T extends TechnicianServiceEligibilityInput>(
  services: readonly T[]
): T | null =>
  services
    .filter(isPublicEligibleTechnicianService)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)[0] ?? null;

export const assertTechnicianServiceQuota = (nonDeletedCount: number): void => {
  if (
    !Number.isSafeInteger(nonDeletedCount) ||
    nonDeletedCount < 0 ||
    nonDeletedCount > TECHNICIAN_SERVICE_LIMIT
  ) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.technician_service.limit_reached",
      statusCode: 409
    });
  }
};

export const assertCompleteServiceOrder = (
  ownedIds: readonly number[],
  submittedIds: readonly number[]
): void => {
  const owned = new Set(ownedIds);
  const submitted = new Set(submittedIds);
  const isCompleteOrder =
    owned.size === ownedIds.length &&
    submitted.size === submittedIds.length &&
    owned.size === submitted.size &&
    submittedIds.every((id) => owned.has(id));

  if (!isCompleteOrder) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.technician_service.invalid_order",
      statusCode: 400
    });
  }
};
