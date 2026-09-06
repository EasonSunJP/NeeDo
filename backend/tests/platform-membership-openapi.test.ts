import request from "supertest";
import { createApp } from "../src/app";

describe("platform membership OpenAPI", () => {
  it("documents all tier, benefit and entitlement administration contracts", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;
    for (const path of [
      "/api/v1/backoffice/membership-tiers",
      "/api/v1/backoffice/membership-tiers/{tierCode}/draft",
      "/api/v1/backoffice/membership-tiers/{tierCode}/publish",
      "/api/v1/backoffice/membership-benefits",
      "/api/v1/backoffice/membership-benefits/{benefitCode}",
      "/api/v1/backoffice/users/{userId}/platform-membership",
      "/api/v1/backoffice/users/{userId}/membership-adjustment"
    ]) {
      expect(paths).toHaveProperty(path);
    }
    const schemas = response.body.components.schemas;
    expect(schemas.PlatformMembershipTierCode.enum).toEqual([
      "free",
      "silver",
      "gold",
      "black_diamond"
    ]);
    expect(schemas.PlatformMembershipBenefitCode.enum).toEqual([
      "ndp_experience",
      "member_sign_in",
      "priority_request",
      "support_service",
      "exclusive_discount",
      "member_day",
      "birthday_gift",
      "traceless_recall"
    ]);
    expect(schemas.PlatformMembershipTheme.required).toEqual([
      "detailAccentColor",
      "detailSurfaceColor",
      "detailSurfaceMiddleColor",
      "detailSurfaceBottomColor",
      "detailItemSurfaceColor",
      "detailOuterBorderColor",
      "detailItemBorderColor",
      "detailAvatarBorderColor",
      "simpleTopColor",
      "simpleBottomColor"
    ]);
    expect(schemas.PlatformMembershipTierVersion.properties.benefits).toMatchObject({
      minItems: 8,
      maxItems: 8
    });
    expect(schemas.PlatformMembershipTierDraftInput.properties.benefits).toMatchObject({
      minItems: 8,
      maxItems: 8
    });
    expect(schemas.PlatformMembershipEntitlementCommand.discriminator.propertyName).toBe("kind");
    expect(schemas.UserMembershipAdjustmentInput.required).toEqual([
      "reason",
      "expectedLockVersion"
    ]);
    expect(schemas.UserMembershipAdjustmentInput.properties).not.toHaveProperty("level");
  });
});
