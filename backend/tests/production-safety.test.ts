import { shouldSeedRequiredTestAccounts } from "../prisma/seed";

describe("production safety", () => {
  const originalEnv = { ...process.env };

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

  it.each(["ALLOW_TEST_LOGIN", "ALLOW_DEMO_SEED", "ALLOW_SIMULATION_SEED"])(
    "rejects %s in production",
    async (unsafeFlag) => {
      process.env = {
        ...originalEnv,
        NODE_ENV: "production",
        DEPLOY_ENV: "prod",
        ALLOW_TEST_LOGIN: "false",
        ALLOW_DEMO_SEED: "false",
        ALLOW_SIMULATION_SEED: "false",
        [unsafeFlag]: "true"
      };

      await expect(
        jest.isolateModulesAsync(async () => {
          await import("../src/config/env");
        })
      ).rejects.toThrow(unsafeFlag);
    }
  );
});
