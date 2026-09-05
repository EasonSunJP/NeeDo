import {
  RedisRouteProviderHealthStore,
  ROUTE_PROVIDER_HEALTH_KEY_NAMESPACE
} from "../src/services/route-provider-health";

class SharedRedisFake {
  public isOpen = true;
  public readonly setCalls: Array<{
    key: string;
    value: string;
    options: { EX: number };
  }> = [];

  public constructor(private readonly values: Map<string, string>) {}

  public async connect(): Promise<void> {
    this.isOpen = true;
  }

  public async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  public async set(key: string, value: string, options: { EX: number }): Promise<string> {
    this.setCalls.push({ key, value, options });
    this.values.set(key, value);
    return "OK";
  }
}

describe("route provider health store", () => {
  it("shares a namespaced, expiring provider observation across independent clients", async () => {
    const values = new Map<string, string>();
    const writerClient = new SharedRedisFake(values);
    const readerClient = new SharedRedisFake(values);
    const writer = new RedisRouteProviderHealthStore(() => writerClient, {
      ttlSeconds: 120
    });
    const reader = new RedisRouteProviderHealthStore(() => readerClient, {
      ttlSeconds: 120
    });
    const checkedAt = new Date("2026-09-05T12:34:56.000Z");

    await writer.recordSuccess("geoapify", checkedAt);

    expect(writerClient.setCalls).toEqual([
      {
        key: `${ROUTE_PROVIDER_HEALTH_KEY_NAMESPACE}:geoapify`,
        value: JSON.stringify({ status: "healthy", checkedAt: checkedAt.toISOString() }),
        options: { EX: 120 }
      }
    ]);
    await expect(reader.read("geoapify")).resolves.toEqual({
      status: "healthy",
      checkedAt: checkedAt.toISOString()
    });
  });

  it("maps provider failures without persisting provider payloads or credentials", async () => {
    const values = new Map<string, string>();
    const client = new SharedRedisFake(values);
    const store = new RedisRouteProviderHealthStore(() => client, { ttlSeconds: 60 });

    await store.recordFailure(
      "geoapify",
      "error.travel.provider_rate_limited",
      new Date("2026-09-05T13:00:00.000Z")
    );

    expect(client.setCalls[0]?.value).toBe(
      JSON.stringify({ status: "rate_limited", checkedAt: "2026-09-05T13:00:00.000Z" })
    );
    expect(client.setCalls[0]?.value).not.toMatch(/apiKey|credential|secret/i);
  });

  it("fails closed with a stable redacted error when Redis storage is unavailable", async () => {
    const store = new RedisRouteProviderHealthStore(
      () =>
        ({
          isOpen: true,
          connect: async () => undefined,
          get: async () => {
            throw new Error("redis://default:super-secret@redis.internal:6379/0");
          },
          set: async () => "OK"
        }) as never,
      { ttlSeconds: 60 }
    );

    const error = await store.read("geoapify").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 50301,
      message: "error.dependency.redis_unavailable",
      statusCode: 503
    });
    expect(String(error)).not.toContain("super-secret");
  });

  it("fails closed when stored health JSON is malformed", async () => {
    const store = new RedisRouteProviderHealthStore(
      () =>
        ({
          isOpen: true,
          connect: async () => undefined,
          get: async () => "{not-json",
          set: async () => "OK"
        }) as never,
      { ttlSeconds: 60 }
    );

    await expect(store.read("geoapify")).rejects.toMatchObject({
      message: "error.dependency.redis_unavailable",
      statusCode: 503
    });
  });
});
