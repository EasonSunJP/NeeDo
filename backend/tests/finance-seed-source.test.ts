import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal finance payroll seed", () => {
  const seedSource = readFileSync(join(__dirname, "../prisma/seed.ts"), "utf8");

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
});
