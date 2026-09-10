import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("merchant technician application OpenAPI", () => {
  it("documents the default review history and explicit withdrawn filter", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, { get?: { parameters?: Array<{ name?: string; description?: string }> } }>;
    };
    const parameters = document.paths["/api/v1/merchant/technician-applications"]?.get?.parameters ?? [];
    const status = parameters.find((parameter) => parameter.name === "status");

    expect(status?.description).toContain("submitted, under_review, approved, and rejected");
    expect(status?.description).toContain("withdrawn");
    expect(status?.description).toContain("explicit");
  });
});
