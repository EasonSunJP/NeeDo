import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const SHOP_SERVICE_LIMIT = 20;

export function assertShopServiceQuota(nonDeletedCountAfterCreate: number): void {
  if (
    !Number.isSafeInteger(nonDeletedCountAfterCreate) ||
    nonDeletedCountAfterCreate < 0 ||
    nonDeletedCountAfterCreate > SHOP_SERVICE_LIMIT
  ) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.service.limit_reached",
      statusCode: 409
    });
  }
}
