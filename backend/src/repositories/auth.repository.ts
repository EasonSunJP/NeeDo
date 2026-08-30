import { Prisma, type PrismaClient } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { prisma } from "../prisma/client";
import { UserBootstrapKeyAllocator } from "../services/user-bootstrap-key.service";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";

export const createGoogleUnlinkRecoveryProof = (jti: string): string =>
  createHmac("sha256", env.AUTH_VERIFICATION_SECRET)
    .update("google-unlink-recovery\u0000")
    .update(jti)
    .digest("base64url");

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
  publicIdentifier?: {
    publicId: string;
    kind: string;
    loginAllowed: boolean;
    status: string;
    deletedAt: Date | null;
  } | null;
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
  isTestAccount: boolean;
  sessionGeneration?: number;
  accessState: AuthAccountAccessState;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  identities: AuthIdentityRecord[];
  userRoles: AuthUserRoleRecord[];
  identityApplications?: AuthIdentityApplicationRecord[];
  loginIdentityId?: number;
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

export interface CreateVerifiedBaselineCustomerInput {
  email: string;
  passwordHash: string | null;
  emailVerifiedAt: Date;
  registrationChallengeId?: string;
  context: {
    ip: string;
    userAgent?: string | null;
  };
  googleIdentity?: GoogleAuthPersistenceInput;
}

export interface GoogleAuthPersistenceInput {
  subject: string;
  email: string;
  emailVerifiedAt: Date;
}

export interface AuthAccountAccessState {
  disabled: boolean;
  restricted: boolean;
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
  googleIdentity: GoogleAuthPersistenceInput;
}

export interface CompleteGoogleFirstUseLinkInput {
  challengeId: string;
  googleIdentity: GoogleAuthPersistenceInput;
  context: { ip: string; userAgent?: string | null };
}
export interface CompleteSuccessfulGoogleLoginInput {
  providerSubject: string;
  expectedUserId: number;
  expectedIdentityId: number;
  loggedInAt: Date;
  context: { ip: string; userAgent?: string | null };
}
export class GoogleLoginStateError extends Error {
  public constructor(public readonly reason: "missing" | "disabled" | "restricted" | "conflict") {
    super("Google login state is no longer eligible");
    this.name = "GoogleLoginStateError";
  }
}

export interface GoogleBindingStatus {
  linked: boolean;
  bindingId: number | null;
  providerEmail: string | null;
}

export interface CompleteAuthenticatedGoogleLinkInput {
  challengeId: string;
  userId: number;
  googleIdentity: GoogleAuthPersistenceInput;
  context: { ip: string; userAgent?: string | null };
}

export interface CompletePasswordSetupInput {
  challengeId: string;
  userId: number;
  passwordHash: string;
  context: { ip: string; userAgent?: string | null };
}

export interface CompleteGoogleUnlinkInput {
  challengeId: string;
  userId: number;
  recoveryProof: string;
  context: { ip: string; userAgent?: string | null };
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
  createVerifiedBaselineCustomer: (
    input: CreateVerifiedBaselineCustomerInput
  ) => Promise<AuthUserRecord>;
  findVerifiedRegistrationByChallenge: (
    registrationChallengeId: string,
    email: string
  ) => Promise<AuthUserRecord | null>;
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
  completeAuthenticatedGoogleLink: (
    input: CompleteAuthenticatedGoogleLinkInput
  ) => Promise<AuthUserRecord>;
  completePasswordSetup: (input: CompletePasswordSetupInput) => Promise<AuthUserRecord>;
  completeGoogleUnlink: (input: CompleteGoogleUnlinkInput) => Promise<AuthUserRecord>;
  hasGoogleUnlinkCompletion: (input: {
    challengeId: string;
    userId: number;
    recoveryProof: string;
  }) => Promise<boolean>;
  updatePasswordHash: (userId: number, passwordHash: string) => Promise<boolean>;
  softUnlinkGoogleBinding: (userId: number) => Promise<boolean>;
  updateGoogleBindingLastUsedAt: (providerSubject: string, lastUsedAt: Date) => Promise<boolean>;
  completeGoogleFirstUseLink: (input: CompleteGoogleFirstUseLinkInput) => Promise<AuthUserRecord>;
  completeSuccessfulGoogleLogin: (
    input: CompleteSuccessfulGoogleLoginInput
  ) => Promise<AuthUserRecord>;
}

const authUserInclude = {
  identities: {
    where: {
      deletedAt: null
    },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }],
    include: { publicIdentifier: true }
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

type AuthUserPrismaRecord = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

const activeAuthIdentities = (user: AuthUserPrismaRecord) =>
  user.identities.filter((identity) => identity.deletedAt === null && identity.isActive);

const resolveLoginIdentityId = (
  user: AuthUserPrismaRecord,
  loginIdentifier?: string
): number | undefined => {
  const identities = activeAuthIdentities(user);
  const customerIdentity = identities.find((identity) =>
    ["customer", "user", "u"].includes(identity.type)
  );
  const matchedIdentifierIdentity = loginIdentifier
    ? identities.find(
        (identity) =>
          identity.publicIdentifier?.publicId === loginIdentifier &&
          identity.publicIdentifier.loginAllowed &&
          identity.publicIdentifier.status === "ACTIVE" &&
          identity.publicIdentifier.deletedAt === null
      )
    : undefined;

  if (matchedIdentifierIdentity?.publicIdentifier?.kind === "NEEDO") {
    return customerIdentity?.id ?? matchedIdentifierIdentity.id;
  }
  return matchedIdentifierIdentity?.id ?? customerIdentity?.id;
};

const toAuthUserRecord = (
  user: AuthUserPrismaRecord,
  loginIdentifier?: string
): AuthUserRecord => {
  const primaryIdentifier = activeAuthIdentities(user).find(
    (identity) => identity.publicIdentifier?.kind === user.primaryIdentityType
  )?.publicIdentifier;

  return {
    ...user,
    needoId: primaryIdentifier?.publicId ?? user.needoId,
    accessState: {
      disabled: !user.isActive,
      restricted: activeAuthIdentities(user).length === 0
    },
    ...(loginIdentifier
      ? { loginIdentityId: resolveLoginIdentityId(user, loginIdentifier) }
      : {})
  };
};

export class AuthRepository implements AuthRepositoryPort, GoogleAuthRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly bootstrapKeyAllocator = new UserBootstrapKeyAllocator(),
    private readonly createIdentifierAllocator = (client: Prisma.TransactionClient) =>
      new IdentifierAllocator(new PublicIdentifierRepository(client))
  ) {}

  public async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findFirst({
      where: {
        email,
        deletedAt: null
      },
      include: authUserInclude
    });
    return user ? toAuthUserRecord(user) : null;
  }

  public async findUserByLoginIdentifier(identifier: string): Promise<AuthUserRecord | null> {
    const findUser = (where: Prisma.UserWhereInput) =>
      this.client.user.findFirst({ where: { ...where, deletedAt: null }, include: authUserInclude });
    let user: AuthUserPrismaRecord | null;

    if (identifier.includes("@")) {
      user = await findUser({ email: identifier });
    } else if (/^(?:u|s|b|o|needo)\d{10}$/.test(identifier)) {
      user = await findUser({
        identities: {
          some: {
            isActive: true,
            deletedAt: null,
            publicIdentifier: {
              is: {
                publicId: identifier,
                loginAllowed: true,
                status: "ACTIVE",
                deletedAt: null
              }
            }
          }
        }
      });
    } else if (/^\d{10}$/.test(identifier)) {
      user = await findUser({ accountNo: identifier });
      if (!user) user = await findUser({ phone: identifier });
    } else {
      user = await findUser({ phone: identifier });
    }

    return user ? toAuthUserRecord(user, identifier) : null;
  }

  public async findUserById(id: number): Promise<AuthUserRecord | null> {
    const user = await this.client.user.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: authUserInclude
    });
    return user ? toAuthUserRecord(user) : null;
  }

  public async findGoogleBindingBySubject(
    providerSubject: string
  ): Promise<GoogleBindingRecord | null> {
    const binding = await this.client.externalAuthAccount.findFirst({
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
    return binding ? { ...binding, user: toAuthUserRecord(binding.user) } : null;
  }

  public createVerifiedBaselineCustomer(
    input: CreateVerifiedBaselineCustomerInput
  ): Promise<AuthUserRecord> {
    const email = input.email.trim().toLowerCase();

    return this.bootstrapKeyAllocator.withNewKey(async (bootstrapKey) => {
      try {
        return await this.client.$transaction(async (transaction) => {
          const customerRole = await transaction.role.findFirst({
            where: { code: "customer", deletedAt: null },
            select: { id: true }
          });
          if (!customerRole) throw new Error("Registration role is missing: customer");

          const user = await transaction.user.create({
            data: {
              needoId: bootstrapKey,
              email,
              emailVerifiedAt: input.emailVerifiedAt,
              passwordHash: input.passwordHash,
              username: bootstrapKey,
              isActive: true
            }
          });
          const customerProfile = await transaction.customerProfile.create({
            data: { userId: user.id, displayName: bootstrapKey }
          });
          const customerIdentity = await transaction.userIdentity.create({
            data: {
              userId: user.id,
              type: "customer",
              scopeType: "customer_profile",
              scopeId: customerProfile.id,
              displayName: bootstrapKey,
              isDefault: true,
              isActive: true
            }
          });
          const publicIdentifier = await this.createIdentifierAllocator(transaction).allocate({
            kind: "U",
            userIdentityId: customerIdentity.id
          });
          await transaction.user.update({
            where: { id: user.id },
            data: {
              needoId: publicIdentifier.publicId,
              username: publicIdentifier.publicId
            }
          });
          await transaction.customerProfile.update({
            where: { id: customerProfile.id },
            data: { displayName: publicIdentifier.publicId }
          });
          await transaction.userIdentity.update({
            where: { id: customerIdentity.id },
            data: { displayName: publicIdentifier.publicId }
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
              metadata: {
                accountType: "customer",
                verified: true,
                ...(input.registrationChallengeId
                  ? { registrationChallengeId: input.registrationChallengeId }
                  : {})
              }
            }
          });

          const registered = await transaction.user.findUniqueOrThrow({
            where: { id: user.id },
            include: authUserInclude
          });
          return toAuthUserRecord(registered);
        });
      } catch (error) {
        if (this.isExternalAuthSubjectCollision(error)) {
          throw new ExternalAuthAccountConflictError();
        }
        throw error;
      }
    });
  }

  public async findVerifiedRegistrationByChallenge(
    registrationChallengeId: string,
    email: string
  ): Promise<AuthUserRecord | null> {
    const auditLog = await this.client.auditLog.findFirst({
      where: {
        action: "auth.register",
        targetType: "User",
        deletedAt: null,
        metadata: {
          path: "$.registrationChallengeId",
          equals: registrationChallengeId
        }
      },
      orderBy: { id: "desc" },
      select: { targetId: true }
    });
    if (!auditLog?.targetId) return null;

    const user = await this.findUserById(auditLog.targetId);
    return user?.email === email.trim().toLowerCase() && user.emailVerifiedAt ? user : null;
  }

  public createOrRestoreGoogleBinding(
    input: CreateOrRestoreGoogleBindingInput
  ): Promise<GoogleBindingRecord> {
    return this.createOrRestoreGoogleBindingWithRetry(input);
  }

  public async completeGoogleFirstUseLink(
    input: CompleteGoogleFirstUseLinkInput
  ): Promise<AuthUserRecord> {
    const email = input.googleIdentity.email.trim().toLowerCase();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const user = await transaction.user.findFirst({
              where: { email, deletedAt: null },
              include: authUserInclude
            });
            if (!user) throw new ExternalAuthAccountConflictError();
            const subject = input.googleIdentity.subject.trim();
            const existing = await transaction.externalAuthAccount.findFirst({
              where: { provider: "google", providerSubject: subject }
            });
            if (existing && !existing.deletedAt && existing.userId !== user.id) {
              throw new ExternalAuthAccountConflictError();
            }
            if (!existing || existing.deletedAt) {
              // Keep the create in this transaction so an audit failure rolls the binding back.
              // A provider-subject P2002 is retried above, where this binding is reread.
              await this.createOrRestoreGoogleBindingInTransaction(transaction, {
                userId: user.id,
                googleIdentity: input.googleIdentity
              });
            }
            const audit = await transaction.auditLog.findFirst({
              where: {
                action: "auth.google.link",
                targetType: "User",
                targetId: user.id,
                deletedAt: null,
                metadata: { path: "$.challengeId", equals: input.challengeId }
              },
              select: { id: true }
            });
            if (!audit) {
              await transaction.auditLog.create({
                data: {
                  actorId: user.id,
                  action: "auth.google.link",
                  targetType: "User",
                  targetId: user.id,
                  ip: input.context.ip,
                  userAgent: input.context.userAgent ?? null,
                  metadata: { challengeId: input.challengeId }
                }
              });
            }
            const refreshed = await transaction.user.findUniqueOrThrow({
              where: { id: user.id },
              include: authUserInclude
            });
            return toAuthUserRecord(refreshed);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        );
      } catch (error) {
        if (!this.isExternalAuthSubjectCollision(error)) throw error;
      }
    }
    throw new ExternalAuthAccountConflictError();
  }

  public async completeSuccessfulGoogleLogin(
    input: CompleteSuccessfulGoogleLoginInput
  ): Promise<AuthUserRecord> {
    return this.client.$transaction(async (transaction) => {
      const binding = await transaction.externalAuthAccount.findFirst({
        where: { provider: "google", providerSubject: input.providerSubject, deletedAt: null },
        include: { user: { include: authUserInclude } }
      });
      if (!binding || binding.userId !== input.expectedUserId || binding.user.deletedAt) {
        throw new GoogleLoginStateError(binding ? "conflict" : "missing");
      }
      const user = toAuthUserRecord(binding.user);
      if (!user.isActive || user.accessState.disabled) throw new GoogleLoginStateError("disabled");
      if (
        user.accessState.restricted ||
        !user.identities.some(
          (identity) => identity.id === input.expectedIdentityId && identity.isActive
        )
      ) {
        throw new GoogleLoginStateError("restricted");
      }
      await transaction.externalAuthAccount.update({
        where: { id: binding.id },
        data: { lastUsedAt: input.loggedInAt }
      });
      await transaction.user.update({
        where: { id: user.id },
        data: { lastLoginAt: input.loggedInAt }
      });
      await transaction.loginLog.create({
        data: {
          userId: user.id,
          email: user.email,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          status: "success"
        }
      });
      const fresh = await transaction.user.findUniqueOrThrow({
        where: { id: user.id },
        include: authUserInclude
      });
      return toAuthUserRecord(fresh);
    });
  }

  public async getGoogleBindingStatus(userId: number): Promise<GoogleBindingStatus> {
    const binding = await this.client.externalAuthAccount.findFirst({
      where: {
        userId,
        provider: "google",
        deletedAt: null,
        user: { deletedAt: null }
      },
      select: { id: true, providerEmail: true }
    });

    return {
      linked: Boolean(binding),
      bindingId: binding?.id ?? null,
      providerEmail: binding?.providerEmail ?? null
    };
  }

  public async completeAuthenticatedGoogleLink(
    input: CompleteAuthenticatedGoogleLinkInput
  ): Promise<AuthUserRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction(
          async (transaction) => {
            const user = await transaction.user.findFirst({
              where: { id: input.userId, deletedAt: null },
              include: authUserInclude
            });
            if (!user) throw new GoogleLoginStateError("missing");
            const account = toAuthUserRecord(user);
            if (!account.isActive || account.accessState.disabled)
              throw new GoogleLoginStateError("disabled");
            if (account.accessState.restricted) throw new GoogleLoginStateError("restricted");

            await this.createOrRestoreGoogleBindingInTransaction(transaction, {
              userId: account.id,
              googleIdentity: input.googleIdentity
            });
            await this.createAccountSecurityAuditInTransaction(transaction, {
              action: "auth.google.link",
              challengeId: input.challengeId,
              userId: account.id,
              context: input.context
            });
            const fresh = await transaction.user.findUniqueOrThrow({
              where: { id: account.id },
              include: authUserInclude
            });
            return toAuthUserRecord(fresh);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        );
      } catch (error) {
        if (!this.isExternalAuthSubjectCollision(error)) throw error;
      }
    }
    throw new ExternalAuthAccountConflictError();
  }

  public async completePasswordSetup(input: CompletePasswordSetupInput): Promise<AuthUserRecord> {
    return this.client.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        include: authUserInclude
      });
      if (!user) throw new GoogleLoginStateError("missing");
      const account = toAuthUserRecord(user);
      if (!account.isActive || account.accessState.disabled)
        throw new GoogleLoginStateError("disabled");
      if (account.accessState.restricted) throw new GoogleLoginStateError("restricted");

      const auditExists = await this.hasAccountSecurityAuditInTransaction(
        transaction,
        "auth.password.setup",
        input.challengeId,
        account.id
      );
      if (!auditExists) {
        // A password-setup challenge is one-way.  Do not let a second valid
        // challenge replace the first password: password changes require their
        // own, current-password-authenticated flow.
        const updated = await transaction.user.updateMany({
          where: { id: account.id, deletedAt: null, passwordHash: null },
          data: { passwordHash: input.passwordHash }
        });
        if (updated.count !== 1) throw new GoogleLoginStateError("conflict");
        await this.createAccountSecurityAuditInTransaction(transaction, {
          action: "auth.password.setup",
          challengeId: input.challengeId,
          userId: account.id,
          context: input.context
        });
      }
      const fresh = await transaction.user.findUniqueOrThrow({
        where: { id: account.id },
        include: authUserInclude
      });
      return toAuthUserRecord(fresh);
    });
  }

  public async completeGoogleUnlink(input: CompleteGoogleUnlinkInput): Promise<AuthUserRecord> {
    return this.client.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        include: authUserInclude
      });
      if (!user) throw new GoogleLoginStateError("missing");
      const account = toAuthUserRecord(user);
      if (!account.isActive || account.accessState.disabled)
        throw new GoogleLoginStateError("disabled");
      if (account.accessState.restricted) throw new GoogleLoginStateError("restricted");
      const auditExists = await this.hasAccountSecurityAuditInTransaction(
        transaction,
        "auth.google.unlink",
        input.challengeId,
        account.id
      );
      if (!auditExists) {
        if (!account.passwordHash) throw new GoogleLoginStateError("conflict");
        const unlinked = await transaction.externalAuthAccount.updateMany({
          where: { userId: account.id, provider: "google", deletedAt: null },
          data: { deletedAt: new Date() }
        });
        if (unlinked.count !== 1) throw new GoogleLoginStateError("missing");
        await transaction.user.update({
          where: { id: account.id },
          data: { sessionGeneration: { increment: 1 } }
        });
        await this.createAccountSecurityAuditInTransaction(transaction, {
          action: "auth.google.unlink",
          challengeId: input.challengeId,
          userId: account.id,
          context: input.context,
          recoveryProof: input.recoveryProof
        });
      }
      const fresh = await transaction.user.findUniqueOrThrow({
        where: { id: account.id },
        include: authUserInclude
      });
      return toAuthUserRecord(fresh);
    });
  }

  public async hasGoogleUnlinkCompletion(input: {
    challengeId: string;
    userId: number;
    recoveryProof: string;
  }): Promise<boolean> {
    return Boolean(
      await this.client.auditLog
        .findFirst({
          where: {
            action: "auth.google.unlink",
            targetType: "User",
            targetId: input.userId,
            metadata: {
              path: "$.challengeId",
              equals: input.challengeId
            }
          },
          select: { metadata: true }
        })
        .then((audit) => {
          if (!audit?.metadata || typeof audit.metadata !== "object") return null;
          const metadata = audit.metadata as Record<string, unknown>;
          const stored = metadata.recoveryProof;
          if (typeof stored !== "string") return null;
          const expected = Buffer.from(input.recoveryProof);
          const actual = Buffer.from(stored);
          return actual.length === expected.length && timingSafeEqual(actual, expected)
            ? audit
            : null;
        })
    );
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

    // A provider subject may only belong to one account, and an account may
    // only have one active identity for each provider.  The latter is also
    // protected by activeUserProviderKey at the database boundary.
    const activeForUser = await transaction.externalAuthAccount.findFirst({
      where: { userId: user.id, provider: "google", deletedAt: null }
    });
    if (activeForUser && activeForUser.providerSubject !== providerSubject) {
      throw new ExternalAuthAccountConflictError();
    }

    if (existing && !existing.deletedAt && existing.userId !== user.id) {
      throw new ExternalAuthAccountConflictError();
    }

    if (!existing) {
      const binding = await transaction.externalAuthAccount.create({
        data: {
          userId: user.id,
          provider: "google",
          providerSubject,
          providerEmail,
          providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt
        }
      });
      return { ...binding, provider: "google", user: toAuthUserRecord(user) };
    }

    if (!existing.deletedAt) {
      if (existing.userId !== user.id) throw new ExternalAuthAccountConflictError();
      const binding = await transaction.externalAuthAccount.update({
        where: { id: existing.id },
        data: {
          providerEmail,
          providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt
        }
      });
      return { ...binding, provider: "google", user: toAuthUserRecord(user) };
    }

    const restored = await transaction.externalAuthAccount.updateMany({
      where: { id: existing.id, deletedAt: existing.deletedAt },
      data: {
        userId: user.id,
        providerEmail,
        providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
        deletedAt: null
      }
    });
    if (restored.count === 1) {
      return {
        ...existing,
        userId: user.id,
        providerEmail,
        providerEmailVerifiedAt: input.googleIdentity.emailVerifiedAt,
        lastUsedAt: existing.lastUsedAt,
        deletedAt: null,
        user: toAuthUserRecord(user)
      };
    }

    const retainedUser = await transaction.user.findFirst({
      where: { id: user.id, deletedAt: null },
      include: authUserInclude
    });
    const retainedBySameUser = await transaction.externalAuthAccount.findFirst({
      where: {
        id: existing.id,
        provider: "google",
        providerSubject,
        userId: user.id,
        deletedAt: null
      }
    });
    if (!retainedUser || !retainedBySameUser) throw new ExternalAuthAccountConflictError();

    return {
      ...retainedBySameUser,
      provider: "google",
      user: toAuthUserRecord(retainedUser)
    };
  }

  private async hasAccountSecurityAuditInTransaction(
    transaction: Prisma.TransactionClient,
    action: "auth.google.link" | "auth.google.unlink" | "auth.password.setup",
    challengeId: string,
    userId: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.auditLog.findFirst({
        where: {
          action,
          targetType: "User",
          targetId: userId,
          deletedAt: null,
          metadata: { path: "$.challengeId", equals: challengeId }
        },
        select: { id: true }
      })
    );
  }

  private async createAccountSecurityAuditInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      action: "auth.google.link" | "auth.google.unlink" | "auth.password.setup";
      challengeId: string;
      userId: number;
      context: { ip: string; userAgent?: string | null };
      recoveryProof?: string;
    }
  ): Promise<void> {
    if (
      await this.hasAccountSecurityAuditInTransaction(
        transaction,
        input.action,
        input.challengeId,
        input.userId
      )
    ) {
      return;
    }
    await transaction.auditLog.create({
      data: {
        actorId: input.userId,
        action: input.action,
        targetType: "User",
        targetId: input.userId,
        ip: input.context.ip,
        userAgent: input.context.userAgent ?? null,
        metadata: {
          challengeId: input.challengeId,
          ...(input.recoveryProof ? { recoveryProof: input.recoveryProof } : {})
        }
      }
    });
  }

  private async createOrRestoreGoogleBindingWithRetry(
    input: CreateOrRestoreGoogleBindingInput
  ): Promise<GoogleBindingRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.client.$transaction((transaction) =>
          this.createOrRestoreGoogleBindingInTransaction(transaction, input)
        );
      } catch (error) {
        if (!this.isExternalAuthSubjectCollision(error)) throw error;
      }
    }
    throw new ExternalAuthAccountConflictError();
  }

  private isExternalAuthSubjectCollision(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
      return false;
    }
    const record = error as {
      meta?: {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { index?: unknown; fields?: unknown } } };
      };
    };
    return [
      record.meta?.target,
      record.meta?.driverAdapterError?.cause?.constraint?.index,
      record.meta?.driverAdapterError?.cause?.constraint?.fields
    ]
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .some((value) => {
        const target = String(value ?? "");
        return (
          target.includes("external_auth_provider_subject") ||
          target.includes("external_auth_active_user_provider_key") ||
          target.includes("provider_subject") ||
          target.includes("active_user_provider_key")
        );
      });
  }
}
