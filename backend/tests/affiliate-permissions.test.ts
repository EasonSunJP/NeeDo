import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const marketplace = ["menu:affiliate", "page:affiliate-marketplace", "button:affiliate-claim"];
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
        ...marketplace,
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
    "scout",
    "viewer"
  ] as const)("grants marketplace claiming to %s", (role) =>
    expect(assignments[role]).toEqual(expect.arrayContaining(marketplace))
  );

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
