import { spawn } from "node:child_process";
import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const BLOCKED_ENVIRONMENTS = new Set(["staging", "prod", "production"]);

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

class ExpectedDmlRollback extends Error {}

const run = (command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `code ${String(code)}`}`
        )
      );
    });
  });

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  loadDotenv({ path: envFile });
  const nodeEnvironment = process.env.NODE_ENV?.trim().toLowerCase() ?? "";
  const deployEnvironment = process.env.DEPLOY_ENV?.trim().toLowerCase() ?? "";
  assert(
    !BLOCKED_ENVIRONMENTS.has(nodeEnvironment) && !BLOCKED_ENVIRONMENTS.has(deployEnvironment),
    "temporary migration check rejects staging and production environments"
  );
  const sourceUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(sourceUrl.hostname),
    "temporary migration check only accepts a local MySQL host"
  );
  const sourceDatabase = sourceUrl.pathname.replace(/^\//, "");
  assert(sourceDatabase.length > 0, "DATABASE_URL must include a database name");
  assert(
    !/(^|[_-])(prod|production|staging)([_-]|$)/i.test(sourceDatabase),
    "temporary migration check rejects production-looking database names"
  );

  const migrationName = "20260829130000_order_acceptance_pause";
  const migrationPath = path.resolve(
    process.cwd(),
    "prisma/migrations",
    migrationName,
    "migration.sql"
  );
  assert(existsSync(migrationPath), `migration file was not found: ${migrationPath}`);
  const migrationSql = readFileSync(migrationPath, "utf8");
  const permissionSectionMarker = "-- Keep protected pause routes";
  const ddlSection = migrationSql.split(permissionSectionMarker)[0];
  const ddlStatements = ddlSection
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert(ddlStatements.length === 5, "unexpected acceptance-control DDL statement count");
  const dmlStatements = migrationSql
    .slice(migrationSql.indexOf(permissionSectionMarker))
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert(dmlStatements.length === 2, "unexpected acceptance-control DML statement count");

  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const permissionCodes = [
    "backoffice:order-acceptance-pause:read",
    "backoffice:order-acceptance-pause:write",
    "merchant-admin:order-acceptance-pause:read",
    "merchant-admin:order-acceptance-pause:write"
  ];
  const capturePermissionState = async () => ({
    permissions: await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: {
        id: true,
        code: true,
        name: true,
        module: true,
        deletedAt: true,
        updatedAt: true
      },
      orderBy: { code: "asc" }
    }),
    assignments: await prisma.rolePermission.findMany({
      where: { permission: { code: { in: permissionCodes } } },
      select: {
        id: true,
        deletedAt: true,
        updatedAt: true,
        role: { select: { code: true } },
        permission: { select: { code: true } }
      },
      orderBy: { id: "asc" }
    })
  });
  const tableCount = async (): Promise<number> => {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
      "order_acceptance_pauses"
    );
    return Number(rows[0]?.count ?? 0);
  };

  try {
    const permissionStateBefore = await capturePermissionState();
    try {
      await prisma.$transaction(async (tx) => {
        for (const statement of dmlStatements) {
          await tx.$executeRawUnsafe(statement);
        }
        const [permissions, assignments] = await Promise.all([
          tx.permission.findMany({
            where: { code: { in: permissionCodes }, deletedAt: null },
            select: { code: true }
          }),
          tx.rolePermission.findMany({
            where: {
              deletedAt: null,
              permission: { code: { in: permissionCodes } },
              role: {
                code: { in: ["admin", "operator", "merchant_owner", "merchant_staff"] },
                deletedAt: null
              }
            },
            select: {
              role: { select: { code: true } },
              permission: { select: { code: true } }
            }
          })
        ]);
        assert(permissions.length === 4, "permission DML did not expose all four permissions");
        const assignmentKeys = new Set(
          assignments.map((assignment) => `${assignment.role.code}:${assignment.permission.code}`)
        );
        for (const code of permissionCodes) {
          assert(assignmentKeys.has(`admin:${code}`), `admin permission grant missing: ${code}`);
        }
        for (const role of ["operator", "merchant_owner", "merchant_staff"]) {
          const prefix = role === "operator" ? "backoffice" : "merchant-admin";
          for (const operation of ["read", "write"]) {
            assert(
              assignmentKeys.has(`${role}:${prefix}:order-acceptance-pause:${operation}`),
              `${role} permission grant missing: ${operation}`
            );
          }
        }
        throw new ExpectedDmlRollback();
      });
    } catch (error) {
      if (!(error instanceof ExpectedDmlRollback)) throw error;
    }
    assert(
      JSON.stringify(await capturePermissionState()) === JSON.stringify(permissionStateBefore),
      "permission DML dry-run did not roll back exactly"
    );

    assert((await tableCount()) === 0, "order_acceptance_pauses already exists; dry-run refused");
    for (const statement of ddlStatements) {
      await prisma.$executeRawUnsafe(statement);
    }
    const [columnRows, constraintRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
        "order_acceptance_pauses"
      ),
      prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE IN ('FOREIGN KEY', 'CHECK')",
        "order_acceptance_pauses"
      )
    ]);
    assert(Number(columnRows[0]?.count ?? 0) === 17, "dry-run table column count mismatch");
    assert(Number(constraintRows[0]?.count ?? 0) === 8, "dry-run table constraint count mismatch");
    await run("npm", ["run", "check:order-acceptance-control-flow"], {
      ...process.env,
      ENV_FILE: envFile
    });
    assert(
      (await prisma.orderAcceptancePause.count()) === 0,
      "flow checker left acceptance-control rows behind"
    );
    process.stdout.write(
      `${JSON.stringify(
        {
          status: "ok",
          sourceDatabase,
          mode: "existing-local-schema-ddl-dry-run",
          migration: migrationName,
          ddlStatements: ddlStatements.length,
          dmlStatements: dmlStatements.length,
          columns: Number(columnRows[0]?.count ?? 0),
          foreignKeysAndChecks: Number(constraintRows[0]?.count ?? 0),
          permissionDmlRolledBack: true,
          migrationRecorded: false,
          dryRunTableWillBeDropped: true
        },
        null,
        2
      )}\n`
    );
  } finally {
    try {
      if ((await tableCount()) === 1) {
        await prisma.$executeRawUnsafe("DROP TABLE `order_acceptance_pauses`");
      }
      assert((await tableCount()) === 0, "dry-run table cleanup failed");
    } finally {
      await disconnectPrisma();
    }
  }
};

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
