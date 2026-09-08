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
  createRepository?: (
    databaseUrl: string,
    allowPublicKeyRetrieval: boolean
  ) => StagingAdminBootstrapRuntime;
  writeOutput?: (value: string) => void;
}

const createPrismaRepository = (
  databaseUrl: string,
  allowPublicKeyRetrieval: boolean
): StagingAdminBootstrapRuntime => {
  const parsedUrl = new URL(databaseUrl);
  const database = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(
      {
        host: parsedUrl.hostname,
        port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
        user: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
        password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
        database,
        allowPublicKeyRetrieval
      },
      { database }
    ),
    log: ["error"]
  });
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
  const allowPublicKeyRetrieval =
    environment.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL?.trim().toLowerCase() === "true";
  const runtime = (options.createRepository ?? createPrismaRepository)(
    databaseUrl,
    allowPublicKeyRetrieval
  );

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
