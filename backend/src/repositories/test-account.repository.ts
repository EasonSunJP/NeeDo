import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { TestNdpProvisioningRepository } from "./test-ndp-provisioning.repository";
import { TestNdpProvisioningService } from "../services/test-ndp-provisioning.service";
import type { AuditLogCreateInput } from "./audit-log.repository";

type TestAccountPrismaClient = PrismaClient | Prisma.TransactionClient;

export interface LockedTestAccountUser {
  id: number;
  isTestAccount: boolean;
  updatedAt: Date;
}

export interface TestAccountClassificationUpdate {
  userId: number;
  fromTestAccount: boolean;
  toTestAccount: boolean;
  expectedUpdatedAt: Date;
}

export interface TestAccountTransactionPort {
  lockUser(userId: number): Promise<LockedTestAccountUser | null>;
  hasActiveFinancialState(userId: number, currency: "NDP" | "TEST_NDP"): Promise<boolean>;
  updateClassification(input: TestAccountClassificationUpdate): Promise<boolean>;
  ensureFormalWallet(userId: number): Promise<void>;
  calibrateTestNdp(userId: number): Promise<void>;
  createAudit(input: AuditLogCreateInput): Promise<void>;
}

export interface TestAccountRepositoryPort {
  runInTransaction<T>(handler: (transaction: TestAccountTransactionPort) => Promise<T>): Promise<T>;
}

type LockedUserRow = {
  id: number;
  isTestAccount: boolean | number;
  updatedAt: Date;
};

export class TestAccountRepository
  implements TestAccountRepositoryPort, TestAccountTransactionPort
{
  public constructor(private readonly client: TestAccountPrismaClient = prisma) {}

  public runInTransaction<T>(
    handler: (transaction: TestAccountTransactionPort) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((transaction) =>
        handler(new TestAccountRepository(transaction))
      );
    }
    return handler(this);
  }

  public async lockUser(userId: number): Promise<LockedTestAccountUser | null> {
    const rows = await this.client.$queryRaw<LockedUserRow[]>(
      Prisma.sql`SELECT
          id,
          is_test_account AS isTestAccount,
          updated_at AS updatedAt
        FROM users
        WHERE id = ${userId} AND deleted_at IS NULL
        FOR UPDATE`
    );
    const user = rows[0];
    return user
      ? {
          id: user.id,
          isTestAccount: Boolean(user.isTestAccount),
          updatedAt: new Date(user.updatedAt)
        }
      : null;
  }

  public async hasActiveFinancialState(
    userId: number,
    currency: "NDP" | "TEST_NDP"
  ): Promise<boolean> {
    const ownedShopIds = (await this.client.shop.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      select: { id: true }
    })).map((shop) => shop.id);
    const ownerScope = [
      { ownerType: "USER" as const, ownerId: userId },
      ...(ownedShopIds.length
        ? [{ ownerType: "SHOP" as const, ownerId: { in: ownedShopIds } }]
        : [])
    ];
    const [frozenWallet, activeHold, pendingAdjustment, unsettledOrder] = await Promise.all([
      this.client.wallet.findFirst({
        where: {
          OR: ownerScope,
          currency,
          frozenBalance: { gt: 0 },
          deletedAt: null
        },
        select: { id: true }
      }),
      this.client.walletHold.findFirst({
        where: {
          OR: ownerScope,
          currency,
          status: { in: ["active", "partially_captured"] },
          deletedAt: null
        },
        select: { id: true }
      }),
      this.client.walletAdjustmentRequest.findFirst({
        where: {
          OR: ownerScope,
          status: "PENDING",
          deletedAt: null,
          wallet: { currency, deletedAt: null }
        },
        select: { id: true }
      }),
      this.client.orderFinancial.findFirst({
        where: {
          OR: [
            { customerUserId: userId },
            ...(ownedShopIds.length ? [{ shopId: { in: ownedShopIds } }] : [])
          ],
          ndpCurrency: currency,
          settlementStatus: {
            notIn: ["settled", "cancelled", "compensated", "refunded"]
          },
          deletedAt: null
        },
        select: { id: true }
      })
    ]);

    return Boolean(frozenWallet || activeHold || pendingAdjustment || unsettledOrder);
  }

  public async updateClassification(input: TestAccountClassificationUpdate): Promise<boolean> {
    const result = await this.client.user.updateMany({
      where: {
        id: input.userId,
        isTestAccount: input.fromTestAccount,
        updatedAt: input.expectedUpdatedAt,
        deletedAt: null
      },
      data: { isTestAccount: input.toTestAccount }
    });
    return result.count === 1;
  }

  public async ensureFormalWallet(userId: number): Promise<void> {
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
        VALUES ('user', ${userId}, 'NDP', 0, 0, CURRENT_TIMESTAMP(3), NULL)
        ON DUPLICATE KEY UPDATE
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP(3)`
    );
  }

  public async calibrateTestNdp(userId: number): Promise<void> {
    await new TestNdpProvisioningService(
      new TestNdpProvisioningRepository(this.client)
    ).calibrateUser(userId);
  }

  public async createAudit(input: AuditLogCreateInput): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }

  private canStartTransaction(client: TestAccountPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
