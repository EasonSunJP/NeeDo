import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  inspectFutureOperationsWindow,
  loadFutureOperationsCohort
} from "../src/simulation/future-six-month-operations-dataset";

describe("future operations dataset contract", () => {
  const datasetPath = resolve(
    __dirname,
    "../src/simulation/future-six-month-operations-dataset.ts"
  );
  const commandPath = resolve(
    __dirname,
    "../scripts/seed-future-six-month-operations.ts"
  );

  it("resolves the existing cohort and never creates identity entities", () => {
    expect(typeof loadFutureOperationsCohort).toBe("function");
    expect(typeof inspectFutureOperationsWindow).toBe("function");
    const source = readFileSync(datasetPath, "utf8");
    expect(source).toContain("buildThreeMonthSimulationPlan");
    expect(source).toContain("user.findMany");
    expect(source).toContain("technicianProfile.findMany");
    expect(source).toContain("technicianService.findMany");
    expect(source).not.toMatch(
      /(?:user|technicianProfile|customerProfile|shop|service)\.(?:create|createMany|upsert)/
    );
  });

  it("is dry-run unless the explicit apply argument is present", () => {
    const source = readFileSync(commandPath, "utf8");
    expect(source).toContain('process.argv.includes("--apply")');
    expect(source).toContain('mode: apply ? "apply" : "dry-run"');
    expect(source).toContain("getSimulationSeedConfig");
  });
});
