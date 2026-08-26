import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { PrismaClient } from "@prisma/client";
import type { AuthRepository } from "../src/repositories/auth.repository";

const integrationDatabaseError =
  "Auth repository Google integration tests require an explicitly allowed local database";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const allowedDatabaseNames = new Set(["needo_dev", "needo_test"]);
const runIntegration = Boolean(process.env.ENV_FILE?.trim());
const describeIntegration = runIntegration ? describe : describe.skip;
const marker = `auth-repository-google-${randomUUID()}`;
const createdUserIds: number[] = [];

let prisma: PrismaClient;
let repository: AuthRepository;

const requireSafeDatabaseUrl = (envFile: string): void => {
  const loadedEnvironment = loadDotenv({ path: envFile, override: true });
  if (loadedEnvironment.error || !loadedEnvironment.parsed?.DATABASE_URL) {
    throw new Error(`${integrationDatabaseError}; ENV_FILE must define DATABASE_URL`);
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(loadedEnvironment.parsed.DATABASE_URL);
  } catch {
    throw new Error(integrationDatabaseError);
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (
    databaseUrl.protocol !== "mysql:" ||
    !allowedHosts.has(databaseUrl.hostname) ||
    !allowedDatabaseNames.has(databaseName)
  ) {
    throw new Error(integrationDatabaseError);
  }
};

describeIntegration("AuthRepository verified account and Google binding integration", () => {
  beforeAll(async () => {
    const envFile = process.env.ENV_FILE?.trim();
    if (!envFile) throw new Error(`${integrationDatabaseError}; ENV_FILE is required`);
    requireSafeDatabaseUrl(envFile);
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
      emailVerifiedAt: user.emailVerifiedAt
    });
    await expect(repository.findUserByLoginIdentifier(user.needoId)).resolves.toMatchObject({
      id: user.id
    });
    await expect(repository.findUserByLoginIdentifier(user.username)).resolves.toBeNull();
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
        emailVerifiedAt: verifiedAt,
        name: "Google profile name must not become a NeeDo display name",
        pictureUrl: null
      }
    });
    createdUserIds.push(account.id);

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
      expect.arrayContaining([expect.objectContaining({ role: { code: "customer" } })])
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

  it("links an existing verified email, rejects another user's subject conflict, and restores the soft-deleted binding", async () => {
    const verifiedAt = new Date("2026-08-26T02:03:04.000Z");
    const existing = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-existing-link@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: "prepared-password-hash",
      context: { ip: "127.0.0.1" }
    });
    const other = await repository.createVerifiedBaselineCustomer({
      email: `${marker}-other-link@needo.test`,
      emailVerifiedAt: verifiedAt,
      passwordHash: "prepared-password-hash",
      context: { ip: "127.0.0.1" }
    });
    createdUserIds.push(existing.id, other.id);

    const googleIdentity = {
      subject: `${marker}-subject-existing-link`,
      email: `${marker}-existing-link@needo.test`,
      emailVerifiedAt: verifiedAt,
      name: null,
      pictureUrl: null
    };
    const binding = await repository.createOrRestoreGoogleBinding({
      userId: existing.id,
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
    await expect(
      repository.createOrRestoreGoogleBinding({ userId: other.id, googleIdentity })
    ).rejects.toMatchObject({
      name: "ExternalAuthAccountConflictError"
    });

    await expect(repository.softUnlinkGoogleBinding(existing.id)).resolves.toBe(true);
    await expect(repository.getGoogleBindingStatus(existing.id)).resolves.toEqual({
      linked: false,
      bindingId: null
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
});
