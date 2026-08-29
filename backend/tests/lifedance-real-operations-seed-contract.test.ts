import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const seedSource = readFileSync(
  resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
  "utf8"
);
const planSource = readFileSync(
  resolve(__dirname, "../src/simulation/three-month-simulation-plan.ts"),
  "utf8"
);
const checkerSource = readFileSync(
  resolve(__dirname, "../scripts/check-three-month-simulation.ts"),
  "utf8"
);
const payrollSeedSource = readFileSync(
  resolve(__dirname, "../src/simulation/lifedance-payroll-seed.ts"),
  "utf8"
);

describe("LifeDance real operations persistence contract", () => {
  it("persists plan-derived shop employment and formal order ownership", () => {
    const technicianProfileBlock = seedSource.slice(
      seedSource.indexOf("const technicianProfileIds"),
      seedSource.indexOf("const customerProfileIds")
    );

    expect(technicianProfileBlock).toContain("employmentType: technician.employmentType");
    expect(technicianProfileBlock).toContain(
      "employmentStartedAt: new Date(technician.employmentStartedAt)"
    );
    expect(seedSource).toContain('dataset: "lifedance_real_operations"');
    expect(planSource).toContain('SIMULATION_ORDER_PREFIX = "LD2026-"');
  });

  it("cleans dependent rows in foreign-key order without broad business-table deletion", () => {
    const reviews = seedSource.indexOf("tx.orderReview.deleteMany");
    const timeline = seedSource.indexOf("tx.orderTimelineComment.deleteMany");
    const financial = seedSource.indexOf("tx.orderFinancial.deleteMany");
    const history = seedSource.indexOf("tx.orderStatusHistory.deleteMany");
    const orders = seedSource.indexOf("tx.bookingOrder.deleteMany");
    const slots = seedSource.indexOf("tx.scheduleSlot.updateMany");
    const availabilities = seedSource.indexOf("tx.availability.updateMany");

    expect(reviews).toBeGreaterThan(-1);
    expect(reviews).toBeLessThan(orders);
    expect(timeline).toBeLessThan(orders);
    expect(financial).toBeLessThan(orders);
    expect(history).toBeLessThan(orders);
    expect(slots).toBeLessThan(availabilities);
    expect(seedSource).not.toMatch(
      /(?:bookingOrder|orderFinancial|scheduleSlot|availability)\.deleteMany\(\{\s*\}\)/
    );
  });

  it("creates confirmed income only from completed orders with reconcilable fields", () => {
    expect(seedSource).toContain(
      'const completedBookings = plan.bookings.filter((booking) => booking.status === "COMPLETED")'
    );
    expect(seedSource).toContain(
      'paymentChannel: ordinal % 2 === 0 ? "offline_card" : "onsite_cash"'
    );
    expect(seedSource).toContain("serviceIncomeConfirmedById: lifeDanceOwnership.adminUserId");
    expect(seedSource).toContain('settlementStatus: "ready_for_payroll"');
    expect(seedSource).toContain("bookingOrderId: getRequiredId(orderIds, booking.orderNo");
  });

  it("requires the database checker to validate employment, histories and money reconciliation", () => {
    expect(checkerSource).toContain("TechnicianEmploymentType.FULL_TIME");
    expect(checkerSource).toContain("TechnicianEmploymentType.TEMPORARY");
    expect(checkerSource).toContain("latestHistory");
    expect(checkerSource).toContain("ready_for_payroll");
    expect(checkerSource).toContain("bookingsByStatus");
    expect(checkerSource).toContain("orderFinancials");
  });

  it("runs three formal payroll periods and verifies payslip-to-order settlement", () => {
    expect(seedSource).toContain("resetLifeDancePayrollPeriods");
    expect(seedSource).toContain("runLifeDancePayrollWorkflow");
    expect(seedSource).toContain("upsertLifeDanceCompensationProfiles");
    expect(payrollSeedSource).toContain('month: "2026-06"');
    expect(payrollSeedSource).toContain('month: "2026-07"');
    expect(payrollSeedSource).toContain('month: "2026-08"');
    expect(checkerSource).toContain("compensationProfiles");
    expect(checkerSource).toContain("payRuns");
    expect(checkerSource).toContain("payslips");
    expect(checkerSource).toContain("payslipOrderLines");
    expect(checkerSource).toContain("payoutRecords");
    expect(checkerSource).toContain("settlementReconciliation");
  });

  it("validates historical payslips against their persisted compensation profile version", () => {
    const compensationProfileQuery = checkerSource.slice(
      checkerSource.indexOf("prisma.technicianCompensationProfile.findMany"),
      checkerSource.indexOf("prisma.payRun.findMany")
    );

    expect(compensationProfileQuery).toContain('status: { in: ["active", "archived"] }');
    expect(compensationProfileQuery).toContain("status: true");
    expect(checkerSource).toContain("activeCompensationProfiles");
    expect(checkerSource).toContain("compensationProfileById");
    expect(checkerSource).toContain(
      "compensationProfileById.get(payslip.compensationProfileId)"
    );
    expect(checkerSource).toContain(
      "compensationProfile.technicianProfileId === payslip.technicianProfileId"
    );
    expect(checkerSource).toContain("compensationProfile.shopId === lifeDanceShop.id");
    expect(checkerSource).not.toContain(
      "payslip.compensationProfileId === compensationProfile.id"
    );
  });
});
