import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import {
  PrismaTechnicianShopAffiliationBackfillRuntime,
  runTechnicianShopAffiliationBackfill,
  type TechnicianShopAffiliationBackfillReport,
  type TechnicianShopAffiliationBackfillRuntime
} from "./backfill-technician-shop-affiliations";
import { PrismaUnifiedIdentifierBackfillRuntime } from "./backfill-unified-identifiers";
import { checkUnifiedIdentifierCutover } from "./check-unified-identifier-cutover";

export interface TechnicianShopAffiliationCutoverCheckResult {
  ready: boolean;
  report: TechnicianShopAffiliationBackfillReport;
}

export const checkTechnicianShopAffiliationCutover = async (
  runtime: TechnicianShopAffiliationBackfillRuntime,
  batchSize: number
): Promise<TechnicianShopAffiliationCutoverCheckResult> => {
  const report = await runTechnicianShopAffiliationBackfill(runtime, {
    mode: "dry-run",
    batchSize
  });
  return {
    ready: report.issues.length === 0 && report.after.pendingOperations === 0,
    report
  };
};

const parseBatchSize = (args: string[]): number => {
  const raw = args.find((argument) => argument.startsWith("--batch-size="))?.split("=")[1];
  const batchSize = Number(raw ?? "100");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("--batch-size must be an integer from 1 through 500");
  }
  return batchSize;
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const batchSize = parseBatchSize(process.argv.slice(2));
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const unifiedIdentifiers = await checkUnifiedIdentifierCutover(
      new PrismaUnifiedIdentifierBackfillRuntime(prisma),
      batchSize
    );
    const affiliations = await checkTechnicianShopAffiliationCutover(
      new PrismaTechnicianShopAffiliationBackfillRuntime(prisma),
      batchSize
    );
    const result = {
      ready: unifiedIdentifiers.ready && affiliations.ready,
      unifiedIdentifiersReady: unifiedIdentifiers.ready,
      affiliations
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ready) process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
