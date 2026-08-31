import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface ShopMembershipCardAdjustmentExpiryInput {
  batchSize: number;
  shopId?: number;
  customerUserId?: number;
}

export interface ShopMembershipCardAdjustmentExpirySummary {
  scanned: number;
  expired: number;
  failed: number;
}

export interface ShopMembershipCardAdjustmentExpiryRepositoryPort {
  expireDue: (
    input: ShopMembershipCardAdjustmentExpiryInput
  ) => Promise<ShopMembershipCardAdjustmentExpirySummary>;
}

export class ShopMembershipCardAdjustmentExpiryService {
  public constructor(
    private readonly repository: ShopMembershipCardAdjustmentExpiryRepositoryPort
  ) {}

  public async expireDue(
    input: ShopMembershipCardAdjustmentExpiryInput
  ): Promise<ShopMembershipCardAdjustmentExpirySummary> {
    if (
      !Number.isSafeInteger(input.batchSize) ||
      input.batchSize < 1 ||
      input.batchSize > 500
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
    return this.repository.expireDue(input);
  }
}
