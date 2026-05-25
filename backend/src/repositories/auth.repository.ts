import type { Prisma, PrismaClient } from "@prisma/client";
import { TEST_LOGIN_EMAIL } from "../constants/test-login.constants";
import { prisma } from "../prisma/client";

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

export interface AuthUserRecord {
  id: number;
  email: string;
  phone: string | null;
  passwordHash: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  identities: AuthIdentityRecord[];
  userRoles: AuthUserRoleRecord[];
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

export interface AuthRepositoryPort {
  findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  findUserById: (id: number) => Promise<AuthUserRecord | null>;
  findTestLoginUserByPortal?: (portal: TestLoginPortal) => Promise<AuthUserRecord | null>;
  updateLastLoginAt: (id: number, loggedInAt: Date) => Promise<void>;
  createLoginLog: (input: CreateLoginLogInput) => Promise<void>;
  createAuditLog: (input: CreateAuditLogInput) => Promise<void>;
}

export type TestLoginPortal = "user" | "merchant" | "technician" | "business" | "admin";

const authUserInclude = {
  identities: {
    where: {
      deletedAt: null
    },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
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
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.client.user.findFirst({
      where: {
        email,
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

  public async findTestLoginUserByPortal(portal: TestLoginPortal): Promise<AuthUserRecord | null> {
    const roleCodesByPortal: Record<TestLoginPortal, string[]> = {
      admin: ["admin"],
      business: ["merchant_owner", "broker", "scout"],
      merchant: ["merchant_owner", "merchant_staff"],
      technician: ["technician"],
      user: ["customer"]
    };

    return this.client.user.findFirst({
      where: {
        email: TEST_LOGIN_EMAIL,
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: {
            deletedAt: null,
            role: {
              code: { in: roleCodesByPortal[portal] },
              deletedAt: null
            }
          }
        }
      },
      include: authUserInclude,
      orderBy: [{ id: "asc" }]
    });
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
