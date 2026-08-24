import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(process.env.NODE_ENV !== "production", "wallet adjustment check cannot use NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "wallet adjustment check cannot use DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "wallet adjustment check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");

  const [{ BackofficeRepository }, { LedgerRepository }, { LedgerService }, { prisma, disconnectPrisma }] =
    await Promise.all([
      import("../src/repositories/backoffice.repository"),
      import("../src/repositories/ledger.repository"),
      import("../src/services/ledger.service"),
      import("../src/prisma/client")
    ]);
  const marker = `${Date.now()}-${process.pid}`;
  const createdUserIds: number[] = [];
  const createdRequestIds: number[] = [];
  const createdTransactionIds: number[] = [];
  const createdWalletIds: number[] = [];
  let shopId: number | null = null;

  try {
    const passwordHash = await hash("WalletFlow.2026!", 12);
    const shop = await new BackofficeRepository(prisma).createShop({
      ownerEmail: `wallet-owner-${marker}@needo.test`,
      ownerUsername: `Wallet Owner ${marker}`,
      ownerPasswordHash: passwordHash,
      name: `Wallet Flow Shop ${marker}`,
      city: "Tokyo",
      address: "Integration 4-4"
    });
    shopId = shop.id;
    assert(shop.ownerUserId, "shop owner user was not created");
    createdUserIds.push(shop.ownerUserId);

    const merchantActor = {
      userId: shop.ownerUserId,
      email: `wallet-owner-${marker}@needo.test`,
      accessTokenJti: `merchant-${marker}`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 900,
      roles: ["merchant_owner"],
      permissions: ["wallet:adjustment:create", "wallet:adjustment:list"],
      currentIdentityId: 1,
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: shop.id
    };
    const operatorActor = {
      ...merchantActor,
      accessTokenJti: `operator-${marker}`,
      roles: ["operator"],
      permissions: ["backoffice:wallet-adjustment:list", "backoffice:wallet-adjustment:review"],
      currentIdentityType: "platform_admin",
      currentIdentityScopeType: "global",
      currentIdentityScopeId: null
    };
    const service = new LedgerService(new LedgerRepository(prisma));
    const topupInput = {
      type: "topup" as const,
      amountNdp: 1000,
      idempotencyKey: `wallet-topup-${marker}`,
      bankReference: `BANK-${marker}`,
      note: "local integration top-up"
    };
    const topup = await service.createWalletAdjustmentRequest(merchantActor, topupInput);
    createdRequestIds.push(topup.id);
    createdWalletIds.push(topup.walletId);
    const topupRetry = await service.createWalletAdjustmentRequest(merchantActor, topupInput);
    assert(topupRetry.id === topup.id, "top-up request retry was not idempotent");
    const ownerList = await service.listMyWalletAdjustmentRequests(merchantActor, { page: 1, pageSize: 20 });
    assert(ownerList.list.some((request) => request.id === topup.id), "shop-scoped request list missed its request");

    const approvedTopup = await service.reviewWalletAdjustmentRequest(operatorActor, topup.id, {
      action: "approve",
      note: "bank receipt confirmed"
    });
    assert(approvedTopup.status === "approved", "top-up was not approved");
    assert(approvedTopup.ledgerTransactionId, "top-up did not link a ledger transaction");
    createdTransactionIds.push(approvedTopup.ledgerTransactionId);
    const approvedRetry = await service.reviewWalletAdjustmentRequest(operatorActor, topup.id, {
      action: "approve",
      note: "bank receipt confirmed"
    });
    assert(approvedRetry.ledgerTransactionId === approvedTopup.ledgerTransactionId, "approval retry created another transaction");

    const withdrawal = await service.createWalletAdjustmentRequest(merchantActor, {
      type: "withdrawal",
      amountNdp: 400,
      idempotencyKey: `wallet-withdrawal-${marker}`,
      note: "local integration withdrawal"
    });
    createdRequestIds.push(withdrawal.id);
    const approvedWithdrawal = await service.reviewWalletAdjustmentRequest(operatorActor, withdrawal.id, {
      action: "approve",
      note: "withdrawal destination confirmed"
    });
    assert(approvedWithdrawal.ledgerTransactionId, "withdrawal did not link a ledger transaction");
    createdTransactionIds.push(approvedWithdrawal.ledgerTransactionId);

    const insufficient = await service.createWalletAdjustmentRequest(merchantActor, {
      type: "withdrawal",
      amountNdp: 1000,
      idempotencyKey: `wallet-insufficient-${marker}`,
      note: "must roll back"
    });
    createdRequestIds.push(insufficient.id);
    let insufficientRejected = false;
    try {
      await service.reviewWalletAdjustmentRequest(operatorActor, insufficient.id, {
        action: "approve",
        note: "must fail"
      });
    } catch (error) {
      insufficientRejected =
        typeof error === "object" && error !== null && "message" in error &&
        (error as { message: string }).message === "error.wallet.insufficient_available";
    }
    assert(insufficientRejected, "insufficient withdrawal approval was not rejected");
    const stillPending = await prisma.walletAdjustmentRequest.findUnique({ where: { id: insufficient.id } });
    assert(stillPending?.status === "PENDING", "failed withdrawal did not roll back request status");
    const rejected = await service.reviewWalletAdjustmentRequest(operatorActor, insufficient.id, {
      action: "reject",
      note: "insufficient balance"
    });
    assert(rejected.status === "rejected", "pending insufficient request could not be rejected");

    const wallet = await prisma.wallet.findUnique({ where: { id: topup.walletId } });
    assert(wallet?.availableBalance === 600, "wallet balance did not equal approved top-up minus withdrawal");
    const ledgerTransactions = await prisma.ledgerTransaction.findMany({
      where: { id: { in: createdTransactionIds } },
      include: { entries: true, reconciliation: true }
    });
    assert(ledgerTransactions.length === 2, "approval retry or rejection changed transaction count");
    assert(ledgerTransactions.every((transaction) => transaction.entries.length === 1), "approved adjustment is missing its immutable ledger entry");
    assert(ledgerTransactions.every((transaction) => transaction.reconciliation), "approved adjustment is missing reconciliation data");

    console.log(JSON.stringify({
      database: databaseName,
      requests: { topupApproved: true, withdrawalApproved: true, rejectedWithoutMutation: true },
      safety: { createIdempotent: true, reviewIdempotent: true, insufficientRolledBack: true },
      ledger: { balanceNdp: wallet.availableBalance, transactionCount: ledgerTransactions.length, reconciled: true },
      status: "ok"
    }, null, 2));
  } finally {
    await prisma.$transaction(async (transaction) => {
      if (createdRequestIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { targetType: "wallet_adjustment_request", targetId: { in: createdRequestIds } } });
        await transaction.walletAdjustmentRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
      }
      if (createdTransactionIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { targetType: "ledger_transaction", targetId: { in: createdTransactionIds } } });
        await transaction.financeReconciliation.deleteMany({ where: { transactionId: { in: createdTransactionIds } } });
        await transaction.walletLedger.deleteMany({ where: { transactionId: { in: createdTransactionIds } } });
        await transaction.ledgerTransaction.deleteMany({ where: { id: { in: createdTransactionIds } } });
      }
      if (createdWalletIds.length > 0) {
        await transaction.wallet.deleteMany({ where: { id: { in: createdWalletIds } } });
      }
      if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
      if (createdUserIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
        await transaction.auditLog.deleteMany({ where: { targetType: "User", targetId: { in: createdUserIds } } });
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    });
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
