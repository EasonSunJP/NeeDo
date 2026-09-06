import { describe, expect, it } from "vitest";
import { isFormalAuthMePayload } from "./authContract";

const me = {
  id: 7,
  needoId: "u0000000007",
  primaryPublicId: "u0000000007",
  activeIdentityId: 11,
  activePublicId: "u0000000011",
  email: "user@example.com",
  emailVerifiedAt: "2026-08-27T00:00:00.000Z",
  hasPassword: true,
  username: "User",
  avatarUrl: null,
  profileDisplayName: "运营者用户端姓名",
  isActive: true,
  isTestAccount: false,
  currentIdentity: {
    id: 11,
    publicId: "u0000000011",
    scopeId: 41,
    scopeType: "customer_profile",
    type: "customer",
    displayName: "用户身份"
  },
  identities: [{
    id: 11,
    publicId: "u0000000011",
    scopeId: 41,
    scopeType: "customer_profile",
    type: "customer",
    displayName: "用户身份"
  }],
  roles: ["customer"],
  permissions: ["auth:me"],
  menus: ["menu:client-app"],
  identityAvailability: []
};

describe("formal auth compliance contract", () => {
  it("accepts a complete server-owned compliance bundle", () => {
    expect(isFormalAuthMePayload({
      ...me,
      complianceRequirements: ["phone_binding_required"],
      compliancePolicyVersionPublicId: "policy-v2",
      complianceEffectiveAt: "2026-09-01T10:00:00.000Z",
      compliancePermittedNextRoutes: ["/api/v1/auth/me"]
    })).toBe(true);
  });

  it("rejects partial or unknown compliance claims", () => {
    expect(isFormalAuthMePayload({ ...me, complianceRequirements: ["phone_binding_required"] })).toBe(false);
    expect(isFormalAuthMePayload({
      ...me,
      complianceRequirements: ["sms_verified"],
      compliancePolicyVersionPublicId: "policy-v2",
      complianceEffectiveAt: "2026-09-01T10:00:00.000Z",
      compliancePermittedNextRoutes: []
    })).toBe(false);
  });
});
