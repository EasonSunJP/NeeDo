import type { AppConfig } from "../src/config/env";

describe("content media storage configuration", () => {
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

  it("rejects equal normalized content and protected identity storage roots", async () => {
    process.env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR = "runtime/shared-media";
    process.env.CONTENT_MEDIA_STORAGE_DIR = "runtime/child/../shared-media";

    await expect(importEnv()).rejects.toThrow(
      "CONTENT_MEDIA_STORAGE_DIR must not overlap IDENTITY_APPLICATION_MEDIA_STORAGE_DIR"
    );
  });

  it("rejects a content root nested under protected identity storage", async () => {
    process.env.IDENTITY_APPLICATION_MEDIA_STORAGE_DIR = "runtime/identity-media";
    process.env.CONTENT_MEDIA_STORAGE_DIR = "runtime/identity-media/public-content";

    await expect(importEnv()).rejects.toThrow(
      "CONTENT_MEDIA_STORAGE_DIR must not overlap IDENTITY_APPLICATION_MEDIA_STORAGE_DIR"
    );
  });
});
