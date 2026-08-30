export interface TestNdpRuntimeEnvironment {
  NODE_ENV?: string;
  DEPLOY_ENV?: string;
  DATABASE_URL?: string;
}

export interface TestNdpFoundationSnapshot {
  activeUserCount: number;
  nonTestUserCount: number;
  userWalletCount: number;
  nonTargetBalanceCount: number;
  testNdpAvailableBalanceTotal: number;
  testNdpFrozenBalanceTotal: number;
  currencyMismatchCount: number;
  formalExportableTestRows: number;
}

export interface TestNdpMigrationPreflightSnapshot {
  activeUserCount: number;
  deletedUserCount: number;
  walletCount: number;
  ndpWalletCount: number;
  testNdpWalletCount: number;
  ndpAvailableBalanceTotal: number;
  ndpFrozenBalanceTotal: number;
  ledgerTransactionCount: number;
  ndpLedgerTransactionCount: number;
  ndpReconciliationCount: number;
  walletHoldWithNdpCount: number;
  orderFinancialCount: number;
  walletCurrencyCollisionCount: number;
  relationshipInconsistencyCount: number;
}

export type TestNdpCheckPhase = "preflight" | "postflight";

type QueryClient = {
  $queryRawUnsafe(query: string): Promise<unknown>;
};

const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const UNSAFE_DATABASE_NAME = /(^|[_-])(prod|production|staging)([_-]|$)/i;

const failUnsafeRuntime = (): never => {
  throw new Error(
    "Test NDP commands are allowed only for a local non-production MySQL database."
  );
};

export const assertSafeTestNdpRuntime = (environment: TestNdpRuntimeEnvironment): void => {
  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase() ?? "";
  const deployEnvironment = environment.DEPLOY_ENV?.trim().toLowerCase() ?? "";
  const databaseUrlValue = environment.DATABASE_URL;
  if (
    BLOCKED_ENVIRONMENTS.has(nodeEnvironment) ||
    BLOCKED_ENVIRONMENTS.has(deployEnvironment)
  ) {
    return failUnsafeRuntime();
  }
  if (!databaseUrlValue) return failUnsafeRuntime();

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    return failUnsafeRuntime();
  }
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  if (
    databaseUrl.protocol !== "mysql:" ||
    !LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname) ||
    databaseName.length === 0 ||
    UNSAFE_DATABASE_NAME.test(databaseName)
  ) {
    return failUnsafeRuntime();
  }
};

const assertInvariant: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const assertTestNdpFoundation = (snapshot: TestNdpFoundationSnapshot): void => {
  assertInvariant(snapshot.nonTestUserCount === 0, "every current user must be a test account");
  assertInvariant(
    snapshot.userWalletCount === snapshot.activeUserCount,
    "every current user must have one Test NDP wallet"
  );
  assertInvariant(
    snapshot.nonTargetBalanceCount === 0,
    "every Test NDP user wallet must have 100000 available"
  );
  assertInvariant(
    snapshot.testNdpAvailableBalanceTotal === snapshot.activeUserCount * 100_000,
    "Test NDP available balance total must equal 100000 per current user"
  );
  assertInvariant(
    snapshot.currencyMismatchCount === 0,
    "wallet and transaction currencies must agree"
  );
  assertInvariant(
    snapshot.formalExportableTestRows === 0,
    "Test NDP must not be formally exportable"
  );
};

export const assertTestNdpMigrationPreflight = (
  snapshot: TestNdpMigrationPreflightSnapshot
): void => {
  assertInvariant(
    snapshot.walletCurrencyCollisionCount === 0,
    "NDP and Test NDP wallets would collide during reclassification"
  );
  assertInvariant(
    snapshot.relationshipInconsistencyCount === 0,
    "wallet and transaction relationships must be consistent before reclassification"
  );
};

export const resolveTestNdpCheckPhase = (argumentsList: string[]): TestNdpCheckPhase => {
  const phase = argumentsList
    .find((argument) => argument.startsWith("--phase="))
    ?.slice("--phase=".length);
  if (phase === "preflight" || phase === "postflight") return phase;
  throw new Error("Test NDP check requires --phase=preflight or --phase=postflight.");
};

const scalarCount = async (client: QueryClient, query: string): Promise<number> => {
  const rows = (await client.$queryRawUnsafe(query)) as Array<{
    count: bigint | number | string;
  }>;
  return Number(rows[0]?.count ?? 0);
};

export const readTestNdpMigrationPreflightSnapshot = async (
  client: QueryClient
): Promise<TestNdpMigrationPreflightSnapshot> => {
  const activeUserCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL"
  );
  const deletedUserCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NOT NULL"
  );
  const walletCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM wallets WHERE deleted_at IS NULL"
  );
  const ndpWalletCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM wallets WHERE currency = 'NDP' AND deleted_at IS NULL"
  );
  const testNdpWalletCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM wallets WHERE currency = 'TEST_NDP' AND deleted_at IS NULL"
  );
  const ndpAvailableBalanceTotal = await scalarCount(
    client,
    "SELECT COALESCE(SUM(available_balance), 0) AS count FROM wallets WHERE currency = 'NDP' AND deleted_at IS NULL"
  );
  const ndpFrozenBalanceTotal = await scalarCount(
    client,
    "SELECT COALESCE(SUM(frozen_balance), 0) AS count FROM wallets WHERE currency = 'NDP' AND deleted_at IS NULL"
  );
  const ledgerTransactionCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM ledger_transactions WHERE deleted_at IS NULL"
  );
  const ndpLedgerTransactionCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM ledger_transactions WHERE currency = 'NDP' AND deleted_at IS NULL"
  );
  const ndpReconciliationCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM finance_reconciliations WHERE currency = 'NDP' AND deleted_at IS NULL"
  );
  const walletHoldWithNdpCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM wallet_holds WHERE deleted_at IS NULL AND (hold_amount_ndp <> 0 OR captured_amount_ndp <> 0 OR released_amount_ndp <> 0)"
  );
  const orderFinancialCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM order_financials WHERE deleted_at IS NULL"
  );
  const walletCurrencyCollisionCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM (SELECT owner_type, owner_id FROM wallets WHERE currency IN ('NDP', 'TEST_NDP') AND deleted_at IS NULL GROUP BY owner_type, owner_id HAVING COUNT(DISTINCT currency) > 1) AS wallet_currency_collisions"
  );
  const relationshipInconsistencyCount = await scalarCount(
    client,
    "SELECT COUNT(*) AS count FROM wallet_ledgers wl LEFT JOIN wallets w ON w.id = wl.wallet_id LEFT JOIN ledger_transactions lt ON lt.id = wl.transaction_id WHERE wl.deleted_at IS NULL AND (w.id IS NULL OR lt.id IS NULL OR w.deleted_at IS NOT NULL OR lt.deleted_at IS NOT NULL OR w.currency <> lt.currency)"
  );

  return {
    activeUserCount,
    deletedUserCount,
    walletCount,
    ndpWalletCount,
    testNdpWalletCount,
    ndpAvailableBalanceTotal,
    ndpFrozenBalanceTotal,
    ledgerTransactionCount,
    ndpLedgerTransactionCount,
    ndpReconciliationCount,
    walletHoldWithNdpCount,
    orderFinancialCount,
    walletCurrencyCollisionCount,
    relationshipInconsistencyCount
  };
};

export const readTestNdpFoundationSnapshot = async (
  client: QueryClient
): Promise<TestNdpFoundationSnapshot> => {
  const [
    activeUserCount,
    nonTestUserCount,
    userWalletCount,
    nonTargetBalanceCount,
    testNdpAvailableBalanceTotal,
    testNdpFrozenBalanceTotal,
    currencyMismatchCount,
    formalExportableTestRows
  ] = await Promise.all([
    scalarCount(client, "SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL"),
    scalarCount(
      client,
      "SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL AND is_test_account = FALSE"
    ),
    scalarCount(
      client,
      "SELECT COUNT(*) AS count FROM wallets WHERE owner_type = 'user' AND currency = 'TEST_NDP' AND deleted_at IS NULL"
    ),
    scalarCount(
      client,
      "SELECT COUNT(*) AS count FROM users u LEFT JOIN wallets w ON w.owner_type = 'user' AND w.owner_id = u.id AND w.currency = 'TEST_NDP' AND w.deleted_at IS NULL WHERE u.deleted_at IS NULL AND (w.id IS NULL OR w.available_balance <> 100000)"
    ),
    scalarCount(
      client,
      "SELECT COALESCE(SUM(available_balance), 0) AS count FROM wallets WHERE owner_type = 'user' AND currency = 'TEST_NDP' AND deleted_at IS NULL"
    ),
    scalarCount(
      client,
      "SELECT COALESCE(SUM(frozen_balance), 0) AS count FROM wallets WHERE owner_type = 'user' AND currency = 'TEST_NDP' AND deleted_at IS NULL"
    ),
    scalarCount(
      client,
      "SELECT COUNT(*) AS count FROM wallet_ledgers wl INNER JOIN wallets w ON w.id = wl.wallet_id INNER JOIN ledger_transactions lt ON lt.id = wl.transaction_id WHERE wl.deleted_at IS NULL AND w.deleted_at IS NULL AND lt.deleted_at IS NULL AND w.currency <> lt.currency"
    ),
    scalarCount(
      client,
      "SELECT COUNT(*) AS count FROM finance_reconciliations fr INNER JOIN ledger_transactions lt ON lt.id = fr.transaction_id WHERE fr.deleted_at IS NULL AND lt.deleted_at IS NULL AND (fr.currency = 'TEST_NDP' OR lt.currency = 'TEST_NDP') AND fr.status <> 'test_only'"
    )
  ]);

  return {
    activeUserCount,
    nonTestUserCount,
    userWalletCount,
    nonTargetBalanceCount,
    testNdpAvailableBalanceTotal,
    testNdpFrozenBalanceTotal,
    currencyMismatchCount,
    formalExportableTestRows
  };
};

const main = async (): Promise<void> => {
  const { config } = await import("dotenv");
  config({ path: process.env.ENV_FILE ?? ".env" });
  assertSafeTestNdpRuntime(process.env);
  const phase = resolveTestNdpCheckPhase(process.argv.slice(2));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    if (phase === "preflight") {
      const snapshot = await readTestNdpMigrationPreflightSnapshot(prisma);
      assertTestNdpMigrationPreflight(snapshot);
      process.stdout.write(`${JSON.stringify({ status: "ok", phase, ...snapshot }, null, 2)}\n`);
      return;
    }
    const snapshot = await readTestNdpFoundationSnapshot(prisma);
    assertTestNdpFoundation(snapshot);
    process.stdout.write(`${JSON.stringify({ status: "ok", phase, ...snapshot }, null, 2)}\n`);
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
