import { ERROR_CODES } from "../constants/error-codes";
import type { TestAccountRepositoryPort } from "../repositories/test-account.repository";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { UserPayload } from "./user.service";

export interface TestAccountUpdateInput {
  isTestAccount: boolean;
  expectedUpdatedAt: Date;
}

export interface TestAccountUserReader {
  get(id: number): Promise<UserPayload>;
}

export class TestAccountService {
  public constructor(
    private readonly repository: TestAccountRepositoryPort,
    private readonly users: TestAccountUserReader
  ) {}

  public async updateClassification(
    userId: number,
    input: TestAccountUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<UserPayload> {
    await this.repository.runInTransaction(async (transaction) => {
      const user = await transaction.lockUser(userId);
      if (!user) throw this.notFoundError();

      if (user.isTestAccount === input.isTestAccount) return;
      if (user.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
        throw this.staleError();
      }

      const fromTestAccount = user.isTestAccount;
      const sourceCurrency = fromTestAccount ? "TEST_NDP" : "NDP";
      if (await transaction.hasActiveFinancialState(userId, sourceCurrency)) {
        throw this.activeFinancialStateError();
      }

      const updated = await transaction.updateClassification({
        userId,
        fromTestAccount,
        toTestAccount: input.isTestAccount,
        expectedUpdatedAt: input.expectedUpdatedAt
      });
      if (!updated) throw this.staleError();

      if (input.isTestAccount) {
        await transaction.calibrateTestNdp(userId);
      } else {
        await transaction.ensureFormalWallet(userId);
      }

      await transaction.createAudit({
        actorId: actor.userId,
        action: "user.test_account.update",
        targetType: "User",
        targetId: userId,
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: {
          fromTestAccount,
          toTestAccount: input.isTestAccount,
          activeCurrency: sourceCurrency,
          expectedUpdatedAt: input.expectedUpdatedAt.toISOString()
        }
      });
    });

    return this.users.get(userId);
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.USER_NOT_FOUND,
      message: "error.user.not_found",
      statusCode: 404
    });
  }

  private staleError(): AppError {
    return new AppError({
      code: ERROR_CODES.ACCOUNT_CLASSIFICATION_STALE,
      message: "error.account_classification.stale",
      statusCode: 409
    });
  }

  private activeFinancialStateError(): AppError {
    return new AppError({
      code: ERROR_CODES.ACCOUNT_CLASSIFICATION_CONFLICT,
      message: "error.account_classification.active_financial_state",
      statusCode: 409
    });
  }
}
