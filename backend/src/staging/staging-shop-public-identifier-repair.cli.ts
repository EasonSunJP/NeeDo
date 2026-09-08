import { disconnectPrisma, prisma } from "../prisma/client";
import {
  parseStagingShopPublicIdentifierRepairConfig,
  repairStagingShopPublicIdentifier
} from "./staging-shop-public-identifier-repair";

const main = async (): Promise<void> => {
  const config = parseStagingShopPublicIdentifierRepairConfig(process.env);
  const result = await repairStagingShopPublicIdentifier(prisma, config);
  console.log(JSON.stringify({ status: "ok", ...result }));
};

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
