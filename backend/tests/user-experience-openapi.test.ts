import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("user experience OpenAPI contract", () => {
  it("documents customer summary and permissioned paginated backoffice history", () => {
    const document = createOpenApiDocument(env);
    type Operation = {
      security?: Array<Record<string, unknown>>;
      responses?: Record<string, unknown>;
      parameters?: unknown[];
    };
    const paths = document.paths as Record<string, { get?: Operation }>;
    const components = document.components as { schemas: Record<string, unknown> };
    const summary = paths["/api/v1/me/experience"]?.get;
    const history = paths["/api/v1/backoffice/users/{userId}/experience-entries"]?.get;

    expect(summary?.security).toEqual([{ bearerAuth: [] }]);
    expect(summary?.responses?.[200]).toBeDefined();
    expect(history?.security).toEqual([{ bearerAuth: [] }]);
    expect(history?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "userId", in: "path", required: true }),
        expect.objectContaining({ name: "page", in: "query" }),
        expect.objectContaining({ name: "pageSize", in: "query" })
      ])
    );
    expect(components.schemas.UserExperienceSummary).toBeDefined();
    expect(components.schemas.UserExperienceEntry).toBeDefined();
  });
});
