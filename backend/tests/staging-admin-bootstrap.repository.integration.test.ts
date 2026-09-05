import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config as loadDotenv } from "dotenv";
import mariadb, { type Connection } from "mariadb";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { StagingAdminBootstrapRepository } from "../src/staging/staging-admin-bootstrap.repository";
import {
  StagingAdminBootstrapService,
  type StagingAdminBootstrapConfig
} from "../src/staging/staging-admin-bootstrap";

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_STAGING_ADMIN_BOOTSTRAP_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
const databaseName = `needo_staging_bootstrap_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminEmail = `staging-admin-${randomUUID()}@needo.life`;
const adminPassword = `Staging-${randomUUID()}-Password`;

let administrationConnection: Connection | undefined;
let prisma: PrismaClient | undefined;
let isolatedDatabaseUrl = "";

const loadSafeLocalAdminUrl = (): URL => {
  const explicitTestAdminUrl = process.env.STAGING_BOOTSTRAP_TEST_ADMIN_URL?.trim();
  if (explicitTestAdminUrl) {
    const parsed = new URL(explicitTestAdminUrl);
    const port = Number(parsed.port);
    if (
      parsed.protocol !== "mysql:" ||
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
      decodeURIComponent(parsed.username) !== "root" ||
      decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) !== "mysql" ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535
    ) {
      throw new Error(
        "STAGING_BOOTSTRAP_TEST_ADMIN_URL must target loopback root/mysql on a high port"
      );
    }
    return parsed;
  }

  const envFile = process.env.ENV_FILE?.trim();
  if (!envFile) throw new Error("Staging bootstrap integration requires ENV_FILE");
  const loaded = loadDotenv({ path: envFile }).parsed;
  const databaseUrl = loaded?.DATABASE_URL;
  const rootPassword = loaded?.MYSQL_ROOT_PASSWORD?.trim();
  if (!databaseUrl) throw new Error("Staging bootstrap integration ENV_FILE has no DATABASE_URL");
  if (!rootPassword) {
    throw new Error("Staging bootstrap integration ENV_FILE has no MYSQL_ROOT_PASSWORD");
  }
  const parsed = new URL(databaseUrl);
  const sourceDatabase = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    parsed.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname) ||
    !["needo_dev", "needo_test"].includes(sourceDatabase)
  ) {
    throw new Error("Staging bootstrap integration requires a local NeeDo development database");
  }
  parsed.username = "root";
  parsed.password = rootPassword;
  return parsed;
};

describeIntegration("StagingAdminBootstrapRepository integration", () => {
  beforeAll(async () => {
    const baseUrl = loadSafeLocalAdminUrl();
    administrationConnection = await mariadb.createConnection({
      host: baseUrl.hostname,
      port: Number(baseUrl.port || "3306"),
      user: decodeURIComponent(baseUrl.username),
      password: decodeURIComponent(baseUrl.password),
      database: decodeURIComponent(baseUrl.pathname.replace(/^\/+/, "")),
      allowPublicKeyRetrieval: true
    });
    await administrationConnection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    const testUrl = new URL(baseUrl);
    testUrl.pathname = `/${databaseName}`;
    isolatedDatabaseUrl = testUrl.toString();
    await execFileAsync(process.execPath, [
      "./node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "prisma/schema.prisma"
    ], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: isolatedDatabaseUrl },
      maxBuffer: 8 * 1024 * 1024
    });
    prisma = new PrismaClient({ adapter: new PrismaMariaDb(isolatedDatabaseUrl), log: ["error"] });
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (administrationConnection) {
      try {
        await administrationConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
      } finally {
        await administrationConnection.end();
      }
    }
  }, 30_000);

  it("creates one non-test platform administrator and is exactly idempotent", async () => {
    if (!prisma) throw new Error("integration Prisma client is unavailable");
    const config: StagingAdminBootstrapConfig = {
      databaseHost: "mysql",
      databaseName: "needo_staging",
      email: adminEmail,
      username: "NeeDo Staging Administrator",
      password: adminPassword,
      verificationSecret: "integration-verification-secret-with-32-characters"
    };
    const service = new StagingAdminBootstrapService(
      new StagingAdminBootstrapRepository(prisma)
    );

    await expect(service.bootstrap(config)).resolves.toMatchObject({ status: "created" });
    await expect(service.bootstrap(config)).resolves.toMatchObject({ status: "already-complete" });

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const testAdministrator = await prisma.user.create({
      data: {
        needoId: `test-admin-${randomUUID()}`,
        email: `test-admin-${randomUUID()}@needo.local`,
        username: `test-admin-${randomUUID()}`,
        passwordHash: "not-a-login-credential",
        isTestAccount: true,
        isActive: true
      }
    });
    await prisma.userRole.create({
      data: {
        userId: testAdministrator.id,
        roleId: adminRole.id,
        scopeType: "global"
      }
    });
    const createdAdministrator = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    expect(createdAdministrator.isTestAccount).toBe(false);
    await prisma.user.update({
      where: { id: createdAdministrator.id },
      data: { isTestAccount: true }
    });

    await expect(service.bootstrap(config)).resolves.toMatchObject({ status: "already-complete" });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
      include: {
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    expect(user.isTestAccount).toBe(true);
    expect(user.identities).toHaveLength(1);
    expect(user.identities[0]).toMatchObject({
      type: "platform",
      scopeType: "global",
      scopeId: null,
      isDefault: true,
      isActive: true
    });
    expect(user.userRoles).toHaveLength(1);
    expect(user.userRoles[0]).toMatchObject({ scopeType: "global", scopeId: null });
    expect(user.userRoles[0].role.code).toBe("admin");
    expect(await prisma.customerProfile.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.wallet.count({ where: { ownerType: "USER", ownerId: user.id } })).toBe(0);
    expect(await prisma.walletLedger.count({ where: { wallet: { ownerType: "USER", ownerId: user.id } } })).toBe(0);
    expect(await prisma.auditLog.count({
      where: { action: "staging.admin.bootstrap", targetType: "User", targetId: user.id }
    })).toBe(1);
  }, 30_000);

  it("rejects a changed credential set after bootstrap", async () => {
    if (!prisma) throw new Error("integration Prisma client is unavailable");
    const service = new StagingAdminBootstrapService(
      new StagingAdminBootstrapRepository(prisma)
    );

    await expect(service.bootstrap({
      databaseHost: "mysql",
      databaseName: "needo_staging",
      email: adminEmail,
      username: "NeeDo Staging Administrator",
      password: `${adminPassword}-changed`,
      verificationSecret: "integration-verification-secret-with-32-characters"
    })).rejects.toThrow("STAGING_ADMIN_BOOTSTRAP_CREDENTIAL_CONFLICT");
  });
});
