import {
  assertSafeTestNdpRuntime,
  assertTestNdpFoundation,
  readTestNdpFoundationSnapshot
} from "./check-test-ndp-foundation";

interface BackfillUser {
  id: number;
  isTestAccount: boolean;
}

interface BackfillWallet {
  ownerId: number;
  availableBalance: number;
}

const main = async (): Promise<void> => {
  const { config } = await import("dotenv");
  config({ path: process.env.ENV_FILE ?? ".env" });
  assertSafeTestNdpRuntime(process.env);
  const apply = process.argv.includes("--apply");
  const [{ prisma, disconnectPrisma }, repositoryModule, serviceModule] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/test-ndp-provisioning.repository"),
    import("../src/services/test-ndp-provisioning.service")
  ]);

  try {
    const users: BackfillUser[] = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, isTestAccount: true },
      orderBy: { id: "asc" }
    });
    const wallets: BackfillWallet[] = await prisma.wallet.findMany({
      where: {
        ownerType: "USER",
        ownerId: { in: users.map((user) => user.id) },
        currency: "TEST_NDP",
        deletedAt: null
      },
      select: { ownerId: true, availableBalance: true }
    });
    const balanceByUserId = new Map(wallets.map((wallet) => [wallet.ownerId, wallet.availableBalance]));
    const deltas = users.map((user) => 100_000 - (balanceByUserId.get(user.id) ?? 0));
    const preview = {
      mode: apply ? "apply" : "dry-run",
      users: users.length,
      testUsers: users.filter((user) => user.isTestAccount).length,
      wallets: wallets.length,
      proposedCredits: deltas.filter((delta) => delta > 0).length,
      proposedCreditAmount: deltas.reduce((total, delta) => total + Math.max(0, delta), 0),
      proposedDebits: deltas.filter((delta) => delta < 0).length,
      proposedDebitAmount: deltas.reduce((total, delta) => total + Math.max(0, -delta), 0),
      unchanged: deltas.filter((delta) => delta === 0).length
    };
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    if (!apply) return;

    if (preview.testUsers !== preview.users) {
      throw new Error("Test NDP backfill requires every current user to be classified as test.");
    }
    const preflight = await readTestNdpFoundationSnapshot(prisma);
    if (preflight.currencyMismatchCount !== 0 || preflight.formalExportableTestRows !== 0) {
      throw new Error("Test NDP backfill preflight found an inconsistent financial graph.");
    }

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
