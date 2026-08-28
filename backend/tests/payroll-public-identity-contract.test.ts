import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("payroll public employee identity contract", () => {
  it("selects and maps the employee NeeDoID on every formal payslip", () => {
    const repositorySource = readFileSync(
      join(process.cwd(), "src/repositories/payroll.repository.ts"),
      "utf8"
    );
    const serviceSource = readFileSync(
      join(process.cwd(), "src/services/payroll.service.ts"),
      "utf8"
    );
    const openApiSource = readFileSync(
      join(process.cwd(), "src/api/openapi.ts"),
      "utf8"
    );

    expect(repositorySource).toContain("user: { select: { needoId: true } }");
    expect(repositorySource).toContain("technicianNeedoId: record.technicianProfile.user.needoId");
    expect(serviceSource).toContain("technicianNeedoId?: string | null;");
    expect(openApiSource).toContain('"technicianNeedoId"');
    expect(openApiSource).toContain("Public NeeDoID for the employee linked to this payslip");
  });
});
