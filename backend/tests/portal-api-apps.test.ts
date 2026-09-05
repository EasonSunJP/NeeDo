import request from "supertest";
import { env } from "../src/config/env";
import { createMerchantApp } from "../src/apps/merchant-app";
import { merchantApiRouteManifest, opsApiRouteManifest } from "../src/apps/api-route-manifest";
import { createOpsApp } from "../src/apps/ops-app";

const healthDependencies = {
  databaseHealthCheck: async () => ({ status: "ok" as const, latencyMs: 1 }),
  redisHealthCheck: async () => ({ status: "ok" as const, latencyMs: 1 })
};

describe("portal API application boundaries", () => {
  it("keeps platform notice publication on ops and authenticated inboxes on both services", async () => {
    const ops = createOpsApp(env, healthDependencies);
    const merchant = createMerchantApp(env, healthDependencies);
    await request(ops).post("/api/v1/backoffice/official-notices").send({}).expect(401);
    await request(merchant).post("/api/v1/backoffice/official-notices").send({}).expect(404);
    await request(merchant).post("/api/v1/merchant-admin/official-notices").send({}).expect(401);
    await request(ops).post("/api/v1/merchant-admin/official-notices").send({}).expect(404);
    await request(ops).get("/api/v1/official-notices?locale=ja").expect(401);
    await request(merchant).get("/api/v1/official-notices?locale=ja").expect(401);
  });
  it("reports independently identifiable service names", async () => {
    const opsHealth = await request(createOpsApp(env, healthDependencies))
      .get("/api/v1/health")
      .expect(200);
    const merchantHealth = await request(createMerchantApp(env, healthDependencies))
      .get("/api/v1/health")
      .expect(200);

    expect(opsHealth.body.data.service).toBe("needo-ops-api");
    expect(merchantHealth.body.data.service).toBe("needo-merchant-api");
  });

  it("exposes operations routes only from the operations application", async () => {
    await request(createOpsApp(env, healthDependencies))
      .get("/api/v1/backoffice/dashboard")
      .expect(401);
    await request(createMerchantApp(env, healthDependencies))
      .get("/api/v1/backoffice/dashboard")
      .expect(404);
  });

  it("exposes merchant administration routes only from the merchant application", async () => {
    await request(createMerchantApp(env, healthDependencies))
      .get("/api/v1/merchant-admin/dashboard")
      .expect(401);
    await request(createOpsApp(env, healthDependencies))
      .get("/api/v1/merchant-admin/dashboard")
      .expect(404);
  });

  it("uses explicit, different route ownership manifests", () => {
    expect(opsApiRouteManifest).toContain("backoffice");
    expect(opsApiRouteManifest).not.toContain("merchant-admin");
    expect(merchantApiRouteManifest).toContain("merchant-admin");
    expect(merchantApiRouteManifest).not.toContain("backoffice");
    expect(opsApiRouteManifest).not.toEqual(merchantApiRouteManifest);
  });
});
