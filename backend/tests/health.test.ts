import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns the unified success response shape", async () => {
    const response = await request(
      createApp(undefined, {
        redisHealthCheck: async () => ({ status: "ok", latencyMs: 2 })
      })
    )
      .get("/api/v1/health")
      .expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        status: "ok",
        service: "needo-backend",
        timestamp: expect.any(String),
        dependencies: {
          redis: {
            status: "ok",
            latencyMs: expect.any(Number)
          }
        }
      }
    });
    expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
  });

  it("reports degraded status when Redis health fails", async () => {
    const response = await request(
      createApp(undefined, {
        redisHealthCheck: async () => ({ status: "error", message: "Redis unavailable" })
      })
    )
      .get("/api/v1/health")
      .expect(200);

    expect(response.body.data.status).toBe("degraded");
    expect(response.body.data.dependencies.redis).toEqual({
      status: "error",
      message: "Redis unavailable"
    });
  });
});
