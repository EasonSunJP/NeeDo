import type { AppConfig } from "../src/config/env";
import { createTranslationProvider } from "../src/routes/im-message-translation.routes";

describe("IM translation environment configuration", () => {
  const originalEnv = { ...process.env };

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
      GOOGLE_AUTH_CLIENT_ID: "424911365001.apps.googleusercontent.com",
      AFFILIATE_LINK_SECRET: "production-affiliate-link-secret-with-32-characters",
      SENSITIVE_DATA_ENCRYPTION_KEY: "production-sensitive-data-key-with-32-characters",
      AFFILIATE_PUBLIC_BASE_URL: "https://needo.dackou.com/afirieito",
      CUSTOMER_AVATAR_PUBLIC_BASE_URL: "https://needo.dackou.com/media/customer-avatars",
      IM_TRANSLATION_PROVIDER: "deepl",
      IM_TRANSLATION_API_BASE_URL: "https://127.0.0.1",
      IM_TRANSLATION_API_KEY: "production-deepl-key:fx"
    };

    await expect(importEnv()).rejects.toThrow("IM_TRANSLATION_API_BASE_URL");
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
