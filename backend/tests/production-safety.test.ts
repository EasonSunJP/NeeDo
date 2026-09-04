import { shouldSeedRequiredTestAccounts } from "../prisma/seed";

describe("production safety", () => {
  const originalEnv = { ...process.env };

  const setValidProductionEnv = (): void => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      DEPLOY_ENV: "prod",
      ALLOW_TEST_LOGIN: "false",
      ALLOW_FORMAL_TEST_SEED: "false",
      ALLOW_SIMULATION_SEED: "false",
      CORS_ALLOWED_ORIGINS: "https://needo.dackou.com",
      METRICS_ENABLED: "true",
      METRICS_BEARER_TOKEN: "production-metrics-token-with-32-characters",
      DATABASE_URL: "mysql://needo_prod:strong-db-password@mysql:3306/needo_prod",
      REDIS_URL: "redis://:strong-redis-password@redis:6379",
      AUTH_ACCESS_TOKEN_SECRET: "production-access-secret-with-32-characters",
      AUTH_REFRESH_TOKEN_SECRET: "production-refresh-secret-with-32-characters",
      AUTH_VERIFICATION_SECRET: "production-verification-secret-with-32-characters",
      GOOGLE_AUTH_CLIENT_ID: "123456789012-productiongoogleclientid.apps.googleusercontent.com",
      AFFILIATE_LINK_SECRET: "production-affiliate-link-secret-with-32-characters",
      SENSITIVE_DATA_ENCRYPTION_KEY: "production-sensitive-data-key-with-32-characters",
      AFFILIATE_PUBLIC_BASE_URL: "https://needo.dackou.com/afirieito",
      CUSTOMER_AVATAR_PUBLIC_BASE_URL: "https://needo.dackou.com/media/customer-avatars"
    };
  };

  const importEnv = async (): Promise<void> => {
    await jest.isolateModulesAsync(async () => {
      await import("../src/config/env");
    });
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("requires an explicit allow flag before seeding test accounts", () => {
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "development",
        DEPLOY_ENV: "local"
      })
    ).toBe(false);
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "development",
        DEPLOY_ENV: "local",
        ALLOW_TEST_LOGIN: "true"
      })
    ).toBe(true);
  });

  it("never seeds test accounts in staging or production runtimes", () => {
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "production",
        DEPLOY_ENV: "staging",
        ALLOW_TEST_LOGIN: "true"
      })
    ).toBe(false);
    expect(
      shouldSeedRequiredTestAccounts({
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        ALLOW_TEST_LOGIN: "true"
      })
    ).toBe(false);
  });

  it.each(["ALLOW_TEST_LOGIN", "ALLOW_FORMAL_TEST_SEED", "ALLOW_SIMULATION_SEED"])(
    "rejects %s in production",
    async (unsafeFlag) => {
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        ALLOW_TEST_LOGIN: "false",
        ALLOW_FORMAL_TEST_SEED: "false",
        ALLOW_SIMULATION_SEED: "false",
        [unsafeFlag]: "true"
      };

      await expect(importEnv()).rejects.toThrow(unsafeFlag);
    }
  );

  it("accepts a complete production environment", async () => {
    setValidProductionEnv();

    await expect(importEnv()).resolves.toBeUndefined();
  });

  it("accepts a production Google Web OAuth client ID without a hyphen", async () => {
    setValidProductionEnv();
    process.env.GOOGLE_AUTH_CLIENT_ID = "424911365001.apps.googleusercontent.com";

    await expect(importEnv()).resolves.toBeUndefined();
  });

  it("rejects a missing Google Web OAuth client ID in production", async () => {
    setValidProductionEnv();
    delete process.env.GOOGLE_AUTH_CLIENT_ID;

    await expect(importEnv()).rejects.toThrow("GOOGLE_AUTH_CLIENT_ID");
  });

  it("allows an absent Google client ID only when Google auth is explicitly disabled", async () => {
    setValidProductionEnv();
    process.env.AUTH_GOOGLE_ENABLED = "false";
    delete process.env.GOOGLE_AUTH_CLIENT_ID;

    await expect(importEnv()).resolves.toBeUndefined();
  });

  it("still rejects an absent Google client ID when Google auth is explicitly enabled", async () => {
    setValidProductionEnv();
    process.env.AUTH_GOOGLE_ENABLED = "true";
    delete process.env.GOOGLE_AUTH_CLIENT_ID;

    await expect(importEnv()).rejects.toThrow("GOOGLE_AUTH_CLIENT_ID");
  });

  it.each([
    "AUTH_ACTION_RATE_LIMIT_WINDOW_MS",
    "AUTH_REGISTRATION_RATE_LIMIT_MAX",
    "AUTH_GOOGLE_INIT_RATE_LIMIT_MAX",
    "AUTH_GOOGLE_CREDENTIAL_RATE_LIMIT_MAX",
    "AUTH_VERIFICATION_RATE_LIMIT_MAX"
  ])("requires a positive %s", async (field) => {
    setValidProductionEnv();
    process.env[field] = "0";

    await expect(importEnv()).rejects.toThrow(field);
  });

  it.each([
    ["local deploy target", { DEPLOY_ENV: "local" }, "DEPLOY_ENV"],
    [
      "insecure CORS origin",
      { CORS_ALLOWED_ORIGINS: "http://needo.example" },
      "CORS_ALLOWED_ORIGINS"
    ],
    [
      "placeholder CORS origin",
      { CORS_ALLOWED_ORIGINS: "https://needo.example" },
      "CORS_ALLOWED_ORIGINS"
    ],
    [
      "unsafe realtime Redis channel",
      { REALTIME_REDIS_CHANNEL: "needo realtime events" },
      "REALTIME_REDIS_CHANNEL"
    ],
    ["missing metrics token", { METRICS_BEARER_TOKEN: "" }, "METRICS_BEARER_TOKEN"],
    ["blank Google client ID", { GOOGLE_AUTH_CLIENT_ID: "" }, "GOOGLE_AUTH_CLIENT_ID"],
    ["whitespace Google client ID", { GOOGLE_AUTH_CLIENT_ID: "   " }, "GOOGLE_AUTH_CLIENT_ID"],
    [
      "placeholder Google client ID",
      { GOOGLE_AUTH_CLIENT_ID: "replace-with-prod-google-client-id" },
      "GOOGLE_AUTH_CLIENT_ID"
    ],
    [
      "test Google client ID",
      { GOOGLE_AUTH_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com" },
      "GOOGLE_AUTH_CLIENT_ID"
    ],
    [
      "local Google client ID",
      { GOOGLE_AUTH_CLIENT_ID: "123456789012-local-google-client.apps.googleusercontent.com" },
      "GOOGLE_AUTH_CLIENT_ID"
    ],
    [
      "dummy Google client ID",
      { GOOGLE_AUTH_CLIENT_ID: "123456789012-dummy-google-client.apps.googleusercontent.com" },
      "GOOGLE_AUTH_CLIENT_ID"
    ],
    [
      "malformed Google client ID domain",
      { GOOGLE_AUTH_CLIENT_ID: "123456789012-google-client.example.com" },
      "GOOGLE_AUTH_CLIENT_ID"
    ],
    [
      "placeholder access secret",
      { AUTH_ACCESS_TOKEN_SECRET: "replace-with-prod-access-token-secret-32chars-min" },
      "AUTH_ACCESS_TOKEN_SECRET"
    ],
    [
      "reused token secrets",
      { AUTH_REFRESH_TOKEN_SECRET: "production-access-secret-with-32-characters" },
      "AUTH_REFRESH_TOKEN_SECRET"
    ],
    [
      "placeholder verification secret",
      { AUTH_VERIFICATION_SECRET: "replace-with-a-dedicated-32-character-secret" },
      "AUTH_VERIFICATION_SECRET"
    ],
    [
      "verification/access secret reuse",
      { AUTH_VERIFICATION_SECRET: "production-access-secret-with-32-characters" },
      "AUTH_VERIFICATION_SECRET"
    ],
    [
      "verification/refresh secret reuse",
      { AUTH_VERIFICATION_SECRET: "production-refresh-secret-with-32-characters" },
      "AUTH_VERIFICATION_SECRET"
    ],
    [
      "insecure affiliate URL",
      { AFFILIATE_PUBLIC_BASE_URL: "http://needo.dackou.com/afirieito" },
      "AFFILIATE_PUBLIC_BASE_URL"
    ],
    [
      "insecure customer avatar URL",
      { CUSTOMER_AVATAR_PUBLIC_BASE_URL: "http://needo.dackou.com/media/customer-avatars" },
      "CUSTOMER_AVATAR_PUBLIC_BASE_URL"
    ],
    [
      "placeholder affiliate secret",
      { AFFILIATE_LINK_SECRET: "replace-with-prod-affiliate-link-secret-32chars-min" },
      "AFFILIATE_LINK_SECRET"
    ],
    [
      "affiliate/access secret reuse",
      { AFFILIATE_LINK_SECRET: "production-access-secret-with-32-characters" },
      "AFFILIATE_LINK_SECRET"
    ],
    [
      "affiliate/refresh secret reuse",
      { AFFILIATE_LINK_SECRET: "production-refresh-secret-with-32-characters" },
      "AFFILIATE_LINK_SECRET"
    ],
    [
      "placeholder sensitive-data secret",
      { SENSITIVE_DATA_ENCRYPTION_KEY: "replace-with-prod-sensitive-data-key-32chars-min" },
      "SENSITIVE_DATA_ENCRYPTION_KEY"
    ],
    [
      "sensitive/access secret reuse",
      { SENSITIVE_DATA_ENCRYPTION_KEY: "production-access-secret-with-32-characters" },
      "SENSITIVE_DATA_ENCRYPTION_KEY"
    ],
    [
      "sensitive/refresh secret reuse",
      { SENSITIVE_DATA_ENCRYPTION_KEY: "production-refresh-secret-with-32-characters" },
      "SENSITIVE_DATA_ENCRYPTION_KEY"
    ],
    [
      "sensitive/affiliate secret reuse",
      { SENSITIVE_DATA_ENCRYPTION_KEY: "production-affiliate-link-secret-with-32-characters" },
      "SENSITIVE_DATA_ENCRYPTION_KEY"
    ],
    [
      "placeholder database credentials",
      { DATABASE_URL: "mysql://needo_prod:replace-with-password@mysql:3306/needo_prod" },
      "DATABASE_URL"
    ],
    ["unauthenticated Redis", { REDIS_URL: "redis://redis:6379" }, "REDIS_URL"]
  ])("rejects %s", async (_label, overrides, expectedField) => {
    setValidProductionEnv();
    Object.assign(process.env, overrides);

    await expect(importEnv()).rejects.toThrow(expectedField);
  });
});
