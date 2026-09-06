import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/reference/administrative-regions", () => {
  it("returns public localized children without authentication", async () => {
    const administrativeRegionRepository = {
      listChildren: jest.fn(async () => [
        {
          code: "13104",
          name: "新宿区",
          level: "admin2" as const,
          parentCode: "13",
          centroid: { lat: 35.6938, lng: 139.7034 }
        }
      ]),
      resolveVerifiedScope: jest.fn()
    };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      administrativeRegionRepository
    } as never);

    await request(app)
      .get("/api/v1/reference/administrative-regions?country=JP&parent=13&locale=ja")
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          code: 0,
          message: "success",
          data: {
            list: [
              {
                code: "13104",
                name: "新宿区",
                parentCode: "13",
                level: "admin2",
                centroid: { lat: 35.6938, lng: 139.7034 }
              }
            ]
          }
        });
      });

    expect(administrativeRegionRepository.listChildren).toHaveBeenCalledWith({
      country: "JP",
      parent: "13",
      locale: "ja"
    });
  });

  it("rejects unsupported countries and unknown query fields before repository access", async () => {
    const administrativeRegionRepository = {
      listChildren: jest.fn(async () => []),
      resolveVerifiedScope: jest.fn()
    };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      administrativeRegionRepository
    } as never);

    await request(app).get("/api/v1/reference/administrative-regions?country=US").expect(400);
    await request(app)
      .get("/api/v1/reference/administrative-regions?country=JP&extra=true")
      .expect(400);

    expect(administrativeRegionRepository.listChildren).not.toHaveBeenCalled();
  });
});
