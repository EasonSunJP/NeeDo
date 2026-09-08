import { assertAdminPermissionCoverage } from "../src/staging/staging-admin-bootstrap.repository";

describe("staging administrator permission coverage", () => {
  it("accepts every required permission while preserving additional historical permissions", () => {
    expect(() =>
      assertAdminPermissionCoverage(
        ["required:one", "required:two", "historical:still-active"],
        ["required:one", "required:two"]
      )
    ).not.toThrow();
  });

  it("rejects a bootstrap result that is missing any required permission", () => {
    expect(() =>
      assertAdminPermissionCoverage(["required:one"], ["required:one", "required:two"])
    ).toThrow("STAGING_ADMIN_BOOTSTRAP_ADMIN_PERMISSION_CONFLICT");
  });
});
