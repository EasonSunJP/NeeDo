import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import type { AuthRepository } from "../src/repositories/auth.repository";

const integrationDatabaseError =
  "Auth repository Google integration tests require an explicitly allowed local database";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const runIntegration = Boolean(process.env.ENV_FILE?.trim());
const describeIntegration = runIntegration ? describe : describe.skip;
const marker = `auth-repository-google-${randomUUID()}`;
const createdUserIds: number[] = [];

let prisma: PrismaClient;
let repository: AuthRepository;

export const assertSafeAuthRepositoryDatabaseUrl = (databaseUrlValue: string): string => {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    throw new Error(integrationDatabaseError);
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (
    databaseUrl.protocol !== "mysql:" ||
    !allowedHosts.has(databaseUrl.hostname) ||
    databaseName !== "needo_test"
  ) {
    throw new Error(integrationDatabaseError);
  }

  return databaseUrlValue;
};

export const requireAuthRepositoryIntegrationDatabaseUrl = (
  envFile: string | undefined
): string => {
  if (!envFile?.trim()) {
    throw new Error(`${integrationDatabaseError}; ENV_FILE is required`);
  }

  const loadedEnvironment = loadDotenv({ path: envFile, override: true });
  if (loadedEnvironment.error || !loadedEnvironment.parsed?.DATABASE_URL) {
    throw new Error(`${integrationDatabaseError}; ENV_FILE must define DATABASE_URL`);
  }

  return assertSafeAuthRepositoryDatabaseUrl(loadedEnvironment.parsed.DATABASE_URL);
};

describe("AuthRepository Google integration database guard", () => {
  it("allows only explicit local MySQL needo_test environments", () => {
    expect(
      assertSafeAuthRepositoryDatabaseUrl(
        "mysql://needo_test:needo_test_password@localhost:3307/needo_test"
      )
    ).toContain("/needo_test");
  });

  it.each([
    "mysql://needo:secret@localhost:3306/needo_dev",
    "mysql://needo:secret@example.com:3306/needo_test",
    "postgresql://needo:secret@localhost:5432/needo_test"
  ])("rejects unsafe database URL %s", (databaseUrl) => {
    expect(() => assertSafeAuthRepositoryDatabaseUrl(databaseUrl)).toThrow(
      integrationDatabaseError
    );
  });

  it("rejects a missing ENV_FILE", () => {
    expect(() => requireAuthRepositoryIntegrationDatabaseUrl(undefined)).toThrow(
      "ENV_FILE is required"
    );
  });
});

describeIntegration("AuthRepository verified account and Google binding integration", () => {
  beforeAll(async () => {
    requireAuthRepositoryIntegrationDatabaseUrl(process.env.ENV_FILE);
    process.env.NODE_ENV = "development";
    process.env.DEPLOY_ENV = "local";

    const [{ AuthRepository }, prismaModule] = await Promise.all([
      import("../src/repositories/auth.repository"),
      import("../src/prisma/client")
    ]);
    repository = new AuthRepository(prismaModule.prisma);
    prisma = prismaModule.prisma;

    const customerRole = await prisma.role.findFirst({
      where: { code: "customer", deletedAt: null },
      select: { id: true }
    });
    if (!customerRole)
      throw new Error("customer role must be seeded before repository integration tests run");
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.$transaction(async (transaction) => {
        await transaction.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: createdUserIds } },
              { targetType: "User", targetId: { in: createdUserIds } }
            ]
          }
        });
        await transaction.externalAuthAccount.deleteMany({
          where: { userId: { in: createdUserIds } }
        });
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      });
    }
    if (prisma) {
      const { disconnectPrisma } = await import("../src/prisma/client");
      await disconnectPrisma();
    }
  });

  it("reads a trusted existing account by persisted email and NeeDo ID", async () => {
    const user = await prisma.user.create({
      data: {
        needoId: "n9999999001",
        email: `${marker}-existing@needo.test`,
        emailVerifiedAt: new Date("2026-08-26T00:00:00.000Z"),
        passwordHash: "prepared-password-hash",
        username: "mutable nickname"
      }
    });
    createdUserIds.push(user.id);

    await expect(repository.findUserByEmail(user.email)).resolves.toMatchObject({
      id: user.id,
      needoId: user.needoId,
      emailVerifiedAt: user.emailVerifiedAt,
      accessState: { disabled: false, restricted: true }
    });
    await expect(repository.findUserByLoginIdentifier(user.needoId)).resolves.toMatchObject({
      id: user.id
    });
    await expect(repository.findUserByLoginIdentifier(user.username)).resolves.toBeNull();
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(repository.findUserById(user.id)).resolves.toMatchObject({
      accessState: { disabled: true, restricted: true }
    });
  });

  it("creates a verified Google-only baseline customer with matching immutable display values", async () => {
    const verifiedAt = new Date("2026-08-26T01:02:03.000Z");
    const account = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-google-only@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1", userAgent: "repository-integration" },
      googleIdentity: {
        subject: `${marker}-subject-google-only`,
        email: `${marker}-google-only@needo.test`,
        emailVerifiedAt: verifiedAt
      }
    });
    createdUserIds.push(account.id);
    expect(account.accessState).toEqual({ disabled: false, restricted: false });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: account.id },
      include: {
        customerProfile: true,
        externalAccounts: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });

    expect(stored.passwordHash).toBeNull();
    expect(stored.needoId).toMatch(/^n\d{10}$/);
    expect(stored.username).toBe(stored.needoId);
    expect(stored.customerProfile?.displayName).toBe(stored.needoId);
    expect(stored.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "customer",
          displayName: stored.needoId,
          isDefault: true,
          isActive: true
        })
      ])
    );
    expect(stored.userRoles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: expect.objectContaining({ code: "customer" }) })
      ])
    );
    expect(stored.externalAccounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "google",
          providerSubject: `${marker}-subject-google-only`,
          providerEmail: stored.email,
          providerEmailVerifiedAt: verifiedAt
        })
      ])
    );
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "auth.register", targetType: "User", targetId: stored.id }
      })
    ).resolves.toBeTruthy();
  });

  it("finds exactly the committed verified registration by its challenge audit evidence", async () => {
    const challengeId = randomUUID();
    const email = `${marker}-registration-recovery@needo.test`;
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      emailVerifiedAt: new Date("2026-08-27T00:00:00.000Z"),
      passwordHash: "prepared-password-hash",
      registrationChallengeId: challengeId,
      context: { ip: "127.0.0.1", userAgent: "registration-recovery-integration" }
    });
    createdUserIds.push(account.id);

    await expect(
      repository.findVerifiedRegistrationByChallenge(challengeId, email)
    ).resolves.toMatchObject({ id: account.id, email, emailVerifiedAt: expect.any(Date) });
    await expect(
      repository.findVerifiedRegistrationByChallenge(challengeId, "other@example.com")
    ).resolves.toBeNull();
    await expect(
      prisma.auditLog.findFirst({
        where: { action: "auth.register", targetType: "User", targetId: account.id },
        select: { metadata: true }
      })
    ).resolves.toMatchObject({
      metadata: expect.objectContaining({ registrationChallengeId: challengeId })
    });
  });

  it("links only the account resolved from the normalized verified Google email", async () => {
    const verifiedAt = new Date("2026-08-26T02:03:04.000Z");
    const existing = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-existing-link@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: "prepared-password-hash",
      context: { ip: "127.0.0.1" }
    });
    const mismatch = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-mismatch-link@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: "prepared-password-hash",
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(existing.id, mismatch.id);

    const googleIdentity = {
      subject: `${marker}-subject-existing-link`,
      email: `  ${marker}-EXISTING-LINK@needo.test  `,
      emailVerifiedAt: verifiedAt
    };
    const resolved = await repository.findUserByEmail(googleIdentity.email.trim().toLowerCase());
    expect(resolved?.id).toBe(existing.id);
    expect(await repository.findUserByEmail(`${marker}-unknown@needo.test`)).toBeNull();
    expect(await repository.findUserByEmail(`${marker}-mismatch-link@needo.test`)).toMatchObject({
      id: mismatch.id
    });
    const binding = await repository.createOrRestoreGoogleBinding({
      userId: resolved?.id as number,
      googleIdentity
    });

    await expect(
      repository.findGoogleBindingBySubject(googleIdentity.subject)
    ).resolves.toMatchObject({
      id: binding.id,
      userId: existing.id
    });
    await expect(repository.getGoogleBindingStatus(existing.id)).resolves.toMatchObject({
      linked: true,
      bindingId: binding.id
    });
    await expect(repository.getGoogleBindingStatus(mismatch.id)).resolves.toEqual({
      linked: false,
      bindingId: null,
      providerEmail: null
    });

    await expect(repository.softUnlinkGoogleBinding(existing.id)).resolves.toBe(true);
    await expect(repository.getGoogleBindingStatus(existing.id)).resolves.toEqual({
      linked: false,
      bindingId: null,
      providerEmail: null
    });
    const restored = await repository.createOrRestoreGoogleBinding({
      userId: existing.id,
      googleIdentity: { ...googleIdentity, email: `${marker}-restored-email@needo.test` }
    });
    expect(restored.id).toBe(binding.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.providerEmail).toBe(`${marker}-restored-email@needo.test`);

    const lastUsedAt = new Date("2026-08-26T03:04:05.000Z");
    await expect(
      repository.updateGoogleBindingLastUsedAt(googleIdentity.subject, lastUsedAt)
    ).resolves.toBe(true);
    await expect(
      repository.findGoogleBindingBySubject(googleIdentity.subject)
    ).resolves.toMatchObject({ lastUsedAt });
    await expect(
      repository.updatePasswordHash(existing.id, "new-prepared-password-hash")
    ).resolves.toBe(true);
    await expect(repository.findUserById(existing.id)).resolves.toMatchObject({
      passwordHash: "new-prepared-password-hash"
    });
  });

  it("atomically links an existing email target and writes one challenge-id audit", async () => {
    const verifiedAt = new Date("2026-08-27T01:02:03.000Z");
    const email = `${marker}-atomic-link@needo.test`;
    const subject = `${marker}-atomic-link-subject`;
    const challengeId = randomUUID();
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      emailVerifiedAt: verifiedAt,
      passwordHash: "prepared-password-hash",
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(account.id);
    const input = {
      challengeId,
      googleIdentity: { subject, email, emailVerifiedAt: verifiedAt },
      context: { ip: "127.0.0.1" }
    };

    await expect(
      repository.completeGoogleFirstUseLink({ ...input, context: { ip: "x".repeat(51) } })
    ).rejects.toBeDefined();
    await expect(repository.findGoogleBindingBySubject(subject)).resolves.toBeNull();
    await expect(
      prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          metadata: { path: "$.challengeId", equals: challengeId }
        }
      })
    ).resolves.toBe(0);

    await expect(repository.completeGoogleFirstUseLink(input)).resolves.toMatchObject({
      id: account.id
    });
    await expect(repository.completeGoogleFirstUseLink(input)).resolves.toMatchObject({
      id: account.id
    });
    await expect(repository.findGoogleBindingBySubject(subject)).resolves.toMatchObject({
      userId: account.id
    });
    await expect(
      prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: challengeId }
        }
      })
    ).resolves.toBe(1);
  });

  it("re-reads a provider-subject collision for one target and rejects another target", async () => {
    const verifiedAt = new Date("2026-08-27T02:03:04.000Z");
    const subject = `${marker}-complete-link-race-subject`;
    const sameTargetEmail = `${marker}-complete-link-race@needo.test`;
    const otherTargetEmail = `${marker}-complete-link-other@needo.test`;
    const sameTarget = await repository.createVerifiedBaselineCustomer({
      email: sameTargetEmail,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    const otherTarget = await repository.createVerifiedBaselineCustomer({
      email: otherTargetEmail,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(sameTarget.id, otherTarget.id);
    const firstChallengeId = randomUUID();
    const secondChallengeId = randomUUID();
    const identity = { subject, email: sameTargetEmail, emailVerifiedAt: verifiedAt };

    const sameTargetResults = await Promise.allSettled([
      repository.completeGoogleFirstUseLink({
        challengeId: firstChallengeId,
        googleIdentity: identity,
        context: { ip: "127.0.0.1" }
      }),
      repository.completeGoogleFirstUseLink({
        challengeId: secondChallengeId,
        googleIdentity: identity,
        context: { ip: "127.0.0.1" }
      })
    ]);
    expect(sameTargetResults).toEqual([
      expect.objectContaining({
        status: "fulfilled",
        value: expect.objectContaining({ id: sameTarget.id })
      }),
      expect.objectContaining({
        status: "fulfilled",
        value: expect.objectContaining({ id: sameTarget.id })
      })
    ]);
    await expect(repository.findGoogleBindingBySubject(subject)).resolves.toMatchObject({
      userId: sameTarget.id
    });
    const firstAuditCount = await prisma.auditLog.count({
      where: {
        action: "auth.google.link",
        targetId: sameTarget.id,
        metadata: { path: "$.challengeId", equals: firstChallengeId }
      }
    });
    const secondAuditCount = await prisma.auditLog.count({
      where: {
        action: "auth.google.link",
        targetId: sameTarget.id,
        metadata: { path: "$.challengeId", equals: secondChallengeId }
      }
    });
    expect(firstAuditCount + secondAuditCount).toBeGreaterThanOrEqual(1);
    expect(firstAuditCount + secondAuditCount).toBeLessThanOrEqual(2);

    await expect(
      repository.completeGoogleFirstUseLink({
        challengeId: randomUUID(),
        googleIdentity: { subject, email: otherTargetEmail, emailVerifiedAt: verifiedAt },
        context: { ip: "127.0.0.1" }
      })
    ).rejects.toMatchObject({ name: "ExternalAuthAccountConflictError" });
    expect(
      await prisma.auditLog.count({
        where: { action: "auth.google.link", targetId: otherTarget.id }
      })
    ).toBe(0);
  });

  it("converges two first-use challenges restoring one soft-deleted binding for its owner", async () => {
    const verifiedAt = new Date("2026-08-27T02:13:14.000Z");
    const email = `${marker}-complete-link-restore@needo.test`;
    const subject = `${marker}-complete-link-restore-subject`;
    const account = await repository.createVerifiedBaselineCustomer({
      email,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(account.id);
    await repository.createOrRestoreGoogleBinding({
      userId: account.id,
      googleIdentity: { subject, email, emailVerifiedAt: verifiedAt }
    });
    await expect(repository.softUnlinkGoogleBinding(account.id)).resolves.toBe(true);
    const firstChallengeId = randomUUID();
    const secondChallengeId = randomUUID();
    const input = {
      googleIdentity: { subject, email, emailVerifiedAt: verifiedAt },
      context: { ip: "127.0.0.1" }
    };

    const results = await Promise.allSettled([
      repository.completeGoogleFirstUseLink({ ...input, challengeId: firstChallengeId }),
      repository.completeGoogleFirstUseLink({ ...input, challengeId: secondChallengeId })
    ]);
    expect(results).toEqual([
      expect.objectContaining({
        status: "fulfilled",
        value: expect.objectContaining({ id: account.id })
      }),
      expect.objectContaining({
        status: "fulfilled",
        value: expect.objectContaining({ id: account.id })
      })
    ]);
    const restored = await prisma.externalAuthAccount.findFirstOrThrow({
      where: { provider: "google", providerSubject: subject }
    });
    expect(restored).toMatchObject({ userId: account.id, deletedAt: null, lastUsedAt: null });
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: firstChallengeId }
        }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          action: "auth.google.link",
          targetId: account.id,
          metadata: { path: "$.challengeId", equals: secondChallengeId }
        }
      })
    ).toBe(1);
  });

  it("rolls every baseline-account write back when the aggregate audit write fails", async () => {
    const failedEmail = `${marker}-rollback@needo.test`;

    await expect(
      repository.createVerifiedBaselineCustomer({
        email: failedEmail,
        emailVerifiedAt: new Date("2026-08-26T04:05:06.000Z"),
        passwordHash: null,
        context: { ip: "x".repeat(51) }
      })
    ).rejects.toBeDefined();
    await expect(prisma.user.findFirst({ where: { email: failedEmail } })).resolves.toBeNull();
  });

  it("returns one stable owner when concurrent first bindings use one Google subject", async () => {
    const verifiedAt = new Date("2026-08-26T05:06:07.000Z");
    const first = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-first-concurrent@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    const second = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-second-concurrent@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(first.id, second.id);
    const googleIdentity = {
      subject: `${marker}-subject-first-concurrent`,
      email: `${marker}-first-concurrent@needo.test`,
      emailVerifiedAt: verifiedAt
    };

    const results = await Promise.allSettled([
      repository.createOrRestoreGoogleBinding({ userId: first.id, googleIdentity }),
      repository.createOrRestoreGoogleBinding({ userId: second.id, googleIdentity })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: { name: "ExternalAuthAccountConflictError" }
    });
    const winningResult = results.find((result) => result.status === "fulfilled");
    if (!winningResult || winningResult.status !== "fulfilled")
      throw new Error("expected one binding winner");
    await expect(
      repository.findGoogleBindingBySubject(googleIdentity.subject)
    ).resolves.toMatchObject({
      userId: winningResult.value.userId
    });
  });

  it("uses compare-and-set restoration so concurrent restores cannot move the Google subject owner", async () => {
    const verifiedAt = new Date("2026-08-26T06:07:08.000Z");
    const originalOwner = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-original-restore@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    const contender = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-contender-restore@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(originalOwner.id, contender.id);
    const googleIdentity = {
      subject: `${marker}-subject-restore`,
      email: `${marker}-original-restore@needo.test`,
      emailVerifiedAt: verifiedAt
    };
    await repository.createOrRestoreGoogleBinding({ userId: originalOwner.id, googleIdentity });
    await repository.softUnlinkGoogleBinding(originalOwner.id);

    const results = await Promise.allSettled([
      repository.createOrRestoreGoogleBinding({ userId: originalOwner.id, googleIdentity }),
      repository.createOrRestoreGoogleBinding({ userId: contender.id, googleIdentity })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({
      reason: { name: "ExternalAuthAccountConflictError" }
    });
    const winningResult = results.find((result) => result.status === "fulfilled");
    if (!winningResult || winningResult.status !== "fulfilled")
      throw new Error("expected one binding winner");
    const finalOwnerId = winningResult.value.userId;
    await expect(
      repository.findGoogleBindingBySubject(googleIdentity.subject)
    ).resolves.toMatchObject({
      userId: finalOwnerId
    });
    await expect(
      repository.createOrRestoreGoogleBinding({
        userId: finalOwnerId === originalOwner.id ? contender.id : originalOwner.id,
        googleIdentity
      })
    ).rejects.toMatchObject({ name: "ExternalAuthAccountConflictError" });
    await expect(
      repository.findGoogleBindingBySubject(googleIdentity.subject)
    ).resolves.toMatchObject({
      userId: finalOwnerId
    });
  });

  it("rolls every Google login fact back on LoginLog failure and returns state outcomes", async () => {
    const verifiedAt = new Date("2026-08-27T03:04:05.000Z");
    const account = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-complete-login@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: null,
      context: { ip: "127.0.0.1" },
      googleIdentity: {
        subject: `${marker}-complete-login-subject`,
        email: `${marker}-complete-login@needo.test`,
        emailVerifiedAt: verifiedAt
      }
    });
    createdUserIds.push(account.id);
    const identity = account.identities.find((item) => item.isDefault)!;
    const binding = await prisma.externalAuthAccount.findFirstOrThrow({
      where: { providerSubject: `${marker}-complete-login-subject` }
    });
    const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    const beforeLogs = await prisma.loginLog.count({
      where: { userId: account.id, status: "success" }
    });
    const input = {
      providerSubject: binding.providerSubject,
      expectedUserId: account.id,
      expectedIdentityId: identity.id,
      loggedInAt: new Date("2026-08-27T04:05:06.000Z"),
      context: { ip: "x".repeat(51) }
    };
    await expect(repository.completeSuccessfulGoogleLogin(input)).rejects.toMatchObject({
      code: "P2000"
    });
    const afterFailureBinding = await prisma.externalAuthAccount.findUniqueOrThrow({
      where: { id: binding.id }
    });
    const afterFailureUser = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(afterFailureBinding.lastUsedAt).toEqual(binding.lastUsedAt);
    expect(afterFailureUser.lastLoginAt).toEqual(beforeUser.lastLoginAt);
    expect(await prisma.loginLog.count({ where: { userId: account.id, status: "success" } })).toBe(
      beforeLogs
    );

    await prisma.userIdentity.update({ where: { id: identity.id }, data: { isActive: false } });
    await expect(
      repository.completeSuccessfulGoogleLogin({ ...input, context: { ip: "127.0.0.1" } })
    ).rejects.toMatchObject({ reason: "restricted" });
    await prisma.userIdentity.update({ where: { id: identity.id }, data: { isActive: true } });
    await expect(
      repository.completeSuccessfulGoogleLogin({
        ...input,
        expectedUserId: account.id + 999,
        context: { ip: "127.0.0.1" }
      })
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(await prisma.loginLog.count({ where: { userId: account.id, status: "success" } })).toBe(
      beforeLogs
    );
  });
});
