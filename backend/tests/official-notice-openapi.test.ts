import request from "supertest";
import { createApp } from "../src/app";

describe("official notice OpenAPI", () => {
  it("documents backoffice delivery commands and recipient read APIs", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;
    expect(paths["/api/v1/backoffice/official-notices"].get["x-permission"]).toBe(
      "page:backoffice-official-notice"
    );
    expect(paths["/api/v1/backoffice/official-notices"].post["x-permission"]).toEqual([
      "button:backoffice-official-notice-create",
      "button:backoffice-official-notice-send"
    ]);
    expect(paths["/api/v1/backoffice/official-notices/{publicId}/cancel"].post).toBeDefined();
    expect(paths["/api/v1/backoffice/official-notices/{publicId}/archive"].post).toBeDefined();
    expect(
      paths["/api/v1/backoffice/official-notices/{publicId}/retry-failures"].post
    ).toBeDefined();
    expect(paths["/api/v1/official-notices"].get).toBeDefined();
    expect(paths["/api/v1/official-notices/{publicId}/read"].post).toBeDefined();
    expect(response.body.components.schemas.OfficialNoticeCreate).toBeDefined();
    expect(response.body.components.schemas.OfficialNoticeProtectedPayload).toBeDefined();
    expect(response.body.components.schemas.RecipientOfficialNoticePayload).toBeDefined();
  });
});
