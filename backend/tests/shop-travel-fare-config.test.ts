import type { AppConfig } from "../src/config/env";

describe("shop travel fare environment configuration", () => {
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

  it("defaults to an explicitly disabled and unconfigured provider with bounded TTLs", async () => {
    for (const key of [
      "TRAVEL_ROUTE_PROVIDER",
      "GEOAPIFY_API_BASE_URL",
      "GEOAPIFY_API_KEY",
      "TRAVEL_ROUTE_TIMEOUT_MS",
      "TRAVEL_ROUTE_MAX_RETRIES",
      "TRAVEL_ROUTE_CACHE_TTL_SECONDS",
      "TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS",
      "TRAVEL_ESTIMATE_TTL_SECONDS"
    ]) {
      delete process.env[key];
    }

    await expect(importEnv()).resolves.toMatchObject({
      TRAVEL_ROUTE_PROVIDER: "disabled",
      GEOAPIFY_API_BASE_URL: "https://api.geoapify.com",
      GEOAPIFY_API_KEY: undefined,
      TRAVEL_ROUTE_TIMEOUT_MS: 5_000,
      TRAVEL_ROUTE_MAX_RETRIES: 2,
      TRAVEL_ROUTE_CACHE_TTL_SECONDS: 300,
      TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS: 30,
      TRAVEL_ESTIMATE_TTL_SECONDS: 600
    });
  });

  it("accepts a fully configured Geoapify provider", async () => {
    Object.assign(process.env, {
      TRAVEL_ROUTE_PROVIDER: "geoapify",
      GEOAPIFY_API_BASE_URL: "https://api.geoapify.com",
      GEOAPIFY_API_KEY: "geoapify-secret-key-123456",
      TRAVEL_ROUTE_TIMEOUT_MS: "8000",
      TRAVEL_ROUTE_MAX_RETRIES: "1",
      TRAVEL_ROUTE_CACHE_TTL_SECONDS: "600",
      TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS: "45",
      TRAVEL_ESTIMATE_TTL_SECONDS: "900"
    });

    await expect(importEnv()).resolves.toMatchObject({
      TRAVEL_ROUTE_PROVIDER: "geoapify",
      GEOAPIFY_API_BASE_URL: "https://api.geoapify.com",
      GEOAPIFY_API_KEY: "geoapify-secret-key-123456",
      TRAVEL_ROUTE_TIMEOUT_MS: 8_000,
      TRAVEL_ROUTE_MAX_RETRIES: 1,
      TRAVEL_ROUTE_CACHE_TTL_SECONDS: 600,
      TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS: 45,
      TRAVEL_ESTIMATE_TTL_SECONDS: 900
    });
  });

  it.each([
    ["missing key", { GEOAPIFY_API_KEY: "" }, "GEOAPIFY_API_KEY"],
    ["HTTP base URL", { GEOAPIFY_API_BASE_URL: "http://api.geoapify.com" }, "GEOAPIFY_API_BASE_URL"],
    ["short timeout", { TRAVEL_ROUTE_TIMEOUT_MS: "499" }, "TRAVEL_ROUTE_TIMEOUT_MS"],
    ["too many retries", { TRAVEL_ROUTE_MAX_RETRIES: "4" }, "TRAVEL_ROUTE_MAX_RETRIES"],
    ["long cache", { TRAVEL_ROUTE_CACHE_TTL_SECONDS: "3601" }, "TRAVEL_ROUTE_CACHE_TTL_SECONDS"],
    [
      "long negative cache",
      { TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS: "301" },
      "TRAVEL_ROUTE_NEGATIVE_CACHE_TTL_SECONDS"
    ],
    ["long estimate TTL", { TRAVEL_ESTIMATE_TTL_SECONDS: "1801" }, "TRAVEL_ESTIMATE_TTL_SECONDS"]
  ])("rejects Geoapify configuration with %s", async (_label, override, expectedField) => {
    Object.assign(process.env, {
      TRAVEL_ROUTE_PROVIDER: "geoapify",
      GEOAPIFY_API_BASE_URL: "https://api.geoapify.com",
      GEOAPIFY_API_KEY: "geoapify-secret-key-123456",
      ...override
    });

    await expect(importEnv()).rejects.toThrow(expectedField);
  });
});
