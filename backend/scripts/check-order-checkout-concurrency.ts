import type { PrismaClient } from "@prisma/client";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  assertFormalDatabaseSchema,
  loadAndValidateFormalEnvironment,
  readFormalDatabaseSchemaEvidence
} from "./check-order-fulfillment-checkout-flow";

type ResultStatus = "completed" | "rejected";

export interface ConcurrentCheckoutEvidence {
  connectionIds: [number, number];
  resultStatuses: [ResultStatus, ResultStatus];
  paymentEvidence: [string | null, string | null];
  orderStatus: string;
  paymentStatus: string;
  checkoutLedgerTransactionId: number | null;
  checkoutAmountNdp: number;
  walletBeforeNdp: number;
  walletAfterNdp: number;
  paymentEventCount: number;
  completedHistoryCount: number;
  paymentTransactionCount: number;
  walletLedgerCount: number;
  paymentAuditCount: number;
  reconciliationCount: number;
}

type ConcurrentFixture = {
  marker: string;
  customerUserId: number;
  technicianUserId: number;
  customerProfileId: number;
  technicianProfileId: number;
  shopId: number;
  categoryId: number;
  serviceId: number;
  scheduleSlotId: number;
  orderId: number;
  walletId: number;
};

type BaselineRow = { rowCount: string; idSum: string; updatedAtMax: Date | null };

const BASELINE_TABLES = [
  "users",
  "customer_profiles",
  "shops",
  "technician_profiles",
  "technician_performance_summaries",
  "categories",
  "services",
  "schedule_slots",
  "booking_orders",
  "order_status_histories",
  "technician_work_events",
  "technician_work_states",
  "order_financials",
  "wallets",
  "ledger_transactions",
  "wallet_ledgers",
  "finance_reconciliations",
  "audit_logs",
  "fee_calculation_logs",
  "wallet_holds",
  "order_service_sessions",
  "order_service_events",
  "order_add_ons",
  "order_checkouts"
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Formal checkout concurrency assertion failed: ${message}`);
}

export function assertConcurrentCheckoutEvidence(evidence: ConcurrentCheckoutEvidence): void {
  assert(
    evidence.connectionIds[0] !== evidence.connectionIds[1],
    "requests did not use independent database connections"
  );
  assert(
    evidence.resultStatuses.every((status) => status === "completed"),
    "both same-key submissions must resolve to the completed checkout"
  );
  assert(
    evidence.paymentEvidence.every((value) => value === "ndp_ledger"),
    "both submissions must resolve to TEST_NDP ledger evidence"
  );
  assert(
    evidence.orderStatus === "COMPLETED" && evidence.paymentStatus === "CONFIRMED",
    "order did not finish with confirmed payment"
  );
  assert(evidence.checkoutLedgerTransactionId !== null, "checkout has no ledger transaction");
  assert(
    evidence.walletAfterNdp === evidence.walletBeforeNdp - evidence.checkoutAmountNdp,
    "wallet was not debited exactly once"
  );
  assert(evidence.paymentEventCount === 1, "payment event was not written exactly once");
  assert(evidence.completedHistoryCount === 1, "completed history was not written exactly once");
  assert(
    evidence.paymentTransactionCount === 1,
    "checkout payment transaction was not written exactly once"
  );
  assert(evidence.walletLedgerCount === 1, "wallet debit ledger was not written exactly once");
  assert(evidence.paymentAuditCount === 1, "payment audit was not written exactly once");
  assert(
    evidence.reconciliationCount === 0,
    "TEST_NDP must not enter production reconciliation"
  );
}

const serializeBaseline = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item);

async function captureExternalBaseline(client: PrismaClient): Promise<Record<string, BaselineRow>> {
  const baseline: Record<string, BaselineRow> = {};
  for (const table of BASELINE_TABLES) {
    const rows = await client.$queryRawUnsafe<BaselineRow[]>(
      `SELECT CAST(COUNT(*) AS CHAR) AS rowCount, CAST(COALESCE(SUM(id), 0) AS CHAR) AS idSum, MAX(updated_at) AS updatedAtMax FROM \`${table}\``
    );
    baseline[table] = rows[0] ?? { rowCount: "0", idSum: "0", updatedAtMax: null };
  }
  const walletTotals = await client.$queryRawUnsafe<BaselineRow[]>(
    "SELECT CAST(COALESCE(SUM(available_balance + frozen_balance), 0) AS CHAR) AS rowCount, CAST(COALESCE(SUM(id), 0) AS CHAR) AS idSum, MAX(updated_at) AS updatedAtMax FROM wallets"
  );
  baseline.walletTotals = walletTotals[0] ?? { rowCount: "0", idSum: "0", updatedAtMax: null };
  return baseline;
}

async function createConcurrentFixture(
  client: PrismaClient,
  now: Date
): Promise<ConcurrentFixture> {
  const marker = `order-concurrency-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountPrefix = String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
  return client.$transaction(async (tx) => {
    const customer = await tx.user.create({ data: {
      needoId: `u${accountPrefix}01`,
      accountNo: `${accountPrefix}01`,
      primaryIdentityType: "U",
      email: `${marker}-customer@example.invalid`,
      username: "Concurrency customer",
      isTestAccount: true
    } });
    const technician = await tx.user.create({ data: {
      needoId: `u${accountPrefix}02`,
      accountNo: `${accountPrefix}02`,
      primaryIdentityType: "U",
      email: `${marker}-technician@example.invalid`,
      username: "Concurrency technician",
      isTestAccount: true
    } });
    const customerProfile = await tx.customerProfile.create({ data: {
      userId: customer.id,
      displayName: "Concurrency customer",
      city: "Tokyo"
    } });
    const shop = await tx.shop.create({ data: {
      name: `Concurrency shop ${marker}`,
      city: "Tokyo",
      address: "Local concurrency checker"
    } });
    const technicianProfile = await tx.technicianProfile.create({ data: {
      userId: technician.id,
      shopId: shop.id,
      displayName: "Concurrency technician",
      city: "Tokyo"
    } });
    const category = await tx.category.create({ data: {
      code: `${marker}-category`,
      name: "Concurrency category"
    } });
    const service = await tx.service.create({ data: {
      categoryId: category.id,
      shopId: shop.id,
      technicianProfileId: technicianProfile.id,
      name: "Concurrency service",
      city: "Tokyo",
      priceAmount: 8_800,
      durationMinutes: 60,
      status: "published"
    } });
    const startsAt = new Date(now.getTime() + 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);
    const slot = await tx.scheduleSlot.create({ data: {
      serviceId: service.id,
      shopId: shop.id,
      technicianProfileId: technicianProfile.id,
      startsAt,
      endsAt,
      bookedCount: 1,
      status: "BOOKED"
    } });
    const order = await tx.bookingOrder.create({ data: {
      orderNo: `NDC${now.getTime()}${Math.random().toString(36).slice(2, 7)}`,
      customerUserId: customer.id,
      serviceId: service.id,
      shopId: shop.id,
      technicianProfileId: technicianProfile.id,
      scheduleSlotId: slot.id,
      status: "CONFIRMED",
      fulfillmentMode: "store",
      priceAmount: 8_800,
      serviceNameSnapshot: "Concurrency service",
      servicePriceSnapshot: 8_800,
      serviceDurationSnapshot: 60,
      serviceSnapshotJson: { serviceId: service.id, marker },
      startsAt,
      endsAt
    } });
    await tx.orderStatusHistory.create({ data: {
      bookingOrderId: order.id,
      fromStatus: "PENDING",
      toStatus: "CONFIRMED",
      actorUserId: technician.id,
      reason: "Formal concurrency checker fixture"
    } });
    await tx.orderFinancial.create({ data: {
      bookingOrderId: order.id,
      customerUserId: customer.id,
      shopId: shop.id,
      technicianProfileId: technicianProfile.id,
      serviceAmountJpy: 8_800,
      ndpCurrency: "TEST_NDP",
      platformFeeEnabledSnapshot: false
    } });
    const wallet = await tx.wallet.create({ data: {
      ownerType: "USER",
      ownerId: customer.id,
      currency: "TEST_NDP",
      availableBalance: 100_000
    } });
    return {
      marker,
      customerUserId: customer.id,
      technicianUserId: technician.id,
      customerProfileId: customerProfile.id,
      technicianProfileId: technicianProfile.id,
      shopId: shop.id,
      categoryId: category.id,
      serviceId: service.id,
      scheduleSlotId: slot.id,
      orderId: order.id,
      walletId: wallet.id
    };
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function cleanupConcurrentFixture(
  client: PrismaClient,
  fixture: ConcurrentFixture
): Promise<void> {
  await client.$transaction(async (tx) => {
    const checkouts = await tx.orderCheckout.findMany({
      where: { bookingOrderId: fixture.orderId },
      select: { id: true, ledgerTransactionId: true }
    });
    const ledgerTransactionIds = checkouts.flatMap((checkout) =>
      checkout.ledgerTransactionId === null ? [] : [checkout.ledgerTransactionId]
    );
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: [fixture.customerUserId, fixture.technicianUserId] } },
          { targetType: "ledger_transaction", targetId: { in: ledgerTransactionIds } }
        ]
      }
    });
    await tx.orderReviewTag.deleteMany({
      where: { orderReview: { bookingOrderId: fixture.orderId } }
    });
    await tx.orderReview.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.reviewSummary.deleteMany({
      where: {
        OR: [
          { customerProfileId: fixture.customerProfileId },
          { technicianProfileId: fixture.technicianProfileId }
        ]
      }
    });
    await tx.technicianPerformanceSummary.deleteMany({
      where: { technicianProfileId: fixture.technicianProfileId }
    });
    await tx.orderServiceEvent.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.orderAddOn.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.orderCheckout.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.orderServiceSession.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.walletHold.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.feeCalculationLog.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.orderStatusHistory.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.technicianWorkEvent.deleteMany({ where: { orderId: fixture.orderId } });
    await tx.orderFinancial.deleteMany({ where: { bookingOrderId: fixture.orderId } });
    await tx.bookingOrder.deleteMany({ where: { id: fixture.orderId } });
    if (ledgerTransactionIds.length > 0) {
      await tx.financeReconciliation.deleteMany({
        where: { transactionId: { in: ledgerTransactionIds } }
      });
      await tx.walletLedger.deleteMany({ where: { transactionId: { in: ledgerTransactionIds } } });
      await tx.ledgerTransaction.deleteMany({ where: { id: { in: ledgerTransactionIds } } });
    }
    await tx.wallet.deleteMany({ where: { id: fixture.walletId } });
    await tx.scheduleSlot.deleteMany({ where: { id: fixture.scheduleSlotId } });
    await tx.service.deleteMany({ where: { id: fixture.serviceId } });
    await tx.technicianWorkState.deleteMany({
      where: { technicianProfileId: fixture.technicianProfileId }
    });
    await tx.technicianProfile.deleteMany({ where: { id: fixture.technicianProfileId } });
    await tx.customerProfile.deleteMany({ where: { id: fixture.customerProfileId } });
    await tx.shop.deleteMany({ where: { id: fixture.shopId } });
    await tx.category.deleteMany({ where: { id: fixture.categoryId } });
    await tx.user.deleteMany({
      where: { id: { in: [fixture.customerUserId, fixture.technicianUserId] } }
    });
  }, { maxWait: 10_000, timeout: 30_000 });
}

async function runConcurrentCheckoutCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;

  const prismaModule = await import("../src/prisma/client");
  const [
    bookingModule,
    bookingRepositoryModule,
    ledgerModule,
    ledgerRepositoryModule,
    auditModule,
    auditRepositoryModule,
    rateModule,
    rateRepositoryModule
  ] = await Promise.all([
    import("../src/services/booking.service"),
    import("../src/repositories/booking.repository"),
    import("../src/services/ledger.service"),
    import("../src/repositories/ledger.repository"),
    import("../src/services/audit-log.service"),
    import("../src/repositories/audit-log.repository"),
    import("../src/services/ndp-exchange-rate.service"),
    import("../src/repositories/ndp-exchange-rate.repository")
  ]);
  const primary = prismaModule.prisma;
  const clientA = prismaModule.createPrismaClient();
  const clientB = prismaModule.createPrismaClient();
  let fixture: ConcurrentFixture | null = null;
  let operationFailure: unknown = null;
  let passSummary: Record<string, unknown> | null = null;
  const baselineBefore = await captureExternalBaseline(primary);

  const createService = (client: PrismaClient) => {
    const audit = new auditModule.AuditLogService(
      new auditRepositoryModule.AuditLogRepository(client)
    );
    const ledger = new ledgerModule.LedgerService(
      new ledgerRepositoryModule.LedgerRepository(client)
    );
    const rate = new rateModule.NdpExchangeRateService(
      new rateRepositoryModule.NdpExchangeRateRepository(client),
      audit
    );
    return new bookingModule.BookingService(
      new bookingRepositoryModule.BookingRepository(client),
      ledger,
      undefined,
      audit,
      undefined,
      rate,
      () => new Date()
    );
  };

  try {
    assertFormalDatabaseSchema(await readFormalDatabaseSchemaEvidence(primary));
    const effectiveRate = await primary.ndpExchangeRateRule.findFirst({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }]
      },
      select: { id: true }
    });
    assert(effectiveRate !== null, "no effective NDP exchange rate is available");
    fixture = await createConcurrentFixture(primary, new Date());
    await Promise.all([clientA.$connect(), clientB.$connect()]);

    const connectionRows = await Promise.all([
      clientA.$queryRawUnsafe<Array<{ connectionId: bigint | number }>>(
        "SELECT CONNECTION_ID() AS connectionId"
      ),
      clientB.$queryRawUnsafe<Array<{ connectionId: bigint | number }>>(
        "SELECT CONNECTION_ID() AS connectionId"
      )
    ]);
    const connectionIds: [number, number] = [
      Number(connectionRows[0][0]?.connectionId),
      Number(connectionRows[1][0]?.connectionId)
    ];
    assert(
      Number.isInteger(connectionIds[0]) && Number.isInteger(connectionIds[1]),
      "database connection identifiers are unavailable"
    );

    const customer: AuthenticatedAccessContext = {
      userId: fixture.customerUserId,
      email: `${fixture.marker}-customer@example.invalid`,
      accessTokenJti: `${fixture.marker}-customer-token`,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
      roles: ["customer"],
      permissions: [
        "order:detail:read",
        "order:service:start",
        "order:service:end",
        "order:checkout:read",
        "order:checkout:payment-method:write",
        "order:checkout:ndp:pay"
      ],
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: fixture.customerProfileId
    };
    const context = { ip: "127.0.0.1", userAgent: "order-checkout-concurrency-checker" };
    const serviceA = createService(clientA);
    const serviceB = createService(clientB);

    await serviceA.startService(customer, fixture.orderId, {
      actor: "customer",
      idempotencyKey: `${fixture.marker}-start`
    }, context);
    await serviceA.endService(customer, fixture.orderId, {
      reason: "completed",
      idempotencyKey: `${fixture.marker}-end`
    }, context);
    const checkout = await serviceA.getCheckout(customer, fixture.orderId);
    await serviceA.selectCheckoutPaymentMethod(customer, fixture.orderId, {
      method: "ndp",
      idempotencyKey: `${fixture.marker}-select`
    }, context);
    const walletBefore = await primary.wallet.findUniqueOrThrow({
      where: { id: fixture.walletId }
    });
    const paymentInput = { idempotencyKey: `${fixture.marker}-same-payment` };
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
    const submit = async (service: ReturnType<typeof createService>) => {
      await gate;
      return service.payCheckoutWithNdp(customer, fixture!.orderId, paymentInput, context);
    };
    const submissions = [submit(serviceA), submit(serviceB)] as const;
    releaseGate();
    const results = await Promise.allSettled(submissions);

    const persistedCheckout = await primary.orderCheckout.findUniqueOrThrow({
      where: { id: checkout.id }
    });
    const paymentTransactions = await primary.ledgerTransaction.findMany({
      where: {
        referenceType: "order_checkout_payment",
        referenceId: checkout.id,
        deletedAt: null
      },
      select: { id: true }
    });
    const transactionIds = paymentTransactions.map((transaction) => transaction.id);
    const [order, walletAfter, paymentEventCount, completedHistoryCount,
      walletLedgerCount, paymentAuditCount, reconciliationCount] = await Promise.all([
      primary.bookingOrder.findUniqueOrThrow({
        where: { id: fixture.orderId },
        select: { status: true, paymentStatus: true }
      }),
      primary.wallet.findUniqueOrThrow({ where: { id: fixture.walletId } }),
      primary.orderServiceEvent.count({
        where: {
          bookingOrderId: fixture.orderId,
          eventType: "NDP_PAYMENT_APPLIED",
          deletedAt: null
        }
      }),
      primary.orderStatusHistory.count({
        where: { bookingOrderId: fixture.orderId, toStatus: "COMPLETED", deletedAt: null }
      }),
      primary.walletLedger.count({
        where: { transactionId: { in: transactionIds }, deletedAt: null }
      }),
      primary.auditLog.count({
        where: {
          action: "ledger.checkout.ndp_payment",
          targetType: "ledger_transaction",
          targetId: { in: transactionIds },
          deletedAt: null
        }
      }),
      primary.financeReconciliation.count({
        where: { transactionId: { in: transactionIds }, deletedAt: null }
      })
    ]);
    const resultStatuses = results.map((result): ResultStatus =>
      result.status === "fulfilled" && result.value.status === "completed"
        ? "completed"
        : "rejected"
    ) as [ResultStatus, ResultStatus];
    const paymentEvidence = results.map((result) =>
      result.status === "fulfilled" ? result.value.paymentEvidence : null
    ) as [string | null, string | null];
    const evidence: ConcurrentCheckoutEvidence = {
      connectionIds,
      resultStatuses,
      paymentEvidence,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      checkoutLedgerTransactionId: persistedCheckout.ledgerTransactionId,
      checkoutAmountNdp: persistedCheckout.payableNdp,
      walletBeforeNdp: walletBefore.availableBalance,
      walletAfterNdp: walletAfter.availableBalance,
      paymentEventCount,
      completedHistoryCount,
      paymentTransactionCount: paymentTransactions.length,
      walletLedgerCount,
      paymentAuditCount,
      reconciliationCount
    };
    assertConcurrentCheckoutEvidence(evidence);
    passSummary = {
      status: "PASS",
      check: "TEST_NDP concurrent checkout",
      independentConnections: true,
      submissions: 2,
      walletDebitCount: 1,
      ledgerTransactionCount: paymentTransactions.length,
      paymentEventCount,
      productionReconciliationCount: reconciliationCount
    };
  } catch (error) {
    operationFailure = error;
  }

  let cleanupFailure: unknown = null;
  try {
    await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()]);
    if (fixture) await cleanupConcurrentFixture(primary, fixture);
    const baselineAfter = await captureExternalBaseline(primary);
    if (serializeBaseline(baselineAfter) !== serializeBaseline(baselineBefore)) {
      const changedKeys = Array.from(
        new Set([...Object.keys(baselineBefore), ...Object.keys(baselineAfter)])
      ).filter(
        (key) => serializeBaseline(baselineBefore[key]) !== serializeBaseline(baselineAfter[key])
      );
      cleanupFailure = new Error(
        `External database baseline changed after concurrency cleanup: ${changedKeys.join(", ")}`
      );
    }
  } catch (error) {
    cleanupFailure = error;
  } finally {
    await primary.$disconnect();
  }

  if (operationFailure && cleanupFailure) {
    throw new AggregateError(
      [operationFailure, cleanupFailure],
      "Concurrent checkout failed and cleanup did not restore the database baseline"
    );
  }
  if (operationFailure) throw operationFailure;
  if (cleanupFailure) throw cleanupFailure;
  if (passSummary) {
    process.stdout.write(`${JSON.stringify(passSummary)}\n`);
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runConcurrentCheckoutCheck().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Checkout concurrency check failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
