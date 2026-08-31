import { parentPort, workerData } from "node:worker_threads";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { createMariaDbPoolConfig, type DatabaseEnvConfig } from "../config/database";
import { AuthRepository } from "../repositories/auth.repository";

interface CompletionWorkerData {
  config: DatabaseEnvConfig;
  socketTimeoutMs: number;
}

interface CompletionRequest {
  requestId: number;
  input: {
    auditId: number;
    operationId: string;
  };
}

const data = workerData as CompletionWorkerData;
const poolConfig = createMariaDbPoolConfig(data.config);
const client = new PrismaClient({
  adapter: new PrismaMariaDb(
    {
      ...poolConfig,
      connectionLimit: 1,
      connectTimeout: Math.min(poolConfig.connectTimeout, data.socketTimeoutMs),
      socketTimeout: data.socketTimeoutMs
    },
    { database: poolConfig.database }
  ),
  log: ["error"]
});
const repository = new AuthRepository(client);

parentPort?.on("message", async (request: CompletionRequest) => {
  try {
    const result = await repository.completeMerchantShopSwitchAudit(request.input);
    parentPort?.postMessage({ requestId: request.requestId, result });
  } catch {
    parentPort?.postMessage({
      requestId: request.requestId,
      error: "Merchant shop audit completion failed"
    });
  }
});
