import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  REQUIRED_TEST_ACCOUNT_EMAILS,
  TEST_USER_ACCOUNTS
} from "../src/constants/test-login.constants";
import { getAdminSeedConfig, getTestUserSeedPassword, shouldSeedRequiredTestAccounts } from "../prisma/seed";

describe("user management seed contract", () => {
  it("defines the Step 04 system roles in the required order", () => {
    expect(SYSTEM_ROLE_CODES).toEqual([
      "admin",
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
    ]);
  });

  it("covers the required base permission modules", () => {
    const modules = Array.from(new Set(SYSTEM_PERMISSIONS.map((permission) => permission.module)));

    expect(modules).toEqual(
      expect.arrayContaining(["auth", "user", "role", "permission", "menu", "dashboard"])
    );
  });

  it("assigns every base permission to the admin role", () => {
    const assignments = buildRolePermissionAssignments();

    expect(assignments.admin).toEqual(SYSTEM_PERMISSIONS.map((permission) => permission.code));
  });

  it("uses the correct password source for admin and required test accounts", () => {
    expect(() => getAdminSeedConfig({ NODE_ENV: "development", DEPLOY_ENV: "local" })).toThrow(
      "TEST_USER_DEFAULT_PASSWORD or ADMIN_DEFAULT_PASSWORD"
    );

    expect(
      getAdminSeedConfig({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ADMIN_DEFAULT_PASSWORD: "S3cure-dev-password!"
      })
    ).toMatchObject({
      email: "admin@example.com",
      password: "S3cure-dev-password!",
      username: "NeeDo Super Admin"
    });

    expect(
      getAdminSeedConfig({
        NODE_ENV: "staging",
        DEPLOY_ENV: "staging",
        ADMIN_DEFAULT_PASSWORD: "admin-bootstrap-password",
        TEST_USER_DEFAULT_PASSWORD: "test-user-password"
      })
    ).toMatchObject({
      email: "admin@example.com",
      password: "test-user-password"
    });
    expect(
      getAdminSeedConfig({
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        ADMIN_DEFAULT_PASSWORD: "prod-admin-bootstrap-password"
      })
    ).toMatchObject({
      email: "admin@example.com",
      password: "prod-admin-bootstrap-password"
    });
  });

  it("defines the required real test accounts for each portal", () => {
    expect(REQUIRED_TEST_ACCOUNT_EMAILS).toEqual([
      "admin@example.com",
      "operator@example.com",
      "merchant@example.com",
      "technician@example.com",
      "customer@example.com"
    ]);
    expect(TEST_USER_ACCOUNTS.map((account) => [account.email, account.roleCode, account.identityType])).toEqual([
      ["admin@example.com", "admin", "platform"],
      ["operator@example.com", "operator", "platform"],
      ["merchant@example.com", "merchant_owner", "merchant"],
      ["technician@example.com", "technician", "technician"],
      ["customer@example.com", "customer", "customer"]
    ]);
  });

  it("uses TEST_USER_DEFAULT_PASSWORD for test accounts and only falls back locally", () => {
    expect(
      getTestUserSeedPassword({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ADMIN_DEFAULT_PASSWORD: "local-admin-password"
      })
    ).toBe("local-admin-password");
    expect(
      getTestUserSeedPassword({
        NODE_ENV: "staging",
        DEPLOY_ENV: "staging",
        ADMIN_DEFAULT_PASSWORD: "staging-admin-password",
        TEST_USER_DEFAULT_PASSWORD: "staging-test-password"
      })
    ).toBe("staging-test-password");
    expect(() =>
      getTestUserSeedPassword({
        NODE_ENV: "production",
        DEPLOY_ENV: "staging",
        ADMIN_DEFAULT_PASSWORD: "staging-admin-password"
      })
    ).toThrow("TEST_USER_DEFAULT_PASSWORD");
  });

  it("seeds required test accounts in local and staging but not production", () => {
    expect(shouldSeedRequiredTestAccounts({ NODE_ENV: "development", DEPLOY_ENV: "local" })).toBe(true);
    expect(shouldSeedRequiredTestAccounts({ NODE_ENV: "production", DEPLOY_ENV: "staging" })).toBe(true);
    expect(shouldSeedRequiredTestAccounts({ NODE_ENV: "production", DEPLOY_ENV: "prod" })).toBe(false);
  });

  it("seeds the portal menu permissions expected by frontend guards", () => {
    const permissionCodes = SYSTEM_PERMISSIONS.map((permission) => permission.code);

    expect(permissionCodes).toEqual(
      expect.arrayContaining([
        "menu:client-app",
        "menu:merchant-app",
        "menu:technician-app",
        "menu:admin-console",
        "menu:merchant-admin",
        "menu:technician-schedule",
        "menu:orders",
        "menu:messages",
        "menu:social",
        "menu:settings"
      ])
    );

    const assignments = buildRolePermissionAssignments();
    expect(assignments.admin).toEqual(expect.arrayContaining(["menu:admin-console", "menu:user-management"]));
    expect(assignments.merchant_owner).toEqual(expect.arrayContaining(["menu:merchant-app", "menu:merchant-admin"]));
    expect(assignments.technician).toEqual(expect.arrayContaining(["menu:technician-app", "menu:technician-schedule"]));
    expect(assignments.customer).toEqual(expect.arrayContaining(["menu:client-app"]));
  });
});
