import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { IdentifierAllocator, PublicIdentifierAllocationUnavailableError } from "../services/public-identifier.service";
import { UserBootstrapKeyAllocator, UserBootstrapKeyAllocationExhaustedError } from "../services/user-bootstrap-key.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";

export interface OperationsMemberCreateData {
  username: string;
  email: string;
  passwordHash: string;
  reason: string;
  actorId: number;
  ip: string;
  userAgent?: string;
}
export interface OperationsMemberPayload {
  needoId: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}
export interface OperationsMemberRepositoryPort {
  createWithAudit(input: OperationsMemberCreateData): Promise<OperationsMemberPayload>;
}

export class OperationsMemberRepository implements OperationsMemberRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  private isEmailConstraint(meta: Prisma.PrismaClientKnownRequestError["meta"]): boolean {
    const adapter = meta?.driverAdapterError as { cause?: { constraint?: { index?: unknown; fields?: unknown } } } | undefined;
    const constraint = adapter?.cause?.constraint;
    return [meta?.target, constraint?.index, constraint?.fields]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .some((value) => /(^|_)email(_|$)/i.test(String(value ?? "")));
  }

  public async createWithAudit(input: OperationsMemberCreateData): Promise<OperationsMemberPayload> {
    try {
      return await new UserBootstrapKeyAllocator().withNewKey((bootstrapKey) =>
        this.client.$transaction(async (tx) => {
          const role = await tx.role.findFirst({ where: { code: "operator", deletedAt: null } });
          if (!role) throw new AppError({ code: ERROR_CODES.ROLE_NOT_FOUND, message: "error.role.not_found", statusCode: 404 });
          const user = await tx.user.create({ data: {
            needoId: bootstrapKey, username: input.username, email: input.email,
            passwordHash: input.passwordHash, isActive: true
          } });
          const identity = await tx.userIdentity.create({ data: {
            userId: user.id, type: "platform", scopeType: "global", scopeId: null,
            displayName: input.username, isActive: true, isDefault: true
          } });
          const identifier = await new IdentifierAllocator(new PublicIdentifierRepository(tx))
            .allocate({ kind: "NEEDO", userIdentityId: identity.id });
          await tx.userRole.create({ data: { userId: user.id, roleId: role.id, scopeType: "global", scopeId: null } });
          const result = await tx.user.update({ where: { id: user.id }, data: { needoId: identifier.publicId },
            select: { needoId: true, username: true, email: true, avatarUrl: true } });
          await tx.auditLog.create({ data: {
            actorId: input.actorId, action: "user.operations_member.create", targetType: "User", targetId: user.id,
            ip: input.ip, userAgent: input.userAgent,
            metadata: { needoId: identifier.publicId, role: "operator", reason: input.reason }
          } });
          return result;
        })
      );
    } catch (error) {
      if (error instanceof UserBootstrapKeyAllocationExhaustedError) throw new PublicIdentifierAllocationUnavailableError(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && this.isEmailConstraint(error.meta)) {
        throw new AppError({ code: ERROR_CODES.EMAIL_ALREADY_EXISTS, message: "error.user.email_already_exists", statusCode: 409 });
      }
      throw error;
    }
  }
}
