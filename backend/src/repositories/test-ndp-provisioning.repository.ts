import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { WalletPayload } from "../services/ledger.service";
import {
  TEST_NDP_BACKFILL_VERSION,
  type TestNdpCalibrationResult,
  type TestNdpProvisioningRepositoryPort,
  type TestNdpProvisioningTransactionPort
} from "../services/test-ndp-provisioning.service";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";

type TestNdpPrismaClient = PrismaClient | Prisma.TransactionClient;

type LockedUserRow = {
  id: number;
  isTestAccount: boolean | number;
};

type LockedWalletRow = {
  id: number;
  ownerType: string;
  ownerId: number;
  currency: string;
  availableBalance: number;
  frozenBalance: number;
  createdAt: Date;
  updatedAt: Date;
};

type LockedTestShopAuthorityRow = {
  isTestAccount: boolean | number;
  activeShopScope: boolean | number;
};

export class TestNdpProvisioningRepository
  implements TestNdpProvisioningRepositoryPort, TestNdpProvisioningTransactionPort
{
  public constructor(private readonly client: TestNdpPrismaClient) {}

  public runInTransaction<T>(
    handler: (transaction: TestNdpProvisioningTransactionPort) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((transaction) =>
        handler(new TestNdpProvisioningRepository(transaction))
      );
    }

    return handler(this);
  }

  public async findCalibration(
    idempotencyKey: string
  ): Promise<{ amount: number; availableBalanceAfter: number } | null> {
    const transaction = await this.client.ledgerTransaction.findFirst({
      where: {
        idempotencyKey,
        type: "TEST_BALANCE_CALIBRATION",
        currency: "TEST_NDP",
        deletedAt: null
      },
      select: {
        amount: true,
        metadata: true,
        entries: {
          where: { deletedAt: null },
          select: { availableBalanceAfter: true },
          orderBy: { id: "asc" },
          take: 1
        }
      }
    });
    if (!transaction) return null;

    const entryBalance = transaction.entries[0]?.availableBalanceAfter;
    const metadataBalance = this.metadataNumber(transaction.metadata, "availableBalanceAfter");
    const availableBalanceAfter = entryBalance ?? metadataBalance;
    if (availableBalanceAfter === null) {
      throw this.mutationError();
    }

    return { amount: transaction.amount, availableBalanceAfter };
  }

  public async lockUser(
    userId: number
  ): Promise<{ id: number; isTestAccount: boolean } | null> {
    const rows = await this.client.$queryRaw<LockedUserRow[]>(
      Prisma.sql`SELECT id, is_test_account AS isTestAccount
        FROM users
        WHERE id = ${userId} AND deleted_at IS NULL
        FOR UPDATE`
    );
    const user = rows[0];

    return user ? { id: user.id, isTestAccount: Boolean(user.isTestAccount) } : null;
  }

  public async getOrCreateAndLockTestWallet(userId: number): Promise<WalletPayload> {
    await this.client.$executeRaw(
      Prisma.sql`INSERT INTO wallets (
          owner_type,
          owner_id,
          currency,
          available_balance,
          frozen_balance,
          updated_at,
          deleted_at
        )
        VALUES ('user', ${userId}, 'TEST_NDP', 0, 0, CURRENT_TIMESTAMP(3), NULL)
        ON DUPLICATE KEY UPDATE
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP(3)`
    );
    const rows = await this.client.$queryRaw<LockedWalletRow[]>(
      Prisma.sql`SELECT
          id,
          owner_type AS ownerType,
          owner_id AS ownerId,
          currency,
          available_balance AS availableBalance,
          frozen_balance AS frozenBalance,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM wallets
        WHERE owner_type = 'user'
          AND owner_id = ${userId}
          AND currency = 'TEST_NDP'
          AND deleted_at IS NULL
        FOR UPDATE`
    );
    const wallet = rows[0];
    if (!wallet || wallet.currency !== "TEST_NDP" || wallet.ownerType !== "user") {
      throw this.mutationError();
    }

    return {
      id: wallet.id,
      ownerType: "user",
      ownerId: wallet.ownerId,
      currency: "TEST_NDP",
      availableBalance: Number(wallet.availableBalance),
      frozenBalance: Number(wallet.frozenBalance),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  public async findTestShopAuthorityForUpdate(input: {
    shopId: number;
    actorUserId: number;
  }): Promise<{ isTestAccount: boolean; activeShopScope: boolean } | null> {
    const rows = await this.client.$queryRaw<LockedTestShopAuthorityRow[]>(
      Prisma.sql`SELECT
          u.is_test_account AS isTestAccount,
          (
            s.owner_user_id = u.id
            OR EXISTS (
              SELECT 1
              FROM merchant_accounts ma
              INNER JOIN merchant_shop_memberships msm
                ON msm.merchant_account_id = ma.id
              WHERE ma.owner_user_id = u.id
                AND ma.deleted_at IS NULL
                AND msm.shop_id = s.id
                AND msm.starts_at <= CURRENT_TIMESTAMP(3)
                AND (msm.ends_at IS NULL OR msm.ends_at > CURRENT_TIMESTAMP(3))
                AND msm.deleted_at IS NULL
            )
          ) AS activeShopScope
        FROM users u
        INNER JOIN shops s
          ON s.id = ${input.shopId}
         AND s.deleted_at IS NULL
        WHERE u.id = ${input.actorUserId}
          AND u.deleted_at IS NULL
        FOR UPDATE`
    );
    const authority = rows[0];

    return authority
      ? {
          isTestAccount: Boolean(authority.isTestAccount),
          activeShopScope: Boolean(authority.activeShopScope)
        }
      : null;
  }

  public async getOrCreateAndLockTestShopWallet(shopId: number): Promise<WalletPayload> {
    await this.client.$executeRaw(
      Prisma.sql`INSERT INTO wallets (
          owner_type,
          owner_id,
          currency,
          available_balance,
          frozen_balance,
          updated_at,
          deleted_at
        )
        VALUES ('shop', ${shopId}, 'TEST_NDP', 0, 0, CURRENT_TIMESTAMP(3), NULL)
        ON DUPLICATE KEY UPDATE
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP(3)`
    );
    const rows = await this.client.$queryRaw<LockedWalletRow[]>(
      Prisma.sql`SELECT
          id,
          owner_type AS ownerType,
          owner_id AS ownerId,
          currency,
          available_balance AS availableBalance,
          frozen_balance AS frozenBalance,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM wallets
        WHERE owner_type = 'shop'
          AND owner_id = ${shopId}
          AND currency = 'TEST_NDP'
          AND deleted_at IS NULL
        FOR UPDATE`
    );
    const wallet = rows[0];
    if (!wallet || wallet.currency !== "TEST_NDP" || wallet.ownerType !== "shop") {
      throw this.mutationError();
    }

    return {
      id: wallet.id,
      ownerType: "shop",
      ownerId: wallet.ownerId,
      currency: "TEST_NDP",
      availableBalance: Number(wallet.availableBalance),
      frozenBalance: Number(wallet.frozenBalance),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    };
  }

  public async createCalibration(input: {
    idempotencyKey: string;
    userId: number;
    walletId: number;
    amount: number;
    direction: "available_credit" | "available_debit";
    availableDelta: number;
    currency: "TEST_NDP";
    frozenBalance: number;
    targetAvailableBalance: number;
  }): Promise<TestNdpCalibrationResult> {
    const sourceAvailableBalance = input.targetAvailableBalance - input.availableDelta;
    const updated = await this.client.wallet.updateMany({
      where: {
        id: input.walletId,
        ownerType: "USER",
        ownerId: input.userId,
        currency: input.currency,
        availableBalance: sourceAvailableBalance,
        frozenBalance: input.frozenBalance,
        deletedAt: null
      },
      data: { availableBalance: { increment: input.availableDelta } }
    });
    if (updated.count !== 1) {
      throw this.mutationError();
    }

    const transaction = await this.client.ledgerTransaction.create({
      data: {
        transactionNo: this.transactionNo(input.idempotencyKey),
        idempotencyKey: input.idempotencyKey,
        type: "TEST_BALANCE_CALIBRATION",
        referenceType: "test_ndp_backfill",
        referenceId: input.userId,
        actorUserId: null,
        amount: input.amount,
        currency: input.currency,
        metadata: this.calibrationMetadata({
          userId: input.userId,
          walletId: input.walletId,
          availableBalanceBefore: sourceAvailableBalance,
          availableDelta: input.availableDelta,
          availableBalanceAfter: input.targetAvailableBalance,
          frozenBalance: input.frozenBalance
        })
      }
    });
    await this.client.walletLedger.create({
      data: {
        transactionId: transaction.id,
        walletId: input.walletId,
        direction:
          input.direction === "available_credit" ? "AVAILABLE_CREDIT" : "AVAILABLE_DEBIT",
        amount: input.amount,
        availableDelta: input.availableDelta,
        frozenDelta: 0,
        availableBalanceAfter: input.targetAvailableBalance,
        frozenBalanceAfter: input.frozenBalance,
        reason: "test_ndp_balance_calibration"
      }
    });
    await this.createTestOnlyReconciliation(transaction.id, "test_ndp_backfill", input.userId, input.amount);
    await this.createAudit({
      userId: input.userId,
      walletId: input.walletId,
      transactionId: transaction.id,
      availableBalanceBefore: sourceAvailableBalance,
      availableDelta: input.availableDelta,
      availableBalanceAfter: input.targetAvailableBalance,
      frozenBalance: input.frozenBalance
    });

    return {
      status: "applied",
      userId: input.userId,
      adjustmentAmount: input.amount,
      availableBalance: input.targetAvailableBalance
    };
  }

  public async recordZeroCalibration(input: {
    idempotencyKey: string;
    userId: number;
    walletId: number;
    availableBalance: number;
    frozenBalance: number;
    currency: "TEST_NDP";
  }): Promise<TestNdpCalibrationResult> {
    const transaction = await this.client.ledgerTransaction.create({
      data: {
        transactionNo: this.transactionNo(input.idempotencyKey),
        idempotencyKey: input.idempotencyKey,
        type: "TEST_BALANCE_CALIBRATION",
        referenceType: "test_ndp_backfill",
        referenceId: input.userId,
        actorUserId: null,
        amount: 0,
        currency: input.currency,
        metadata: this.calibrationMetadata({
          userId: input.userId,
          walletId: input.walletId,
          availableBalanceBefore: input.availableBalance,
          availableDelta: 0,
          availableBalanceAfter: input.availableBalance,
          frozenBalance: input.frozenBalance
        })
      }
    });
    await this.createTestOnlyReconciliation(transaction.id, "test_ndp_backfill", input.userId, 0);
    await this.createAudit({
      userId: input.userId,
      walletId: input.walletId,
      transactionId: transaction.id,
      availableBalanceBefore: input.availableBalance,
      availableDelta: 0,
      availableBalanceAfter: input.availableBalance,
      frozenBalance: input.frozenBalance
    });

    return {
      status: "applied",
      userId: input.userId,
      adjustmentAmount: 0,
      availableBalance: input.availableBalance
    };
  }

  public async createShopCalibration(input: {
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
  }): Promise<TestNdpCalibrationResult> {
    const sourceAvailableBalance = input.targetAvailableBalance - input.availableDelta;
    const updated = await this.client.wallet.updateMany({
      where: {
        id: input.walletId,
        ownerType: "SHOP",
        ownerId: input.shopId,
        currency: input.currency,
        availableBalance: sourceAvailableBalance,
        frozenBalance: input.frozenBalance,
        deletedAt: null
      },
      data: { availableBalance: { increment: input.availableDelta } }
    });
    if (updated.count !== 1) throw this.mutationError();

    const transaction = await this.client.ledgerTransaction.create({
      data: {
        transactionNo: this.transactionNo(input.idempotencyKey),
        idempotencyKey: input.idempotencyKey,
        type: "TEST_BALANCE_CALIBRATION",
        referenceType: "exchange_request_test_shop_funding",
        referenceId: input.shopId,
        actorUserId: input.actorUserId,
        amount: input.amount,
        currency: input.currency,
        metadata: {
          version: "exchange-request-shop-test-ndp-v1",
          actorUserId: input.actorUserId,
          shopId: input.shopId,
          walletId: input.walletId,
          currency: input.currency,
          availableBalanceBefore: sourceAvailableBalance,
          availableDelta: input.availableDelta,
          availableBalanceAfter: input.targetAvailableBalance,
          frozenBalance: input.frozenBalance
        }
      }
    });
    await this.client.walletLedger.create({
      data: {
        transactionId: transaction.id,
        walletId: input.walletId,
        direction:
          input.direction === "available_credit" ? "AVAILABLE_CREDIT" : "AVAILABLE_DEBIT",
        amount: input.amount,
        availableDelta: input.availableDelta,
        frozenDelta: 0,
        availableBalanceAfter: input.targetAvailableBalance,
        frozenBalanceAfter: input.frozenBalance,
        reason: "test_ndp_shop_balance_calibration"
      }
    });
    await this.createTestOnlyReconciliation(
      transaction.id,
      "exchange_request_test_shop_funding",
      input.shopId,
      input.amount
    );
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "test_ndp.shop.calibrate",
        targetType: "ledger_transaction",
        targetId: transaction.id,
        metadata: {
          shopId: input.shopId,
          walletId: input.walletId,
          availableBalanceBefore: sourceAvailableBalance,
          availableDelta: input.availableDelta,
          availableBalanceAfter: input.targetAvailableBalance,
          currency: input.currency
        }
      }
    });

    return {
      status: "applied",
      userId: input.actorUserId,
      shopId: input.shopId,
      adjustmentAmount: input.amount,
      availableBalance: input.targetAvailableBalance
    };
  }

  public async recordZeroShopCalibration(input: {
    idempotencyKey: string;
    actorUserId: number;
    shopId: number;
    walletId: number;
    availableBalance: number;
    frozenBalance: number;
    currency: "TEST_NDP";
  }): Promise<TestNdpCalibrationResult> {
    const transaction = await this.client.ledgerTransaction.create({
      data: {
        transactionNo: this.transactionNo(input.idempotencyKey),
        idempotencyKey: input.idempotencyKey,
        type: "TEST_BALANCE_CALIBRATION",
        referenceType: "exchange_request_test_shop_funding",
        referenceId: input.shopId,
        actorUserId: input.actorUserId,
        amount: 0,
        currency: input.currency,
        metadata: {
          version: "exchange-request-shop-test-ndp-v1",
          actorUserId: input.actorUserId,
          shopId: input.shopId,
          walletId: input.walletId,
          currency: input.currency,
          availableBalanceBefore: input.availableBalance,
          availableDelta: 0,
          availableBalanceAfter: input.availableBalance,
          frozenBalance: input.frozenBalance
        }
      }
    });
    await this.createTestOnlyReconciliation(
      transaction.id,
      "exchange_request_test_shop_funding",
      input.shopId,
      0
    );
    await this.client.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: "test_ndp.shop.calibrate",
        targetType: "ledger_transaction",
        targetId: transaction.id,
        metadata: {
          shopId: input.shopId,
          walletId: input.walletId,
          availableDelta: 0,
          availableBalanceAfter: input.availableBalance,
          currency: input.currency
        }
      }
    });

    return {
      status: "applied",
      userId: input.actorUserId,
      shopId: input.shopId,
      adjustmentAmount: 0,
      availableBalance: input.availableBalance
    };
  }

  private createTestOnlyReconciliation(
    transactionId: number,
    referenceType: string,
    referenceId: number,
    amount: number
  ): Promise<unknown> {
    return this.client.financeReconciliation.create({
      data: {
        transactionId,
        referenceType,
        referenceId,
        status: "TEST_ONLY",
        currency: "TEST_NDP",
        expectedAmount: amount,
        actualAmount: amount,
        differenceAmount: 0
      }
    });
  }

  private calibrationMetadata(input: {
    userId: number;
    walletId: number;
    availableBalanceBefore: number;
    availableDelta: number;
    availableBalanceAfter: number;
    frozenBalance: number;
  }): Prisma.InputJsonValue {
    return {
      version: TEST_NDP_BACKFILL_VERSION,
      userId: input.userId,
      walletId: input.walletId,
      currency: "TEST_NDP",
      availableBalanceBefore: input.availableBalanceBefore,
      availableDelta: input.availableDelta,
      availableBalanceAfter: input.availableBalanceAfter,
      frozenBalance: input.frozenBalance
    };
  }

  private createAudit(input: {
    userId: number;
    walletId: number;
    transactionId: number;
    availableBalanceBefore: number;
    availableDelta: number;
    availableBalanceAfter: number;
    frozenBalance: number;
  }): Promise<unknown> {
    return this.client.auditLog.create({
      data: {
        actorId: null,
        action: "ledger.test_ndp.balance_calibrated",
        targetType: "ledger_transaction",
        targetId: input.transactionId,
        metadata: this.calibrationMetadata({
          userId: input.userId,
          walletId: input.walletId,
          availableBalanceBefore: input.availableBalanceBefore,
          availableDelta: input.availableDelta,
          availableBalanceAfter: input.availableBalanceAfter,
          frozenBalance: input.frozenBalance
        })
      }
    });
  }

  private transactionNo(idempotencyKey: string): string {
    const digest = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24).toUpperCase();
    return `LTTESTNDP${digest}`;
  }

  private metadataNumber(metadata: Prisma.JsonValue, key: string): number | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const value = metadata[key];
    return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
  }

  private canStartTransaction(client: TestNdpPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }

  private mutationError(): AppError {
    return new AppError({
      code: ERROR_CODES.WALLET_MUTATION_FAILED,
      message: "error.wallet.mutation_failed",
      statusCode: 409
    });
  }
}
