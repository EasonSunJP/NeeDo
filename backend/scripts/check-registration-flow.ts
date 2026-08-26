import { compare, hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(
    process.env.NODE_ENV !== "production",
    "registration integration check cannot use NODE_ENV=production"
  );
  assert(
    process.env.DEPLOY_ENV !== "prod",
    "registration integration check cannot use DEPLOY_ENV=prod"
  );
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "registration integration check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(
    databaseName === "needo_test",
    "registration integration check only accepts the needo_test database"
  );

  const [{ AuthRepository }, { prisma, disconnectPrisma }] = await Promise.all([
    import("../src/repositories/auth.repository"),
    import("../src/prisma/client")
  ]);
  const marker = `${Date.now()}-${process.pid}`;
  const customerEmail = `registration-customer-${marker}@needo.test`;
  const password = "Registration.2026!";
  const passwordHash = await hash(password, 12);
  const createdUserIds: number[] = [];

  try {
    const requiredRoles = await prisma.role.findMany({
      where: { code: "customer", deletedAt: null },
      select: { code: true }
    });
    assert(requiredRoles.length === 1, "customer role must be seeded in needo_test");

    const repository = new AuthRepository(prisma);
    const verifiedAt = new Date();
    const customer = await repository.createVerifiedBaselineCustomer({
      email: customerEmail,
      emailVerifiedAt: verifiedAt,
      passwordHash,
      context: { ip: "127.0.0.1", userAgent: "registration-flow-check" }
    });
    createdUserIds.push(customer.id);

    const users = await prisma.user.findMany({
      where: { id: { in: createdUserIds } },
      include: {
        customerProfile: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    const storedCustomer = users.find((user) => user.id === customer.id);

    assert(storedCustomer?.customerProfile, "customer profile was not persisted");
    assert(
      storedCustomer.emailVerifiedAt?.getTime() === verifiedAt.getTime(),
      "customer email must be verified"
    );
    assert(/^n\d{10}$/.test(storedCustomer.needoId), "customer must receive an immutable NeeDo ID");
    assert(
      storedCustomer.username === storedCustomer.needoId,
      "customer username must equal the initial NeeDo ID"
    );
    assert(
      storedCustomer.customerProfile.displayName === storedCustomer.needoId,
      "customer profile display name must equal the initial NeeDo ID"
    );
    assert(storedCustomer.identities[0]?.isActive, "customer identity must be active");
    assert(
      storedCustomer.identities[0]?.displayName === storedCustomer.needoId,
      "customer identity display name must equal the initial NeeDo ID"
    );
    assert(storedCustomer.userRoles[0]?.role.code === "customer", "customer role was not assigned");
    assert(Boolean(storedCustomer.passwordHash), "customer password hash must be persisted");
    assert(
      await compare(password, storedCustomer.passwordHash as string),
      "customer password hash is invalid"
    );
    await expectTrustedLookup(
      repository,
      storedCustomer.email,
      storedCustomer.needoId,
      storedCustomer.id
    );

    const registrationAuditCount = await prisma.auditLog.count({
      where: {
        action: "auth.register",
        targetType: "User",
        targetId: { in: createdUserIds }
      }
    });
    assert(registrationAuditCount === 1, "verified baseline creation must create an audit log");

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          customer: { active: true, profile: true, role: "customer", verified: true },
          auditLogs: registrationAuditCount,
          status: "ok"
        },
        null,
        2
      )
    );
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.$transaction(async (transaction) => {
        await transaction.auditLog.deleteMany({
          where: { targetType: "User", targetId: { in: createdUserIds } }
        });
        await transaction.externalAuthAccount.deleteMany({
          where: { userId: { in: createdUserIds } }
        });
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.technicianProfile.deleteMany({
          where: { userId: { in: createdUserIds } }
        });
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      });
    }
    await disconnectPrisma();
  }
};

const expectTrustedLookup = async (
  repository: {
    findUserByEmail(email: string): Promise<{ id: number } | null>;
    findUserByLoginIdentifier(identifier: string): Promise<{ id: number } | null>;
  },
  email: string,
  needoId: string,
  userId: number
): Promise<void> => {
  assert(
    (await repository.findUserByEmail(email))?.id === userId,
    "email lookup must resolve the verified account"
  );
  assert(
    (await repository.findUserByLoginIdentifier(needoId))?.id === userId,
    "NeeDo ID lookup must resolve the verified account"
  );
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
