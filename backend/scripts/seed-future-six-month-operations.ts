import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const apply = process.argv.includes("--apply");

  const [
    { getSimulationSeedConfig },
    { prisma, disconnectPrisma },
    { applyFutureOperationsPlan, loadFutureOperationsCohort, inspectFutureOperationsWindow },
    {
      buildFutureSixMonthOperationsPlan,
      summarizeFutureOperationsPlan,
      validateFutureOperationsPlan
    }
  ] = await Promise.all([
    import("../src/simulation/simulation-seed-config"),
    import("../src/prisma/client"),
    import("../src/simulation/future-six-month-operations-dataset"),
    import("../src/simulation/future-six-month-operations-plan")
  ]);
  const seedConfig = getSimulationSeedConfig(process.env);

  try {
    const cohort = await loadFutureOperationsCohort(prisma);
    const plan = buildFutureSixMonthOperationsPlan(cohort);
    const validation = validateFutureOperationsPlan(plan);
    const inspection = await inspectFutureOperationsWindow(prisma, plan);
    const summary = summarizeFutureOperationsPlan(plan);
    const result = apply
      ? await applyFutureOperationsPlan(prisma, plan)
      : { mode: "dry-run" as const, summary };
    console.log(
      JSON.stringify(
        {
          database: seedConfig.databaseName,
          mode: apply ? "apply" : "dry-run",
          account: {
            customers: cohort.customers.length,
            technicians: cohort.technicians.length,
            shops: new Set(cohort.technicians.map((technician) => technician.shopId)).size
          },
          inspection,
          result,
          summary,
          validation
        },
        null,
        2
      )
    );
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Future operations command failed.");
  process.exitCode = 1;
});
