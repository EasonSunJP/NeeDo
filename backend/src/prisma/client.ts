import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  createMariaDbPoolConfig,
  getDatabaseConfig,
  type DatabaseHealthStatus
} from "../config/database";
import { env } from "../config/env";

const prismaLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "production" ? ["warn", "error"] : ["error"];

export interface DatabaseHealthClient {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}

export interface FinanceReadinessSchemaColumn {
  table: string;
  column: string;
}

interface DatabaseSchemaColumnRow {
  tableName?: string;
  TABLE_NAME?: string;
  columnName?: string;
  COLUMN_NAME?: string;
}

export const FINANCE_READINESS_SCHEMA_COLUMNS: readonly FinanceReadinessSchemaColumn[] = [
  { table: "order_financials", column: "id" },
  { table: "order_financials", column: "booking_order_id" },
  { table: "order_financials", column: "order_type" },
  { table: "order_financials", column: "b_platform_fee_hold_ndp" },
  { table: "order_financials", column: "b_platform_fee_actual_ndp" },
  { table: "order_financials", column: "c_request_fee_hold_ndp" },
  { table: "order_financials", column: "c_request_fee_actual_ndp" },
  { table: "order_financials", column: "user_reward_ndp" },
  { table: "order_financials", column: "released_ndp" },
  { table: "order_financials", column: "platform_fee_bearer_for_payroll" },
  { table: "order_financials", column: "completed_order_ordinal_in_period" },
  { table: "order_financials", column: "settlement_status" },
  { table: "order_financials", column: "deleted_at" },
  { table: "pay_runs", column: "id" },
  { table: "pay_runs", column: "shop_id" },
  { table: "pay_runs", column: "period_start" },
  { table: "pay_runs", column: "period_end" },
  { table: "pay_runs", column: "status" },
  { table: "pay_runs", column: "total_base_salary_jpy" },
  { table: "pay_runs", column: "total_commission_jpy" },
  { table: "pay_runs", column: "total_bonus_jpy" },
  { table: "pay_runs", column: "total_allowance_jpy" },
  { table: "pay_runs", column: "total_deduction_jpy" },
  { table: "pay_runs", column: "total_net_pay_jpy" },
  { table: "pay_runs", column: "paid_amount_jpy" },
  { table: "pay_runs", column: "unpaid_amount_jpy" },
  { table: "pay_runs", column: "locked_at" },
  { table: "pay_runs", column: "deleted_at" },
  { table: "payslips", column: "id" },
  { table: "payslips", column: "pay_run_id" },
  { table: "payslips", column: "shop_id" },
  { table: "payslips", column: "technician_profile_id" },
  { table: "payslips", column: "technician_user_id" },
  { table: "payslips", column: "period_start" },
  { table: "payslips", column: "period_end" },
  { table: "payslips", column: "status" },
  { table: "payslips", column: "dispute_status" },
  { table: "payslips", column: "dispute_reason" },
  { table: "payslips", column: "platform_fee_share_deduction_jpy" },
  { table: "payslips", column: "net_pay_jpy" },
  { table: "payslips", column: "paid_amount_jpy" },
  { table: "payslips", column: "unpaid_amount_jpy" },
  { table: "payslips", column: "confirmed_at" },
  { table: "payslips", column: "disputed_at" },
  { table: "payslips", column: "dispute_resolved_at" },
  { table: "payslips", column: "dispute_resolved_by_id" },
  { table: "payslips", column: "dispute_resolution_note" },
  { table: "payslips", column: "deleted_at" },
  { table: "payslip_lines", column: "id" },
  { table: "payslip_lines", column: "payslip_id" },
  { table: "payslip_lines", column: "line_type" },
  { table: "payslip_lines", column: "title" },
  { table: "payslip_lines", column: "amount_jpy" },
  { table: "payslip_lines", column: "source_type" },
  { table: "payslip_lines", column: "order_id" },
  { table: "payslip_lines", column: "deleted_at" },
  { table: "payroll_adjustment_requests", column: "id" },
  { table: "payroll_adjustment_requests", column: "shop_id" },
  { table: "payroll_adjustment_requests", column: "technician_profile_id" },
  { table: "payroll_adjustment_requests", column: "period_start" },
  { table: "payroll_adjustment_requests", column: "period_end" },
  { table: "payroll_adjustment_requests", column: "adjustment_type" },
  { table: "payroll_adjustment_requests", column: "amount_jpy" },
  { table: "payroll_adjustment_requests", column: "status" },
  { table: "payroll_adjustment_requests", column: "requested_by_id" },
  { table: "payroll_adjustment_requests", column: "submitted_at" },
  { table: "payroll_adjustment_requests", column: "approved_by_id" },
  { table: "payroll_adjustment_requests", column: "approved_at" },
  { table: "payroll_adjustment_requests", column: "rejected_by_id" },
  { table: "payroll_adjustment_requests", column: "rejected_at" },
  { table: "payroll_adjustment_requests", column: "applied_pay_run_id" },
  { table: "payroll_adjustment_requests", column: "applied_payslip_line_id" },
  { table: "payroll_adjustment_requests", column: "deleted_at" },
  { table: "payout_records", column: "id" },
  { table: "payout_records", column: "payslip_id" },
  { table: "payout_records", column: "shop_id" },
  { table: "payout_records", column: "technician_profile_id" },
  { table: "payout_records", column: "amount_jpy" },
  { table: "payout_records", column: "payout_method" },
  { table: "payout_records", column: "payout_date" },
  { table: "payout_records", column: "status" },
  { table: "payout_records", column: "confirmed_by_technician" },
  { table: "payout_records", column: "technician_confirmed_at" },
  { table: "payout_records", column: "deleted_at" }
];

const databaseConfig = getDatabaseConfig(env);

const createPrismaAdapter = (): PrismaMariaDb => {
  const poolConfig = createMariaDbPoolConfig(env);

  return new PrismaMariaDb(poolConfig, {
    database: poolConfig.database
  });
};

export const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: prismaLogLevels
  });

export const prisma = createPrismaClient();

export const disconnectPrisma = async (): Promise<void> => {
  await prisma.$disconnect();
};

export const checkDatabaseHealth = async (
  client: DatabaseHealthClient = prisma
): Promise<DatabaseHealthStatus> => {
  const startedAt = Date.now();

  try {
    await client.$queryRaw`SELECT 1`;
    const missingFinanceColumns = await getMissingFinanceReadinessSchemaColumns(client);

    if (missingFinanceColumns.length > 0) {
      return {
        status: "error",
        message: `Database schema is missing finance readiness columns: ${missingFinanceColumns.join(", ")}`
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
      poolSize: databaseConfig.pool.connectionLimit
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown database health check error"
    };
  }
};

const getMissingFinanceReadinessSchemaColumns = async (
  client: DatabaseHealthClient
): Promise<string[]> => {
  const requiredTables = [
    ...new Set(FINANCE_READINESS_SCHEMA_COLUMNS.map((column) => column.table))
  ];
  const requiredColumns = [
    ...new Set(FINANCE_READINESS_SCHEMA_COLUMNS.map((column) => column.column))
  ];
  const schemaRows = await client.$queryRaw<DatabaseSchemaColumnRow[]>`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${Prisma.join(requiredTables)})
      AND COLUMN_NAME IN (${Prisma.join(requiredColumns)})
  `;
  const actualColumns = new Set(
    schemaRows.map((row) => {
      const tableName = row.tableName ?? row.TABLE_NAME ?? "";
      const columnName = row.columnName ?? row.COLUMN_NAME ?? "";

      return `${tableName}.${columnName}`;
    })
  );

  return FINANCE_READINESS_SCHEMA_COLUMNS.map(
    (column) => `${column.table}.${column.column}`
  ).filter((columnKey) => !actualColumns.has(columnKey));
};
