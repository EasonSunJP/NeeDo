import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";

import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_USERNAME = "NeeDo Super Admin";
const SEED_PRISMA_LOG_LEVELS: Prisma.LogLevel[] = ["error"];

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required before running the User Management seed.");
  }

  return databaseUrl;
};

export interface AdminSeedConfig {
  email: string;
  username: string;
  password: string;
}

export const getAdminSeedConfig = (env: NodeJS.ProcessEnv = process.env): AdminSeedConfig => {
  const password = env.ADMIN_DEFAULT_PASSWORD;

  if (!password || password.trim().length === 0) {
    throw new Error("ADMIN_DEFAULT_PASSWORD is required before running the User Management seed.");
  }

  return {
    email: env.ADMIN_DEFAULT_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL,
    username: env.ADMIN_DEFAULT_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME,
    password
  };
};

const createSeedPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaMariaDb(getDatabaseUrl()),
    log: SEED_PRISMA_LOG_LEVELS
  });

export const seedUserManagement = async (
  prisma: PrismaClient = createSeedPrismaClient()
): Promise<void> => {
  const adminConfig = getAdminSeedConfig();
  const adminPasswordHash = await hash(adminConfig.password, BCRYPT_ROUNDS);
  const rolePermissionAssignments = buildRolePermissionAssignments();

  await prisma.$transaction(async (tx) => {
    for (const role of SYSTEM_ROLES) {
      await tx.role.upsert({
        where: { code: role.code },
        create: {
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem
        },
        update: {
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          deletedAt: null
        }
      });
    }

    for (const permission of SYSTEM_PERMISSIONS) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: {
          code: permission.code,
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem
        },
        update: {
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem,
          deletedAt: null
        }
      });
    }

    const roles = await tx.role.findMany({
      where: {
        code: { in: SYSTEM_ROLES.map((role) => role.code) },
        deletedAt: null
      }
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: SYSTEM_PERMISSIONS.map((permission) => permission.code) },
        deletedAt: null
      }
    });
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByCode = new Map(
      permissions.map((permission) => [permission.code, permission])
    );

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissionAssignments)) {
      const role = roleByCode.get(roleCode);
      if (!role) {
        throw new Error(`Role seed failed: missing role ${roleCode}.`);
      }

      for (const permissionCode of permissionCodes) {
        const permission = permissionByCode.get(permissionCode);
        if (!permission) {
          throw new Error(`Permission seed failed: missing permission ${permissionCode}.`);
        }

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id
            }
          },
          create: {
            roleId: role.id,
            permissionId: permission.id
          },
          update: {
            deletedAt: null
          }
        });
      }
    }

    const adminUser = await tx.user.upsert({
      where: { email: adminConfig.email },
      create: {
        email: adminConfig.email,
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true
      },
      update: {
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true,
        deletedAt: null
      }
    });

    const adminIdentity = await tx.userIdentity.findFirst({
      where: {
        userId: adminUser.id,
        type: "platform",
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminIdentity) {
      await tx.userIdentity.update({
        where: { id: adminIdentity.id },
        data: {
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId: adminUser.id,
          type: "platform",
          scopeType: "global",
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true
        }
      });
    }

    const adminRole = roleByCode.get("admin");
    if (!adminRole) {
      throw new Error("Admin user seed failed: missing admin role.");
    }

    const adminUserRole = await tx.userRole.findFirst({
      where: {
        userId: adminUser.id,
        roleId: adminRole.id,
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminUserRole) {
      await tx.userRole.update({
        where: { id: adminUserRole.id },
        data: { deletedAt: null }
      });
    } else {
      await tx.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          scopeType: "global"
        }
      });
    }
  });
};

const runSeed = async (): Promise<void> => {
  const prisma = createSeedPrismaClient();

  try {
    await seedUserManagement(prisma);
    console.log("User Management seed completed.");
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
