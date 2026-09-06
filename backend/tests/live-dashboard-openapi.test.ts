import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("live dashboard OpenAPI", () => {
  it("documents strict hierarchy input, auth/RBAC, cache state, and the no-PII response", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, { get?: Record<string, unknown> }>;
    };
    const operation = document.paths["/api/v1/backoffice/dashboard/live-snapshot"]?.get;

    expect(operation).toBeDefined();
    expect(operation?.security).toEqual([{ bearerAuth: [] }]);
    expect(operation?.["x-required-permission"]).toBe("backoffice:dashboard:read");
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "country", in: "query", required: true }),
        expect.objectContaining({ name: "admin1", in: "query" }),
        expect.objectContaining({ name: "admin2", in: "query" }),
        expect.objectContaining({ name: "period", in: "query" })
      ])
    );
    expect(operation?.responses).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object)
      })
    );
    expect(JSON.stringify(operation)).toContain("cacheStatus");
    expect(JSON.stringify(operation)).toContain("freshnessSeconds");
    expect(JSON.stringify(operation)).not.toMatch(/customerEmail|customerPhone|customerAddress/i);
  });
});
