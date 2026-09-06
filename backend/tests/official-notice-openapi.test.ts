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
    expect(response.body.components.schemas.OfficialNoticeCreate.required).toContain("translations");
    expect(response.body.components.schemas.OfficialNoticeCreate.required).not.toContain("title");
    expect(response.body.components.schemas.OfficialNoticeCreate.properties.title).toBeUndefined();
  });

  it("documents strict merchant notice routes with dedicated permissions and audience schema", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;
    const collection = paths["/api/v1/merchant-admin/official-notices"];
    expect(collection.get["x-permission"]).toBe("merchant-admin:notice:read");
    expect(collection.get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "search",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 100 }
        }),
        expect.objectContaining({
          name: "X-NeeDo-Merchant-Preview-Shop-Id",
          in: "header"
        })
      ])
    );
    expect(collection.post["x-permission"]).toEqual([
      "merchant-admin:notice:create",
      "merchant-admin:notice:send"
    ]);
    expect(
      paths["/api/v1/merchant-admin/official-notices/{publicId}/cancel"].post[
        "x-permission"
      ]
    ).toBe("merchant-admin:notice:review");
    expect(
      paths["/api/v1/merchant-admin/official-notices/{publicId}/archive"].post[
        "x-permission"
      ]
    ).toBe("merchant-admin:notice:review");
    expect(
      paths["/api/v1/merchant-admin/official-notices/{publicId}/retry-failures"].post[
        "x-permission"
      ]
    ).toBe("merchant-admin:notice:send");
    for (const path of [
      "/api/v1/merchant-admin/official-notices/{publicId}/cancel",
      "/api/v1/merchant-admin/official-notices/{publicId}/archive",
      "/api/v1/merchant-admin/official-notices/{publicId}/retry-failures"
    ]) {
      expect(Object.keys(paths[path].post.responses).sort()).toEqual([
        "200",
        "400",
        "401",
        "403",
        "404",
        "409"
      ]);
    }

    const audience = response.body.components.schemas.MerchantOfficialNoticeAudience;
    expect(audience.properties.type.enum).toEqual([
      "shop_card_holders",
      "shop_employees",
      "shop_technicians"
    ]);
    expect(audience.additionalProperties).toBe(false);
    expect(response.body.components.schemas.MerchantOfficialNoticeCreate.properties.audience).toEqual({
      $ref: "#/components/schemas/MerchantOfficialNoticeAudience"
    });
  });

  it("documents the same bounded server search on operations notice management", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    expect(
      response.body.paths["/api/v1/backoffice/official-notices"].get.parameters
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "search",
          in: "query",
          schema: { type: "string", minLength: 1, maxLength: 100 }
        })
      ])
    );
  });

  it("documents public NeeDo IDs for exact-account delivery without exposing internal user IDs", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const variants = response.body.components.schemas.OfficialNoticeAudience.oneOf;
    const exactUsers = variants.find(
      (variant: { properties?: { type?: { enum?: string[] } } }) =>
        variant.properties?.type?.enum?.includes("exact_users")
    );

    expect(exactUsers.required).toEqual(["type", "needoIds"]);
    expect(exactUsers.properties.needoIds).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 500,
      items: { type: "string", pattern: "^u[0-9]{10}$" }
    });
    expect(exactUsers.properties.userIds).toBeUndefined();
  });
});
