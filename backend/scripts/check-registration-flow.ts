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
  assert(process.env.NODE_ENV !== "production", "registration integration check cannot use NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "registration integration check cannot use DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "registration integration check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");

  const [{ AuthRepository }, { prisma, disconnectPrisma }] = await Promise.all([
    import("../src/repositories/auth.repository"),
    import("../src/prisma/client")
  ]);
  const marker = `${Date.now()}-${process.pid}`;
  const customerEmail = `registration-customer-${marker}@needo.test`;
  const technicianEmail = `registration-technician-${marker}@needo.test`;
  const password = "Registration.2026!";
  const passwordHash = await hash(password, 12);
  const createdUserIds: number[] = [];

  try {
    const requiredRoles = await prisma.role.findMany({
      where: { code: { in: ["customer", "technician"] }, deletedAt: null },
      select: { code: true }
    });
    assert(requiredRoles.length === 2, "customer and technician roles must be seeded in needo_test");

    const repository = new AuthRepository(prisma);
    const customer = await repository.registerUser({
      accountType: "customer",
      email: customerEmail,
      ip: "127.0.0.1",
      passwordHash,
      username: "Registration Customer"
    });
    createdUserIds.push(customer.id);
    const technician = await repository.registerUser({
      accountType: "technician",
      city: "Tokyo",
      email: technicianEmail,
      ip: "127.0.0.1",
      passwordHash,
      username: "Registration Technician"
    });
    createdUserIds.push(technician.id);

    assert(customer.approvalStatus === "approved", "customer registration must be approved");
    assert(customer.isActive, "customer registration must be active");
    assert(
      technician.approvalStatus === "pending_review",
      "technician registration must require review"
    );
    assert(!technician.isActive, "technician registration must remain inactive before review");

    const users = await prisma.user.findMany({
      where: { id: { in: createdUserIds } },
      include: {
        customerProfile: true,
        technicianProfile: true,
        identities: { where: { deletedAt: null } },
        userRoles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    const storedCustomer = users.find((user) => user.id === customer.id);
    const storedTechnician = users.find((user) => user.id === technician.id);

    assert(storedCustomer?.customerProfile, "customer profile was not persisted");
    assert(!storedCustomer.technicianProfile, "customer must not have a technician profile");
    assert(storedCustomer.identities[0]?.isActive, "customer identity must be active");
    assert(storedCustomer.userRoles[0]?.role.code === "customer", "customer role was not assigned");
    assert(await compare(password, storedCustomer.passwordHash), "customer password hash is invalid");

    assert(storedTechnician?.technicianProfile, "technician profile was not persisted");
    assert(
      storedTechnician.technicianProfile.status === "pending_review",
      "technician profile status must be pending_review"
    );
    assert(storedTechnician.technicianProfile.city === "Tokyo", "technician city was not persisted");
    assert(!storedTechnician.identities[0]?.isActive, "technician identity must remain inactive");
    assert(
      storedTechnician.userRoles[0]?.role.code === "technician",
      "technician role was not assigned"
    );
    assert(await compare(password, storedTechnician.passwordHash), "technician password hash is invalid");

    const registrationAuditCount = await prisma.auditLog.count({
      where: {
        action: "auth.register",
        targetType: "User",
        targetId: { in: createdUserIds }
      }
    });
    assert(registrationAuditCount === 2, "each registration must create an audit log");

    console.log(
      JSON.stringify(
        {
          database: databaseName,
          customer: { active: true, profile: true, role: "customer" },
          technician: {
            active: false,
            city: "Tokyo",
            profileStatus: "pending_review",
            role: "technician"
          },
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
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.technicianProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.user.deleteMany({ where: { id: { in: createdUserIds } } });
      });
    }
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
