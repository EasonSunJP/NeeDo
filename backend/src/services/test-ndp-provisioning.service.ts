import { ERROR_CODES } from "../constants/error-codes";
import type { WalletPayload } from "./ledger.service";
import { AppError } from "../utils/app-error";

export const TEST_NDP_TARGET_AVAILABLE = 100_000;
export const TEST_NDP_BACKFILL_VERSION = "exchange-test-ndp-v1";

export interface TestNdpCalibrationResult {
  status: "applied" | "already_applied";
  userId: number;
  adjustmentAmount: number;
  availableBalance: number;
}

export interface TestNdpProvisioningTransactionPort {
  findCalibration(
    idempotencyKey: string
  ): Promise<{ amount: number; availableBalanceAfter: number } | null>;
  lockUser(userId: number): Promise<{ id: number; isTestAccount: boolean } | null>;
  getOrCreateAndLockTestWallet(userId: number): Promise<WalletPayload>;
  createCalibration(input: {
    idempotencyKey: string;
    userId: number;
    walletId: number;
    amount: number;
    direction: "available_credit" | "available_debit";
    availableDelta: number;
    currency: "TEST_NDP";
    frozenBalance: number;
    targetAvailableBalance: number;
  }): Promise<TestNdpCalibrationResult>;
  recordZeroCalibration(input: {
    idempotencyKey: string;
    userId: number;
    walletId: number;
    availableBalance: number;
    frozenBalance: number;
    currency: "TEST_NDP";
  }): Promise<TestNdpCalibrationResult>;
}

export interface TestNdpProvisioningRepositoryPort {
  runInTransaction<T>(
    handler: (transaction: TestNdpProvisioningTransactionPort) => Promise<T>
  ): Promise<T>;
}

export class TestNdpProvisioningService {
  public constructor(private readonly repository: TestNdpProvisioningRepositoryPort) {}

  public calibrateUser(userId: number): Promise<TestNdpCalibrationResult> {
    const idempotencyKey = `${TEST_NDP_BACKFILL_VERSION}:user:${userId}:calibrate`;

    return this.repository.runInTransaction(async (transaction) => {
      const existing = await transaction.findCalibration(idempotencyKey);
      if (existing) {
        return this.existingResult(userId, existing);
      }

      const user = await transaction.lockUser(userId);
      if (!user) {
        throw new AppError({
          code: ERROR_CODES.USER_NOT_FOUND,
          message: "error.user.not_found",
          statusCode: 404
        });
      }
      if (!user.isTestAccount) {
        throw new AppError({
          code: ERROR_CODES.ACCOUNT_CLASSIFICATION_CONFLICT,
          message: "error.test_ndp.account_not_test",
          statusCode: 409
        });
      }

      const completedWhileWaiting = await transaction.findCalibration(idempotencyKey);
      if (completedWhileWaiting) {
        return this.existingResult(userId, completedWhileWaiting);
      }

      const wallet = await transaction.getOrCreateAndLockTestWallet(userId);
      const availableDelta = TEST_NDP_TARGET_AVAILABLE - wallet.availableBalance;
      if (availableDelta === 0) {
        return transaction.recordZeroCalibration({
          idempotencyKey,
          userId,
          walletId: wallet.id,
          availableBalance: wallet.availableBalance,
          frozenBalance: wallet.frozenBalance,
          currency: "TEST_NDP"
        });
      }

      return transaction.createCalibration({
        idempotencyKey,
        userId,
        walletId: wallet.id,
        amount: Math.abs(availableDelta),
        direction: availableDelta > 0 ? "available_credit" : "available_debit",
        availableDelta,
        currency: "TEST_NDP",
        frozenBalance: wallet.frozenBalance,
        targetAvailableBalance: TEST_NDP_TARGET_AVAILABLE
      });
    });
  }

  private existingResult(
    userId: number,
    existing: { amount: number; availableBalanceAfter: number }
  ): TestNdpCalibrationResult {
    return {
      status: "already_applied",
      userId,
      adjustmentAmount: existing.amount,
      availableBalance: existing.availableBalanceAfter
    };
  }
}
