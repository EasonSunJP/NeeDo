import {
  assertSafeTestNdpRuntime,
  assertTestNdpFoundation,
  readTestNdpFoundationSnapshot
} from "./check-test-ndp-foundation";

interface BackfillUser {
  id: number;
  isTestAccount: boolean;
}

type PreviewQueryClient = {
  $queryRawUnsafe(query: string): Promise<unknown>;
};

interface BackfillPreviewRow {
  id: bigint | number;
  isTestAccount: bigint | boolean | number;
  walletId: bigint | number | null;
  availableBalance: bigint | number;
}

export interface TestNdpBackfillPreview {
  schemaReady: boolean;
  users: number;
  testUsers: number;
  wallets: number;
  proposedCredits: number;
  proposedCreditAmount: number;
  proposedDebits: number;
  proposedDebitAmount: number;
  unchanged: number;
}

export const isTestNdpSchemaReady = async (client: PreviewQueryClient): Promise<boolean> => {
  const rows = (await client.$queryRawUnsafe(
    "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'users' AND column_name = 'is_test_account') OR (table_name = 'wallet_holds' AND column_name = 'currency') OR (table_name = 'order_financials' AND column_name = 'ndp_currency'))"
  )) as Array<{ count: bigint | number }>;
  return Number(rows[0]?.count ?? 0) === 3;
};

export const readTestNdpBackfillPreview = async (
  client: PreviewQueryClient,
  schemaReady: boolean
): Promise<TestNdpBackfillPreview> => {
  const rows = (await client.$queryRawUnsafe(
    schemaReady
      ? "SELECT u.id, u.is_test_account AS isTestAccount, w.id AS walletId, COALESCE(w.available_balance, 0) AS availableBalance FROM users u LEFT JOIN wallets w ON w.owner_type = 'user' AND w.owner_id = u.id AND w.currency = 'TEST_NDP' AND w.deleted_at IS NULL WHERE u.deleted_at IS NULL ORDER BY u.id ASC"
      : "SELECT u.id, FALSE AS isTestAccount, w.id AS walletId, COALESCE(w.available_balance, 0) AS availableBalance FROM users u LEFT JOIN wallets w ON w.owner_type = 'user' AND w.owner_id = u.id AND w.currency = 'NDP' AND w.deleted_at IS NULL WHERE u.deleted_at IS NULL ORDER BY u.id ASC"
  )) as BackfillPreviewRow[];
  const deltas = rows.map((row) => 100_000 - Number(row.availableBalance));

  return {
    schemaReady,
    users: rows.length,
    testUsers: rows.filter((row) => Boolean(row.isTestAccount)).length,
    wallets: rows.filter((row) => row.walletId !== null).length,
    proposedCredits: deltas.filter((delta) => delta > 0).length,
    proposedCreditAmount: deltas.reduce((total, delta) => total + Math.max(0, delta), 0),
    proposedDebits: deltas.filter((delta) => delta < 0).length,
    proposedDebitAmount: deltas.reduce((total, delta) => total + Math.max(0, -delta), 0),
    unchanged: deltas.filter((delta) => delta === 0).length
  };
};

const main = async (): Promise<void> => {
  const { config } = await import("dotenv");
  config({ path: process.env.ENV_FILE ?? ".env" });
  assertSafeTestNdpRuntime(process.env);
  const apply = process.argv.includes("--apply");
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");

  try {
    const schemaReady = await isTestNdpSchemaReady(prisma);
    const preview = await readTestNdpBackfillPreview(prisma, schemaReady);
    process.stdout.write(`${JSON.stringify({ mode: apply ? "apply" : "dry-run", ...preview }, null, 2)}\n`);
    if (!apply) return;
    if (!schemaReady) {
      throw new Error("Test NDP migration must be applied before running the backfill.");
    }

    const users: BackfillUser[] = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, isTestAccount: true },
      orderBy: { id: "asc" }
    });
    if (preview.testUsers !== preview.users) {
      throw new Error("Test NDP backfill requires every current user to be classified as test.");
    }
    const preflight = await readTestNdpFoundationSnapshot(prisma);
    if (preflight.currencyMismatchCount !== 0 || preflight.formalExportableTestRows !== 0) {
      throw new Error("Test NDP backfill preflight found an inconsistent financial graph.");
    }

    const [repositoryModule, serviceModule] = await Promise.all([
      import("../src/repositories/test-ndp-provisioning.repository"),
      import("../src/services/test-ndp-provisioning.service")
    ]);
    const repository = new repositoryModule.TestNdpProvisioningRepository(prisma);
    const service = new serviceModule.TestNdpProvisioningService(repository);
    const results = [];
    for (const user of users) {
      results.push(await service.calibrateUser(user.id));
    }
    const snapshot = await readTestNdpFoundationSnapshot(prisma);
    assertTestNdpFoundation(snapshot);
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "applied",
          applied: results.filter((result) => result.status === "applied").length,
          alreadyApplied: results.filter((result) => result.status === "already_applied").length,
          snapshot
        },
        null,
        2
      )}\n`
    );
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
