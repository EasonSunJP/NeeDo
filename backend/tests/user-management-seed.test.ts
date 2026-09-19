import {
  LEGAL_DOCUMENT_PERMISSIONS,
  PLATFORM_SETTINGS_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLE_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  REQUIRED_TEST_ACCOUNT_EMAILS,
  TEST_USER_ACCOUNTS,
  getTestAccountSwitchIdentityTypes
} from "../src/constants/test-login.constants";
import {
  CUSTOMER_REQUEST_WALLET_SEED_NDP,
  DEFAULT_REQUEST_DISPATCH_FEE_NDP,
  buildSeedUserUpdateData,
  calibrateTestNdpUserIds,
  getRequestDispatchWalletTopUpAmount,
  getRequestDispatchWalletSeedAmount,
  getAdminSeedConfig,
  getTestUserSeedPassword,
  provisionRequiredTestAccountPortalData,
  shouldSeedRequiredTestAccounts
} from "../prisma/seed";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("user management seed contract", () => {
  it("uses the shared test-account password hash for core read test users", () => {
    const seedSource = readFileSync(resolve(__dirname, "../prisma/seed.ts"), "utf8");
    const seedExecution = seedSource.slice(seedSource.indexOf("export const seedUserManagement"));

    expect(seedExecution).toContain("await seedCoreReadData(tx, testUserPasswordHash");
    expect(seedExecution).not.toContain("await seedCoreReadData(tx, adminPasswordHash");
  });

  it("reconciles the legacy global merchant organization identity before core reseeding", () => {
    const seedSource = readFileSync(resolve(__dirname, "../prisma/seed.ts"), "utf8");
    const billingSeed = seedSource.slice(
      seedSource.indexOf("const seedMerchantSaasBillingData"),
      seedSource.indexOf("const seedCoreReadData")
    );

    expect(billingSeed).toContain("const legacyMerchantOrganizationIdentity");
    expect(billingSeed).toContain('scopeType: "global"');
    expect(billingSeed).toContain('scopeType: "merchant_account"');
    expect(billingSeed.indexOf("legacyMerchantOrganizationIdentity")).toBeLessThan(
      billingSeed.indexOf("await upsertSeedIdentity")
    );
  });

  it("creates an active experience account with every seeded customer foundation", () => {
    const seedSource = readFileSync(resolve(__dirname, "../prisma/seed.ts"), "utf8");
    const foundation = seedSource.slice(
      seedSource.indexOf("const ensureSeedCustomerFoundation"),
      seedSource.indexOf("export const upsertSeedUser")
    );
    expect(foundation).toContain("userExperienceAccount.upsert");
    expect(foundation).toContain("update: { deletedAt: null }");
  });

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

  it("assigns system settings writes to operators and reads to viewers", () => {
    const assignments = buildRolePermissionAssignments();
    const readPermissions = [
      PLATFORM_SETTINGS_PERMISSIONS.read,
      PLATFORM_SETTINGS_PERMISSIONS.imRetentionRead,
      LEGAL_DOCUMENT_PERMISSIONS.read,
      PLATFORM_SETTINGS_PERMISSIONS.paymentRead
    ];
    const writePermissions = [
      PLATFORM_SETTINGS_PERMISSIONS.write,
      PLATFORM_SETTINGS_PERMISSIONS.brandMediaActivate,
      PLATFORM_SETTINGS_PERMISSIONS.imRetentionWrite,
      LEGAL_DOCUMENT_PERMISSIONS.write,
      LEGAL_DOCUMENT_PERMISSIONS.publish,
      PLATFORM_SETTINGS_PERMISSIONS.paymentWrite
    ];

    expect(assignments.operator).toEqual(
      expect.arrayContaining([...readPermissions, ...writePermissions])
    );
    expect(assignments.viewer).toEqual(expect.arrayContaining(readPermissions));
    for (const permission of writePermissions) expect(assignments.viewer).not.toContain(permission);
  });

  it("uses the correct password source for admin and required test accounts", () => {
    expect(() => getAdminSeedConfig({ NODE_ENV: "development", DEPLOY_ENV: "local" })).toThrow(
      "ADMIN_DEFAULT_PASSWORD"
    );

    expect(
      getAdminSeedConfig({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ADMIN_DEFAULT_PASSWORD: "S3cure-dev-password!"
      })
    ).toMatchObject({
      email: "admin@lifedance.com",
      password: "S3cure-dev-password!",
      username: "LifeDance 管理员"
    });

    expect(
      getAdminSeedConfig({
        NODE_ENV: "production",
        DEPLOY_ENV: "staging",
        ADMIN_DEFAULT_PASSWORD: "admin-bootstrap-password",
        TEST_USER_DEFAULT_PASSWORD: "test-user-password"
      })
    ).toMatchObject({
      email: "admin@lifedance.com",
      password: "admin-bootstrap-password"
    });
    expect(
      getAdminSeedConfig({
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        ADMIN_DEFAULT_PASSWORD: "prod-admin-bootstrap-password"
      })
    ).toMatchObject({
      email: "admin@lifedance.com",
      password: "prod-admin-bootstrap-password"
    });
  });

  it("defines the required real test accounts for each portal", () => {
    expect(REQUIRED_TEST_ACCOUNT_EMAILS).toEqual([
      "admin@lifedance.com",
      "operator@example.com",
      "merchant@example.com",
      "affiliate@example.com",
      "technician@example.com",
      "customer@example.com"
    ]);
    expect(
      TEST_USER_ACCOUNTS.map((account) => [
        account.email,
        account.roleCode,
        account.identityType,
        account.primaryIdentifierKind
      ])
    ).toEqual([
      ["admin@lifedance.com", "admin", "platform", "NEEDO"],
      ["operator@example.com", "operator", "platform", "U"],
      ["merchant@example.com", "merchant_owner", "merchant", "U"],
      ["affiliate@example.com", "broker", "broker", "U"],
      ["technician@example.com", "technician", "technician", "U"],
      ["customer@example.com", "customer", "customer", "U"]
    ]);
  });

  it("assigns an appropriate generated avatar to every fixed test account", () => {
    expect(
      TEST_USER_ACCOUNTS.every((account) => account.avatarUrl.startsWith("/images/generated/"))
    ).toBe(true);

    const avatarByEmail = new Map(
      TEST_USER_ACCOUNTS.map((account) => [account.email, account.avatarUrl])
    );
    expect(avatarByEmail.get("merchant@example.com")).toMatch(/^\/images\/generated\/stores\//);
    expect(
      TEST_USER_ACCOUNTS.filter((account) => account.email !== "merchant@example.com").every(
        (account) => account.avatarUrl.startsWith("/images/generated/profiles/")
      )
    ).toBe(true);
  });

  it("enables formal technician and merchant test accounts to switch all requested identities", () => {
    expect(getTestAccountSwitchIdentityTypes("technician")).toEqual([
      "customer",
      "technician",
      "scout"
    ]);
    expect(getTestAccountSwitchIdentityTypes("merchant")).toEqual([
      "customer",
      "technician",
      "merchant",
      "scout"
    ]);
    expect(getTestAccountSwitchIdentityTypes("customer")).toEqual(["customer"]);
  });

  it("provisions independent merchant profile data and an independently configurable technician income model", async () => {
    const tx = {
      merchantIdentityProfile: { upsert: jest.fn(async () => ({ id: 1 })) },
      technicianProfile: { update: jest.fn(async () => ({ id: 22 })) },
      technicianShopAffiliation: { upsert: jest.fn(async () => ({ id: 3 })) },
      technicianCompensationProfile: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }) => ({ id: 4, ...data })),
        update: jest.fn()
      }
    };

    await provisionRequiredTestAccountPortalData(tx as never, {
      identityType: "merchant",
      identityId: 12,
      userId: 7,
      username: "Merchant",
      shopId: 5,
      scopeId: 5
    });
    await provisionRequiredTestAccountPortalData(tx as never, {
      identityType: "technician",
      identityId: 13,
      userId: 8,
      username: "Technician",
      shopId: 5,
      scopeId: 22
    });

    expect(tx.merchantIdentityProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identityId: 12 },
        create: expect.objectContaining({ identityId: 12, userId: 7, displayName: "Merchant" })
      })
    );
    expect(tx.technicianShopAffiliation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activeKey: "technician:22:shop:5" }
      })
    );
    expect(tx.technicianCompensationProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shopId: 5,
        technicianProfileId: 22,
        commissionRateBps: 4000,
        extensionCommissionRateBps: 5500,
        nominationFeeJpy: 2000
      })
    });
  });

  it("funds customer seed wallets enough for Request dispatch-fee smoke flows", () => {
    expect(DEFAULT_REQUEST_DISPATCH_FEE_NDP).toBe(500);
    expect(CUSTOMER_REQUEST_WALLET_SEED_NDP).toBeGreaterThanOrEqual(
      DEFAULT_REQUEST_DISPATCH_FEE_NDP
    );

    const walletSeedAmountByEmail = new Map(
      TEST_USER_ACCOUNTS.map((account) => [
        account.email,
        getRequestDispatchWalletSeedAmount(account)
      ])
    );

    expect(walletSeedAmountByEmail.get("customer@example.com")).toBe(
      CUSTOMER_REQUEST_WALLET_SEED_NDP
    );
    expect(walletSeedAmountByEmail.get("merchant@example.com")).toBe(0);
    expect(walletSeedAmountByEmail.get("technician@example.com")).toBe(0);
  });

  it("tops up repeat seed wallets back to the Request smoke minimum", () => {
    expect(getRequestDispatchWalletTopUpAmount(0)).toBe(CUSTOMER_REQUEST_WALLET_SEED_NDP);
    expect(getRequestDispatchWalletTopUpAmount(500)).toBe(500);
    expect(getRequestDispatchWalletTopUpAmount(CUSTOMER_REQUEST_WALLET_SEED_NDP)).toBe(0);
    expect(getRequestDispatchWalletTopUpAmount(CUSTOMER_REQUEST_WALLET_SEED_NDP + 100)).toBe(0);
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

  it("seeds required test accounts only with an explicit local or test flag", () => {
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ALLOW_TEST_LOGIN: "true"
      })
    ).toBe(true);
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "production",
        DEPLOY_ENV: "staging",
        ALLOW_TEST_LOGIN: "true"
      })
    ).toBe(false);
    expect(shouldSeedRequiredTestAccounts({ NODE_ENV: "production", DEPLOY_ENV: "prod" })).toBe(
      false
    );
  });

  it("refreshes existing seed user passwords when the configured test password changes", () => {
    expect(
      buildSeedUserUpdateData(
        { email: "merchant@example.com", username: "Merchant" },
        "next-password-hash"
      )
    ).toMatchObject({
      passwordHash: "next-password-hash",
      username: "Merchant",
      isTestAccount: true,
      isActive: true,
      deletedAt: null
    });
  });

  it("calibrates each unique test account once after its seed transaction commits", async () => {
    const service = { calibrateUser: jest.fn(async () => ({ status: "applied" })) };

    await calibrateTestNdpUserIds([7, 9, 7], service as never);

    expect(service.calibrateUser).toHaveBeenCalledTimes(2);
    expect(service.calibrateUser.mock.calls).toEqual([[7], [9]]);
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
    expect(assignments.admin).toEqual(
      expect.arrayContaining(["menu:admin-console", "menu:user-management"])
    );
    expect(assignments.merchant_owner).toEqual(
      expect.arrayContaining(["menu:merchant-app", "menu:merchant-admin"])
    );
    expect(assignments.technician).toEqual(
      expect.arrayContaining(["menu:technician-app", "menu:technician-schedule"])
    );
    expect(assignments.customer).toEqual(expect.arrayContaining(["menu:client-app"]));
  });
});
