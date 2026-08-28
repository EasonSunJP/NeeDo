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
  "button:affiliate-profile-edit"
];
const merchantPublisher = [
  "menu:merchant-affiliate",
  "page:merchant-affiliate-task",
  "button:merchant-affiliate-task-create",
  "button:merchant-affiliate-task-submit",
  "button:merchant-affiliate-task-pause"
];
const backofficeRead = ["menu:backoffice-affiliate", "page:backoffice-affiliate"];

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
        "button:backoffice-affiliate-export"
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
});
