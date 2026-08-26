import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { assertSafeAffiliateCompletionDatabase } from "./lib/assert-safe-affiliate-completion-database";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  const databaseName = assertSafeAffiliateCompletionDatabase();
  const [
    { AffiliateTaskExpiryRepository },
    { AffiliateTaskExpiryService },
    { LedgerRepository },
    { LedgerService },
    { prisma, disconnectPrisma }
  ] = await Promise.all([
    import("../src/repositories/affiliate-task-expiry.repository"),
    import("../src/services/affiliate-task-expiry.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/ledger.service"),
    import("../src/prisma/client")
  ]);

  const marker = `affiliate-task-expiry-${Date.now()}-${process.pid}`;
  const taskIds: number[] = [];
  const ledgerTransactionIds: number[] = [];
  let userId: number | null = null;
  let shopId: number | null = null;
  let walletId: number | null = null;
  let result: Record<string, unknown> | null = null;

  try {
    const now = new Date();
    const startsAt = new Date(now.getTime() - 120_000);
    const dueAt = new Date(now.getTime() - 60_000);
    const laterAt = new Date(now.getTime() + 60_000);
    const user = await prisma.user.create({
      data: {
        email: `${marker}@needo.test`,
        username: marker,
        passwordHash: "acceptance-script-no-login"
      }
    });
    userId = user.id;
    const shop = await prisma.shop.create({
      data: {
        ownerUserId: user.id,
        name: `${marker} shop`,
        city: "Tokyo",
        address: "Local affiliate expiry acceptance",
        status: "published",
        pricingMode: "MERCHANT"
      }
    });
    shopId = shop.id;
    const wallet = await prisma.wallet.create({
      data: {
        ownerType: "SHOP",
        ownerId: shop.id,
        availableBalance: 600,
        frozenBalance: 3_800
      }
    });
    walletId = wallet.id;

    const createTask = async (input: {
      label: string;
      status: "ACTIVE" | "ENDED";
      endsAt: Date;
      total: number;
      allocated: number;
      captured: number;
      released: number;
    }) => {
      const task = await prisma.affiliateTask.create({
        data: {
          taskCode: `${marker}-${input.label}`,
          lineageKey: `${marker}-${input.label}`,
          publisherType: "SHOP",
          publisherShopId: shop.id,
          name: `${marker} ${input.label}`,
          rewardNdpPerCompletedOrder: 100,
          totalBudgetNdp: input.total,
          reservedBudgetNdp: input.total,
          allocatedBudgetNdp: input.allocated,
          settledBudgetNdp: input.captured,
          releasedBudgetNdp: input.released,
          customerDiscountType: "NONE",
          claimStartsAt: startsAt,
          claimEndsAt: input.endsAt,
          taskStartsAt: startsAt,
          taskEndsAt: input.endsAt,
          attributionWindowDays: 14,
          serviceScopeMode: "SELECTED_SERVICES",
          status: input.status,
          activatedAt: dueAt,
          endedAt: input.status === "ENDED" ? dueAt : null,
          budgetReservation: {
            create: {
              walletId: wallet.id,
              totalFrozenNdp: input.total,
              allocatedNdp: input.allocated,
              capturedNdp: input.captured,
              releasedNdp: input.released,
              status: "ACTIVE",
              idempotencyKey: `${marker}-${input.label}-reservation`
            }
          }
        }
      });
      taskIds.push(task.id);
      return task;
    };

    // fully unallocated due task
    const fullyUnallocated = await createTask({
      label: "fully-unallocated",
      status: "ACTIVE",
      endsAt: dueAt,
      total: 1_000,
      allocated: 0,
      captured: 0,
      released: 0
    });
    // partially allocated and captured due task
    const partial = await createTask({
      label: "partial",
      status: "ACTIVE",
      endsAt: dueAt,
      total: 2_000,
      allocated: 500,
      captured: 700,
      released: 0
    });
    // ended task later incremental release
    const laterIncremental = await createTask({
      label: "later-incremental",
      status: "ENDED",
      endsAt: dueAt,
      total: 1_200,
      allocated: 500,
      captured: 400,
      released: 300
    });
    const zeroUnallocated = await createTask({
      label: "zero-unallocated",
      status: "ACTIVE",
      endsAt: dueAt,
      total: 1_000,
      allocated: 0,
      captured: 1_000,
      released: 0
    });
    const concurrent = await createTask({
      label: "concurrent",
      status: "ACTIVE",
      endsAt: laterAt,
      total: 1_000,
      allocated: 0,
      captured: 0,
      released: 0
    });

    const expiry = new AffiliateTaskExpiryService(
      new AffiliateTaskExpiryRepository(prisma),
      new LedgerService(new LedgerRepository(prisma))
    );
    const initialSummary = await expiry.expireDue({ now, batchSize: 10 });
    assert(
      initialSummary.scanned === 3 &&
        initialSummary.ended === 3 &&
        initialSummary.released === 2 &&
        initialSummary.failed === 0 &&
        initialSummary.releasedNdp === 1_800,
      "initial expiry batch summary is incorrect"
    );

    const [fullTask, fullReservation, partialTask, partialReservation, zeroTask, zeroReservation] =
      await Promise.all([
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: fullyUnallocated.id } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId: fullyUnallocated.id } }),
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: partial.id } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId: partial.id } }),
        prisma.affiliateTask.findUniqueOrThrow({ where: { id: zeroUnallocated.id } }),
        prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId: zeroUnallocated.id } })
      ]);
    assert(
      fullTask.status === "ENDED" &&
        fullTask.endedAt !== null &&
        fullTask.releasedBudgetNdp === 1_000 &&
        fullReservation.allocatedNdp === 0 &&
        fullReservation.capturedNdp === 0 &&
        fullReservation.releasedNdp === 1_000 &&
        fullReservation.status === "RELEASED",
      "fully unallocated due task did not end and release its full budget"
    );
    assert(
      partialTask.status === "ENDED" &&
        partialTask.endedAt !== null &&
        partialTask.allocatedBudgetNdp === 500 &&
        partialTask.settledBudgetNdp === 700 &&
        partialTask.releasedBudgetNdp === 800 &&
        partialReservation.allocatedNdp === 500 &&
        partialReservation.capturedNdp === 700 &&
        partialReservation.releasedNdp === 800 &&
        partialReservation.status === "ACTIVE",
      "partially allocated and captured due task did not preserve allocation and release only unallocated budget"
    );
    assert(
      zeroTask.status === "ENDED" &&
        zeroTask.endedAt !== null &&
        zeroTask.releasedBudgetNdp === 0 &&
        zeroReservation.releasedNdp === 0 &&
        zeroReservation.status === "RELEASED" &&
        zeroReservation.releasedAt !== null &&
        (await prisma.ledgerTransaction.count({
          where: {
            type: "AFFILIATE_TASK_BUDGET_RELEASE",
            referenceType: "affiliate_task",
            referenceId: zeroUnallocated.id,
            deletedAt: null
          }
        })) === 0,
      "zero-unallocated task did not create an empty release ledger transaction"
    );

    await prisma.$transaction(async (transaction) => {
      await transaction.affiliateTask.update({
        where: { id: laterIncremental.id },
        data: { allocatedBudgetNdp: 0 }
      });
      await transaction.affiliateBudgetReservation.update({
        where: { taskId: laterIncremental.id },
        data: { allocatedNdp: 0 }
      });
    });
    const incrementalSummary = await expiry.expireDue({ now, batchSize: 10 });
    const [incrementalTask, incrementalReservation] = await Promise.all([
      prisma.affiliateTask.findUniqueOrThrow({ where: { id: laterIncremental.id } }),
      prisma.affiliateBudgetReservation.findUniqueOrThrow({ where: { taskId: laterIncremental.id } })
    ]);
    assert(
      incrementalSummary.scanned === 1 &&
        incrementalSummary.ended === 0 &&
        incrementalSummary.released === 1 &&
        incrementalSummary.failed === 0 &&
        incrementalSummary.releasedNdp === 500 &&
        incrementalTask.status === "ENDED" &&
        incrementalTask.endedAt !== null &&
        incrementalTask.allocatedBudgetNdp === 0 &&
        incrementalTask.settledBudgetNdp === 400 &&
        incrementalTask.releasedBudgetNdp === 800 &&
        incrementalReservation.allocatedNdp === 0 &&
        incrementalReservation.capturedNdp === 400 &&
        incrementalReservation.releasedNdp === 800 &&
        incrementalReservation.status === "RELEASED",
      "ended task later incremental release did not preserve cumulative budget state"
    );

    await prisma.affiliateTask.update({
      where: { id: concurrent.id },
      data: { taskEndsAt: dueAt, claimEndsAt: dueAt }
    });
    const concurrentRuns = await Promise.allSettled([
      expiry.expireDue({ now, batchSize: 10 }),
      expiry.expireDue({ now, batchSize: 10 })
    ]);
    assert(
      concurrentRuns.every((run) => run.status === "fulfilled") &&
        concurrentRuns.reduce(
          (total, run) => total + (run.status === "fulfilled" ? run.value.released : 0),
          0
        ) === 1 &&
        concurrentRuns.reduce(
          (total, run) => total + (run.status === "fulfilled" ? run.value.releasedNdp : 0),
          0
        ) === 1_000,
      "concurrent expireDue calls did not produce exactly one release"
    );

    const releaseTransactions = await prisma.ledgerTransaction.findMany({
      where: {
        type: "AFFILIATE_TASK_BUDGET_RELEASE",
        referenceType: "affiliate_task",
        referenceId: { in: taskIds },
        deletedAt: null
      },
      include: { entries: true, reconciliation: true, affiliateBudgetTransactions: true }
    });
    ledgerTransactionIds.push(...releaseTransactions.map((transaction) => transaction.id));
    assert(
      releaseTransactions.length === 4 &&
        releaseTransactions.every(
          (transaction) =>
            transaction.actorUserId === null &&
            transaction.entries.length === 1 &&
            transaction.entries[0].availableDelta === transaction.amount &&
            transaction.entries[0].frozenDelta === -transaction.amount &&
            transaction.entries[0].reason === "affiliate_task_budget_release" &&
            transaction.reconciliation?.differenceAmount === 0 &&
            transaction.affiliateBudgetTransactions.length === 1 &&
            transaction.affiliateBudgetTransactions[0].kind === "RELEASE" &&
            transaction.affiliateBudgetTransactions[0].amountNdp === transaction.amount
        ),
      "affiliate_task_budget_release LedgerTransaction, WalletLedger, FinanceReconciliation, or budget links are incomplete"
    );
    const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    assert(
      walletAfter.availableBalance === 3_900 && walletAfter.frozenBalance === 500,
      "expiry releases did not produce exact wallet balances"
    );
    const auditRows = await prisma.auditLog.findMany({
      where: {
        actorId: null,
        deletedAt: null,
        OR: [
          { targetType: "affiliate_task", targetId: { in: taskIds } },
          { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
        ]
      }
    });
    assert(
      auditRows.filter((audit) => audit.action === "affiliate.task.expired").length === 4 &&
        auditRows.filter((audit) => audit.action === "affiliate.task.expiry_budget_released").length === 4 &&
        auditRows.filter((audit) => audit.action === "ledger.affiliate_task_budget.release").length === 4,
      "actor-null expiry and ledger AuditLog evidence is incomplete"
    );
    const repeatedSummary = await expiry.expireDue({ now, batchSize: 10 });
    assert(
      repeatedSummary.scanned === 0 &&
        repeatedSummary.ended === 0 &&
        repeatedSummary.released === 0 &&
        repeatedSummary.failed === 0 &&
        repeatedSummary.releasedNdp === 0 &&
        (await prisma.ledgerTransaction.count({
          where: {
            type: "AFFILIATE_TASK_BUDGET_RELEASE",
            referenceType: "affiliate_task",
            referenceId: { in: taskIds },
            deletedAt: null
          }
        })) === 4,
      "repeated expiry execution was not idempotent"
    );

    result = {
      database: databaseName,
      marker,
      expiry: { full: true, partial: true, laterIncremental: true, zeroRelease: true },
      concurrency: { exactlyOneRelease: true },
      finance: { ledgerTransactions: 4, reconciled: true, audited: true },
      cleanup: "pending",
      status: "ok"
    };
  } finally {
    await prisma.$transaction(async (transaction) => {
      const markerTaskIds = await transaction.affiliateTask.findMany({
        where: { taskCode: { startsWith: marker } },
        select: { id: true }
      });
      for (const task of markerTaskIds) {
        if (!taskIds.includes(task.id)) taskIds.push(task.id);
      }
      const markerLedgerTransactions =
        taskIds.length > 0
          ? await transaction.ledgerTransaction.findMany({
              where: {
                type: "AFFILIATE_TASK_BUDGET_RELEASE",
                referenceType: "affiliate_task",
                referenceId: { in: taskIds }
              },
              select: { id: true }
            })
          : [];
      for (const transactionRow of markerLedgerTransactions) {
        if (!ledgerTransactionIds.includes(transactionRow.id)) {
          ledgerTransactionIds.push(transactionRow.id);
        }
      }
      if (taskIds.length > 0 || ledgerTransactionIds.length > 0) {
        await transaction.auditLog.deleteMany({
          where: {
            OR: [
              { targetType: "affiliate_task", targetId: { in: taskIds } },
              { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
            ]
          }
        });
      }
      if (ledgerTransactionIds.length > 0) {
        await transaction.affiliateBudgetTransaction.deleteMany({
          where: { ledgerTransactionId: { in: ledgerTransactionIds } }
        });
        await transaction.financeReconciliation.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.walletLedger.deleteMany({
          where: { transactionId: { in: ledgerTransactionIds } }
        });
        await transaction.ledgerTransaction.deleteMany({ where: { id: { in: ledgerTransactionIds } } });
      }
      if (taskIds.length > 0) {
        await transaction.affiliateBudgetReservation.deleteMany({ where: { taskId: { in: taskIds } } });
        await transaction.affiliateTask.deleteMany({ where: { id: { in: taskIds } } });
      }
      if (walletId !== null) await transaction.wallet.deleteMany({ where: { id: walletId } });
      if (shopId !== null) await transaction.shop.deleteMany({ where: { id: shopId } });
      if (userId !== null) await transaction.user.deleteMany({ where: { id: userId } });
    });
    const cleanupCounts = await Promise.all([
      prisma.user.count({ where: { email: { startsWith: marker } } }),
      prisma.shop.count({ where: { name: { startsWith: marker } } }),
      prisma.affiliateTask.count({ where: { taskCode: { startsWith: marker } } }),
      prisma.affiliateBudgetReservation.count({ where: { taskId: { in: taskIds } } }),
      prisma.ledgerTransaction.count({ where: { id: { in: ledgerTransactionIds } } })
    ]);
    assert(cleanupCounts.every((count) => count === 0), "marker cleanup left affiliate expiry rows behind");
    await disconnectPrisma();
  }

  assert(result !== null, "affiliate expiry acceptance did not complete");
  console.log(JSON.stringify({ ...result, cleanup: "exact" }));
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
