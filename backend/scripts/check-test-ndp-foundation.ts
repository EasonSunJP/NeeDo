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
  currencyMismatchCount: number;
  formalExportableTestRows: number;
}

type QueryClient = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
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
    snapshot.currencyMismatchCount === 0,
    "wallet and transaction currencies must agree"
  );
  assertInvariant(
    snapshot.formalExportableTestRows === 0,
    "Test NDP must not be formally exportable"
  );
};

const scalarCount = async (client: QueryClient, query: string): Promise<number> => {
  const rows = await client.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(query);
  return Number(rows[0]?.count ?? 0);
};

export const readTestNdpFoundationSnapshot = async (
  client: QueryClient
): Promise<TestNdpFoundationSnapshot> => {
  const [
    activeUserCount,
    nonTestUserCount,
    userWalletCount,
    nonTargetBalanceCount,
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
    currencyMismatchCount,
    formalExportableTestRows
  };
};

const main = async (): Promise<void> => {
  const { config } = await import("dotenv");
  config({ path: process.env.ENV_FILE ?? ".env" });
  assertSafeTestNdpRuntime(process.env);
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const snapshot = await readTestNdpFoundationSnapshot(prisma);
    assertTestNdpFoundation(snapshot);
    process.stdout.write(`${JSON.stringify({ status: "ok", ...snapshot }, null, 2)}\n`);
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
