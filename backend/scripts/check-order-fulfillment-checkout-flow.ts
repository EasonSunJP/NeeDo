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
  "20260901101500_order_review_idempotency",
  "20260902090000_order_status_history_fulfillment_statuses"
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
  if (serializeEvidence(before) !== serializeEvidence(after)) {
    throw new Error("Formal order checker assertion failed: cash payment changed wallet or checkout ledger evidence");
  }
}

export function assertDeepSnapshotEqual(
  before: unknown,
  after: unknown,
  label: string
): void {
  if (serializeEvidence(before) !== serializeEvidence(after)) {
    throw new Error(`Formal order checker assertion failed: ${label} left partial writes`);
  }
}

type FormalFulfillmentChain = {
  order: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  checkout: Record<string, unknown> | null;
  addOn: Record<string, unknown> | null;
  histories: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
};

const serializeEvidence = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return `boolean:${value ? "true" : "false"}`;
  if (typeof value === "bigint") return `bigint:${value.toString()}`;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    if (value === Number.POSITIVE_INFINITY) return "number:Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number:-Infinity";
    if (Object.is(value, -0)) return "number:-0";
    return `number:${value}`;
  }
  if (value instanceof Date) return `date:${JSON.stringify(value.toISOString())}`;
  if (Array.isArray(value)) {
    return `array:[${value.map((item) => serializeEvidence(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const jsonCapable = value as { toJSON?: () => unknown };
    if (typeof jsonCapable.toJSON === "function") {
      return `json:${serializeEvidence(jsonCapable.toJSON())}`;
    }
    const record = value as Record<string, unknown>;
    return `object:{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serializeEvidence(record[key])}`)
      .join(",")}}`;
  }
  return `${typeof value}:${String(value)}`;
};

const projectExpectedShape = (actual: unknown, expected: unknown): unknown => {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return actual;
    if (actual.length !== expected.length) return actual;
    return expected.map((item, index) => projectExpectedShape(actual[index], item));
  }
  if (expected instanceof Date) return actual;
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return actual;
    return Object.fromEntries(
      Object.entries(expected).map(([key, value]) => [
        key,
        key === "metadata"
          ? (actual as Record<string, unknown>)[key]
          : projectExpectedShape((actual as Record<string, unknown>)[key], value)
      ])
    );
  }
  return actual;
};

const assertChainSection = (
  actual: unknown,
  expected: unknown,
  label: string,
  section: string
): void => {
  if (serializeEvidence(projectExpectedShape(actual, expected)) !== serializeEvidence(expected)) {
    throw new Error(`Formal order checker assertion failed: ${label} ${section} mismatch`);
  }
};

export function assertFormalFulfillmentChain(
  evidence: FormalFulfillmentChain,
  expected: FormalFulfillmentChain,
  label: string
): void {
  assertChainSection(evidence.order, expected.order, label, "order payment evidence");
  assertChainSection(evidence.session, expected.session, label, "session lifecycle");
  assertChainSection(evidence.checkout, expected.checkout, label, "checkout evidence");
  assertChainSection(evidence.addOn, expected.addOn, label, "add-on lifecycle");
  assertChainSection(evidence.histories, expected.histories, label, "history chain");
  assertChainSection(evidence.events, expected.events, label, "event chain");
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
  if (serializeEvidence(after) !== serializeEvidence(before)) {
    throw new Error("External database baseline changed after rollback");
  }
}

export async function runExpectedFailureRollbackTransaction<TTransaction extends object, TBaseline>(
  client: RollbackClient<TTransaction>,
  captureBaseline: () => Promise<TBaseline>,
  flow: TransactionCallback<TTransaction, void>,
  expectedMessage: string
): Promise<void> {
  const before = await captureBaseline();
  let failure: unknown;
  try {
    await client.$transaction(
      async (transaction) => {
        await flow(transaction);
        throw new Error(`Expected ${expectedMessage} was not rejected`);
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error) {
    failure = error;
  }
  const message = failure instanceof Error ? failure.message : String(failure);
  if (message !== expectedMessage) {
    throw new Error(
      `Formal order checker assertion failed: expected ${expectedMessage}, received ${message}`
    );
  }
  const after = await captureBaseline();
  if (serializeEvidence(after) !== serializeEvidence(before)) {
    throw new Error(`External database baseline changed after ${expectedMessage} rollback`);
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
  const accountPrefix = String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0");
  const customerAccountNo = `${accountPrefix}01`;
  const technicianAccountNo = `${accountPrefix}02`;
  const customer = await tx.user.create({ data: {
    needoId: `u${customerAccountNo}`, accountNo: customerAccountNo, primaryIdentityType: "U",
    email: `${marker}-customer@example.invalid`, username: "Formal flow customer",
    isTestAccount: true
  } });
  const technician = await tx.user.create({ data: {
    needoId: `u${technicianAccountNo}`, accountNo: technicianAccountNo, primaryIdentityType: "U",
    email: `${marker}-technician@example.invalid`, username: "Formal flow technician",
    isTestAccount: true
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
    status: "ACTIVE", effectiveFrom: new Date(now.getTime() - 60_000), activeKey: "ndp_exchange_rate",
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

export async function captureOrderMutationState(
  tx: Prisma.TransactionClient,
  orderId: number
) {
  const [order, session, addOns, events, histories, checkout, ledgerTransactions,
    reconciliations, affiliateRewards, affiliateRewardTransactions, walletHolds,
    reviews, reviewSummaries, audits, financial, wallets] = await Promise.all([
    tx.bookingOrder.findUnique({ where: { id: orderId } }),
    tx.orderServiceSession.findUnique({ where: { bookingOrderId: orderId } }),
    tx.orderAddOn.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } }),
    tx.orderServiceEvent.findMany({
      where: { bookingOrderId: orderId }, orderBy: { id: "asc" }
    }),
    tx.orderStatusHistory.findMany({
      where: { bookingOrderId: orderId }, orderBy: { id: "asc" }
    }),
    tx.orderCheckout.findUnique({ where: { bookingOrderId: orderId } }),
    tx.ledgerTransaction.findMany({
      include: { entries: { orderBy: { id: "asc" } }, reconciliation: true },
      orderBy: { id: "asc" }
    }),
    tx.financeReconciliation.findMany({ orderBy: { id: "asc" } }),
    tx.affiliateReward.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } }),
    tx.affiliateRewardTransaction.findMany({
      where: { reward: { bookingOrderId: orderId } }, orderBy: { id: "asc" }
    }),
    tx.walletHold.findMany({ where: { bookingOrderId: orderId }, orderBy: { id: "asc" } }),
    tx.orderReview.findMany({
      where: { bookingOrderId: orderId },
      include: { tags: { orderBy: { id: "asc" } } },
      orderBy: { id: "asc" }
    }),
    tx.reviewSummary.findMany({ orderBy: { id: "asc" } }),
    tx.auditLog.findMany({ orderBy: { id: "asc" } }),
    tx.orderFinancial.findUnique({ where: { bookingOrderId: orderId } }),
    tx.wallet.findMany({ orderBy: { id: "asc" } })
  ]);
  return {
    order, session, addOns, events, histories, checkout, ledgerTransactions,
    reconciliations, affiliateRewards, affiliateRewardTransactions, walletHolds,
    reviews, reviewSummaries, audits, financial, wallets
  };
}

async function createFormalFlowHarness(tx: Prisma.TransactionClient, now: Date) {
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
  assert(currency === "TEST_NDP", "test fixture did not resolve to TEST_NDP currency");
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
  return {
    fixture,
    bookingRepositoryModule,
    validatorModule,
    service,
    currency,
    customer,
    technician,
    context: { ip: "127.0.0.1", userAgent: "order-flow-checker" }
  };
}

async function runFormalFlow(tx: Prisma.TransactionClient): Promise<void> {
  const now = new Date();
  const {
    fixture,
    bookingRepositoryModule,
    validatorModule,
    service,
    currency,
    customer,
    technician,
    context
  } = await createFormalFlowHarness(tx, now);

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
        statusHistory: { where: { deletedAt: null }, orderBy: { id: "asc" } },
        serviceSession: {
          include: {
            events: { where: { deletedAt: null }, orderBy: { id: "asc" } },
            addOns: { where: { deletedAt: null }, orderBy: { id: "asc" } }
          }
        },
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
  const ndpSession = ndpEvidence.serviceSession;
  const ndpAddOn = ndpSession.addOns[0]!;
  const ndpEvents = ndpSession.events;
  const ndpStartedEvent = ndpEvents[0]!;
  const ndpProposedEvent = ndpEvents[1]!;
  const ndpAcceptedEvent = ndpEvents[2]!;
  const ndpEndedEvent = ndpEvents[3]!;
  const ndpCheckoutEvent = ndpEvents[4]!;
  const ndpSelectionEvent = ndpEvents[5]!;
  const ndpPaymentEvent = ndpEvents[6]!;
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
  assert(reconciliation === null && ndpEvidence.financial?.settlementStatus === "settled",
  "TEST_NDP reconciliation isolation/settlement evidence is not exact");
  assertFormalFulfillmentChain(
    {
      order: ndpEvidence as unknown as Record<string, unknown>,
      session: ndpSession as unknown as Record<string, unknown>,
      checkout: persistedCheckout as unknown as Record<string, unknown>,
      addOn: ndpAddOn as unknown as Record<string, unknown>,
      histories: ndpEvidence.statusHistory as unknown as Array<Record<string, unknown>>,
      events: ndpEvents as unknown as Array<Record<string, unknown>>
    },
    {
      order: {
        status: "COMPLETED", paymentMethod: "NDP", paymentStatus: "CONFIRMED",
        paymentAmountJpy: 11_000, paymentConfirmedById: fixture.customer.id,
        paymentConfirmedAt: ndpPaymentEvent.occurredAt,
        paymentReference: `checkout:${persistedCheckout.id}:ledger:${paymentTransaction.id}`,
        paymentNote: null
      },
      session: {
        id: ndpSession.id, bookingOrderId: ndpOrder.id,
        startedByUserId: fixture.customer.id, startedAt: ndpStartedEvent.occurredAt,
        expectedEndsAt: new Date(ndpStartedEvent.occurredAt.getTime() + 90 * 60_000),
        endedByUserId: fixture.customer.id, endedAt: ndpEndedEvent.occurredAt,
        deletedAt: null
      },
      checkout: {
        id: persistedCheckout.id, bookingOrderId: ndpOrder.id, paymentMethod: "NDP",
        createdAt: ndpCheckoutEvent.occurredAt,
        paymentSelectedAt: ndpSelectionEvent.occurredAt,
        ledgerTransactionId: paymentTransaction.id, receiptConfirmedById: null,
        receiptConfirmedAt: null, receiptConfirmationReason: null, deletedAt: null
      },
      addOn: {
        id: ndpAddOn.id, bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
        serviceId: fixture.addOnServiceId, status: "ACCEPTED",
        serviceNameSnapshot: "Formal add-on", priceAmountJpy: 2_200,
        currency: "JPY", durationMinutes: 30,
        serviceSnapshotJson: {
          serviceId: fixture.addOnServiceId, name: "Formal add-on", description: null,
          priceAmountJpy: 2_200, currency: "JPY", durationMinutes: 30
        },
        proposedByUserId: fixture.customer.id, proposedAt: ndpProposedEvent.occurredAt,
        acceptedByUserId: fixture.technician.id, acceptedAt: ndpAcceptedEvent.occurredAt,
        rejectedByUserId: null, rejectedAt: null, resolutionReason: null, deletedAt: null
      },
      histories: [
        {
          fromStatus: "PENDING", toStatus: "CONFIRMED", actorUserId: fixture.technician.id,
          reason: "Formal checker fixture"
        },
        {
          fromStatus: "CONFIRMED", toStatus: "IN_SERVICE", actorUserId: fixture.customer.id,
          reason: "service_started", createdAt: ndpStartedEvent.occurredAt
        },
        {
          fromStatus: "IN_SERVICE", toStatus: "AWAITING_CHECKOUT",
          actorUserId: fixture.customer.id, reason: "completed", createdAt: ndpEndedEvent.occurredAt
        },
        {
          fromStatus: "AWAITING_CHECKOUT", toStatus: "COMPLETED",
          actorUserId: fixture.customer.id, reason: "checkout_ndp_payment_applied",
          createdAt: ndpPaymentEvent.occurredAt
        }
      ],
      events: [
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: null, orderCheckoutId: null, eventType: "SERVICE_STARTED",
          actorUserId: fixture.customer.id, idempotencyKey: ndpStart.idempotencyKey,
          reason: null, metadata: {
            actor: "customer", requestIp: context.ip, requestUserAgent: context.userAgent
          }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: ndpAddOn.id, orderCheckoutId: null, eventType: "ADD_ON_PROPOSED",
          actorUserId: fixture.customer.id, idempotencyKey: proposalInput.idempotencyKey,
          reason: null, metadata: {
            actor: "customer", requestIp: context.ip, requestUserAgent: context.userAgent,
            serviceId: fixture.addOnServiceId
          }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: ndpAddOn.id, orderCheckoutId: null, eventType: "ADD_ON_ACCEPTED",
          actorUserId: fixture.technician.id, idempotencyKey: acceptInput.idempotencyKey,
          reason: null, metadata: {
            actor: "technician", requestIp: context.ip, requestUserAgent: context.userAgent,
            decision: "accept"
          }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: null, orderCheckoutId: null, eventType: "SERVICE_ENDED",
          actorUserId: fixture.customer.id, idempotencyKey: endInput.idempotencyKey,
          reason: "completed", metadata: {
            actor: "customer", requestIp: context.ip, requestUserAgent: context.userAgent
          }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: null, orderCheckoutId: persistedCheckout.id,
          eventType: "CHECKOUT_CREATED", actorUserId: fixture.customer.id,
          idempotencyKey: `checkout:${ndpOrder.id}:created`, reason: null,
          metadata: { checkoutAmountJpy: 11_000, payableNdp: 11_000, rateRuleId: fixture.rateId }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: null, orderCheckoutId: persistedCheckout.id,
          eventType: "PAYMENT_METHOD_SELECTED", actorUserId: fixture.customer.id,
          idempotencyKey: selection.idempotencyKey, reason: null, metadata: { method: "ndp" }
        },
        {
          bookingOrderId: ndpOrder.id, serviceSessionId: ndpSession.id,
          orderAddOnId: null, orderCheckoutId: persistedCheckout.id,
          eventType: "NDP_PAYMENT_APPLIED", actorUserId: fixture.customer.id,
          idempotencyKey: paymentInput.idempotencyKey, reason: "checkout_ndp_payment_applied",
          metadata: { paymentEvidence: "ndp_ledger", ledgerTransactionId: paymentTransaction.id }
        }
      ]
    },
    "NDP"
  );
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
  const cashStartInput = {
    actor: "technician", verificationCode, idempotencyKey: `${fixture.marker}-cash-start`
  } as const;
  await service.startService(technician, cashOrder.id, cashStartInput, context);
  const cashProposalInput = {
    serviceId: fixture.addOnServiceId, idempotencyKey: `${fixture.marker}-cash-addon`
  };
  const cashProposal = await service.createOrderAddOn(
    technician, cashOrder.id, cashProposalInput, context
  );
  const cashAddOnId = cashProposal.serviceSession?.addOns[0]?.id;
  assert(cashAddOnId, "cash add-on was not projected");
  const cashAcceptInput = {
    idempotencyKey: `${fixture.marker}-cash-accept`
  };
  await service.acceptOrderAddOn(customer, cashOrder.id, cashAddOnId, cashAcceptInput, context);
  const cashEndInput = {
    reason: "completed", idempotencyKey: `${fixture.marker}-cash-end`
  };
  await service.endService(technician, cashOrder.id, cashEndInput, context);
  await service.getCheckout(customer, cashOrder.id);
  const cashNoDebitBefore = await captureCashNoDebitEvidence(
    tx, cashOrder.id, fixture.customer.id, currency
  );
  const cashSelectionInput = {
    method: "cash", idempotencyKey: `${fixture.marker}-cash-select`
  } as const;
  const awaitingPaymentConfirmation = await service.selectCheckoutPaymentMethod(
    customer, cashOrder.id, cashSelectionInput, context
  );
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
        statusHistory: { where: { deletedAt: null }, orderBy: { id: "asc" } },
        serviceSession: {
          include: {
            events: { where: { deletedAt: null }, orderBy: { id: "asc" } },
            addOns: { where: { deletedAt: null }, orderBy: { id: "asc" } }
          }
        },
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
  const cashSession = cashEvidence.serviceSession!;
  const cashAddOn = cashSession.addOns[0]!;
  const cashEvents = cashSession.events;
  const cashStartedEvent = cashEvents[0]!;
  const cashProposedEvent = cashEvents[1]!;
  const cashAcceptedEvent = cashEvents[2]!;
  const cashEndedEvent = cashEvents[3]!;
  const cashCheckoutEvent = cashEvents[4]!;
  const cashSelectionEvent = cashEvents[5]!;
  const cashReceiptEvent = cashEvents[6]!;
  const cashCheckout = cashEvidence.checkout!;
  assertFormalFulfillmentChain(
    {
      order: cashEvidence as unknown as Record<string, unknown>,
      session: cashSession as unknown as Record<string, unknown>,
      checkout: cashCheckout as unknown as Record<string, unknown>,
      addOn: cashAddOn as unknown as Record<string, unknown>,
      histories: cashEvidence.statusHistory as unknown as Array<Record<string, unknown>>,
      events: cashEvents as unknown as Array<Record<string, unknown>>
    },
    {
      order: {
        status: "COMPLETED", paymentMethod: "CASH", paymentStatus: "CONFIRMED",
        paymentAmountJpy: 11_000, paymentConfirmedById: fixture.technician.id,
        paymentConfirmedAt: cashReceiptEvent.occurredAt,
        paymentReference: `checkout:${cashCheckout.id}:technician-receipt`,
        paymentNote: receiptInput.reason
      },
      session: {
        id: cashSession.id, bookingOrderId: cashOrder.id,
        startedByUserId: fixture.technician.id, startedAt: cashStartedEvent.occurredAt,
        expectedEndsAt: new Date(cashStartedEvent.occurredAt.getTime() + 90 * 60_000),
        endedByUserId: fixture.technician.id, endedAt: cashEndedEvent.occurredAt,
        deletedAt: null
      },
      checkout: {
        id: cashCheckout.id, bookingOrderId: cashOrder.id, paymentMethod: "CASH",
        createdAt: cashCheckoutEvent.occurredAt,
        paymentSelectedAt: cashSelectionEvent.occurredAt, ledgerTransactionId: null,
        receiptConfirmedById: fixture.technician.id,
        receiptConfirmedAt: cashReceiptEvent.occurredAt,
        receiptConfirmationReason: receiptInput.reason, deletedAt: null
      },
      addOn: {
        id: cashAddOn.id, bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
        serviceId: fixture.addOnServiceId, status: "ACCEPTED",
        serviceNameSnapshot: "Formal add-on", priceAmountJpy: 2_200,
        currency: "JPY", durationMinutes: 30,
        serviceSnapshotJson: {
          serviceId: fixture.addOnServiceId, name: "Formal add-on", description: null,
          priceAmountJpy: 2_200, currency: "JPY", durationMinutes: 30
        },
        proposedByUserId: fixture.technician.id, proposedAt: cashProposedEvent.occurredAt,
        acceptedByUserId: fixture.customer.id, acceptedAt: cashAcceptedEvent.occurredAt,
        rejectedByUserId: null, rejectedAt: null, resolutionReason: null, deletedAt: null
      },
      histories: [
        {
          fromStatus: "PENDING", toStatus: "CONFIRMED", actorUserId: fixture.technician.id,
          reason: "Formal checker fixture"
        },
        {
          fromStatus: "CONFIRMED", toStatus: "IN_SERVICE", actorUserId: fixture.technician.id,
          reason: "service_started", createdAt: cashStartedEvent.occurredAt
        },
        {
          fromStatus: "IN_SERVICE", toStatus: "AWAITING_CHECKOUT",
          actorUserId: fixture.technician.id, reason: "completed",
          createdAt: cashEndedEvent.occurredAt
        },
        {
          fromStatus: "AWAITING_CHECKOUT", toStatus: "AWAITING_PAYMENT_CONFIRMATION",
          actorUserId: fixture.customer.id, reason: "checkout_payment_method_selected",
          createdAt: cashSelectionEvent.occurredAt
        },
        {
          fromStatus: "AWAITING_PAYMENT_CONFIRMATION", toStatus: "COMPLETED",
          actorUserId: fixture.technician.id, reason: receiptInput.reason,
          createdAt: cashReceiptEvent.occurredAt
        }
      ],
      events: [
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: null, orderCheckoutId: null, eventType: "SERVICE_STARTED",
          actorUserId: fixture.technician.id, idempotencyKey: cashStartInput.idempotencyKey,
          reason: null, metadata: {
            actor: "technician", requestIp: context.ip, requestUserAgent: context.userAgent
          }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: cashAddOn.id, orderCheckoutId: null, eventType: "ADD_ON_PROPOSED",
          actorUserId: fixture.technician.id, idempotencyKey: cashProposalInput.idempotencyKey,
          reason: null, metadata: {
            actor: "technician", requestIp: context.ip, requestUserAgent: context.userAgent,
            serviceId: fixture.addOnServiceId
          }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: cashAddOn.id, orderCheckoutId: null, eventType: "ADD_ON_ACCEPTED",
          actorUserId: fixture.customer.id, idempotencyKey: cashAcceptInput.idempotencyKey,
          reason: null, metadata: {
            actor: "customer", requestIp: context.ip, requestUserAgent: context.userAgent,
            decision: "accept"
          }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: null, orderCheckoutId: null, eventType: "SERVICE_ENDED",
          actorUserId: fixture.technician.id, idempotencyKey: cashEndInput.idempotencyKey,
          reason: "completed", metadata: {
            actor: "technician", requestIp: context.ip, requestUserAgent: context.userAgent
          }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: null, orderCheckoutId: cashCheckout.id,
          eventType: "CHECKOUT_CREATED", actorUserId: fixture.customer.id,
          idempotencyKey: `checkout:${cashOrder.id}:created`, reason: null,
          metadata: { checkoutAmountJpy: 11_000, payableNdp: 11_000, rateRuleId: fixture.rateId }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: null, orderCheckoutId: cashCheckout.id,
          eventType: "PAYMENT_METHOD_SELECTED", actorUserId: fixture.customer.id,
          idempotencyKey: cashSelectionInput.idempotencyKey,
          reason: null, metadata: { method: "cash" }
        },
        {
          bookingOrderId: cashOrder.id, serviceSessionId: cashSession.id,
          orderAddOnId: null, orderCheckoutId: cashCheckout.id,
          eventType: "RECEIPT_CONFIRMED", actorUserId: fixture.technician.id,
          idempotencyKey: receiptInput.idempotencyKey, reason: receiptInput.reason,
          metadata: {
            paymentEvidence: "technician_receipt_confirmation", reason: receiptInput.reason
          }
        }
      ]
    },
    "cash"
  );
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

  const pendingAddOnOrder = await createConfirmedOrder(tx, fixture, 4, now, currency);
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

async function runInsufficientBalanceRollbackFlow(tx: Prisma.TransactionClient): Promise<void> {
  const now = new Date();
  const { fixture, service, currency, customer, context } = await createFormalFlowHarness(tx, now);
  const order = await createConfirmedOrder(tx, fixture, 1, now, currency);
  await service.startService(customer, order.id, {
    actor: "customer", idempotencyKey: `${fixture.marker}-insufficient-start`
  }, context);
  await service.endService(customer, order.id, {
    reason: "completed", idempotencyKey: `${fixture.marker}-insufficient-end`
  }, context);
  await service.getCheckout(customer, order.id);
  await service.selectCheckoutPaymentMethod(customer, order.id, {
    method: "ndp", idempotencyKey: `${fixture.marker}-insufficient-select`
  }, context);
  await service.payCheckoutWithNdp(customer, order.id, {
    idempotencyKey: `${fixture.marker}-insufficient-pay`
  }, context);
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
    await runExpectedFailureRollbackTransaction(
      prisma,
      () => captureExternalBaseline(prisma),
      runInsufficientBalanceRollbackFlow,
      "error.wallet.insufficient_available"
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
