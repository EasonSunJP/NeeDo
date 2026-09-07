import { randomBytes, randomInt } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  buildRolePermissionAssignments
} from "../constants/permissions.constants";
import { isReservedVanityNumber } from "../services/public-identifier.service";
import type {
  StagingAdminBootstrapRepositoryPort,
  StagingAdminBootstrapResult,
  StagingAdminBootstrapWriteInput
} from "./staging-admin-bootstrap";

const BOOTSTRAP_ACTION = "staging.admin.bootstrap";
const BOOTSTRAP_LOCK = "needo:staging:admin-bootstrap";
const MAX_IDENTIFIER_ATTEMPTS = 8;

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const readFingerprint = (metadata: Prisma.JsonValue | null): string | null => {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  const value = metadata.credentialFingerprint;
  return typeof value === "string" ? value : null;
};

const assertExactDefinitions = <
  A extends { code: string },
  E extends { code: string }
>(
  actual: readonly A[],
  expected: readonly E[],
  label: string
): void => {
  const actualByCode = new Map(actual.map((item) => [item.code, item]));
  for (const expectedItem of expected) {
    const actualItem = actualByCode.get(expectedItem.code);
    if (!actualItem) throw new Error(`STAGING_ADMIN_BOOTSTRAP_${label}_MISSING`);
    for (const [key, value] of Object.entries(expectedItem)) {
      if ((actualItem as Record<string, unknown>)[key] !== value) {
        throw new Error(`STAGING_ADMIN_BOOTSTRAP_${label}_CONFLICT`);
      }
    }
  }
};

export const assertAdminPermissionCoverage = (
  actualCodes: readonly string[],
  requiredCodes: readonly string[]
): void => {
  const actual = new Set(actualCodes);
  if (requiredCodes.some((code) => !actual.has(code))) {
    throw new Error("STAGING_ADMIN_BOOTSTRAP_ADMIN_PERMISSION_CONFLICT");
  }
};

export class StagingAdminBootstrapRepository implements StagingAdminBootstrapRepositoryPort {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrap(
    input: StagingAdminBootstrapWriteInput
  ): Promise<StagingAdminBootstrapResult> {
    return this.prisma.$transaction(async (tx) => {
      const lockRows = await tx.$queryRaw<Array<{ acquired: bigint | number }>>`
        SELECT GET_LOCK(${BOOTSTRAP_LOCK}, 30) AS acquired
      `;
      if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
        throw new Error("STAGING_ADMIN_BOOTSTRAP_LOCK_UNAVAILABLE");
      }

      try {
        return await this.bootstrapLocked(tx, input);
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${BOOTSTRAP_LOCK})`;
      }
    }, { timeout: 120_000 });
  }

  private async bootstrapLocked(
    tx: Prisma.TransactionClient,
    input: StagingAdminBootstrapWriteInput
  ): Promise<StagingAdminBootstrapResult> {
    const adminRole = await this.ensureRbacFoundation(tx);
    const activeAdministrators = await tx.userRole.findMany({
      where: {
        roleId: adminRole.id,
        scopeType: "global",
        scopeId: null,
        deletedAt: null,
        user: { deletedAt: null, email: input.email }
      },
      include: {
        user: {
          include: {
            identities: { where: { deletedAt: null } },
            auditLogs: {
              where: { action: BOOTSTRAP_ACTION, deletedAt: null },
              orderBy: { id: "desc" },
              take: 1
            }
          }
        }
      }
    });

    if (activeAdministrators.length > 0) {
      if (activeAdministrators.length !== 1) {
        throw new Error("STAGING_ADMIN_BOOTSTRAP_ADMIN_CONFLICT");
      }
      const administrator = activeAdministrators[0].user;
      const platformIdentities = administrator.identities.filter(
        (identity) =>
          identity.type === "platform" &&
          identity.scopeType === "global" &&
          identity.scopeId === null &&
          identity.isActive
      );
      const exactExisting =
        administrator.email === input.email &&
        administrator.username === input.username &&
        administrator.isActive &&
        platformIdentities.length === 1 &&
        readFingerprint(administrator.auditLogs[0]?.metadata ?? null) ===
          input.credentialFingerprint;

      if (!exactExisting) {
        throw new Error("STAGING_ADMIN_BOOTSTRAP_CREDENTIAL_CONFLICT");
      }

      return this.readPostcondition(tx, administrator.id, "already-complete");
    }

    const conflictingUser = await tx.user.findFirst({
      where: { email: input.email },
      select: { id: true }
    });
    if (conflictingUser) throw new Error("STAGING_ADMIN_BOOTSTRAP_USER_CONFLICT");

    const administrator = await this.createAdministrator(tx, input);
    await tx.userRole.create({
      data: {
        userId: administrator.id,
        roleId: adminRole.id,
        scopeType: "global"
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: administrator.id,
        action: BOOTSTRAP_ACTION,
        targetType: "User",
        targetId: administrator.id,
        metadata: {
          namespace: "needo_staging_v1",
          credentialFingerprint: input.credentialFingerprint,
          identityType: "platform",
          roleCode: "admin",
          scopeType: "global"
        }
      }
    });

    return this.readPostcondition(tx, administrator.id, "created");
  }

  private async ensureRbacFoundation(tx: Prisma.TransactionClient) {
    for (const role of SYSTEM_ROLES) {
      await tx.role.upsert({
        where: { code: role.code },
        create: role,
        update: { ...role, deletedAt: null }
      });
    }
    for (const permission of SYSTEM_PERMISSIONS) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: { ...permission, deletedAt: null }
      });
    }

    const roles = await tx.role.findMany({
      where: { code: { in: SYSTEM_ROLES.map(({ code }) => code) }, deletedAt: null }
    });
    const permissions = await tx.permission.findMany({
      where: { code: { in: SYSTEM_PERMISSIONS.map(({ code }) => code) }, deletedAt: null }
    });
    assertExactDefinitions(roles, SYSTEM_ROLES, "ROLE");
    assertExactDefinitions(permissions, SYSTEM_PERMISSIONS, "PERMISSION");

    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
    const assignments = buildRolePermissionAssignments();
    const relationRows = Object.entries(assignments).flatMap(([roleCode, permissionCodes]) => {
      const role = roleByCode.get(roleCode);
      if (!role) throw new Error("STAGING_ADMIN_BOOTSTRAP_ROLE_MISSING");
      return permissionCodes.map((permissionCode) => {
        const permission = permissionByCode.get(permissionCode);
        if (!permission) throw new Error("STAGING_ADMIN_BOOTSTRAP_PERMISSION_MISSING");
        return { roleId: role.id, permissionId: permission.id };
      });
    });
    await tx.rolePermission.createMany({ data: relationRows, skipDuplicates: true });

    const adminRole = roleByCode.get("admin");
    if (!adminRole) throw new Error("STAGING_ADMIN_BOOTSTRAP_ADMIN_ROLE_MISSING");
    const adminPermissions = await tx.rolePermission.findMany({
      where: { roleId: adminRole.id, deletedAt: null },
      select: { permission: { select: { code: true } } }
    });
    assertAdminPermissionCoverage(
      adminPermissions.map(({ permission }) => permission.code),
      SYSTEM_PERMISSIONS.map(({ code }) => code)
    );
    return adminRole;
  }

  private async createAdministrator(
    tx: Prisma.TransactionClient,
    input: StagingAdminBootstrapWriteInput
  ) {
    let user: Awaited<ReturnType<typeof tx.user.create>> | undefined;
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
      try {
        user = await tx.user.create({
          data: {
            needoId: `pending:${randomBytes(12).toString("hex")}`,
            email: input.email,
            emailVerifiedAt: new Date(),
            passwordHash: input.passwordHash,
            username: input.username,
            isTestAccount: false,
            isActive: true
          }
        });
        break;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    if (!user) throw new Error("STAGING_ADMIN_BOOTSTRAP_USER_ID_EXHAUSTED");

    const identity = await tx.userIdentity.create({
      data: {
        userId: user.id,
        type: "platform",
        scopeType: "global",
        scopeId: null,
        displayName: input.username,
        isDefault: true,
        isActive: true
      }
    });
    const identifier = await this.allocateIdentifier(tx, identity.id);
    return tx.user.update({
      where: { id: user.id },
      data: {
        needoId: identifier.publicId,
        accountNo: identifier.numberPart,
        primaryIdentityType: "NEEDO"
      }
    });
  }

  private async allocateIdentifier(tx: Prisma.TransactionClient, userIdentityId: number) {
    for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
      const numberPart = randomInt(0, 10_000_000_000).toString().padStart(10, "0");
      if (isReservedVanityNumber(numberPart)) continue;
      const reservation = await tx.vanityNumberReservation.findFirst({
        where: { numberPart, status: "sealed", deletedAt: null },
        select: { id: true }
      });
      if (reservation) continue;
      try {
        return await tx.publicIdentifier.create({
          data: {
            publicId: `needo${numberPart}`,
            numberPart,
            kind: "NEEDO",
            userIdentityId,
            loginAllowed: true,
            searchable: true
          }
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    throw new Error("STAGING_ADMIN_BOOTSTRAP_PUBLIC_ID_EXHAUSTED");
  }

  private async readPostcondition(
    tx: Prisma.TransactionClient,
    userId: number,
    status: StagingAdminBootstrapResult["status"]
  ): Promise<StagingAdminBootstrapResult> {
    const adminRole = await tx.role.findUniqueOrThrow({ where: { code: "admin" } });
    const [administratorCount, platformIdentityCount, customerCount, walletCount, ledgerCount, shopCount, technicianCount] =
      await Promise.all([
        tx.userRole.count({
          where: {
            roleId: adminRole.id,
            scopeType: "global",
            scopeId: null,
            deletedAt: null,
            user: { id: userId, deletedAt: null }
          }
        }),
        tx.userIdentity.count({
          where: {
            userId,
            type: "platform",
            scopeType: "global",
            scopeId: null,
            isActive: true,
            deletedAt: null
          }
        }),
        tx.customerProfile.count({ where: { userId } }),
        tx.wallet.count({ where: { ownerType: "USER", ownerId: userId } }),
        tx.walletLedger.count({ where: { wallet: { ownerType: "USER", ownerId: userId } } }),
        tx.shop.count({ where: { ownerUserId: userId } }),
        tx.technicianProfile.count({ where: { userId } })
      ]);

    return {
      status,
      administratorCount,
      platformIdentityCount,
      forbiddenBusinessRowCount:
        customerCount + walletCount + ledgerCount + shopCount + technicianCount
    };
  }
}
