import { env } from "../src/config/env";
import type { RouteProviderHealthStorePort } from "../src/services/route-provider-health";
import {
  TravelOperationsService,
  type TravelOperationsRepositoryPort
} from "../src/services/travel-operations.service";

const repository: jest.Mocked<TravelOperationsRepositoryPort> = {
  listFarePolicies: jest.fn()
};

const auditLogService = {
  record: jest.fn(async () => undefined)
};

const configured = {
  ...env,
  TRAVEL_ROUTE_PROVIDER: "geoapify" as const,
  GEOAPIFY_API_KEY: "geoapify-secret-key-123456"
};

describe("travel operations provider status", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("awaits the shared health store and returns its redacted observation", async () => {
    const healthStore: jest.Mocked<RouteProviderHealthStorePort> = {
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      read: jest.fn<
        ReturnType<RouteProviderHealthStorePort["read"]>,
        Parameters<RouteProviderHealthStorePort["read"]>
      >(async () => ({
        status: "healthy",
        checkedAt: "2026-09-05T12:34:56.000Z"
      }))
    };
    const service = new TravelOperationsService(
      configured,
      repository,
      auditLogService,
      healthStore
    );

    await expect(service.getProviderStatus({} as never, {} as never)).resolves.toMatchObject({
      providerCode: "geoapify",
      status: "healthy",
      configured: true,
      checkedAt: "2026-09-05T12:34:56.000Z"
    });
    expect(healthStore.read).toHaveBeenCalledWith("geoapify");
    expect(JSON.stringify(auditLogService.record.mock.calls)).not.toContain(
      "geoapify-secret-key-123456"
    );
  });

  it("fails closed when the shared health store cannot be read", async () => {
    const healthStore: jest.Mocked<RouteProviderHealthStorePort> = {
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      read: jest.fn<
        ReturnType<RouteProviderHealthStorePort["read"]>,
        Parameters<RouteProviderHealthStorePort["read"]>
      >(async () => {
        throw Object.assign(new Error("error.dependency.redis_unavailable"), {
          code: 50301,
          statusCode: 503
        });
      })
    };
    const service = new TravelOperationsService(
      configured,
      repository,
      auditLogService,
      healthStore
    );

    await expect(service.getProviderStatus({} as never, {} as never)).rejects.toMatchObject({
      message: "error.dependency.redis_unavailable",
      statusCode: 503
    });
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});
