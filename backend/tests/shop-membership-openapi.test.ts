import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("shop membership OpenAPI", () => {
  it("documents every merchant and customer membership route with protected responses", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<string, unknown>;
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
      parameters?: Array<{ name: string; in: string }>;
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Record<"get" | "post", Operation>>;
      components: { schemas: Record<string, { additionalProperties?: boolean }> };
    };
    const operations = [
      document.paths["/api/v1/merchant-admin/shop-memberships/overview"].get,
      document.paths["/api/v1/merchant-admin/shop-memberships"].get,
      document.paths["/api/v1/merchant-admin/shop-memberships"].post,
      document.paths["/api/v1/merchant-admin/shop-memberships/{publicId}"].get,
      document.paths["/api/v1/merchant-admin/shop-membership-candidates"].get,
      document.paths["/api/v1/merchant-admin/shop-membership-cards"].get,
      document.paths["/api/v1/merchant-admin/shop-membership-activities"].get,
      document.paths["/api/v1/merchant-admin/shop-membership-analytics"].get,
      document.paths["/api/v1/customer-profile/me/shop-memberships"].get,
      document.paths["/api/v1/customer-profile/me/shop-memberships/{publicId}"].get
    ];

    for (const operation of operations) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(
        expect.objectContaining({
          "400": expect.any(Object),
          "401": expect.any(Object),
          "403": expect.any(Object),
          "404": expect.any(Object),
          "409": expect.any(Object)
        })
      );
    }
    expect(document.paths["/api/v1/merchant-admin/shop-memberships"].post.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ShopMembershipCreateRequest"
    });
    expect(document.components.schemas.ShopMembershipCreateRequest.additionalProperties).toBe(false);
    expect(document.components.schemas).toEqual(expect.objectContaining({
      ShopMembership: expect.any(Object),
      ShopMembershipCard: expect.any(Object),
      ShopMembershipOverview: expect.any(Object),
      ShopMembershipAnalytics: expect.any(Object)
    }));
  });
});
