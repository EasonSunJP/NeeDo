import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("shop visibility OpenAPI contract", () => {
  it("documents the closed visibility enum and scoped read/write operations", () => {
    const document = createOpenApiDocument(env) as {
      components: { schemas: { ShopVisibility: { enum: string[] } } };
      paths: Record<
        string,
        {
          get: Record<string, unknown>;
          put: Record<string, unknown>;
        }
      >;
    };
    const path = document.paths["/api/v1/merchant-admin/shops/{shopId}/visibility"];

    expect(document.components.schemas.ShopVisibility.enum).toEqual([
      "public",
      "privateAll",
      "limited",
      "network"
    ]);
    expect(path.get).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-permission": "merchant-admin:shop:read"
      })
    );
    expect(path.put).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-permission": "merchant-admin:shop:write",
        requestBody: expect.objectContaining({ required: true })
      })
    );
  });

  it("documents optional bearer identity on every relationship-aware public read", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, { get: { security?: Array<Record<string, unknown>> } }>;
    };
    const paths = [
      "/api/v1/services",
      "/api/v1/services/{id}",
      "/api/v1/services/{id}/reviews",
      "/api/v1/home/recommendations",
      "/api/v1/search",
      "/api/v1/shops/{id}",
      "/api/v1/technicians/{id}",
      "/api/v1/shops/{shopId}/booking-navigation",
      "/api/v1/shops/{shopId}/technicians/{technicianId}/services",
      "/api/v1/technicians/{technicianId}/services",
      "/api/v1/schedule/availability"
    ];

    for (const path of paths) {
      expect(document.paths[path].get.security).toEqual([{}, { bearerAuth: [] }]);
    }
  });

  it("documents the source-scoped intelligence shop detail query", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, { get: { parameters: Array<{ name: string; in: string; schema: Record<string, unknown> }> } }>;
    };
    expect(document.paths["/api/v1/shops/{id}"].get.parameters).toContainEqual(
      expect.objectContaining({
        name: "sourcePostId",
        in: "query",
        schema: expect.objectContaining({ type: "integer", minimum: 1 })
      })
    );
  });
});
