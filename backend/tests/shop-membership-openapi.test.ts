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
      components: { schemas: Record<string, { additionalProperties?: boolean; required?: string[]; properties?: Record<string, unknown> }> };
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

    const issuance = document.paths["/api/v1/merchant-admin/shop-memberships/{publicId}/cards"].post;
    expect(issuance.security).toEqual([{ bearerAuth: [] }]);
    expect(issuance.requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ShopMembershipCardIssuanceRequest"
    });
    expect(issuance.responses).toEqual(expect.objectContaining({
      "200": expect.any(Object),
      "201": expect.any(Object),
      "400": expect.any(Object),
      "401": expect.any(Object),
      "403": expect.any(Object),
      "404": expect.any(Object),
      "409": expect.any(Object)
    }));
    expect(document.components.schemas.ShopMembershipCardIssuanceRequest.additionalProperties).toBe(false);
    expect(document.components.schemas.ShopMembershipCardIssuanceResult.additionalProperties).toBe(false);
    expect(document.components.schemas.MerchantShopMembershipCard.required).toEqual(expect.arrayContaining([
      "membershipPublicId", "customerNeedoId", "customerDisplayName", "pendingAdjustment"
    ]));
    expect(document.components.schemas.MerchantShopMembershipCard.properties).toEqual(expect.objectContaining({
      pendingAdjustment: expect.any(Object)
    }));

    const adjustmentOperations = [
      document.paths["/api/v1/merchant-admin/shop-membership-cards/{publicId}/adjustment-requests"].post,
      document.paths["/api/v1/merchant-admin/shop-membership-card-adjustment-requests"].get,
      document.paths["/api/v1/merchant-admin/shop-membership-card-adjustment-requests/{publicId}/cancel"].post,
      document.paths["/api/v1/customer-profile/me/shop-membership-card-adjustment-requests"].get,
      document.paths["/api/v1/customer-profile/me/shop-membership-card-adjustment-requests/{publicId}/decision"].post
    ];
    for (const operation of adjustmentOperations) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(expect.objectContaining({
        "200": expect.any(Object), "400": expect.any(Object), "401": expect.any(Object),
        "403": expect.any(Object), "404": expect.any(Object), "409": expect.any(Object)
      }));
    }
    expect(document.components.schemas.ShopMembershipCardAdjustmentCreateRequest).toMatchObject({ additionalProperties: false });
    expect(document.components.schemas.ShopMembershipCardAdjustmentDecisionRequest).toMatchObject({ additionalProperties: false });
    expect(document.components.schemas.ShopMembershipCardAdjustment).toMatchObject({ additionalProperties: false });

    const topUpOperations = [
      document.paths["/api/v1/merchant-admin/shop-membership-cards/{publicId}/top-ups"].post,
      document.paths["/api/v1/merchant-admin/shop-membership-card-top-ups"].get,
      document.paths["/api/v1/customer-profile/me/shop-membership-card-top-ups"].get
    ];
    for (const operation of topUpOperations) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.responses).toEqual(expect.objectContaining({
        "200": expect.any(Object), "400": expect.any(Object), "401": expect.any(Object),
        "403": expect.any(Object), "404": expect.any(Object), "409": expect.any(Object)
      }));
    }
    expect(topUpOperations[0].requestBody?.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ShopMembershipCardTopUpCreateRequest"
    });
    expect(document.components.schemas.ShopMembershipCardTopUpCreateRequest).toMatchObject({ additionalProperties: false });
    expect(document.components.schemas.ShopMembershipCardTopUp).toMatchObject({ additionalProperties: false });
    expect(document.components.schemas.ShopMembershipCardTopUpPage).toMatchObject({ additionalProperties: false });
  });

  it("documents strict membership card plan and reward fee contracts", () => {
    type Operation = {
      security: Array<Record<string, unknown>>;
      responses: Record<string, unknown>;
      requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
    };
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<string, Partial<Record<"get" | "post" | "patch", Operation>>>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const expected = [
      ["/api/v1/merchant-admin/shop-membership-card-plans", "get"],
      ["/api/v1/merchant-admin/shop-membership-card-plans", "post"],
      ["/api/v1/merchant-admin/shop-membership-card-plans/{publicId}", "get"],
      ["/api/v1/merchant-admin/shop-membership-card-plans/{publicId}/draft", "patch"],
      ["/api/v1/merchant-admin/shop-membership-card-plans/{publicId}/preview", "post"],
      ["/api/v1/merchant-admin/shop-membership-card-plans/{publicId}/publish", "post"],
      ["/api/v1/merchant-admin/shop-membership-card-plans/{publicId}/retire", "post"],
      ["/api/v1/backoffice/membership-reward-fee-policy", "get"],
      ["/api/v1/backoffice/membership-reward-fee-policy/versions", "post"]
    ] as const;
    for (const [path, method] of expected) {
      const operation = document.paths[path][method];
      expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      expect(operation?.responses).toEqual(expect.objectContaining({
        "400": expect.any(Object), "401": expect.any(Object), "403": expect.any(Object),
        "404": expect.any(Object), "409": expect.any(Object)
      }));
    }
    expect(document.components.schemas.MembershipRewardRule).toMatchObject({
      discriminator: { propertyName: "kind" },
      oneOf: expect.arrayContaining([expect.objectContaining({ $ref: expect.stringContaining("FixedPerCompletion") })])
    });
    expect(document.components.schemas.ShopMembershipCardPlanDraftRequest).toMatchObject({ additionalProperties: false });
    expect(document.components.schemas.MembershipRewardFeeVersionCreateRequest).toMatchObject({ additionalProperties: false });
  });
});
