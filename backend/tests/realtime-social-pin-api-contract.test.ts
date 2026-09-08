import { readFileSync } from "node:fs";

describe("formal Social post pin API contract", () => {
  const routes = readFileSync("src/routes/realtime.routes.ts", "utf8");
  const controller = readFileSync("src/controllers/realtime.controller.ts", "utf8");
  const openapi = readFileSync("src/api/openapi.ts", "utf8");

  it("exposes authenticated permission-gated pin and unpin routes", () => {
    expect(routes).toContain('"/social/posts/:id/pin"');
    expect(routes).toContain("authorize(REALTIME_ROUTE_PERMISSIONS.updateSocialPost)");
    expect(routes).toContain("controller.pinSocialPost");
    expect(routes).toContain("controller.unpinSocialPost");
    expect(controller).toContain("this.service.setSocialPostPin(");
  });

  it("documents both mutations in OpenAPI", () => {
    expect(openapi).toContain("/social/posts/{id}/pin");
    expect(openapi).toContain("Pin the authenticated author's root social post");
    expect(openapi).toContain("Unpin the authenticated author's root social post");
  });
});
