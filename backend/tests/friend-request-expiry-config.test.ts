import type { AppConfig } from "../src/config/env";

describe("friend request expiry environment configuration", () => {
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

  it("uses the documented expiry defaults", async () => {
    delete process.env.FRIEND_REQUEST_EXPIRY_INTERVAL_MS;
    delete process.env.FRIEND_REQUEST_EXPIRY_BATCH_SIZE;

    const env = await importEnv();

    expect(env.FRIEND_REQUEST_EXPIRY_INTERVAL_MS).toBe(60_000);
    expect(env.FRIEND_REQUEST_EXPIRY_BATCH_SIZE).toBe(100);
  });

  it("rejects an interval shorter than one minute", async () => {
    process.env.FRIEND_REQUEST_EXPIRY_INTERVAL_MS = "59999";

    await expect(importEnv()).rejects.toThrow("FRIEND_REQUEST_EXPIRY_INTERVAL_MS");
  });

  it.each(["0", "501"])("rejects batch size %s outside the allowed range", async (batchSize) => {
    process.env.FRIEND_REQUEST_EXPIRY_BATCH_SIZE = batchSize;

    await expect(importEnv()).rejects.toThrow("FRIEND_REQUEST_EXPIRY_BATCH_SIZE");
  });
});
