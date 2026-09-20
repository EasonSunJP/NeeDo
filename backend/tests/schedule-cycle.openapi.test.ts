import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("schedule cycle OpenAPI", () => {
  it("documents merchant, technician, projection, and operations authority boundaries", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, { summary?: string; "x-required-permission"?: string }>>;
    };

    expect(document.paths["/api/v1/merchant-admin/schedule-cycles"]?.get?.["x-required-permission"]).toBe("schedule:slots:list");
    expect(document.paths["/api/v1/merchant-admin/schedule-cycles/{cycleId}/finalize"]?.post?.summary).toContain("bookable schedule slots");
    expect(document.paths["/api/v1/technician/schedule-cycles/{cycleId}/feedback"]?.put?.["x-required-permission"]).toBe("schedule:slots:write");
    expect(document.paths["/api/v1/backoffice/schedule-cycles"]?.get?.["x-required-permission"]).toBe("backoffice:schedule:list");
  });
});
