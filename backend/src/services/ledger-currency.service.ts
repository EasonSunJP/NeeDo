import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type LedgerCurrency = "NDP" | "TEST_NDP";

export interface LedgerCurrencyRepositoryPort {
  findUserAccountClassification(userId: number): Promise<{ isTestAccount: boolean } | null>;
}

export class LedgerCurrencyService {
  public constructor(private readonly repository: LedgerCurrencyRepositoryPort) {}

  public async resolveForUser(userId: number): Promise<LedgerCurrency> {
    const user = await this.repository.findUserAccountClassification(userId);
    if (!user) {
      throw new AppError({
        code: ERROR_CODES.USER_NOT_FOUND,
        message: "error.user.not_found",
        statusCode: 404
      });
    }

    return user.isTestAccount ? "TEST_NDP" : "NDP";
  }

  public static assertSameCurrency(expected: LedgerCurrency, actual: LedgerCurrency[]): void {
    if (actual.some((currency) => currency !== expected)) {
      throw LedgerCurrencyService.currencyMismatchError();
    }
  }

  public static fromStored(value: string): LedgerCurrency {
    if (value === "NDP" || value === "TEST_NDP") {
      return value;
    }

    throw LedgerCurrencyService.currencyMismatchError();
  }

  private static currencyMismatchError(): AppError {
    return new AppError({
      code: ERROR_CODES.LEDGER_CURRENCY_MISMATCH,
      message: "error.ledger.currency_mismatch",
      statusCode: 409
    });
  }
}
