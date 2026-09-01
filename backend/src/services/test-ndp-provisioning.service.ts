import { ERROR_CODES } from "../constants/error-codes";
import type { WalletPayload } from "./ledger.service";
import { AppError } from "../utils/app-error";

export const TEST_NDP_TARGET_AVAILABLE = 100_000;
export const TEST_NDP_BACKFILL_VERSION = "exchange-test-ndp-v1";
export const TEST_SHOP_NDP_CALIBRATION_VERSION = "exchange-request-shop-test-ndp-v1";

export interface TestNdpCalibrationResult {
  status: "applied" | "already_applied";
  userId: number;
  shopId?: number;
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
  findTestShopAuthorityForUpdate(input: {
    shopId: number;
    actorUserId: number;
  }): Promise<{ isTestAccount: boolean; activeShopScope: boolean } | null>;
  getOrCreateAndLockTestShopWallet(shopId: number): Promise<WalletPayload>;
  createShopCalibration(input: {
    idempotencyKey: string;
    actorUserId: number;
    shopId: number;
    walletId: number;
    amount: number;
    direction: "available_credit" | "available_debit";
    availableDelta: number;
    currency: "TEST_NDP";
    frozenBalance: number;
    targetAvailableBalance: number;
  }): Promise<TestNdpCalibrationResult>;
  recordZeroShopCalibration(input: {
    idempotencyKey: string;
    actorUserId: number;
    shopId: number;
    walletId: number;
    availableBalance: number;
    frozenBalance: number;
    currency: "TEST_NDP";
  }): Promise<TestNdpCalibrationResult>;
}

export interface TestShopNdpCalibrationInput {
  shopId: number;
  actorUserId: number;
  targetAvailableNdp?: number;
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

  public calibrateShop(input: TestShopNdpCalibrationInput): Promise<TestNdpCalibrationResult> {
    const targetAvailableNdp = input.targetAvailableNdp ?? TEST_NDP_TARGET_AVAILABLE;
    if (
      !Number.isSafeInteger(input.shopId) ||
      input.shopId <= 0 ||
      !Number.isSafeInteger(input.actorUserId) ||
      input.actorUserId <= 0 ||
      !Number.isSafeInteger(targetAvailableNdp) ||
      targetAvailableNdp < 0
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
    const idempotencyKey = `${TEST_SHOP_NDP_CALIBRATION_VERSION}:shop:${input.shopId}:calibrate`;

    return this.repository.runInTransaction(async (transaction) => {
      const authority = await transaction.findTestShopAuthorityForUpdate(input);
      if (!authority?.isTestAccount || !authority.activeShopScope) {
        throw new AppError({
          code: ERROR_CODES.FORBIDDEN,
          message: "error.forbidden",
          statusCode: 403
        });
      }
      const existing = await transaction.findCalibration(idempotencyKey);
      if (existing) {
        return {
          ...this.existingResult(input.actorUserId, existing),
          shopId: input.shopId
        };
      }

      const wallet = await transaction.getOrCreateAndLockTestShopWallet(input.shopId);
      const availableDelta = targetAvailableNdp - wallet.availableBalance;
      if (availableDelta === 0) {
        return transaction.recordZeroShopCalibration({
          idempotencyKey,
          actorUserId: input.actorUserId,
          shopId: input.shopId,
          walletId: wallet.id,
          availableBalance: wallet.availableBalance,
          frozenBalance: wallet.frozenBalance,
          currency: "TEST_NDP"
        });
      }

      return transaction.createShopCalibration({
        idempotencyKey,
        actorUserId: input.actorUserId,
        shopId: input.shopId,
        walletId: wallet.id,
        amount: Math.abs(availableDelta),
        direction: availableDelta > 0 ? "available_credit" : "available_debit",
        availableDelta,
        currency: "TEST_NDP",
        frozenBalance: wallet.frozenBalance,
        targetAvailableBalance: targetAvailableNdp
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
