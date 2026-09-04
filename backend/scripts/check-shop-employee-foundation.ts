import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { Prisma, type PrismaClient } from "@prisma/client";

export const SHOP_EMPLOYEE_SYSTEM_ROLE_CODES = [
  "OWNER",
  "ADMINISTRATOR",
  "STAFF",
  "TECHNICIAN",
  "ACCOUNTANT",
  "DRIVER",
  "GENERAL_AFFAIRS",
  "CHEF"
] as const;

export interface ShopEmployeeFoundationCounts {
  missingSystemRoles: number;
  ownersWithoutEmployee: number;
  techniciansWithoutEmployee: number;
  invalidTechnicianAssignments: number;
  orphanActiveEmployees: number;
}

export interface ShopEmployeeFoundationReport {
  ready: boolean;
  counts: ShopEmployeeFoundationCounts;
}

export interface ShopEmployeeFoundationCheckRepository {
  countIssues(): Promise<ShopEmployeeFoundationCounts>;
}

type CountRow = {
  missingSystemRoles: bigint | number;
  ownersWithoutEmployee: bigint | number;
  techniciansWithoutEmployee: bigint | number;
  invalidTechnicianAssignments: bigint | number;
  orphanActiveEmployees: bigint | number;
};

const isEffective = Prisma.sql`
  AND employees.status IN ('active', 'on_leave', 'suspended')
  AND employees.starts_at <= UTC_TIMESTAMP(3)
  AND (employees.ends_at IS NULL OR employees.ends_at > UTC_TIMESTAMP(3))
  AND employees.deleted_at IS NULL
`;

export class PrismaShopEmployeeFoundationCheckRepository
  implements ShopEmployeeFoundationCheckRepository
{
  constructor(private readonly client: Pick<PrismaClient, "$queryRaw">) {}

  async countIssues(): Promise<ShopEmployeeFoundationCounts> {
    const rows = await this.client.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT
        GREATEST(
          ${SHOP_EMPLOYEE_SYSTEM_ROLE_CODES.length} - (
            SELECT COUNT(DISTINCT roles.code)
            FROM shop_employee_roles AS roles
            WHERE roles.shop_id IS NULL
              AND roles.code IN (${Prisma.join(SHOP_EMPLOYEE_SYSTEM_ROLE_CODES)})
              AND roles.is_system = true
              AND roles.active_key IS NOT NULL
              AND roles.deleted_at IS NULL
          ),
          0
        ) AS missingSystemRoles,
        (
          SELECT COUNT(*)
          FROM shops
          WHERE shops.owner_user_id IS NOT NULL
            AND shops.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM shop_employees AS employees
              WHERE employees.shop_id = shops.id
                AND employees.user_id = shops.owner_user_id
                ${isEffective}
            )
        ) AS ownersWithoutEmployee,
        (
          SELECT COUNT(*)
          FROM technician_shop_affiliations AS affiliations
          JOIN technician_profiles AS profiles
            ON profiles.id = affiliations.technician_profile_id
            AND profiles.deleted_at IS NULL
          WHERE affiliations.work_status IN ('active', 'on_leave', 'suspended')
            AND affiliations.starts_at <= UTC_TIMESTAMP(3)
            AND (affiliations.ends_at IS NULL OR affiliations.ends_at > UTC_TIMESTAMP(3))
            AND affiliations.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM shop_employees AS employees
              WHERE employees.technician_shop_affiliation_id = affiliations.id
                AND employees.shop_id = affiliations.shop_id
                AND employees.user_id = profiles.user_id
                ${isEffective}
            )
        ) AS techniciansWithoutEmployee,
        (
          SELECT COUNT(*)
          FROM shop_employee_role_assignments AS assignments
          JOIN shop_employee_roles AS roles
            ON roles.id = assignments.shop_employee_role_id
            AND roles.active_key = 'system:TECHNICIAN'
            AND roles.is_technician_role = true
            AND roles.deleted_at IS NULL
          JOIN shop_employees AS employees
            ON employees.id = assignments.shop_employee_id
          WHERE assignments.starts_at <= UTC_TIMESTAMP(3)
            AND (assignments.ends_at IS NULL OR assignments.ends_at > UTC_TIMESTAMP(3))
            AND assignments.deleted_at IS NULL
            ${isEffective}
            AND NOT EXISTS (
              SELECT 1
              FROM technician_shop_affiliations AS affiliations
              JOIN technician_profiles AS profiles
                ON profiles.id = affiliations.technician_profile_id
                AND profiles.user_id = employees.user_id
                AND profiles.deleted_at IS NULL
              WHERE affiliations.id = employees.technician_shop_affiliation_id
                AND affiliations.shop_id = employees.shop_id
                AND affiliations.work_status IN ('active', 'on_leave', 'suspended')
                AND affiliations.starts_at <= UTC_TIMESTAMP(3)
                AND (affiliations.ends_at IS NULL OR affiliations.ends_at > UTC_TIMESTAMP(3))
                AND affiliations.deleted_at IS NULL
            )
        ) AS invalidTechnicianAssignments,
        (
          SELECT COUNT(*)
          FROM shop_employees AS employees
          WHERE 1 = 1
            ${isEffective}
            AND (
              NOT EXISTS (
                SELECT 1 FROM shops
                WHERE shops.id = employees.shop_id
                  AND shops.deleted_at IS NULL
              )
              OR NOT EXISTS (
                SELECT 1 FROM users
                WHERE users.id = employees.user_id
                  AND users.is_active = true
                  AND users.deleted_at IS NULL
              )
              OR NOT EXISTS (
                SELECT 1
                FROM shop_employee_role_assignments AS assignments
                JOIN shop_employee_roles AS roles
                  ON roles.id = assignments.shop_employee_role_id
                  AND roles.deleted_at IS NULL
                WHERE assignments.shop_employee_id = employees.id
                  AND assignments.starts_at <= UTC_TIMESTAMP(3)
                  AND (assignments.ends_at IS NULL OR assignments.ends_at > UTC_TIMESTAMP(3))
                  AND assignments.deleted_at IS NULL
              )
            )
        ) AS orphanActiveEmployees
    `);

    const row = rows[0];
    if (!row) throw new Error("shop employee foundation count query returned no row");
    return {
      missingSystemRoles: Number(row.missingSystemRoles),
      ownersWithoutEmployee: Number(row.ownersWithoutEmployee),
      techniciansWithoutEmployee: Number(row.techniciansWithoutEmployee),
      invalidTechnicianAssignments: Number(row.invalidTechnicianAssignments),
      orphanActiveEmployees: Number(row.orphanActiveEmployees)
    };
  }
}

export const checkShopEmployeeFoundation = async (
  repository: ShopEmployeeFoundationCheckRepository
): Promise<ShopEmployeeFoundationReport> => {
  const counts = await repository.countIssues();
  for (const [name, value] of Object.entries(counts)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`invalid shop employee foundation count: ${name}`);
    }
  }
  return {
    ready: Object.values(counts).every((count) => count === 0),
    counts
  };
};

const loadScriptEnvironment = (): void => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (existsSync(envFile)) loadDotenv({ path: envFile });
};

const main = async (): Promise<void> => {
  loadScriptEnvironment();
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const report = await checkShopEmployeeFoundation(
      new PrismaShopEmployeeFoundationCheckRepository(prisma)
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
};

if (require.main === module) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
