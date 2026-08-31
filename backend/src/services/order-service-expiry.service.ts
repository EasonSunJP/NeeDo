import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface OrderServiceExpiryRepositoryPort {
  moveDueSessionsToCheckout: (input: { now: Date; batchSize: number }) => Promise<number>;
}

export class OrderServiceExpiryService {
  public constructor(private readonly repository: OrderServiceExpiryRepositoryPort) {}

  public async expireDueSessions(now: Date, batchSize: number): Promise<number> {
    if (
      !(now instanceof Date) ||
      Number.isNaN(now.getTime()) ||
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 500
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
    return this.repository.moveDueSessionsToCheckout({ now, batchSize });
  }
}
