import { getSimulationSeedConfig } from "../src/simulation/simulation-seed-config";

const localEnv = {
  NODE_ENV: "development",
  DEPLOY_ENV: "local",
  ALLOW_SIMULATION_SEED: "true",
  DATABASE_URL: "mysql://needo:password@127.0.0.1:3307/needo",
  SIMULATION_DEFAULT_PASSWORD: "Local-only-password!"
};

describe("simulation seed safety", () => {
  it("accepts an explicitly enabled local database", () => {
    expect(getSimulationSeedConfig(localEnv)).toMatchObject({
      databaseName: "needo",
      defaultPassword: "Local-only-password!"
    });
  });

  it("requires the explicit simulation flag and password", () => {
    expect(() => getSimulationSeedConfig({ ...localEnv, ALLOW_SIMULATION_SEED: "false" })).toThrow(
      "ALLOW_SIMULATION_SEED=true"
    );
    expect(() => getSimulationSeedConfig({ ...localEnv, SIMULATION_DEFAULT_PASSWORD: "" })).toThrow(
      "SIMULATION_DEFAULT_PASSWORD"
    );
  });

  it("can reuse the configured local test-account password without hardcoding a secret", () => {
    expect(
      getSimulationSeedConfig({
        ...localEnv,
        SIMULATION_DEFAULT_PASSWORD: "",
        TEST_USER_DEFAULT_PASSWORD: "Existing-local-test-password!"
      }).defaultPassword
    ).toBe("Existing-local-test-password!");
  });

  it("uses one explicitly configured password for the local exported test cohort", () => {
    expect(getSimulationSeedConfig(localEnv).defaultPassword).toBe(
      localEnv.SIMULATION_DEFAULT_PASSWORD
    );
  });

  it("rejects production, remote hosts and production-looking databases", () => {
    expect(() => getSimulationSeedConfig({ ...localEnv, NODE_ENV: "production" })).toThrow(
      "production"
    );
    expect(() => getSimulationSeedConfig({ ...localEnv, DEPLOY_ENV: "prod" })).toThrow(
      "production"
    );
    expect(() =>
      getSimulationSeedConfig({
        ...localEnv,
        DATABASE_URL: "mysql://needo:password@db.example.com:3306/needo"
      })
    ).toThrow("local MySQL host");
    expect(() =>
      getSimulationSeedConfig({
        ...localEnv,
        DATABASE_URL: "mysql://needo:password@127.0.0.1:3307/needo_production"
      })
    ).toThrow("production database");
  });
});
