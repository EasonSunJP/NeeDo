import { parseStagingShopTaxonomyProvisioningConfig } from "../src/staging/staging-shop-taxonomy-provisioning";

describe("staging shop taxonomy provisioning", () => {
  const validEnv = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_SHOP_TAXONOMY_PROVISIONING: "true",
    DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_staging",
    ADMIN_DEFAULT_EMAIL: "admin@lifedance.com"
  } as NodeJS.ProcessEnv;

  it("accepts only the explicit staging database boundary", () => {
    expect(parseStagingShopTaxonomyProvisioningConfig(validEnv)).toEqual({
      databaseHost: "mysql",
      databaseName: "needo_staging",
      actorEmail: "admin@lifedance.com"
    });

    for (const override of [
      { NODE_ENV: "development" },
      { DEPLOY_ENV: "production" },
      { ALLOW_STAGING_SHOP_TAXONOMY_PROVISIONING: "false" },
      { DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_prod" },
      { DATABASE_URL: "mysql://needo:secret@127.0.0.1:3306/needo_staging" },
      { ADMIN_DEFAULT_EMAIL: undefined }
    ]) {
      expect(() => parseStagingShopTaxonomyProvisioningConfig({ ...validEnv, ...override })).toThrow();
    }
  });
});
