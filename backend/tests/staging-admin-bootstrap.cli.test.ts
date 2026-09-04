import type { StagingAdminBootstrapRepositoryPort } from "../src/staging/staging-admin-bootstrap";
import { runStagingAdminBootstrapCli } from "../src/staging/staging-admin-bootstrap.cli";

const env = {
  NODE_ENV: "production",
  DEPLOY_ENV: "staging",
  ALLOW_STAGING_ADMIN_BOOTSTRAP: "true",
  DATABASE_URL: "mysql://needo_staging:secret@mysql:3306/needo_staging",
  ADMIN_DEFAULT_EMAIL: "admin@needo.life",
  ADMIN_DEFAULT_USERNAME: "NeeDo Staging Admin",
  ADMIN_DEFAULT_PASSWORD: "Correct-Horse-Battery-Staging-42",
  AUTH_VERIFICATION_SECRET: "a-dedicated-staging-verification-secret"
} satisfies NodeJS.ProcessEnv;

describe("staging administrator bootstrap CLI", () => {
  it("prints only redacted postconditions and always disconnects", async () => {
    const writes: string[] = [];
    let disconnected = false;
    const repository: StagingAdminBootstrapRepositoryPort = {
      bootstrap: async () => ({
        status: "created",
        administratorCount: 1,
        platformIdentityCount: 1,
        forbiddenBusinessRowCount: 0
      })
    };

    await runStagingAdminBootstrapCli({
      env,
      createRepository: () => ({
        repository,
        disconnect: async () => {
          disconnected = true;
        }
      }),
      writeOutput: (value) => writes.push(value)
    });

    expect(disconnected).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({
      gate: "staging-admin-bootstrap",
      status: "created",
      administratorCount: 1,
      platformIdentityCount: 1,
      forbiddenBusinessRowCount: 0
    });
    expect(writes[0]).not.toContain(env.ADMIN_DEFAULT_EMAIL);
    expect(writes[0]).not.toContain(env.ADMIN_DEFAULT_PASSWORD);
    expect(writes[0]).not.toContain(env.AUTH_VERIFICATION_SECRET);
  });
});
