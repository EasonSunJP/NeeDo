import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { VerifiedGoogleIdentity } from "../services/google-credential-verifier.service";
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
  needoId: string;
  email: string;
  emailVerifiedAt?: Date | null;
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

export interface CreateVerifiedBaselineCustomerInput {
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date;
  context: {
    ip: string;
    userAgent?: string | null;
  };
  googleIdentity?: VerifiedGoogleIdentity;
}

export interface GoogleBindingRecord {
  id: number;
  userId: number;
  provider: string;
  providerSubject: string;
  providerEmail: string;
  providerEmailVerifiedAt: Date;
  lastUsedAt: Date | null;
  deletedAt: Date | null;
  user: AuthUserRecord;
}

export interface CreateOrRestoreGoogleBindingInput {
  userId: number;
  googleIdentity: VerifiedGoogleIdentity;
}

export interface GoogleBindingStatus {
  linked: boolean;
  bindingId: number | null;
}

export class ExternalAuthAccountConflictError extends Error {
  public constructor() {
    super("Google identity is already linked to a different NeeDo account");
    this.name = "ExternalAuthAccountConflictError";
  }
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

export interface GoogleAuthRepositoryPort {
  findGoogleBindingBySubject: (providerSubject: string) => Promise<GoogleBindingRecord | null>;
  createVerifiedBaselineCustomer: (
    input: CreateVerifiedBaselineCustomerInput
  ) => Promise<AuthUserRecord>;
  createOrRestoreGoogleBinding: (
    input: CreateOrRestoreGoogleBindingInput
  ) => Promise<GoogleBindingRecord>;
  getGoogleBindingStatus: (userId: number) => Promise<GoogleBindingStatus>;
  updatePasswordHash: (userId: number, passwordHash: string) => Promise<boolean>;
  softUnlinkGoogleBinding: (userId: number) => Promise<boolean>;
  updateGoogleBindingLastUsedAt: (providerSubject: string, lastUsedAt: Date) => Promise<boolean>;
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

export class AuthRepository implements AuthRepositoryPort, GoogleAuthRepositoryPort {
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
        OR: [{ email: identifier }, { needoId: identifier }],
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

  public async findGoogleBindingBySubject(
    providerSubject: string
  ): Promise<GoogleBindingRecord | null> {
    return this.client.externalAuthAccount.findFirst({
      where: {
        provider: "google",
        providerSubject,
        deletedAt: null,
        user: { deletedAt: null }
      },
      include: {
        user: { include: authUserInclude }
      }
    });
  }

  public createVerifiedBaselineCustomer(
    input: CreateVerifiedBaselineCustomerInput
  ): Promise<AuthUserRecord> {
    const email = input.email.trim().toLowerCase();

    return this.needoIdAllocator.withNewId((needoId) =>
      this.client.$transaction(async (transaction) => {
        const customerRole = await transaction.role.findFirst({
          where: { code: "customer", deletedAt: null },
          select: { id: true }
        });
        if (!customerRole) throw new Error("Registration role is missing: customer");

        const user = await transaction.user.create({
          data: {
            needoId,
            email,
            emailVerifiedAt: input.emailVerifiedAt,
            passwordHash: input.passwordHash,
            username: needoId,
            isActive: true
          }
        });
        const customerProfile = await transaction.customerProfile.create({
          data: { userId: user.id, displayName: needoId }
        });
        await transaction.userIdentity.create({
          data: {
            userId: user.id,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: customerProfile.id,
            displayName: needoId,
            isDefault: true,
            isActive: true
          }
        });
        await transaction.userRole.create({
          data: {
            userId: user.id,
            roleId: customerRole.id,
            scopeType: "customer_profile",
            scopeId: customerProfile.id
          }
        });
        if (input.googleIdentity) {
          await this.createOrRestoreGoogleBindingInTransaction(transaction, {
            userId: user.id,
            googleIdentity: input.googleIdentity
          });
        }
        await transaction.auditLog.create({
          data: {
            action: "auth.register",
            targetType: "User",
            targetId: user.id,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: { accountType: "customer", verified: true }
          }
        });

        const registered = await transaction.user.findUniqueOrThrow({
          where: { id: user.id },
          include: authUserInclude
        });
        return registered;
      })
    );
  }

  public createOrRestoreGoogleBinding(
    input: CreateOrRestoreGoogleBindingInput
  ): Promise<GoogleBindingRecord> {
    return this.client.$transaction((transaction) =>
      this.createOrRestoreGoogleBindingInTransaction(transaction, input)
    );
  }

  public async getGoogleBindingStatus(userId: number): Promise<GoogleBindingStatus> {
    const binding = await this.client.externalAuthAccount.findFirst({
      where: {
        userId,
        provider: "google",
        deletedAt: null,
        user: { deletedAt: null }
      },
      select: { id: true }
    });

    return { linked: Boolean(binding), bindingId: binding?.id ?? null };
  }

  public async updatePasswordHash(userId: number, passwordHash: string): Promise<boolean> {
    const result = await this.client.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { passwordHash }
    });
    return result.count === 1;
  }

  public async softUnlinkGoogleBinding(userId: number): Promise<boolean> {
    const result = await this.client.externalAuthAccount.updateMany({
      where: { userId, provider: "google", deletedAt: null, user: { deletedAt: null } },
      data: { deletedAt: new Date() }
    });
    return result.count === 1;
  }

  public async updateGoogleBindingLastUsedAt(
    providerSubject: string,
    lastUsedAt: Date
  ): Promise<boolean> {
    const result = await this.client.externalAuthAccount.updateMany({
      where: {
        provider: "google",
        providerSubject,
        deletedAt: null,
        user: { deletedAt: null }
      },
      data: { lastUsedAt }
    });
    return result.count === 1;
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

  private async createOrRestoreGoogleBindingInTransaction(
    transaction: Prisma.TransactionClient,
    input: CreateOrRestoreGoogleBindingInput
  ): Promise<GoogleBindingRecord> {
    const user = await transaction.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      include: authUserInclude
    });
    if (!user) throw new Error("Cannot bind Google identity to a deleted NeeDo account");

    const providerSubject = input.googleIdentity.subject.trim();
    const providerEmail = input.googleIdentity.email.trim().toLowerCase();
    const existing = await transaction.externalAuthAccount.findFirst({
      where: { provider: "google", providerSubject }
    });

    if (existing && !existing.deletedAt && existing.userId !== user.id) {
      throw new ExternalAuthAccountConflictError();
    }

    const binding = existing
      ? await transaction.externalAuthAccount.update({
          where: { id: existing.id },
          data: {
            userId: user.id,
            providerEmail,
            providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
            lastUsedAt: new Date(),
            deletedAt: null
          }
        })
      : await transaction.externalAuthAccount.create({
          data: {
            userId: user.id,
            provider: "google",
            providerSubject,
            providerEmail,
            providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
            lastUsedAt: new Date()
          }
        });

    return { ...binding, provider: "google", user };
  }
}
