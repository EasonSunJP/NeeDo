import { env } from "../src/config/env";
import { createRedisClient } from "../src/config/redis";
import { createLiveDashboardRuntime } from "../src/services/live-dashboard-runtime";

jest.mock("../src/config/env", () => ({
  ...jest.requireActual("../src/config/env"),
  env: { ...jest.requireActual("../src/config/env").env, SERVICE_NAME: "needo-backend", LIVE_DASHBOARD_REDIS_URL: undefined }
}));
jest.mock("../src/config/redis", () => ({
  createRedisClient: jest.fn(() => ({ on: jest.fn() })),
  checkRedisHealth: jest.fn(), disconnectRedis: jest.fn()
}));
jest.mock("../src/prisma/client", () => ({ disconnectPrisma: jest.fn() }));
jest.mock("../src/config/logger", () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock("../src/workers/official-notice.worker");
// Stop at the application boundary: real entrypoint, startup and live runtime
// execute, but no application, listener, worker or external connection starts.
jest.mock("../src/apps/ops-app", () => ({ createOpsApp: () => { throw new Error("application boundary reached"); } }));
jest.mock("../src/apps/merchant-app", () => ({ createMerchantApp: () => { throw new Error("application boundary reached"); } }));

describe("actual split entrypoints with default environment service identity", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["ops-server", "merchant-server"])("%s rejects a missing shared live target before creating any Redis client", async (entrypoint) => {
    expect(env.SERVICE_NAME).toBe("needo-backend");
    expect(env.LIVE_DASHBOARD_REDIS_URL).toBeUndefined();
    await expect(import(`../src/${entrypoint}`)).rejects.toThrow("LIVE_DASHBOARD_REDIS_URL is required");
    expect(createRedisClient).not.toHaveBeenCalled();
  });

  it("keeps the monolith fallback intentional without changing its environment", async () => {
    const runtime = createLiveDashboardRuntime(env);
    expect(createRedisClient).toHaveBeenCalledTimes(4);
    for (const [config] of jest.mocked(createRedisClient).mock.calls) {
      expect(config?.REDIS_URL).toBe(env.REDIS_URL);
    }
    expect(env.SERVICE_NAME).toBe("needo-backend");
    await runtime.close();
  });
});
