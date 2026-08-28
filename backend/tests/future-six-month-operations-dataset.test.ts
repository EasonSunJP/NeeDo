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
  const commandPath = resolve(__dirname, "../scripts/seed-future-six-month-operations.ts");

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
    expect(source).toContain("applyFutureOperationsPlan");
    expect(source).not.toContain("Dry-run safety gate refused database writes");
  });

  it("uses one transaction and never overwrites unrelated target-window records", () => {
    const source = readFileSync(datasetPath, "utf8");
    expect(source).toContain("export const applyFutureOperationsPlan");
    expect(source).toContain("prisma.$transaction");
    expect(source).toContain("Target window contains non-matching operational data");
    expect(source).not.toMatch(/(?:availability|scheduleSlot|bookingOrder)\.deleteMany/);
  });

  it("persists only future-safe order side effects", () => {
    const source = readFileSync(datasetPath, "utf8");
    expect(source).toContain("orderStatusHistory.createMany");
    expect(source).toContain("notification.createMany");
    expect(source).not.toMatch(
      /(?:orderFinancial|walletHold|walletLedger|payRun|payslip|orderReview)\.(?:create|createMany)/
    );
  });

  it("stores the namespace in every auditable booking artifact", () => {
    const source = readFileSync(datasetPath, "utf8");
    expect(source).toContain("serviceSnapshotJson");
    expect(source).toContain("metadata: { namespace: FUTURE_OPERATIONS_NAMESPACE }");
    expect(source).toMatch(
      /payload:\s*\{[\s\S]*?namespace:\s*FUTURE_OPERATIONS_NAMESPACE/
    );
    expect(source).toContain('action: "simulation.future_operations.applied"');
  });
});
