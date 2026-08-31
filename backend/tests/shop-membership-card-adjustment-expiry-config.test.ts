import type { AppConfig } from "../src/config/env";

describe("membership card adjustment expiry environment configuration", () => {
  const originalEnv = { ...process.env };
  const importEnv = async (): Promise<AppConfig> => {
    let imported: AppConfig | undefined;
    await jest.isolateModulesAsync(async () => { imported = (await import("../src/config/env")).env; });
    return imported as AppConfig;
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it("uses the documented five-minute/100-item defaults", async () => {
    delete process.env.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS;
    delete process.env.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE;
    const config = await importEnv();
    expect(config.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS).toBe(300_000);
    expect(config.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE).toBe(100);
  });

  it("rejects unsafe interval and batch bounds", async () => {
    process.env.SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS = "59999";
    await expect(importEnv()).rejects.toThrow("SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_INTERVAL_MS");
    process.env = { ...originalEnv, SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE: "501" };
    await expect(importEnv()).rejects.toThrow("SHOP_MEMBERSHIP_CARD_ADJUSTMENT_EXPIRY_BATCH_SIZE");
  });
});
