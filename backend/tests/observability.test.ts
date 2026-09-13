import request from "supertest";
import { env } from "../src/config/env";
import { createApp } from "../src/app";
import { createCacheHeadersMiddleware } from "../src/middlewares/cache.middleware";

describe("observability middleware", () => {
  it("propagates W3C trace ids to response headers", async () => {
    const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

    const response = await request(
      createApp(undefined, {
        redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
        databaseHealthCheck: async () => ({ status: "ok", latencyMs: 1, poolSize: 10 })
      })
    )
      .get("/api/v1/health")
      .set("traceparent", `00-${traceId}-00f067aa0ba902b7-01`)
      .expect(200);

    expect(response.headers["x-trace-id"]).toBe(traceId);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("emits Prometheus metrics for completed requests", async () => {
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      databaseHealthCheck: async () => ({ status: "ok", latencyMs: 1, poolSize: 10 })
    });

    await request(app).get("/api/v1/health").expect(200);

    const response = await request(app)
      .get("/api/v1/metrics")
      .expect("content-type", /text\/plain/)
      .expect(200);

    expect(response.text).toContain("http_requests_total");
    expect(response.text).toContain('path="/health"');
    expect(response.text).toContain("http_request_duration_seconds_bucket");
    expect(response.text).toContain("process_resident_memory_bytes");
  });

  it("exports dependency readiness, latency, and pool gauges", async () => {
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({
        status: "ok",
        latencyMs: 4,
        poolSize: 3,
        healthyClients: 3
      }),
      databaseHealthCheck: async () => ({ status: "ok", latencyMs: 7, poolSize: 20 })
    });

    await request(app).get("/api/v1/ready").expect(200);
    const response = await request(app).get("/api/v1/metrics").expect(200);

    expect(response.text).toContain('needo_dependency_up{dependency="database"} 1');
    expect(response.text).toContain(
      'needo_dependency_latency_seconds{dependency="database"} 0.007'
    );
    expect(response.text).toContain('needo_dependency_pool_size{dependency="database"} 20');
    expect(response.text).toContain('needo_dependency_up{dependency="redis"} 1');
    expect(response.text).toContain('needo_dependency_latency_seconds{dependency="redis"} 0.004');
    expect(response.text).toContain('needo_dependency_pool_size{dependency="redis"} 3');
    expect(response.text).toContain('needo_dependency_pool_healthy{dependency="redis"} 3');
  });

  it("requires revalidation and varies by authorization for visibility-sensitive reads", () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    createCacheHeadersMiddleware(env)(
      {
        method: "GET",
        path: "/api/v1/services"
      } as never,
      {
        setHeader
      } as never,
      next
    );

    expect(setHeader).toHaveBeenCalledWith("Vary", "Authorization");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "public, no-cache");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("never publicly caches relationship-scoped customer profile responses", () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    createCacheHeadersMiddleware(env)(
      { method: "GET", path: "/api/v1/profiles/customers/248" } as never,
      { setHeader } as never,
      next
    );

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("never publicly caches optional-auth shop reads when a viewer credential is present", () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    createCacheHeadersMiddleware(env)(
      {
        method: "GET",
        path: "/api/v1/shops/shop0000000001",
        get: (name: string) => (name.toLowerCase() === "authorization" ? "Bearer token" : undefined)
      } as never,
      { setHeader } as never,
      next
    );

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(setHeader).toHaveBeenCalledWith("Vary", "Authorization");
    expect(next).toHaveBeenCalledTimes(1);
  });
});
