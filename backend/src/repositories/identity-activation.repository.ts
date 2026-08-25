import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import {
  type ActivatedIdentityRecord,
  type ActivateIdentityTransactionInput,
  type IdentityActivationRepositoryPort
} from "../services/identity-activation.service";
import { AppError } from "../utils/app-error";

const roleCodeByIdentityType: Readonly<Record<string, string>> = {
  technician: "technician",
  merchant_owner: "merchant_owner",
  scout: "scout"
};

export class IdentityActivationRepository implements IdentityActivationRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findActiveIdentity(
    userId: number,
    identityType: string
  ): Promise<ActivatedIdentityRecord | null> {
    const row = await this.client.userIdentity.findFirst({
      where: { userId, type: identityType, isActive: true, deletedAt: null }
    });

    if (!row) {
      return null;
    }

    return {
      identityId: row.id,
      userId: row.userId,
      identityType: row.type,
      roleCode: roleCodeByIdentityType[row.type] ?? row.type,
      scopeType: row.scopeType ?? "global",
      scopeId: row.scopeId
    };
  }

  public async activateInTransaction(
    input: ActivateIdentityTransactionInput
  ): Promise<ActivatedIdentityRecord> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const role = await transaction.role.findFirst({
          where: { code: input.roleCode, deletedAt: null },
          select: { id: true, code: true }
        });
        if (!role) {
          throw new AppError({
            code: ERROR_CODES.ROLE_NOT_FOUND,
            message: "error.role_not_found",
            statusCode: 404
          });
        }

        const identity = await transaction.userIdentity.create({
          data: {
            userId: input.userId,
            type: input.identityType,
            activeKey: input.idempotencyKey,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            displayName: input.displayName,
            isDefault: false,
            isActive: true,
            createdAt: input.activatedAt
          }
        });

        const existingRole = await transaction.userRole.findFirst({
          where: {
            userId: input.userId,
            roleId: role.id,
            scopeType: input.scopeType,
            scopeId: input.scopeId
          },
          select: { id: true, deletedAt: true }
        });
        if (!existingRole) {
          await transaction.userRole.create({
            data: {
              userId: input.userId,
              roleId: role.id,
              scopeType: input.scopeType,
              scopeId: input.scopeId
            }
          });
        } else if (existingRole.deletedAt !== null) {
          await transaction.userRole.update({
            where: { id: existingRole.id },
            data: { deletedAt: null }
          });
        }

        await transaction.notification.create({
          data: {
            recipientUserId: input.userId,
            actorUserId: input.actorUserId,
            type: "SYSTEM",
            title: "identity.activation.approved.title",
            body: "identity.activation.approved.body",
            payload: input.notificationPayload as Prisma.InputJsonValue,
            createdAt: input.activatedAt
          }
        });

        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "identity.activation.completed",
            targetType: "UserIdentity",
            targetId: identity.id,
            ip: null,
            userAgent: null,
            metadata: input.auditMetadata as Prisma.InputJsonValue,
            createdAt: input.activatedAt
          }
        });

        return {
          identityId: identity.id,
          userId: identity.userId,
          identityType: identity.type,
          roleCode: role.code,
          scopeType: identity.scopeType ?? input.scopeType,
          scopeId: identity.scopeId
        };
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        const existing = await this.findActiveIdentity(input.userId, input.identityType);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
