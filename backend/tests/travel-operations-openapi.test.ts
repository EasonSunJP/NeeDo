import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { TRAVEL_FARE_PERMISSIONS } from "../src/constants/permissions.constants";

describe("travel operations OpenAPI", () => {
  it("documents redacted provider readiness and paginated policy visibility", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, { get: Record<string, unknown> & { parameters?: Array<Record<string, unknown>> } }>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const provider = document.paths["/api/v1/backoffice/travel/providers/status"].get;
    const policies = document.paths["/api/v1/backoffice/travel/fare-policies"].get;
    const statusSchema = document.components.schemas.TravelRouteProviderStatus as { properties: Record<string, unknown> };
    const versionSchema = document.components.schemas.ShopTravelFarePolicyVersion as {
      required: string[];
    };

    expect(provider["x-permission"]).toBe(TRAVEL_FARE_PERMISSIONS.backofficeRead);
    expect((provider.responses as Record<string, unknown>)["503"]).toBeDefined();
    expect(policies["x-permission"]).toBe(TRAVEL_FARE_PERMISSIONS.backofficeRead);
    expect(policies.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "page" }),
      expect.objectContaining({ name: "pageSize" }),
      expect.objectContaining({ name: "city" }),
      expect.objectContaining({ name: "shopKeyword" })
    ]));
    expect(statusSchema.properties).not.toHaveProperty("apiKey");
    expect(statusSchema.properties).not.toHaveProperty("credentials");
    expect(versionSchema.required).toEqual(
      expect.arrayContaining(["publishedByUserId", "createdAt"])
    );
  });
});
