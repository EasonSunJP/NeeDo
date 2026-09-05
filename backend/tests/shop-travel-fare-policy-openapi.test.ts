import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { TRAVEL_FARE_PERMISSIONS } from "../src/constants/permissions.constants";

describe("merchant travel fare policy OpenAPI", () => {
  it("documents strict publication, permission separation, history pagination and stable errors", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, {
        get: Record<string, unknown> & { parameters?: Array<Record<string, unknown>> };
        post?: Record<string, unknown> & { responses: Record<string, unknown> };
      }>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const current = document.paths["/api/v1/merchant-admin/travel-fare-policy"].get;
    const versions = document.paths["/api/v1/merchant-admin/travel-fare-policy/versions"];
    const input = document.components.schemas.ShopTravelFarePolicyPublishInput;

    expect(current["x-permission"]).toBe(TRAVEL_FARE_PERMISSIONS.merchantRead);
    expect(versions.get["x-permission"]).toBe(TRAVEL_FARE_PERMISSIONS.merchantRead);
    expect(versions.post?.["x-permission"]).toBe(TRAVEL_FARE_PERMISSIONS.merchantWrite);
    expect(input?.additionalProperties).toBe(false);
    expect(input?.required).toEqual(["expectedVersion", "effectiveFrom", "reason", "bands"]);
    expect(versions.get.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "page" }),
      expect.objectContaining({ name: "pageSize" })
    ]));
    expect(versions.post?.responses).toEqual(expect.objectContaining({ "400": expect.anything(), "401": expect.anything(), "403": expect.anything(), "409": expect.anything() }));
  });
});
