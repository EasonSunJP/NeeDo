import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const affiliateEntry = ["menu:affiliate"];
const activatedAffiliate = [
  ...affiliateEntry,
  "page:affiliate-marketplace",
  "button:affiliate-claim",
  "page:affiliate-profile",
  "button:affiliate-profile-edit",
  "page:affiliate-alliance",
  "button:affiliate-alliance-create",
  "affiliate-alliance:members:list",
  "affiliate-alliance:candidates:list",
  "affiliate-alliance:invitations:list",
  "button:affiliate-alliance-invite",
  "button:affiliate-alliance-invitation-respond"
];
const merchantPublisher = [
  "menu:merchant-affiliate",
  "page:merchant-affiliate-task",
  "button:merchant-affiliate-task-create",
  "button:merchant-affiliate-task-submit",
  "button:merchant-affiliate-task-pause"
];
const backofficeRead = ["menu:backoffice-affiliate", "page:backoffice-affiliate"];
const affiliateFeeRuleRead = "page:backoffice-affiliate-fee-rule";
const affiliateFeeRuleWrite = "button:backoffice-affiliate-fee-rule-create";

describe("affiliate RBAC seed contract", () => {
  const assignments = buildRolePermissionAssignments();

  it("registers every approved affiliate permission", () => {
    expect(SYSTEM_PERMISSION_CODES).toEqual(
      expect.arrayContaining([
        ...activatedAffiliate,
        ...merchantPublisher,
        ...backofficeRead,
        "button:backoffice-affiliate-review",
        "button:backoffice-affiliate-suspend",
        "button:backoffice-affiliate-reversal",
        "button:backoffice-affiliate-export",
        affiliateFeeRuleRead,
        affiliateFeeRuleWrite
      ])
    );
  });

  it.each([
    "operator",
    "finance",
    "support",
    "merchant_owner",
    "merchant_staff",
    "technician",
    "customer",
    "broker",
    "viewer"
  ] as const)("keeps only the affiliate activation entry for %s", (role) => {
    expect(assignments[role]).toEqual(expect.arrayContaining(affiliateEntry));
    expect(assignments[role]).not.toContain("page:affiliate-marketplace");
    expect(assignments[role]).not.toContain("button:affiliate-claim");
    expect(assignments[role]).not.toContain("page:affiliate-profile");
    expect(assignments[role]).not.toContain("button:affiliate-profile-edit");
    expect(assignments[role]).not.toContain("page:affiliate-alliance");
    expect(assignments[role]).not.toContain("button:affiliate-alliance-create");
    expect(assignments[role]).not.toContain("affiliate-alliance:members:list");
    expect(assignments[role]).not.toContain("affiliate-alliance:candidates:list");
    expect(assignments[role]).not.toContain("affiliate-alliance:invitations:list");
    expect(assignments[role]).not.toContain("button:affiliate-alliance-invite");
    expect(assignments[role]).not.toContain("button:affiliate-alliance-invitation-respond");
  });

  it("grants marketplace and profile access only to the activated affiliate role", () => {
    expect(assignments.scout).toEqual(expect.arrayContaining(activatedAffiliate));
  });

  it.each(["merchant_owner", "merchant_staff"] as const)(
    "grants publishing controls to %s",
    (role) => {
      expect(assignments[role]).toEqual(expect.arrayContaining(merchantPublisher));
    }
  );

  it("keeps merchant publishing controls away from ordinary customers", () => {
    expect(assignments.customer).not.toEqual(expect.arrayContaining(merchantPublisher));
  });

  it("splits operations and finance actions by least privilege", () => {
    expect(assignments.operator).toEqual(
      expect.arrayContaining([
        ...backofficeRead,
        "button:backoffice-affiliate-review",
        "button:backoffice-affiliate-suspend",
        "button:backoffice-affiliate-export"
      ])
    );
    expect(assignments.operator).not.toContain("button:backoffice-affiliate-reversal");
    expect(assignments.finance).toEqual(
      expect.arrayContaining([
        ...backofficeRead,
        "button:backoffice-affiliate-reversal",
        "button:backoffice-affiliate-export"
      ])
    );
    expect(assignments.viewer).toEqual(expect.arrayContaining(backofficeRead));
    expect(assignments.viewer).not.toContain("button:backoffice-affiliate-export");
  });

  it("continues to grant every system permission to admin", () => {
    expect(assignments.admin).toEqual(SYSTEM_PERMISSION_CODES);
  });

  it("grants Affiliate fee rules with least privilege", () => {
    expect(assignments.finance).toEqual(
      expect.arrayContaining([affiliateFeeRuleRead, affiliateFeeRuleWrite])
    );
    expect(assignments.operator).toContain(affiliateFeeRuleRead);
    expect(assignments.operator).not.toContain(affiliateFeeRuleWrite);
    expect(assignments.viewer).toContain(affiliateFeeRuleRead);
    expect(assignments.viewer).not.toContain(affiliateFeeRuleWrite);
    for (const role of [
      "support",
      "merchant_owner",
      "merchant_staff",
      "technician",
      "customer",
      "broker",
      "scout"
    ] as const) {
      expect(assignments[role]).not.toContain(affiliateFeeRuleRead);
      expect(assignments[role]).not.toContain(affiliateFeeRuleWrite);
    }
  });
});
