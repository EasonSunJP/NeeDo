import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

type Environment = Record<string, string | undefined>;

export interface FormalEnvironmentFileSystem {
  resolve: (value: string) => string;
  existsSync: (value: string) => boolean;
  readFileSync: (value: string) => string;
}

export interface FormalEnvironment {
  envFilePath: string;
  databaseUrl: string;
  databaseHost: string;
  databaseName: string;
  values: Record<string, string>;
}

export interface FormalDatabaseSchemaEvidence {
  appliedMigrations: string[];
  tables: string[];
  columns: string[];
  constraints: string[];
  indexes: string[];
  columnCollations: Record<string, string | null>;
}

const REQUIRED_MIGRATIONS = [
  "20260901090000_order_fulfillment_checkout",
  "20260901101500_order_review_idempotency"
] as const;
const REQUIRED_TABLES = [
  "users",
  "customer_profiles",
  "shops",
  "technician_profiles",
  "categories",
  "services",
  "schedule_slots",
  "booking_orders",
  "order_status_histories",
  "order_financials",
  "wallets",
  "ledger_transactions",
  "wallet_ledgers",
  "finance_reconciliations",
  "audit_logs",
  "review_summaries",
  "ndp_exchange_rate_rules",
  "order_service_sessions",
  "order_service_events",
  "order_add_ons",
  "order_checkouts",
  "order_reviews",
  "order_review_tags"
] as const;
const REQUIRED_COLUMNS = [
  "order_service_sessions.verification_hash",
  "order_service_events.idempotency_key",
  "order_add_ons.service_snapshot_json",
  "order_checkouts.calculation_snapshot_json",
  "order_checkouts.rate_snapshot_json",
  "order_checkouts.ledger_transaction_id",
  "order_reviews.idempotency_key",
  "order_reviews.request_fingerprint"
] as const;
const REQUIRED_CONSTRAINTS = [
  "order_service_events.order_service_events_shape_chk",
  "order_checkouts.order_checkouts_total_chk",
  "order_checkouts.order_checkouts_receipt_evidence_chk"
] as const;
const REQUIRED_INDEXES = [
  "order_service_events.order_service_events_idempotency_key",
  "order_checkouts.order_checkouts_booking_order_key",
  "order_reviews.order_reviews_idempotency_key_key",
  "order_review_tags.order_review_tags_order_review_id_label_key"
] as const;

const productionEnvironment = /^(?:prod|production|staging)$/i;
const productionDatabaseName = /(?:prod(?:uction)?|staging|live)/i;
const allowedDatabasePurpose = /(?:test|dev|local)/i;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

const defaultFileSystem: FormalEnvironmentFileSystem = {
  resolve,
  existsSync,
  readFileSync: (value) => readFileSync(value, "utf8")
};

export function loadAndValidateFormalEnvironment(
  runtimeEnvironment: Environment,
  fileSystem: FormalEnvironmentFileSystem = defaultFileSystem
): FormalEnvironment {
  const requestedPath = runtimeEnvironment.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requestedPath) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const envFilePath = fileSystem.resolve(requestedPath);
  if (!fileSystem.existsSync(envFilePath)) {
    throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  }
  const parsed = parse(fileSystem.readFileSync(envFilePath));
  const values = { ...runtimeEnvironment, ...parsed } as Record<string, string>;
  for (const name of ["NODE_ENV", "DEPLOY_ENV"] as const) {
    if (productionEnvironment.test(values[name]?.trim() ?? "")) {
      throw new Error("Formal order checker refuses a production environment");
    }
  }
  const databaseUrl = parsed.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required in FORMAL_BACKEND_ENV_FILE");
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL URL");
  }
  if (target.protocol !== "mysql:") throw new Error("DATABASE_URL must use MySQL");
  const databaseHost = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!loopbackHosts.has(databaseHost)) {
    throw new Error("DATABASE_URL must use a loopback MySQL host");
  }
  const databaseName = decodeURIComponent(target.pathname.replace(/^\/+/, "")).trim();
  if (!databaseName || !allowedDatabasePurpose.test(databaseName)) {
    throw new Error("Database name must contain test, dev, or local");
  }
  if (productionDatabaseName.test(databaseName)) {
    throw new Error("Database name is production-looking");
  }
  return { envFilePath, databaseUrl, databaseHost, databaseName, values };
}

export function assertFormalDatabaseSchema(evidence: FormalDatabaseSchemaEvidence): void {
  const missing = [
    ...REQUIRED_MIGRATIONS.filter((name) => !evidence.appliedMigrations.includes(name)),
    ...REQUIRED_TABLES.filter((name) => !evidence.tables.includes(name)),
    ...REQUIRED_COLUMNS.filter((name) => !evidence.columns.includes(name)),
    ...REQUIRED_CONSTRAINTS.filter((name) => !evidence.constraints.includes(name)),
    ...REQUIRED_INDEXES.filter((name) => !evidence.indexes.includes(name))
  ];
  if (missing.length > 0) {
    throw new Error(`Formal order schema preflight failed: ${missing.join(", ")}`);
  }
  if (evidence.columnCollations["order_review_tags.label"] !== "utf8mb4_bin") {
    throw new Error("Formal order schema preflight failed: order_review_tags.label must use utf8mb4_bin");
  }
}

type TransactionCallback<TTransaction extends object, TResult> = (
  transaction: TTransaction
) => Promise<TResult>;

export type TransactionBoundPrismaFacade<TTransaction extends object> = TTransaction & {
  $transaction: <TResult>(callback: TransactionCallback<TTransaction, TResult>) => Promise<TResult>;
};

export function createTransactionBoundPrismaFacade<TTransaction extends object>(
  transaction: TTransaction
): TransactionBoundPrismaFacade<TTransaction> {
  return new Proxy(transaction, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async <TResult>(callback: TransactionCallback<TTransaction, TResult>) => {
          if (typeof callback !== "function") {
            throw new Error("Transaction-bound facade requires a callback transaction");
          }
          return callback(transaction);
        };
      }
      if (property === "$connect" || property === "$disconnect") {
        return async () => {
          throw new Error("Transaction-bound facade cannot manage the global connection");
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as TransactionBoundPrismaFacade<TTransaction>;
}

export async function resolveFixtureLedgerCurrency(
  transaction: Prisma.TransactionClient,
  userId: number
): Promise<"NDP" | "TEST_NDP"> {
  const [{ LedgerCurrencyService }, { LedgerRepository }] = await Promise.all([
    import("../src/services/ledger-currency.service"),
    import("../src/repositories/ledger.repository")
  ]);
  const facade = createTransactionBoundPrismaFacade(transaction) as unknown as PrismaClient;
  return new LedgerCurrencyService(new LedgerRepository(facade)).resolveForUser(userId);
}

export type CashNoDebitEvidence = {
  checkoutId: number;
  walletAvailableBalance: number;
  walletFrozenBalance: number;
  ledgerTransactionCount: number;
  walletLedgerCount: number;
  reconciliationCount: number;
};

export async function captureCashNoDebitEvidence(
  transaction: Pick<
    Prisma.TransactionClient,
    "orderCheckout" | "wallet" | "ledgerTransaction" | "walletLedger" | "financeReconciliation"
  >,
  orderId: number,
  customerUserId: number,
  currency: "NDP" | "TEST_NDP"
): Promise<CashNoDebitEvidence> {
  const checkout = await transaction.orderCheckout.findUnique({
    where: { bookingOrderId: orderId },
    select: { id: true }
  });
  if (!checkout) throw new Error("Formal order checker cash checkout is missing");
  const [wallet, ledgerTransactionCount, walletLedgerCount, reconciliationCount] =
    await Promise.all([
      transaction.wallet.findUnique({
        where: {
          ownerType_ownerId_currency: {
            ownerType: "USER", ownerId: customerUserId, currency
          }
        },
        select: { availableBalance: true, frozenBalance: true }
      }),
      transaction.ledgerTransaction.count({
        where: { referenceType: "order_checkout_payment", referenceId: checkout.id, currency }
      }),
      transaction.walletLedger.count({
        where: {
          wallet: { ownerType: "USER", ownerId: customerUserId, currency },
          transaction: {
            referenceType: "order_checkout_payment", referenceId: checkout.id, currency
          }
        }
      }),
      transaction.financeReconciliation.count({
        where: { referenceType: "order_checkout_payment", referenceId: checkout.id, currency }
      })
    ]);
  if (!wallet) throw new Error("Formal order checker customer wallet is missing");
  return {
    checkoutId: checkout.id,
    walletAvailableBalance: wallet.availableBalance,
    walletFrozenBalance: wallet.frozenBalance,
    ledgerTransactionCount,
    walletLedgerCount,
    reconciliationCount
  };
}

export function assertNoCashDebit(
  before: CashNoDebitEvidence,
  after: CashNoDebitEvidence
): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("Formal order checker assertion failed: cash payment changed wallet or checkout ledger evidence");
  }
}

export function assertDeepSnapshotEqual(
  before: unknown,
  after: unknown,
  label: string
): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Formal order checker assertion failed: ${label} left partial writes`);
  }
}

export class RollbackCompleted extends Error {
  public constructor() {
    super("ROLLBACK_COMPLETED");
    this.name = "RollbackCompleted";
  }
}

interface RollbackClient<TTransaction extends object> {
  $transaction: (
    callback: TransactionCallback<TTransaction, void>,
    options?: { maxWait?: number; timeout?: number }
  ) => Promise<unknown>;
}

export async function runRollbackOnlyTransaction<TTransaction extends object, TBaseline>(
  client: RollbackClient<TTransaction>,
  captureBaseline: () => Promise<TBaseline>,
  flow: TransactionCallback<TTransaction, void>
): Promise<void> {
  const before = await captureBaseline();
  let rolledBack = false;
  try {
    await client.$transaction(
      async (transaction) => {
        await flow(transaction);
        throw new RollbackCompleted();
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error) {
    if (!(error instanceof RollbackCompleted)) throw error;
    rolledBack = true;
  }
  if (!rolledBack) throw new Error("Rollback-only transaction committed unexpectedly");
  const after = await captureBaseline();
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error("External database baseline changed after rollback");
  }
}

type NameRow = { name: string };
type ColumnRow = { tableName: string; columnName: string; collationName: string | null };

export async function readFormalDatabaseSchemaEvidence(
  client: Pick<PrismaClient, "$queryRaw">
): Promise<FormalDatabaseSchemaEvidence> {
  const migrations = await client.$queryRaw<NameRow[]>`
    SELECT migration_name AS name
      FROM _prisma_migrations
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  const tables = await client.$queryRaw<NameRow[]>`
    SELECT table_name AS name
      FROM information_schema.tables
     WHERE table_schema = DATABASE()
  `;
  const columns = await client.$queryRaw<ColumnRow[]>`
    SELECT table_name AS tableName, column_name AS columnName, collation_name AS collationName
      FROM information_schema.columns
     WHERE table_schema = DATABASE()
  `;
  const constraints = await client.$queryRaw<Array<{ tableName: string; name: string }>>`
    SELECT table_name AS tableName, constraint_name AS name
      FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE()
  `;
  const indexes = await client.$queryRaw<Array<{ tableName: string; name: string }>>`
    SELECT DISTINCT table_name AS tableName, index_name AS name
      FROM information_schema.statistics
     WHERE table_schema = DATABASE()
  `;
  return {
    appliedMigrations: migrations.map((row) => row.name),
    tables: tables.map((row) => row.name),
    columns: columns.map((row) => `${row.tableName}.${row.columnName}`),
    constraints: constraints.map((row) => `${row.tableName}.${row.name}`),
    indexes: indexes.map((row) => `${row.tableName}.${row.name}`),
    columnCollations: Object.fromEntries(
      columns.map((row) => [`${row.tableName}.${row.columnName}`, row.collationName])
    )
  };
}

const BASELINE_TABLES = [
  "users", "customer_profiles", "shops", "technician_profiles", "categories", "services",
  "schedule_slots", "booking_orders", "order_status_histories", "order_financials", "wallets",
  "ledger_transactions", "wallet_ledgers", "finance_reconciliations", "audit_logs",
  "ndp_exchange_rate_rules", "order_service_sessions", "order_service_events", "order_add_ons",
  "order_checkouts", "order_reviews", "order_review_tags", "review_summaries"
] as const;

type BaselineRow = { rowCount: string; idSum: string; updatedAtMax: Date | null };

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

type CheckerFixture = {
  marker: string;
  customer: Prisma.UserGetPayload<Record<string, never>>;
  technician: Prisma.UserGetPayload<Record<string, never>>;
  customerProfileId: number;
  technicianProfileId: number;
  shopId: number;
  serviceId: number;
  addOnServiceId: number;
  rateId: number;
  rateVersion: number;
  rateEffectiveFrom: Date;
};

async function createCheckerFixture(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<CheckerFixture> {
  const marker = `order-flow-${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const customer = await tx.user.create({ data: {
    needoId: `${marker}-customer`, email: `${marker}-customer@example.invalid`,
    username: "Formal flow customer", isTestAccount: false
  } });
  const technician = await tx.user.create({ data: {
    needoId: `${marker}-technician`, email: `${marker}-technician@example.invalid`,
    username: "Formal flow technician", isTestAccount: true
  } });
  const customerProfile = await tx.customerProfile.create({ data: {
    userId: customer.id, displayName: "Formal flow customer", city: "Tokyo"
  } });
  const shop = await tx.shop.create({ data: {
    name: `Formal flow shop ${marker}`, city: "Tokyo", address: "Local rollback fixture"
  } });
  const technicianProfile = await tx.technicianProfile.create({ data: {
    userId: technician.id, shopId: shop.id, displayName: "Formal flow technician", city: "Tokyo"
  } });
  const category = await tx.category.create({ data: {
    code: `${marker}-category`, name: "Formal flow category"
  } });
  const service = await tx.service.create({ data: {
    categoryId: category.id, shopId: shop.id, technicianProfileId: technicianProfile.id,
    name: "Formal service", city: "Tokyo", priceAmount: 8_800, durationMinutes: 60,
    status: "published"
  } });
  const addOn = await tx.service.create({ data: {
    categoryId: category.id, shopId: shop.id, technicianProfileId: technicianProfile.id,
    name: "Formal add-on", city: "Tokyo", priceAmount: 2_200, durationMinutes: 30,
    status: "published"
  } });
  const previousRates = await tx.ndpExchangeRateRule.findMany({
    where: { status: "ACTIVE", deletedAt: null }
  });
  await tx.ndpExchangeRateRule.updateMany({
    where: { status: "ACTIVE", deletedAt: null },
    data: { status: "SUPERSEDED", activeKey: null, effectiveTo: now }
  });
  const latestRate = await tx.ndpExchangeRateRule.aggregate({ _max: { version: true } });
  const rate = await tx.ndpExchangeRateRule.create({ data: {
    version: (latestRate._max.version ?? 0) + 1, ndpUnits: 1, jpyUnits: 1,
    status: "ACTIVE", effectiveFrom: new Date(now.getTime() - 60_000), activeKey: "active",
    idempotencyKey: `${marker}-rate`, reason: "Rollback-only formal flow check"
  } });
  if (previousRates.some((row) => row.effectiveFrom >= now)) {
    throw new Error("Formal order checker requires no future active rate inside its isolated transaction");
  }
  return {
    marker, customer, technician, customerProfileId: customerProfile.id,
    technicianProfileId: technicianProfile.id, shopId: shop.id, serviceId: service.id,
    addOnServiceId: addOn.id, rateId: rate.id, rateVersion: rate.version,
    rateEffectiveFrom: rate.effectiveFrom
  };
}

type CheckerOrder = { id: number; orderNo: string };

async function createConfirmedOrder(
  tx: Prisma.TransactionClient,
  fixture: CheckerFixture,
  sequence: number,
  now: Date,
  currency: "NDP" | "TEST_NDP",
  walletBalance = 0
): Promise<CheckerOrder> {
  const startsAt = new Date(now.getTime() + sequence * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  const slot = await tx.scheduleSlot.create({ data: {
    serviceId: fixture.serviceId, shopId: fixture.shopId,
    technicianProfileId: fixture.technicianProfileId, startsAt, endsAt,
    bookedCount: 1, status: "BOOKED"
  } });
  const order = await tx.bookingOrder.create({ data: {
    orderNo: `${fixture.marker}-${sequence}`, customerUserId: fixture.customer.id,
    serviceId: fixture.serviceId, shopId: fixture.shopId,
    technicianProfileId: fixture.technicianProfileId, scheduleSlotId: slot.id,
    status: "CONFIRMED", fulfillmentMode: "store", priceAmount: 8_800,
    serviceNameSnapshot: "Formal service", servicePriceSnapshot: 8_800,
    serviceDurationSnapshot: 60,
    serviceSnapshotJson: { serviceId: fixture.serviceId, marker: fixture.marker },
    startsAt, endsAt
  } });
  await tx.orderStatusHistory.create({ data: {
    bookingOrderId: order.id, fromStatus: "PENDING", toStatus: "CONFIRMED",
    actorUserId: fixture.technician.id, reason: "Formal checker fixture"
  } });
  await tx.orderFinancial.create({ data: {
    bookingOrderId: order.id, customerUserId: fixture.customer.id,
    shopId: fixture.shopId, technicianProfileId: fixture.technicianProfileId,
    serviceAmountJpy: 8_800, ndpCurrency: currency, platformFeeEnabledSnapshot: false
  } });
  if (walletBalance > 0) {
    await tx.wallet.upsert({
      where: { ownerType_ownerId_currency: { ownerType: "USER", ownerId: fixture.customer.id, currency } },
      create: { ownerType: "USER", ownerId: fixture.customer.id, currency, availableBalance: walletBalance },
      update: { availableBalance: walletBalance, frozenBalance: 0 }
    });
  }
  return { id: order.id, orderNo: order.orderNo };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Formal order checker assertion failed: ${message}`);
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Formal order checker expected structured evidence");
  }
  return value as Record<string, unknown>;
};

async function assertRejectedWithMessage(
  operation: () => Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(errorMessage(error) === expectedMessage, `expected ${expectedMessage}`);
    return;
  }
  throw new Error(`Formal order checker assertion failed: ${expectedMessage} was not rejected`);
}

async function captureOrderMutationState(tx: Prisma.TransactionClient, orderId: number) {
  const [order, session, events, histories, checkout, ledgerTransactions,
    reconciliations, reviews, audits, financial] = await Promise.all([
    tx.bookingOrder.findUnique({
      where: { id: orderId },
      select: {
        status: true, paymentStatus: true, paymentMethod: true,
        paymentAmountJpy: true, customerUserId: true
      }
    }),
    tx.orderServiceSession.findUnique({
      where: { bookingOrderId: orderId },
      select: {
        startedByUserId: true, startedAt: true, expectedEndsAt: true,
        endedByUserId: true, endedAt: true,
        addOns: {
          where: { deletedAt: null },
          orderBy: { id: "asc" },
          select: { id: true, status: true, acceptedByUserId: true, rejectedByUserId: true }
        }
      }
    }),
    tx.orderServiceEvent.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } }),
    tx.orderStatusHistory.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } }),
    tx.orderCheckout.findUnique({
      where: { bookingOrderId: orderId },
      select: {
        id: true, paymentMethod: true, ledgerTransactionId: true,
        receiptConfirmedById: true, receiptConfirmedAt: true
      }
    }),
    tx.ledgerTransaction.findMany({
      include: { entries: true, reconciliation: true }, orderBy: { id: "asc" }
    }),
    tx.financeReconciliation.findMany({ orderBy: { id: "asc" } }),
    tx.orderReview.findMany({ include: { tags: true }, orderBy: { id: "asc" } }),
    tx.auditLog.findMany({ orderBy: { id: "asc" } }),
    tx.orderFinancial.findUnique({ where: { bookingOrderId: orderId } })
  ]);
  const wallet = order && (financial?.ndpCurrency === "NDP" || financial?.ndpCurrency === "TEST_NDP")
    ? await tx.wallet.findUnique({
        where: {
          ownerType_ownerId_currency: {
            ownerType: "USER", ownerId: order.customerUserId, currency: financial.ndpCurrency
          }
        },
        select: { availableBalance: true, frozenBalance: true }
      })
    : null;
  return {
    order, session, events, histories, checkout, ledgerTransactions,
    reconciliations, reviews, audits, financial, wallet
  };
}

async function runFormalFlow(tx: Prisma.TransactionClient): Promise<void> {
  const now = new Date();
  const fixture = await createCheckerFixture(tx, now);
  const facade = createTransactionBoundPrismaFacade(tx) as unknown as PrismaClient;
  const [bookingModule, bookingRepositoryModule, ledgerModule, ledgerRepositoryModule,
    auditModule, auditRepositoryModule, rateModule, rateRepositoryModule,
    validatorModule] = await Promise.all([
    import("../src/services/booking.service"), import("../src/repositories/booking.repository"),
    import("../src/services/ledger.service"), import("../src/repositories/ledger.repository"),
    import("../src/services/audit-log.service"), import("../src/repositories/audit-log.repository"),
    import("../src/services/ndp-exchange-rate.service"), import("../src/repositories/ndp-exchange-rate.repository"),
    import("../src/validators/booking.validator")
  ]);
  const audit = new auditModule.AuditLogService(new auditRepositoryModule.AuditLogRepository(facade));
  const ledger = new ledgerModule.LedgerService(new ledgerRepositoryModule.LedgerRepository(facade));
  const rate = new rateModule.NdpExchangeRateService(
    new rateRepositoryModule.NdpExchangeRateRepository(facade), audit
  );
  const service = new bookingModule.BookingService(
    new bookingRepositoryModule.BookingRepository(facade), ledger, undefined, audit,
    undefined, rate, () => now
  );
  const currency = await resolveFixtureLedgerCurrency(tx, fixture.customer.id);
  assert(currency === "NDP", "non-test fixture did not resolve to formal NDP currency");
  const customer: AuthenticatedAccessContext = {
    userId: fixture.customer.id, email: fixture.customer.email, accessTokenJti: fixture.marker,
    accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 600, roles: ["customer"],
    permissions: ["order:detail:read", "order:service:start", "order:add-on:create",
      "order:add-on:decide", "order:service:end", "order:checkout:read",
      "order:checkout:payment-method:write", "order:checkout:ndp:pay", "order:review:create"],
    currentIdentityType: "customer", currentIdentityScopeType: "customer_profile",
    currentIdentityScopeId: fixture.customerProfileId
  };
  const technician: AuthenticatedAccessContext = {
    userId: fixture.technician.id, email: fixture.technician.email,
    accessTokenJti: `${fixture.marker}-technician`,
    accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 600, roles: ["technician"],
    permissions: ["order:detail:read", "order:service:start", "order:add-on:create",
      "order:add-on:decide", "order:service:end", "order:checkout:receipt:confirm",
      "order:review:create"], currentIdentityType: "technician",
    currentIdentityScopeType: "technician_profile",
    currentIdentityScopeId: fixture.technicianProfileId
  };
  const context = { ip: "127.0.0.1", userAgent: "order-flow-checker" };

  const ndpOrder = await createConfirmedOrder(tx, fixture, 1, now, currency, 100_000);
  const ndpStart = { actor: "customer" as const, idempotencyKey: `${fixture.marker}-ndp-start` };
  await service.startService(customer, ndpOrder.id, ndpStart, context);
  await service.startService(customer, ndpOrder.id, ndpStart, context);
  const proposalInput = {
    serviceId: fixture.addOnServiceId, idempotencyKey: `${fixture.marker}-ndp-addon`
  };
  const proposed = await service.createOrderAddOn(customer, ndpOrder.id, proposalInput, context);
  await service.createOrderAddOn(customer, ndpOrder.id, proposalInput, context);
  await assertRejectedWithMessage(
    () => service.createOrderAddOn(customer, ndpOrder.id, {
      serviceId: fixture.serviceId, idempotencyKey: proposalInput.idempotencyKey
    }, context),
    "error.idempotency.key_reused"
  );
  const addOnId = proposed.serviceSession?.addOns[0]?.id;
  assert(addOnId, "formal add-on was not projected");
  const acceptInput = {
    idempotencyKey: `${fixture.marker}-ndp-accept`
  };
  await service.acceptOrderAddOn(technician, ndpOrder.id, addOnId, acceptInput, context);
  await service.acceptOrderAddOn(technician, ndpOrder.id, addOnId, acceptInput, context);
  const endInput = {
    reason: "completed", idempotencyKey: `${fixture.marker}-ndp-end`
  };
  await service.endService(customer, ndpOrder.id, endInput, context);
  await service.endService(customer, ndpOrder.id, endInput, context);
  await assertRejectedWithMessage(
    () => service.endService(customer, ndpOrder.id, {
      ...endInput, reason: "different completion reason"
    }, context),
    "error.idempotency.key_reused"
  );
  const checkout = await service.getCheckout(customer, ndpOrder.id);
  const checkoutReplay = await service.getCheckout(customer, ndpOrder.id);
  assert(checkout.id === checkoutReplay.id && checkout.payableNdp === 11_000,
    "checkout replay/snapshot mismatch");
  const selection = { method: "ndp" as const, idempotencyKey: `${fixture.marker}-ndp-select` };
  await service.selectCheckoutPaymentMethod(customer, ndpOrder.id, selection, context);
  await service.selectCheckoutPaymentMethod(customer, ndpOrder.id, selection, context);
  await assertRejectedWithMessage(
    () => service.selectCheckoutPaymentMethod(customer, ndpOrder.id, {
      method: "cash", idempotencyKey: selection.idempotencyKey
    }, context),
    "error.idempotency.key_reused"
  );
  const ndpWalletBefore = await tx.wallet.findUniqueOrThrow({
    where: {
      ownerType_ownerId_currency: {
        ownerType: "USER", ownerId: fixture.customer.id, currency
      }
    }
  });
  const paymentInput = { idempotencyKey: `${fixture.marker}-ndp-payment` };
  const paid = await service.payCheckoutWithNdp(customer, ndpOrder.id, paymentInput, context);
  const paidReplay = await service.payCheckoutWithNdp(customer, ndpOrder.id, paymentInput, context);
  assert(paid.status === "completed" && paid.paymentEvidence === "ndp_ledger" && paidReplay.id === paid.id,
    "NDP settlement evidence/replay mismatch");
  assert(!validatorModule.orderReviewCreateBodySchema.safeParse({
    targetType: "technician", rating: 5, tags: ["Straße", "STRASSE"], comment: null,
    idempotencyKey: `${fixture.marker}-unicode-collision`
  }).success, "review validator accepted a Unicode full-fold collision");
  assert(!validatorModule.orderReviewCreateBodySchema.safeParse({
    targetType: "technician", rating: 5, tags: ["Σ", "ς"], comment: null,
    idempotencyKey: `${fixture.marker}-sigma-collision`
  }).success, "review validator accepted a final-sigma collision");
  const customerReviewInput = validatorModule.orderReviewCreateBodySchema.parse({
    targetType: "technician", rating: 5, tags: ["ＳＰＡ", "ı", "i"],
    comment: "  Ｆｏｒｍａｌ  ",
    idempotencyKey: `${fixture.marker}-customer-review`
  });
  const customerReview = await service.createOrderReview(customer, ndpOrder.id, customerReviewInput, context);
  const customerReviewReplay = await service.createOrderReview(customer, ndpOrder.id, customerReviewInput, context);
  assert(customerReview.applied && !customerReviewReplay.applied,
    "customer review semantic replay mismatch");
  await assertRejectedWithMessage(
    () => service.createOrderReview(customer, ndpOrder.id, {
      ...customerReviewInput, rating: 4
    }, context),
    "error.idempotency.key_reused"
  );
  await service.createOrderReview(technician, ndpOrder.id, {
    targetType: "customer", rating: 5, tags: ["准时到达"], comment: "正式流程",
    idempotencyKey: `${fixture.marker}-technician-review`
  }, context);
  await assertRejectedWithMessage(
    () => service.createOrderReview(customer, ndpOrder.id, {
      ...customerReviewInput, idempotencyKey: `${fixture.marker}-customer-review-second`
    }, context),
    "error.order.review_already_submitted"
  );
  const [ndpEvidence, ndpWalletAfter] = await Promise.all([
    tx.bookingOrder.findUnique({
      where: { id: ndpOrder.id },
      include: {
        statusHistory: { where: { deletedAt: null } },
        serviceSession: { include: { events: true, addOns: true } },
        checkout: {
          include: { ledgerTransaction: { include: { entries: true, reconciliation: true } } }
        },
        financial: true,
        reviews: { include: { tags: true } }
      }
    }),
    tx.wallet.findUniqueOrThrow({
      where: {
        ownerType_ownerId_currency: {
          ownerType: "USER", ownerId: fixture.customer.id, currency
        }
      }
    })
  ]);
  assert(ndpEvidence?.status === "COMPLETED" && ndpEvidence.statusHistory.length === 4,
    "NDP order history is not coherent");
  assert(ndpEvidence.serviceSession?.events.length === 7 &&
    ndpEvidence.serviceSession.addOns.length === 1 &&
    ndpEvidence.serviceSession.addOns[0]?.status === "ACCEPTED" &&
    ndpEvidence.serviceSession.addOns[0]?.serviceId === fixture.addOnServiceId,
  "NDP service/add-on event chain is not coherent");
  const persistedCheckout = ndpEvidence.checkout;
  assert(persistedCheckout?.baseAmountJpy === 8_800 &&
    persistedCheckout.addOnAmountJpy === 2_200 &&
    persistedCheckout.discountAmountJpy === 0 &&
    persistedCheckout.checkoutAmountJpy === 11_000 && persistedCheckout.payableNdp === 11_000,
  "NDP checkout amount evidence is not exact");
  const rateSnapshot = asRecord(persistedCheckout.rateSnapshotJson);
  const calculationSnapshot = asRecord(persistedCheckout.calculationSnapshotJson);
  assert(rateSnapshot.ruleId === fixture.rateId && rateSnapshot.version === fixture.rateVersion &&
    rateSnapshot.ndpUnits === 1 && rateSnapshot.jpyUnits === 1 &&
    rateSnapshot.effectiveFrom === fixture.rateEffectiveFrom.toISOString(),
  "NDP exchange-rate snapshot is not exact");
  assert(calculationSnapshot.formula === "base_plus_accepted_add_ons_minus_discount" &&
    calculationSnapshot.baseAmountJpy === 8_800 && calculationSnapshot.addOnAmountJpy === 2_200 &&
    calculationSnapshot.discountAmountJpy === 0 && calculationSnapshot.checkoutAmountJpy === 11_000 &&
    Array.isArray(calculationSnapshot.acceptedAddOnIds) &&
    calculationSnapshot.acceptedAddOnIds.length === 1 &&
    calculationSnapshot.acceptedAddOnIds[0] === addOnId,
  "NDP calculation snapshot is not exact");
  const paymentTransaction = persistedCheckout.ledgerTransaction;
  const paymentEntry = paymentTransaction?.entries[0];
  const reconciliation = paymentTransaction?.reconciliation;
  assert(paymentTransaction?.referenceType === "order_checkout_payment" &&
    paymentTransaction.referenceId === persistedCheckout.id &&
    paymentTransaction.actorUserId === fixture.customer.id &&
    paymentTransaction.amount === 11_000 && paymentTransaction.currency === currency &&
    paymentEntry?.walletId === ndpWalletBefore.id && paymentEntry.direction === "AVAILABLE_DEBIT" &&
    paymentEntry.amount === 11_000 && paymentEntry.availableDelta === -11_000 &&
    paymentEntry.frozenDelta === 0 && paymentEntry.availableBalanceAfter === 89_000 &&
    paymentEntry.frozenBalanceAfter === 0 && ndpWalletBefore.availableBalance === 100_000 &&
    ndpWalletAfter.availableBalance === 89_000 && ndpWalletAfter.frozenBalance === 0,
  "NDP wallet/ledger balance evidence is not exact");
  assert(reconciliation?.referenceType === "order_checkout_payment" &&
    reconciliation.referenceId === persistedCheckout.id && reconciliation.currency === currency &&
    reconciliation.expectedAmount === 11_000 && reconciliation.actualAmount === 11_000 &&
    reconciliation.differenceAmount === 0 && reconciliation.status === "PENDING" &&
    ndpEvidence.financial?.settlementStatus === "settled",
  "NDP reconciliation/settlement evidence is not exact");
  const paymentAudit = await tx.auditLog.findFirst({
    where: {
      action: "ledger.checkout.ndp_payment", targetType: "ledger_transaction",
      targetId: paymentTransaction.id, actorId: fixture.customer.id, deletedAt: null
    }
  });
  const paymentAuditMetadata = asRecord(paymentAudit?.metadata);
  assert(paymentAuditMetadata.referenceType === "order_checkout_payment" &&
    paymentAuditMetadata.referenceId === persistedCheckout.id &&
    paymentAuditMetadata.amount === 11_000 && paymentAuditMetadata.currency === currency &&
    paymentAuditMetadata.bookingOrderId === ndpOrder.id &&
    paymentAuditMetadata.checkoutId === persistedCheckout.id,
  "NDP payment audit is not exact");
  assert(ndpEvidence.reviews.length === 2, "NDP directional review count is not exact");
  const technicianTargetReview = ndpEvidence.reviews.find(
    (review) => review.targetType === "TECHNICIAN"
  );
  const customerTargetReview = ndpEvidence.reviews.find(
    (review) => review.targetType === "CUSTOMER"
  );
  assert(technicianTargetReview?.reviewerUserId === fixture.customer.id &&
    technicianTargetReview.technicianProfileId === fixture.technicianProfileId &&
    technicianTargetReview.customerProfileId === null && technicianTargetReview.rating === 5 &&
    technicianTargetReview.comment === "Formal" &&
    JSON.stringify(technicianTargetReview.tags.map((tag) => tag.label).sort()) ===
      JSON.stringify(["SPA", "i", "ı"].sort()),
  "technician-target review normalization/ownership is not exact");
  assert(customerTargetReview?.reviewerUserId === fixture.technician.id &&
    customerTargetReview.customerProfileId === fixture.customerProfileId &&
    customerTargetReview.technicianProfileId === null && customerTargetReview.rating === 5 &&
    customerTargetReview.tags[0]?.label === "准时到达",
  "customer-target review ownership is not exact");

  const cashOrder = await createConfirmedOrder(tx, fixture, 2, now, currency);
  const verificationCode = bookingRepositoryModule.deriveOrderServiceVerificationCode(cashOrder.id);
  await service.startService(technician, cashOrder.id, {
    actor: "technician", verificationCode, idempotencyKey: `${fixture.marker}-cash-start`
  }, context);
  const cashProposal = await service.createOrderAddOn(technician, cashOrder.id, {
    serviceId: fixture.addOnServiceId, idempotencyKey: `${fixture.marker}-cash-addon`
  }, context);
  const cashAddOnId = cashProposal.serviceSession?.addOns[0]?.id;
  assert(cashAddOnId, "cash add-on was not projected");
  await service.acceptOrderAddOn(customer, cashOrder.id, cashAddOnId, {
    idempotencyKey: `${fixture.marker}-cash-accept`
  }, context);
  await service.endService(technician, cashOrder.id, {
    reason: "completed", idempotencyKey: `${fixture.marker}-cash-end`
  }, context);
  await service.getCheckout(customer, cashOrder.id);
  const cashNoDebitBefore = await captureCashNoDebitEvidence(
    tx, cashOrder.id, fixture.customer.id, currency
  );
  const awaitingPaymentConfirmation = await service.selectCheckoutPaymentMethod(customer, cashOrder.id, {
    method: "cash", idempotencyKey: `${fixture.marker}-cash-select`
  }, context);
  assert(awaitingPaymentConfirmation.status === "awaitingPaymentConfirmation",
    "cash selection did not enter payment confirmation");
  const receiptInput = { reason: "cash received", idempotencyKey: `${fixture.marker}-cash-receipt` };
  const cashCompleted = await service.confirmCheckoutReceipt(
    technician, cashOrder.id, receiptInput, context
  );
  const cashReplay = await service.confirmCheckoutReceipt(
    technician, cashOrder.id, receiptInput, context
  );
  assert(cashCompleted.status === "completed" &&
    cashCompleted.paymentEvidence === "technician_receipt_confirmation" &&
    cashReplay.id === cashCompleted.id, "cash receipt evidence/replay mismatch");
  await assertRejectedWithMessage(
    () => service.confirmCheckoutReceipt(technician, cashOrder.id, {
      ...receiptInput, reason: "different receipt"
    }, context),
    "error.idempotency.key_reused"
  );
  const cashNoDebitAfter = await captureCashNoDebitEvidence(
    tx, cashOrder.id, fixture.customer.id, currency
  );
  assertNoCashDebit(cashNoDebitBefore, cashNoDebitAfter);
  const cashCustomerReview = {
    targetType: "technician" as const, rating: 4, tags: ["服务精神"], comment: "现金流程",
    idempotencyKey: `${fixture.marker}-cash-customer-review`
  };
  await service.createOrderReview(customer, cashOrder.id, cashCustomerReview, context);
  await service.createOrderReview(customer, cashOrder.id, cashCustomerReview, context);
  await service.createOrderReview(technician, cashOrder.id, {
    targetType: "customer", rating: 4, tags: ["准时到达"], comment: "现金流程",
    idempotencyKey: `${fixture.marker}-cash-technician-review`
  }, context);
  const [cashEvidence, summaryRows, reviewAuditCount] = await Promise.all([
    tx.bookingOrder.findUnique({
      where: { id: cashOrder.id },
      include: {
        statusHistory: { where: { deletedAt: null } },
        serviceSession: { include: { events: true, addOns: true } },
        checkout: true, financial: true, reviews: { include: { tags: true } }
      }
    }),
    tx.reviewSummary.findMany({
      where: {
        OR: [
          { technicianProfileId: fixture.technicianProfileId },
          { customerProfileId: fixture.customerProfileId }
        ]
      }
    }),
    tx.auditLog.count({
      where: { action: "order.review.create", targetType: "BookingOrder",
        targetId: { in: [ndpOrder.id, cashOrder.id] } }
    })
  ]);
  assert(cashEvidence?.status === "COMPLETED" && cashEvidence.statusHistory.length === 5 &&
    cashEvidence.serviceSession?.events.length === 7 &&
    cashEvidence.serviceSession.addOns[0]?.status === "ACCEPTED",
  "cash history/service/add-on event chain is not coherent");
  assert(cashEvidence.checkout?.paymentMethod === "CASH" &&
    cashEvidence.checkout.ledgerTransactionId === null &&
    cashEvidence.checkout.receiptConfirmedById === fixture.technician.id &&
    cashEvidence.financial?.settlementStatus === "settled" && cashEvidence.reviews.length === 2,
  "cash receipt/settlement/review chain is not coherent");
  const technicianSummary = summaryRows.find(
    (summary) => summary.technicianProfileId === fixture.technicianProfileId
  );
  const customerSummary = summaryRows.find(
    (summary) => summary.customerProfileId === fixture.customerProfileId
  );
  const expectedTechnicianHighlights = ["SPA", "i", "ı", "服务精神"]
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  assert(summaryRows.length === 2 && technicianSummary?.targetType === "technician" &&
    technicianSummary.targetId === fixture.technicianProfileId &&
    technicianSummary.reviewCount === 2 && technicianSummary.ratingAverage.toString() === "4.5" &&
    Array.isArray(technicianSummary.highlights) &&
    JSON.stringify(technicianSummary.highlights) === JSON.stringify(expectedTechnicianHighlights) &&
    customerSummary?.targetType === "customer" &&
    customerSummary.targetId === fixture.customerProfileId && customerSummary.reviewCount === 2 &&
    customerSummary.ratingAverage.toString() === "4.5" &&
    JSON.stringify(customerSummary.highlights) === JSON.stringify(["准时到达"]) &&
    reviewAuditCount === 4,
  "review ownership/summaries/highlights/audits were not recomputed atomically");

  const invalidCodeOrder = await createConfirmedOrder(tx, fixture, 3, now, currency);
  const invalidCodeBefore = await captureOrderMutationState(tx, invalidCodeOrder.id);
  const wrongCode = bookingRepositoryModule.deriveOrderServiceVerificationCode(invalidCodeOrder.id) === "000000"
    ? "999999" : "000000";
  await assertRejectedWithMessage(() => service.startService(technician, invalidCodeOrder.id, {
    actor: "technician", verificationCode: wrongCode,
    idempotencyKey: `${fixture.marker}-invalid-code`
  }, context), "error.order.verification_code_invalid");
  assertDeepSnapshotEqual(
    invalidCodeBefore,
    await captureOrderMutationState(tx, invalidCodeOrder.id),
    "invalid verification code"
  );

  const insufficientOrder = await createConfirmedOrder(tx, fixture, 4, now, currency);
  await service.startService(customer, insufficientOrder.id, {
    actor: "customer", idempotencyKey: `${fixture.marker}-insufficient-start`
  }, context);
  await service.endService(customer, insufficientOrder.id, {
    reason: "completed", idempotencyKey: `${fixture.marker}-insufficient-end`
  }, context);
  await service.getCheckout(customer, insufficientOrder.id);
  await service.selectCheckoutPaymentMethod(customer, insufficientOrder.id, {
    method: "ndp", idempotencyKey: `${fixture.marker}-insufficient-select`
  }, context);
  await tx.wallet.update({
    where: { ownerType_ownerId_currency: { ownerType: "USER", ownerId: fixture.customer.id, currency } },
    data: { availableBalance: 0 }
  });
  const insufficientBefore = await captureOrderMutationState(tx, insufficientOrder.id);
  await assertRejectedWithMessage(() => service.payCheckoutWithNdp(customer, insufficientOrder.id, {
    idempotencyKey: `${fixture.marker}-insufficient-pay`
  }, context), "error.wallet.insufficient_available");
  assertDeepSnapshotEqual(
    insufficientBefore,
    await captureOrderMutationState(tx, insufficientOrder.id),
    "insufficient NDP"
  );

  const pendingAddOnOrder = await createConfirmedOrder(tx, fixture, 5, now, currency);
  await service.startService(customer, pendingAddOnOrder.id, {
    actor: "customer", idempotencyKey: `${fixture.marker}-pending-start`
  }, context);
  await service.createOrderAddOn(technician, pendingAddOnOrder.id, {
    serviceId: fixture.addOnServiceId, idempotencyKey: `${fixture.marker}-pending-addon`
  }, context);
  const pendingBefore = await captureOrderMutationState(tx, pendingAddOnOrder.id);
  await assertRejectedWithMessage(() => service.endService(customer, pendingAddOnOrder.id, {
    reason: "completed", idempotencyKey: `${fixture.marker}-pending-end`
  }, context), "error.order.invalid_transition");
  assertDeepSnapshotEqual(
    pendingBefore,
    await captureOrderMutationState(tx, pendingAddOnOrder.id),
    "unresolved add-on end"
  );
}

export async function runOrderFulfillmentCheckoutCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;
  const { prisma } = await import("../src/prisma/client");
  try {
    assertFormalDatabaseSchema(await readFormalDatabaseSchemaEvidence(prisma));
    await runRollbackOnlyTransaction(
      prisma,
      () => captureExternalBaseline(prisma),
      runFormalFlow
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runOrderFulfillmentCheckoutCheck().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Order fulfillment check failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
