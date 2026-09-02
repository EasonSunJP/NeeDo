import request from "supertest";
import { createApp } from "../src/app";

describe("platform partner OpenAPI", () => {
  it("documents partner marking, paginated agent search, and shop referral creation", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;

    expect(
      paths["/api/v1/backoffice/users/{userId}/partner-profiles"].post["x-permission"]
    ).toBe("backoffice:partner-profile:write");
    expect(paths["/api/v1/backoffice/agents"].get["x-permission"]).toBe(
      "backoffice:agent:read"
    );
    expect(
      paths["/api/v1/backoffice/agents/{agentPublicId}/shop-referrals"].post[
        "x-permission"
      ]
    ).toBe("backoffice:agent:write");
    expect(response.body.components.schemas.PlatformPartnerProfile).toBeDefined();
    expect(response.body.components.schemas.AgentShopReferral).toBeDefined();
  });
});
