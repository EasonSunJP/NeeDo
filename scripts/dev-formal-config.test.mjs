import { describe, expect, it } from "vitest";
import { resolveFormalDevConfig } from "./dev-formal-config.mjs";

describe("formal development launcher config", () => {
  it("uses the formal backend and frontend defaults", () => {
    expect(resolveFormalDevConfig({})).toEqual({
      backendPort: 3000,
      frontendPort: 5180,
      merchantApiPort: 3002,
      merchantApiProxyTarget: "http://127.0.0.1:3002",
      merchantApiRedisUrl: "redis://127.0.0.1:6379/2",
      opsApiPort: 3001,
      opsApiProxyTarget: "http://127.0.0.1:3001",
      opsApiRedisUrl: "redis://127.0.0.1:6379/1",
      proxyTarget: "http://127.0.0.1:3000"
    });
  });

  it("accepts valid local port overrides and rejects invalid values", () => {
    expect(
      resolveFormalDevConfig({
        FORMAL_BACKEND_PORT: "3102",
        FORMAL_MERCHANT_API_PORT: "3104",
        FORMAL_MERCHANT_API_REDIS_URL: "redis://localhost:6380/12",
        FORMAL_OPS_API_PORT: "3103",
        FORMAL_OPS_API_REDIS_URL: "redis://localhost:6380/11",
        FRONTEND_PORT: "5181"
      })
    ).toEqual({
      backendPort: 3102,
      frontendPort: 5181,
      merchantApiPort: 3104,
      merchantApiProxyTarget: "http://127.0.0.1:3104",
      merchantApiRedisUrl: "redis://localhost:6380/12",
      opsApiPort: 3103,
      opsApiProxyTarget: "http://127.0.0.1:3103",
      opsApiRedisUrl: "redis://localhost:6380/11",
      proxyTarget: "http://127.0.0.1:3102"
    });
    expect(() => resolveFormalDevConfig({ FORMAL_BACKEND_PORT: "70000" })).toThrow(
      "FORMAL_BACKEND_PORT"
    );
  });

  it("rejects listener and Redis isolation collisions", () => {
    expect(() =>
      resolveFormalDevConfig({ FORMAL_BACKEND_PORT: "3001" })
    ).toThrow("distinct");
    expect(() =>
      resolveFormalDevConfig({
        FORMAL_MERCHANT_API_REDIS_URL: "redis://localhost:6379/8",
        FORMAL_OPS_API_REDIS_URL: "redis://localhost:6379/8"
      })
    ).toThrow("Redis");
  });
});
