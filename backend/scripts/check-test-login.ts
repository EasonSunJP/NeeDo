import { config as loadDotenv } from "dotenv";
import { existsSync } from "fs";
import { TEST_USER_ACCOUNTS, type TestUserAccountDefinition } from "../src/constants/test-login.constants";

type CliOptions = {
  all: boolean;
  baseUrl?: string;
  email?: string;
  envFile: string;
};

type CheckLine = {
  email: string;
  role: string;
  loginOk: boolean;
  permissionsCount: number;
  canEnterExpectedPortal: boolean;
  reason?: string;
};

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    all: false,
    envFile: process.env.ENV_FILE || ".env.dev"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all") {
      options.all = true;
    } else if (arg === "--email") {
      options.email = args[index + 1];
      index += 1;
    } else if (arg === "--base-url") {
      options.baseUrl = args[index + 1];
      index += 1;
    } else if (arg === "--env-file") {
      options.envFile = args[index + 1];
      index += 1;
    }
  }

  return options;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const joinUrl = (baseUrl: string, path: string): string =>
  `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`;

const tokenPreview = (token: string | undefined): string =>
  token ? `${token.slice(0, 8)}***` : "<missing>";

const getPassword = (): string => {
  const password =
    process.env.TEST_USER_DEFAULT_PASSWORD?.trim() || process.env.ADMIN_DEFAULT_PASSWORD?.trim();

  if (!password) {
    throw new Error("TEST_USER_DEFAULT_PASSWORD or ADMIN_DEFAULT_PASSWORD is required.");
  }

  return password;
};

const expectedPortalPermission = (account: TestUserAccountDefinition): string => {
  const permissions: Record<TestUserAccountDefinition["expectedPortal"], string> = {
    admin: "menu:admin-console",
    business: "menu:dashboard",
    merchant: "menu:merchant-app",
    technician: "menu:technician-app",
    customer: "menu:client-app"
  };

  return permissions[account.expectedPortal];
};

const printSection = (title: string): void => {
  console.log(`\n== ${title} ==`);
};

const main = async (): Promise<void> => {
  const options = parseArgs();
  process.env.ENV_FILE = options.envFile;
  if (!existsSync(options.envFile)) {
    throw new Error(`Env file ${options.envFile} was not found. Copy backend/.env.dev.example to backend/.env.dev and fill real local values.`);
  }
  loadDotenv({ path: options.envFile });

  const [{ env }, { prisma, disconnectPrisma }, { getRedisClient, disconnectRedis }] =
    await Promise.all([
      import("../src/config/env"),
      import("../src/prisma/client"),
      import("../src/config/redis")
    ]);
  const baseUrl = options.baseUrl || process.env.API_BASE_URL || `http://localhost:${env.PORT}${env.API_PREFIX}`;
  const password = getPassword();
  const accounts = options.email
    ? TEST_USER_ACCOUNTS.filter((account) => account.email === options.email)
    : TEST_USER_ACCOUNTS;

  if (!options.all && !options.email) {
    throw new Error("Pass --all or --email <email>.");
  }

  if (accounts.length === 0) {
    throw new Error(`No configured test account matches ${options.email}.`);
  }

  let hasFailure = false;

  try {
    printSection("Backend Health");
    const healthResponse = await fetch(joinUrl(baseUrl, "/health"));
    console.log(`${joinUrl(baseUrl, "/health")} -> ${healthResponse.status}`);
    if (!healthResponse.ok) {
      hasFailure = true;
    }

    printSection("MySQL / Prisma");
    await prisma.$queryRaw`SELECT 1`;
    console.log("Prisma connection ok");

    printSection("Redis");
    const redis = getRedisClient();
    if (!redis.isOpen) {
      await redis.connect();
    }
    console.log(`Redis ping -> ${await redis.ping()}`);

    printSection("Accounts");
    const results: CheckLine[] = [];
    for (const account of accounts) {
      const user = await prisma.user.findFirst({
        where: {
          email: account.email,
          deletedAt: null
        },
        include: {
          identities: {
            where: { deletedAt: null }
          },
          userRoles: {
            where: { deletedAt: null },
            include: {
              role: {
                include: {
                  rolePermissions: {
                    where: { deletedAt: null },
                    include: { permission: true }
                  }
                }
              }
            }
          }
        }
      });

      if (!user) {
        hasFailure = true;
        results.push({
          email: account.email,
          role: account.roleCode,
          loginOk: false,
          permissionsCount: 0,
          canEnterExpectedPortal: false,
          reason: "account missing; run seed"
        });
        continue;
      }

      const role = user.userRoles.find((item) => item.role.code === account.roleCode);
      const permissions = new Set(
        role?.role.rolePermissions
          .filter((item) => item.permission.deletedAt === null)
          .map((item) => item.permission.code) ?? []
      );
      const identityOk = user.identities.some(
        (identity) => identity.type === account.identityType && identity.isActive
      );
      const canEnterExpectedPortal = permissions.has(expectedPortalPermission(account));

      if (!user.isActive || !role || permissions.size === 0 || !identityOk || !canEnterExpectedPortal) {
        hasFailure = true;
      }

      try {
        const loginResponse = await fetch(joinUrl(baseUrl, "/auth/login"), {
          body: JSON.stringify({ email: account.email, password }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        });
        const loginPayload = (await loginResponse.json()) as {
          data?: { accessToken?: string; refreshToken?: string };
          message?: string;
        };

        if (!loginResponse.ok || !loginPayload.data?.accessToken) {
          hasFailure = true;
          results.push({
            email: account.email,
            role: account.roleCode,
            loginOk: false,
            permissionsCount: permissions.size,
            canEnterExpectedPortal,
            reason: loginPayload.message || `login HTTP ${loginResponse.status}`
          });
          continue;
        }

        const meResponse = await fetch(joinUrl(baseUrl, "/auth/me"), {
          headers: {
            Authorization: `Bearer ${loginPayload.data.accessToken}`
          }
        });
        const mePayload = (await meResponse.json()) as {
          data?: { permissions?: string[]; roles?: string[] };
          message?: string;
        };
        const mePermissionsCount = mePayload.data?.permissions?.length ?? 0;
        const meCanEnterExpectedPortal = Boolean(
          mePayload.data?.permissions?.includes(expectedPortalPermission(account))
        );

        if (!meResponse.ok || mePermissionsCount === 0 || !meCanEnterExpectedPortal) {
          hasFailure = true;
        }

        console.log(
          `${account.email}: access=${tokenPreview(loginPayload.data.accessToken)} refresh=${tokenPreview(loginPayload.data.refreshToken)}`
        );
        results.push({
          email: account.email,
          role: account.roleCode,
          loginOk: meResponse.ok,
          permissionsCount: mePermissionsCount,
          canEnterExpectedPortal: meCanEnterExpectedPortal,
          reason: meResponse.ok ? undefined : mePayload.message || `me HTTP ${meResponse.status}`
        });
      } catch (error) {
        hasFailure = true;
        results.push({
          email: account.email,
          role: account.roleCode,
          loginOk: false,
          permissionsCount: permissions.size,
          canEnterExpectedPortal,
          reason: error instanceof Error ? error.message : "unknown login error"
        });
      }
    }

    console.table(results);
  } finally {
    await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
