import {
  STAGING_TEST_SUPER_ADMIN_EMAILS,
  buildStagingTestSuperAdminPortalPlan,
  parseStagingTestSuperAdminProvisioningConfig
} from "../src/staging/staging-test-super-admin-provisioning";

describe("staging test super administrator provisioning", () => {
  const validEnv = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_TEST_SUPER_ADMIN_PROVISIONING: "true",
    DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_staging",
    ADMIN_DEFAULT_EMAIL: "admin@lifedance.com",
    TEST_USER_DEFAULT_PASSWORD: "shared-test-password-value",
    STAGING_TEST_SUPER_ADMIN_SHOP_NO: "6333731099"
  } as NodeJS.ProcessEnv;

  it("targets only the five explicitly requested staging test accounts", () => {
    expect(STAGING_TEST_SUPER_ADMIN_EMAILS).toEqual([
      "adminb@lifedance.com",
      "adminc@lifedance.com",
      "admind@lifedance.com",
      "akiratest@lifedance.com",
      "collintest@lifedance.com"
    ]);
  });

  it("requires an explicit staging boundary, shared test password and existing shop number", () => {
    expect(parseStagingTestSuperAdminProvisioningConfig(validEnv)).toMatchObject({
      databaseHost: "mysql",
      databaseName: "needo_staging",
      actorEmail: "admin@lifedance.com",
      shopNo: "6333731099",
      password: "shared-test-password-value"
    });

    for (const override of [
      { NODE_ENV: "development" },
      { DEPLOY_ENV: "prod" },
      { ALLOW_STAGING_TEST_SUPER_ADMIN_PROVISIONING: "false" },
      { DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_prod" },
      { TEST_USER_DEFAULT_PASSWORD: undefined },
      { STAGING_TEST_SUPER_ADMIN_SHOP_NO: "" }
    ]) {
      expect(() =>
        parseStagingTestSuperAdminProvisioningConfig({ ...validEnv, ...override })
      ).toThrow();
    }
  });

  it("opens the user, technician, merchant and operations portals with scoped identities and roles", () => {
    expect(
      buildStagingTestSuperAdminPortalPlan({
        userId: 273,
        displayName: "akira",
        customerProfileId: 501,
        technicianProfileId: 601,
        shopId: 11
      })
    ).toEqual({
      identities: [
        {
          type: "platform",
          scopeType: "global",
          scopeId: null,
          displayName: "akira",
          isDefault: true,
          identifierKind: "NEEDO"
        },
        {
          type: "customer",
          scopeType: "customer_profile",
          scopeId: 501,
          displayName: "akira",
          isDefault: false,
          identifierKind: null
        },
        {
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 601,
          displayName: "akira",
          isDefault: false,
          identifierKind: "S"
        },
        {
          type: "merchant_staff",
          scopeType: "shop",
          scopeId: 11,
          displayName: "akira",
          isDefault: false,
          identifierKind: "B"
        }
      ],
      roles: [
        { code: "admin", scopeType: "global", scopeId: null },
        { code: "customer", scopeType: "customer_profile", scopeId: 501 },
        { code: "technician", scopeType: "technician_profile", scopeId: 601 },
        { code: "merchant_staff", scopeType: "shop", scopeId: 11 }
      ]
    });
  });
});
