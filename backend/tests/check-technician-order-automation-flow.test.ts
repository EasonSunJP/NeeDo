import {
  AUTOMATION_FIXTURE_MARKER,
  validateTechnicianAutomationEnvironment
} from "../scripts/check-technician-order-automation-flow";

describe("persistent technician order automation checker", () => {
  const local = {
    FORMAL_BACKEND_ENV_FILE: "/tmp/needo-local.env",
    DATABASE_URL: "mysql://needo:needo@127.0.0.1:3307/needo_dev"
  };

  it("uses a stable retained marker for repeatable real-data rounds", () => {
    expect(AUTOMATION_FIXTURE_MARKER).toBe("qa-technician-order-automation-20260909");
    expect(() => validateTechnicianAutomationEnvironment(local)).not.toThrow();
  });

  it.each([
    ["remote host", { ...local, DATABASE_URL: "mysql://needo:needo@example.com/needo_dev" }],
    ["production database", { ...local, DATABASE_URL: "mysql://needo:needo@127.0.0.1:3307/needo_production" }],
    ["staging environment", { ...local, NODE_ENV: "staging" }]
  ])("refuses %s", (_label, environment) => {
    expect(() => validateTechnicianAutomationEnvironment(environment)).toThrow();
  });
});
