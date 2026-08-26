import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { NeedoIdAllocator } from "../services/needo-id.service";

export interface AuthIdentityRecord {
  id: number;
  userId: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
  isDefault: boolean;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface AuthPermissionRecord {
  code: string;
  type: string;
  deletedAt: Date | null;
}

export interface AuthRolePermissionRecord {
  deletedAt: Date | null;
  permission: AuthPermissionRecord;
}

export interface AuthRoleRecord {
  code: string;
  deletedAt: Date | null;
  rolePermissions: AuthRolePermissionRecord[];
}

export interface AuthUserRoleRecord {
  deletedAt: Date | null;
  role: AuthRoleRecord;
}

export interface AuthIdentityApplicationRecord {
  id: number;
  type: string;
  status: string;
  rejectionReason: string | null;
  version: number;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface AuthUserRecord {
  id: number;
  email: string;
  phone: string | null;
  passwordHash: string | null;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  identities: AuthIdentityRecord[];
  userRoles: AuthUserRoleRecord[];
  identityApplications?: AuthIdentityApplicationRecord[];
}

export interface CreateLoginLogInput {
  userId?: number | null;
  email: string;
  ip: string;
  userAgent?: string | null;
  status: "success" | "failed" | "locked";
  failReason?: string | null;
}

export interface CreateAuditLogInput {
  actorId?: number | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export type PublicRegistrationAccountType = "customer" | "technician";

interface RegisterUserBaseData {
  email: string;
  ip: string;
  passwordHash: string;
  userAgent?: string | null;
  username: string;
}

export type RegisterUserData =
  | (RegisterUserBaseData & { accountType: "customer" })
  | (RegisterUserBaseData & { accountType: "technician"; city: string });

export interface RegisteredAccountRecord {
  id: number;
  email: string;
  username: string;
  accountType: PublicRegistrationAccountType;
  approvalStatus: "approved" | "pending_review";
  isActive: boolean;
}

export interface AuthRepositoryPort {
  findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  findUserByLoginIdentifier: (identifier: string) => Promise<AuthUserRecord | null>;
  findUserById: (id: number) => Promise<AuthUserRecord | null>;
  registerUser: (input: RegisterUserData) => Promise<RegisteredAccountRecord>;
  updateLastLoginAt: (id: number, loggedInAt: Date) => Promise<void>;
  createLoginLog: (input: CreateLoginLogInput) => Promise<void>;
  createAuditLog: (input: CreateAuditLogInput) => Promise<void>;
}

const authUserInclude = {
  identities: {
    where: {
      deletedAt: null
    },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
  },
  identityApplications: {
    where: {
      status: { in: ["draft", "submitted", "under_review", "rejected"] },
      deletedAt: null
    },
    orderBy: [{ updatedAt: "desc" as const }, { id: "desc" as const }],
    select: {
      id: true,
      type: true,
      status: true,
      rejectionReason: true,
      version: true,
      updatedAt: true,
      deletedAt: true
    }
  },
  userRoles: {
    where: {
      deletedAt: null
    },
    include: {
      role: {
        include: {
          rolePermissions: {
            where: {
              deletedAt: null
            },
            include: {
              permission: true
            }
          }
        }
      }
    }
  }
};

export class AuthRepository implements AuthRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly needoIdAllocator = new NeedoIdAllocator()
  ) {}

  public async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.client.user.findFirst({
      where: {
        email,
        deletedAt: null
      },
      include: authUserInclude
    });
  }

  public async findUserByLoginIdentifier(identifier: string): Promise<AuthUserRecord | null> {
    return this.client.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
        deletedAt: null
      },
      include: authUserInclude
    });
  }

  public async findUserById(id: number): Promise<AuthUserRecord | null> {
    return this.client.user.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: authUserInclude
    });
  }

  public registerUser(input: RegisterUserData): Promise<RegisteredAccountRecord> {
    return this.needoIdAllocator.withNewId((needoId) => this.client.$transaction(async (transaction) => {
      const role = await transaction.role.findFirst({
        where: {
          code: input.accountType,
          deletedAt: null
        }
      });

      if (!role) {
        throw new Error(`Registration role is missing: ${input.accountType}`);
      }

      const isCustomer = input.accountType === "customer";
      const user = await transaction.user.create({
        data: {
          needoId,
          email: input.email,
          passwordHash: input.passwordHash,
          username: needoId,
          isActive: isCustomer
        }
      });
      const profile = isCustomer
        ? await transaction.customerProfile.create({
            data: {
              userId: user.id,
              displayName: needoId
            }
          })
        : await transaction.technicianProfile.create({
            data: {
              userId: user.id,
              displayName: needoId,
              city: input.city,
              status: "pending_review"
            }
          });
      const scopeType = isCustomer ? "customer_profile" : "technician_profile";

      await transaction.userIdentity.create({
        data: {
          userId: user.id,
          type: input.accountType,
            scopeType,
            scopeId: profile.id,
            displayName: needoId,
          isDefault: true,
          isActive: isCustomer
        }
      });
      await transaction.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          scopeType,
          scopeId: profile.id
        }
      });
      await transaction.auditLog.create({
        data: {
          action: "auth.register",
          targetType: "User",
          targetId: user.id,
          ip: input.ip,
          userAgent: input.userAgent ?? null,
          metadata: {
            accountType: input.accountType,
            approvalStatus: isCustomer ? "approved" : "pending_review"
          }
        }
      });

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        accountType: input.accountType,
        approvalStatus: isCustomer ? "approved" : "pending_review",
        isActive: user.isActive
      };
    }));
  }

  public async updateLastLoginAt(id: number, loggedInAt: Date): Promise<void> {
    await this.client.user.update({
      where: { id },
      data: { lastLoginAt: loggedInAt }
    });
  }

  public async createLoginLog(input: CreateLoginLogInput): Promise<void> {
    await this.client.loginLog.create({
      data: {
        userId: input.userId ?? null,
        email: input.email,
        ip: input.ip,
        userAgent: input.userAgent ?? null,
        status: input.status,
        failReason: input.failReason ?? null
      }
    });
  }

  public async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata
      }
    });
  }
}
