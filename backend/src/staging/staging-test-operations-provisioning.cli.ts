import { disconnectPrisma, prisma } from "../prisma/client";
import {
  parseStagingTestOperationsConfig,
  StagingTestOperationsProvisioner
} from "./staging-test-operations-provisioning";

const main = async (): Promise<void> => {
  const config = parseStagingTestOperationsConfig(process.env);
  try {
    const result = await new StagingTestOperationsProvisioner(prisma).provision(config);
    console.log(JSON.stringify({ gate: "staging-test-operations-provisioning", status: "passed", ...result }));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(JSON.stringify({
    gate: "staging-test-operations-provisioning",
    status: "failed",
    reason: error instanceof Error ? error.message : String(error)
  }));
  process.exitCode = 1;
});
