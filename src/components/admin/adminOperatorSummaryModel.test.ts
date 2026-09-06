import { describe, expect, it } from "vitest";
import type { AuthSession } from "../../auth/rbac";
import type { MerchantReview, Paginated } from "../../features/identity-applications/api";
import {
  mergePendingMerchantReviews,
  resolveAdminDisplayName,
  resolveAdminRoleLabel
} from "./adminOperatorSummaryModel";

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  const identity = {
    id: 9,
    publicId: null,
    scopeId: null,
    scopeType: "global",
    type: "platform",
    displayName: "东京运营组"
  };
  return {
    authVersion: 7,
    id: 7,
    needoId: "u0000000007",
    primaryPublicId: "u0000000007",
    activeIdentityId: identity.id,
    activePublicId: null,
    username: "admin_user",
    email: "admin@example.com",
    emailVerifiedAt: "2026-09-01T00:00:00.000Z",
    hasPassword: true,
    avatarUrl: null,
    profileDisplayName: "  用户端姓名  ",
    portal: "admin",
    allowedPortals: ["admin"],
    loginMethod: "password",
    loggedInAt: "2026-09-06T00:00:00.000Z",
    linkedCustomerId: "cus-7",
    linkedTechnicianId: "",
    linkedStoreId: "",
    roles: ["operator"],
    permissions: [],
    menus: [],
    currentIdentity: identity,
    identities: [identity],
    identityAvailability: [],
    ...overrides
  };
}

function review(
  applicationId: number,
  status: "submitted" | "under_review",
  submittedAt: string | null,
  createdAt: string
): MerchantReview {
  return {
    applicationId,
    applicantUserId: applicationId + 100,
    status,
    version: 1,
    submittedAt,
    createdAt,
    applicantKind: "individual",
    corporateLegalName: null,
    corporateLegalNameKana: null,
    representativeName: `申请人 ${applicationId}`,
    representativeNameKana: `シンセイニン ${applicationId}`,
    shopName: `店铺 ${applicationId}`,
    businessAddress: "Tokyo",
    contactPhone: "+819000000000",
    responsiblePersonName: `申请人 ${applicationId}`,
    showcaseDraft: null,
    serviceCategories: [],
    businessKeywords: [],
    bankAccount: null,
    eKycVerified: true,
    contractAcceptance: null,
    media: []
  };
}

function page(list: MerchantReview[], total = list.length): Paginated<MerchantReview> {
  return { list, total, page: 1, page_size: 5 };
}

describe("admin operator summary model", () => {
  it("resolves the display name from profile, username, then email", () => {
    expect(resolveAdminDisplayName(session())).toBe("用户端姓名");
    expect(resolveAdminDisplayName(session({ profileDisplayName: " " }))).toBe("admin_user");
    expect(resolveAdminDisplayName(session({ profileDisplayName: null, username: " " }))).toBe(
      "admin@example.com"
    );
  });

  it("uses only an active platform identity label for the admin role copy", () => {
    expect(resolveAdminRoleLabel(session(), "运营后台成员")).toBe("东京运营组");
    expect(
      resolveAdminRoleLabel(
        session({
          currentIdentity: { ...session().currentIdentity, type: "customer" },
          identities: [{ ...session().currentIdentity, type: "customer" }]
        }),
        "运营后台成员"
      )
    ).toBe("运营后台成员");
  });

  it("adds totals, removes duplicate rows, and returns the newest five reviews", () => {
    const submitted = page(
      [
        review(1, "submitted", "2026-09-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
        review(3, "submitted", null, "2026-09-03T00:00:00.000Z"),
        review(5, "submitted", "2026-09-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z")
      ],
      8
    );
    const underReview = page(
      [
        review(2, "under_review", "2026-09-02T00:00:00.000Z", "2026-08-02T00:00:00.000Z"),
        review(4, "under_review", "2026-09-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z"),
        review(5, "under_review", "2026-09-05T00:00:00.000Z", "2026-08-05T00:00:00.000Z"),
        review(6, "under_review", "invalid", "invalid")
      ],
      7
    );

    expect(mergePendingMerchantReviews(submitted, underReview)).toEqual({
      total: 15,
      list: expect.arrayContaining([])
    });
    expect(
      mergePendingMerchantReviews(submitted, underReview).list.map((item) => item.applicationId)
    ).toEqual([5, 4, 3, 2, 1]);
  });
});
