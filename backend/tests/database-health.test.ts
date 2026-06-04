import {
  FINANCE_READINESS_SCHEMA_COLUMNS,
  checkDatabaseHealth,
  type DatabaseHealthClient
} from "../src/prisma/client";

const createDatabaseHealthClient = (
  schemaRows: Array<{ tableName: string; columnName: string }>
): DatabaseHealthClient => {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce([{ ok: 1 }])
    .mockResolvedValueOnce(schemaRows);

  return {
    $queryRaw: queryRaw
  };
};

describe("checkDatabaseHealth", () => {
  it("returns ok only when the finance and payroll readiness schema is present", async () => {
    const schemaRows = FINANCE_READINESS_SCHEMA_COLUMNS.map((column) => ({
      tableName: column.table,
      columnName: column.column
    }));

    await expect(checkDatabaseHealth(createDatabaseHealthClient(schemaRows))).resolves.toEqual({
      status: "ok",
      latencyMs: expect.any(Number),
      poolSize: expect.any(Number)
    });
  });

  it("returns an error with the missing finance and payroll columns", async () => {
    const schemaRows = FINANCE_READINESS_SCHEMA_COLUMNS.filter(
      (column) =>
        column.table !== "payslips" ||
        !["dispute_resolved_at", "dispute_resolved_by_id"].includes(column.column)
    ).map((column) => ({
      tableName: column.table,
      columnName: column.column
    }));

    await expect(checkDatabaseHealth(createDatabaseHealthClient(schemaRows))).resolves.toEqual({
      status: "error",
      message:
        "Database schema is missing finance readiness columns: payslips.dispute_resolved_at, payslips.dispute_resolved_by_id"
    });
  });
});
