import type { AppConfig } from "../src/config/env";

describe("affiliate alliance invitation expiry configuration", () => {
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

  it("uses the formal interval and batch defaults", async () => {
    delete process.env.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS;
    delete process.env.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE;
    const config = await importEnv();
    expect(config.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS).toBe(300_000);
    expect(config.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE).toBe(100);
  });

  it("rejects unsafe interval and batch values", async () => {
    process.env.AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS = "59999";
    await expect(importEnv()).rejects.toThrow("AFFILIATE_ALLIANCE_INVITATION_EXPIRY_INTERVAL_MS");
    process.env = { ...originalEnv, AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE: "501" };
    await expect(importEnv()).rejects.toThrow("AFFILIATE_ALLIANCE_INVITATION_EXPIRY_BATCH_SIZE");
  });
});
