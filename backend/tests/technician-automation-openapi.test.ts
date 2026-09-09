import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("technician automation OpenAPI", () => {
  it("documents settings read/write and paginated IM contact options", () => {
    const document = createOpenApiDocument(env) as { paths: Record<string, Record<string, unknown>> };
    const settings = document.paths[`${env.API_PREFIX}/technician/automation-settings/{kind}`];
    const contacts = document.paths[`${env.API_PREFIX}/technician/automation-settings/contacts`];
    expect(settings).toEqual(expect.objectContaining({ get: expect.any(Object), put: expect.any(Object) }));
    expect(contacts).toEqual(expect.objectContaining({ get: expect.any(Object) }));
    expect(JSON.stringify(settings)).toContain("technician:automation-settings:write");
    expect(JSON.stringify(contacts)).toContain("page_size");
  });
});
