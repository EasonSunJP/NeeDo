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

  it("sets public cache headers only for anonymous read APIs", () => {
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

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120"
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
