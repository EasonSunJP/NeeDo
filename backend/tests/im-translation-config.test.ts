import type { AppConfig } from "../src/config/env";
import { createTranslationProvider } from "../src/routes/im-message-translation.routes";

describe("IM translation environment configuration", () => {
  const originalEnv = { ...process.env };

  const productionEnv = (override: Record<string, string>): NodeJS.ProcessEnv => ({
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
    GOOGLE_AUTH_CLIENT_ID: "424911365001.apps.googleusercontent.com",
    AFFILIATE_LINK_SECRET: "production-affiliate-link-secret-with-32-characters",
    SENSITIVE_DATA_ENCRYPTION_KEY: "production-sensitive-data-key-with-32-characters",
    AFFILIATE_PUBLIC_BASE_URL: "https://needo.dackou.com/afirieito",
    CUSTOMER_AVATAR_PUBLIC_BASE_URL: "https://needo.dackou.com/media/customer-avatars",
    IM_TRANSLATION_PROVIDER: "deepl",
    IM_TRANSLATION_API_BASE_URL: "https://api-free.deepl.com",
    IM_TRANSLATION_API_KEY: "actual-production-deepl-secret:fx",
    ...override
  });

  const importEnv = async (): Promise<AppConfig> => {
    let importedEnv: AppConfig | undefined;
    await jest.isolateModulesAsync(async () => {
      importedEnv = (await import("../src/config/env")).env;
    });
    return importedEnv as AppConfig;
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("defaults to a disabled provider with bounded operational defaults", async () => {
    delete process.env.IM_TRANSLATION_PROVIDER;
    delete process.env.IM_TRANSLATION_API_BASE_URL;
    delete process.env.IM_TRANSLATION_API_KEY;
    delete process.env.IM_TRANSLATION_TIMEOUT_MS;
    delete process.env.IM_TRANSLATION_MAX_RETRIES;
    delete process.env.IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT;

    await expect(importEnv()).resolves.toMatchObject({
      IM_TRANSLATION_PROVIDER: "disabled",
      IM_TRANSLATION_API_BASE_URL: undefined,
      IM_TRANSLATION_API_KEY: undefined,
      IM_TRANSLATION_TIMEOUT_MS: 5_000,
      IM_TRANSLATION_MAX_RETRIES: 2,
      IM_TRANSLATION_MONTHLY_CHARACTER_LIMIT: 500_000
    });
  });

  it.each([
    ["missing base URL", { IM_TRANSLATION_API_BASE_URL: "" }, "IM_TRANSLATION_API_BASE_URL"],
    [
      "HTTP base URL",
      { IM_TRANSLATION_API_BASE_URL: "http://api-free.deepl.com" },
      "IM_TRANSLATION_API_BASE_URL"
    ],
    ["missing key", { IM_TRANSLATION_API_KEY: "" }, "IM_TRANSLATION_API_KEY"],
    [
      "placeholder key",
      { IM_TRANSLATION_API_KEY: "replace-with-deepl-key" },
      "IM_TRANSLATION_API_KEY"
    ]
  ])("rejects DeepL configuration with %s", async (_label, override, expectedField) => {
    process.env.IM_TRANSLATION_PROVIDER = "deepl";
    process.env.IM_TRANSLATION_API_BASE_URL = "https://api-free.deepl.com";
    process.env.IM_TRANSLATION_API_KEY = "unit-test-deepl-key:fx";
    Object.assign(process.env, override);

    await expect(importEnv()).rejects.toThrow(expectedField);
  });

  it("rejects a loopback DeepL endpoint in production", async () => {
    process.env = productionEnv({ IM_TRANSLATION_API_BASE_URL: "https://127.0.0.1" });

    await expect(importEnv()).rejects.toThrow("IM_TRANSLATION_API_BASE_URL");
  });

  it.each([
    "https://example.com",
    "https://api.example.net",
    "https://example.org.",
    "https://127.0.0.2",
    "https://127.255.255.254",
    "https://0.0.0.0",
    "https://api.localhost",
    "https://[::1]",
    "https://[::]",
    "https://[::ffff:127.0.0.1]",
    "https://[0:0:0:0:0:ffff:7f00:1]",
    "https://[::ffff:0.0.0.0]",
    "https://[0:0:0:0:0:ffff:0:0]"
  ])("rejects unsafe production DeepL endpoint %s", async (apiBaseUrl) => {
    process.env = productionEnv({ IM_TRANSLATION_API_BASE_URL: apiBaseUrl });
    await expect(importEnv()).rejects.toThrow("IM_TRANSLATION_API_BASE_URL");
  });

  it.each([
    "dummy",
    "test-key",
    "fake-secret",
    "sample",
    "changeme",
    "placeholder",
    "local",
    "local-key",
    "development",
    "development-key",
    "development-key:fx",
    "dev-key",
    "dev-key:fx",
    "not-a-real-key",
    "not-a-real-key:fx",
    "local.secret",
    "my-dummy-deepl-key",
    "sample.translation.key"
  ])("rejects obvious production placeholder key %s", async (apiKey) => {
    process.env = productionEnv({ IM_TRANSLATION_API_KEY: apiKey });
    await expect(importEnv()).rejects.toThrow("IM_TRANSLATION_API_KEY");
  });

  it("allows a custom HTTPS DeepL-compatible endpoint in development", async () => {
    process.env.IM_TRANSLATION_PROVIDER = "deepl";
    process.env.IM_TRANSLATION_API_BASE_URL = "https://translator.internal.example.com";
    process.env.IM_TRANSLATION_API_KEY = "development-secret";

    await expect(importEnv()).resolves.toMatchObject({
      IM_TRANSLATION_PROVIDER: "deepl",
      IM_TRANSLATION_API_BASE_URL: "https://translator.internal.example.com"
    });
  });

  it("does not enforce DeepL production endpoint or key policy while the provider is disabled", async () => {
    process.env = productionEnv({
      IM_TRANSLATION_PROVIDER: "disabled",
      IM_TRANSLATION_API_BASE_URL: "https://api.localhost",
      IM_TRANSLATION_API_KEY: "local-key"
    });

    await expect(importEnv()).resolves.toMatchObject({ IM_TRANSLATION_PROVIDER: "disabled" });
  });

  it("selects disabled or DeepL implementations through the production route composition", async () => {
    const config = await importEnv();
    expect(createTranslationProvider(config).key).toBe("disabled");
    expect(
      createTranslationProvider({
        ...config,
        IM_TRANSLATION_PROVIDER: "deepl",
        IM_TRANSLATION_API_BASE_URL: "https://api-free.deepl.com",
        IM_TRANSLATION_API_KEY: "unit-test-deepl-key:fx"
      }).key
    ).toBe("deepl");
  });
});
