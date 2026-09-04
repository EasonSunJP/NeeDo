import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import {
  StagingAdminBootstrapService,
  parseStagingAdminBootstrapConfig,
  type StagingAdminBootstrapRepositoryPort
} from "./staging-admin-bootstrap";
import { StagingAdminBootstrapRepository } from "./staging-admin-bootstrap.repository";

interface StagingAdminBootstrapRuntime {
  repository: StagingAdminBootstrapRepositoryPort;
  disconnect: () => Promise<void>;
}

interface RunStagingAdminBootstrapCliOptions {
  env?: NodeJS.ProcessEnv;
  createRepository?: (databaseUrl: string) => StagingAdminBootstrapRuntime;
  writeOutput?: (value: string) => void;
}

const createPrismaRepository = (databaseUrl: string): StagingAdminBootstrapRuntime => {
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl), log: ["error"] });
  return {
    repository: new StagingAdminBootstrapRepository(prisma),
    disconnect: () => prisma.$disconnect()
  };
};

export const runStagingAdminBootstrapCli = async (
  options: RunStagingAdminBootstrapCliOptions = {}
): Promise<void> => {
  const environment = options.env ?? process.env;
  const config = parseStagingAdminBootstrapConfig(environment);
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("STAGING_ADMIN_BOOTSTRAP_DATABASE_URL_MISSING");
  const runtime = (options.createRepository ?? createPrismaRepository)(databaseUrl);

  try {
    const result = await new StagingAdminBootstrapService(runtime.repository).bootstrap(config);
    (options.writeOutput ?? console.log)(
      JSON.stringify({ gate: "staging-admin-bootstrap", ...result })
    );
  } finally {
    await runtime.disconnect();
  }
};

if (require.main === module) {
  runStagingAdminBootstrapCli().catch(() => {
    console.error(
      JSON.stringify({
        gate: "staging-admin-bootstrap",
        status: "failed",
        reason: "STAGING_ADMIN_BOOTSTRAP_FAILED"
      })
    );
    process.exitCode = 1;
  });
}
