import request from "supertest";
import { createApp } from "../src/app";

describe("legal document OpenAPI", () => {
  it("documents the complete catalog, locale, release, and public routes", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;
    expect(paths["/api/v1/backoffice/legal-documents"].get["x-required-permission"]).toBe(
      "backoffice:legal-documents:read"
    );
    expect(paths["/api/v1/backoffice/legal-documents"].post["x-required-permission"]).toBe(
      "backoffice:legal-documents:write"
    );
    expect(
      paths["/api/v1/backoffice/legal-documents/{publicId}/locales/{locale}/publish"].post[
        "x-required-permission"
      ]
    ).toBe("backoffice:legal-documents:publish");
    expect(paths["/api/v1/legal-documents/{slug}/current"].get.security).toBeUndefined();
    expect(response.body.components.schemas.LegalDocumentDraftUpdate.additionalProperties).toBe(false);
  });
});
