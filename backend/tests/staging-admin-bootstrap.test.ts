import { compare } from "bcryptjs";
import {
  StagingAdminBootstrapService,
  parseStagingAdminBootstrapConfig,
  type StagingAdminBootstrapRepositoryPort,
  type StagingAdminBootstrapWriteInput
} from "../src/staging/staging-admin-bootstrap";

const validEnv = {
  NODE_ENV: "production",
  DEPLOY_ENV: "staging",
  ALLOW_STAGING_ADMIN_BOOTSTRAP: "true",
  DATABASE_URL: "mysql://needo_staging:secret@mysql:3306/needo_staging",
  ADMIN_DEFAULT_EMAIL: "admin@needo.life",
  ADMIN_DEFAULT_USERNAME: "NeeDo Staging Admin",
  ADMIN_DEFAULT_PASSWORD: "Correct-Horse-Battery-Staging-42",
  AUTH_VERIFICATION_SECRET: "a-dedicated-staging-verification-secret"
} satisfies NodeJS.ProcessEnv;

describe("staging administrator bootstrap", () => {
  it("accepts only the exact production staging database boundary", () => {
    expect(parseStagingAdminBootstrapConfig(validEnv)).toMatchObject({
      databaseHost: "mysql",
      databaseName: "needo_staging",
      email: "admin@needo.life",
      username: "NeeDo Staging Admin"
    });

    for (const override of [
      { NODE_ENV: "development" },
      { DEPLOY_ENV: "prod" },
      { ALLOW_STAGING_ADMIN_BOOTSTRAP: "false" },
      { DATABASE_URL: "mysql://needo_staging:secret@127.0.0.1:3306/needo_staging" },
      { DATABASE_URL: "mysql://needo_staging:secret@mysql:3306/needo_prod" },
      { ADMIN_DEFAULT_PASSWORD: "too-short" }
    ]) {
      expect(() => parseStagingAdminBootstrapConfig({ ...validEnv, ...override })).toThrow();
    }
  });

  it("hashes the password with cost 12 and sends no plaintext credential to the repository", async () => {
    let captured: StagingAdminBootstrapWriteInput | undefined;
    const repository: StagingAdminBootstrapRepositoryPort = {
      bootstrap: async (input) => {
        captured = input;
        return {
          status: "created",
          administratorCount: 1,
          platformIdentityCount: 1,
          forbiddenBusinessRowCount: 0
        };
      }
    };
    const config = parseStagingAdminBootstrapConfig(validEnv);

    const result = await new StagingAdminBootstrapService(repository).bootstrap(config);

    expect(result).toEqual({
      status: "created",
      administratorCount: 1,
      platformIdentityCount: 1,
      forbiddenBusinessRowCount: 0
    });
    expect(captured).toBeDefined();
    expect(Object.keys(captured ?? {}).sort()).toEqual([
      "credentialFingerprint",
      "email",
      "passwordHash",
      "username"
    ]);
    expect(captured?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(compare(validEnv.ADMIN_DEFAULT_PASSWORD, captured?.passwordHash ?? "")).resolves.toBe(
      true
    );
    expect(JSON.stringify(captured)).not.toContain(validEnv.ADMIN_DEFAULT_PASSWORD);
    expect(captured?.credentialFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects any repository result that does not prove one clean administrator", async () => {
    const repository: StagingAdminBootstrapRepositoryPort = {
      bootstrap: async () => ({
        status: "created",
        administratorCount: 1,
        platformIdentityCount: 1,
        forbiddenBusinessRowCount: 1
      })
    };

    await expect(
      new StagingAdminBootstrapService(repository).bootstrap(
        parseStagingAdminBootstrapConfig(validEnv)
      )
    ).rejects.toThrow("STAGING_ADMIN_BOOTSTRAP_POSTCONDITION_FAILED");
  });
});
