import request from "supertest";
import { createApp } from "../src/app";
import { createStep06Fixture } from "./helpers/step06-fixture";

const settings = {
  version: 1,
  messageDays: 30,
  mediaDays: 3,
  updatedAt: new Date("2026-09-01T00:00:00.000Z")
};

const createService = () => ({
  get: jest.fn(async () => settings),
  update: jest.fn(async () => ({ ...settings, version: 2, messageDays: 45, mediaDays: 7 }))
});

describe("IM retention settings API", () => {
  it("requires read permission and returns only the operations projection", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ imPolicyService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:system-settings:read"]);
    const token = await fixture.loginAsAdmin();

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/system-settings/im-retention")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body.data).toEqual({ ...settings, updatedAt: settings.updatedAt.toISOString() });
    expect(response.body.data).not.toHaveProperty("textRetentionSeconds");
  });

  it("strictly validates whole-day updates and forwards request context", async () => {
    const service = createService();
    const fixture = await createStep06Fixture({ imPolicyService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:system-settings:write"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/im-retention")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedVersion: 1, messageDays: 30.5, mediaDays: 3 })
      .expect(400);
    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/im-retention")
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedVersion: 1, messageDays: 45, mediaDays: 7, localCacheDays: 1 })
      .expect(400);
    const body = { expectedVersion: 1, messageDays: 45, mediaDays: 7 };
    await request(fixture.app)
      .put("/api/v1/backoffice/system-settings/im-retention")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      expect.objectContaining({ ip: expect.any(String) }),
      body
    );
  });

  it("documents exact permissions, strict days, and the local-device boundary", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const operation = response.body.paths["/api/v1/backoffice/system-settings/im-retention"];
    expect(operation.get["x-required-permission"]).toBe("backoffice:system-settings:read");
    expect(operation.put["x-required-permission"]).toBe("backoffice:system-settings:write");
    expect(operation.get.description).toContain("do not delete device-local records or caches");
    expect(response.body.components.schemas.ImRetentionSettingsUpdate).toMatchObject({
      additionalProperties: false,
      required: ["expectedVersion", "messageDays", "mediaDays"]
    });
  });
});
