import { disconnectPrisma, prisma } from "../prisma/client";
import {
  parseStagingTestChibaShopConfig,
  StagingTestChibaShopProvisioner
} from "./staging-test-chiba-shop-provisioning";

const main = async (): Promise<void> => {
  const config = parseStagingTestChibaShopConfig(process.env);
  try {
    const result = await new StagingTestChibaShopProvisioner(prisma).provision(config);
    console.log(JSON.stringify({ gate: "staging-test-chiba-shop-provisioning", status: "passed", ...result }));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(JSON.stringify({
    gate: "staging-test-chiba-shop-provisioning",
    status: "failed",
    reason: error instanceof Error ? error.message : String(error)
  }));
  process.exitCode = 1;
});
