import { createServer, type Socket } from "node:net";
import type { AddressInfo } from "node:net";
import { env } from "../src/config/env";
import { createMerchantShopAuditCompletionRuntime } from "../src/prisma/merchant-shop-audit-completion.runtime";

describe("MerchantShopAuditCompletionRepository", () => {
  it("terminates its isolated Prisma execution unit so a silent in-flight query rejects", async () => {
    const sockets = new Set<Socket>();
    let acceptConnection: (() => void) | undefined;
    const connectionAccepted = new Promise<void>((resolve) => {
      acceptConnection = resolve;
    });
    const silentServer = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      acceptConnection?.();
    });
    await new Promise<void>((resolve) => silentServer.listen(0, "127.0.0.1", resolve));
    const address = silentServer.address() as AddressInfo;
    const runtime = createMerchantShopAuditCompletionRuntime(
      {
        ...env,
        DATABASE_URL: `mysql://user:password@127.0.0.1:${address.port}/needo`,
        DATABASE_POOL_CONNECT_TIMEOUT_MS: 10_000
      },
      { socketTimeoutMs: 10_000 }
    );

    try {
      const completion = runtime.repository.completeMerchantShopSwitchAudit({
        auditId: 91,
        operationId: "operation-91"
      });
      await connectionAccepted;
      const startedAt = Date.now();
      const destroyed = runtime.destroy();
      await expect(completion).rejects.toBeDefined();
      await expect(destroyed).resolves.toBeUndefined();
      expect(Date.now() - startedAt).toBeLessThan(2_000);
      await expect(runtime.destroy()).resolves.toBeUndefined();
    } finally {
      sockets.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve, reject) =>
        silentServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }, 20_000);
});
