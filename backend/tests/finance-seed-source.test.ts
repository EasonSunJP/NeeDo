import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal finance payroll seed", () => {
  const seedSource = readFileSync(join(__dirname, "../prisma/seed.ts"), "utf8");
  const operationsSeedSource = readFileSync(
    join(__dirname, "../scripts/seed-three-month-simulation.ts"),
    "utf8"
  );

  it("seeds a non-empty formal finance and payroll demo chain", () => {
    expect(seedSource).toContain("seedFormalFinancePayrollDemoData");
    expect(seedSource).toContain("SEED-FINANCE-0001");
    expect(seedSource).toContain("tx.bookingOrder.upsert");
    expect(seedSource).toContain("tx.orderFinancial.upsert");
    expect(seedSource).toContain("tx.payRun");
    expect(seedSource).toContain("tx.payslip");
    expect(seedSource).toContain("tx.payoutRecord");
    expect(seedSource).toContain("upsertSeedTechnicianService");
    expect(seedSource).toContain("technicianServiceId");
  });

  it("links every LifeDance completed-order financial through its unique booking relation", () => {
    expect(operationsSeedSource).toContain("tx.orderFinancial.createMany");
    expect(operationsSeedSource).toContain(
      "bookingOrderId: getRequiredId(orderIds, booking.orderNo"
    );
    expect(operationsSeedSource).not.toContain("orderFinancial: { metadata:");
  });
});
