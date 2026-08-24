import { hash } from "bcryptjs";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  assert(existsSync(envFile), `environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });
  assert(process.env.NODE_ENV !== "production", "master-data integration check cannot use NODE_ENV=production");
  assert(process.env.DEPLOY_ENV !== "prod", "master-data integration check cannot use DEPLOY_ENV=prod");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  assert(
    databaseUrl.hostname === "localhost" || databaseUrl.hostname === "127.0.0.1",
    "master-data integration check only accepts a local MySQL host"
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(databaseName.length > 0, "DATABASE_URL must include a database name");

  const [{ AuthRepository }, { BackofficeRepository }, { prisma, disconnectPrisma }] = await Promise.all([
    import("../src/repositories/auth.repository"),
    import("../src/repositories/backoffice.repository"),
    import("../src/prisma/client")
  ]);
  const marker = `${Date.now()}-${process.pid}`;
  const ownerEmail = `master-owner-${marker}@needo.test`;
  const technicianEmail = `master-technician-${marker}@needo.test`;
  const customerEmail = `master-customer-${marker}@needo.test`;
  const passwordHash = await hash("MasterData.2026!", 12);
  const createdUserIds: number[] = [];
  let shopId: number | null = null;
  let serviceId: number | null = null;

  try {
    const [category, roles] = await Promise.all([
      prisma.category.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { id: "asc" } }),
      prisma.role.findMany({ where: { code: { in: ["merchant_owner", "technician", "customer"] }, deletedAt: null }, select: { code: true } })
    ]);
    assert(category, "at least one active category must be seeded");
    assert(roles.length === 3, "merchant_owner, technician, and customer roles must be seeded");

    const authRepository = new AuthRepository(prisma);
    const repository = new BackofficeRepository(prisma);
    const shop = await repository.createShop({
      ownerEmail,
      ownerUsername: `Master Owner ${marker}`,
      ownerPasswordHash: passwordHash,
      name: `Master Data Shop ${marker}`,
      city: "Tokyo",
      address: "Integration 1-1"
    });
    shopId = shop.id;
    assert(shop.ownerUserId, "shop owner user was not created");
    createdUserIds.push(shop.ownerUserId);
    assert(shop.status === "pending_review", "new shop must require review");

    const approvedShop = await repository.approveShop(shop.id, new Date());
    assert(approvedShop?.status === "published", "shop approval did not publish the shop");
    const activeOwner = await prisma.user.findUnique({ where: { id: shop.ownerUserId }, include: { identities: true } });
    assert(activeOwner?.isActive, "approved shop owner was not activated");
    assert(activeOwner.identities.some((identity) => identity.scopeId === shop.id && identity.isActive), "approved merchant identity was not activated");

    const technicianAccount = await authRepository.registerUser({
      accountType: "technician",
      city: "Tokyo",
      email: technicianEmail,
      ip: "127.0.0.1",
      passwordHash,
      username: `Master Technician ${marker}`
    });
    const customerAccount = await authRepository.registerUser({
      accountType: "customer",
      email: customerEmail,
      ip: "127.0.0.1",
      passwordHash,
      username: `Master Customer ${marker}`
    });
    createdUserIds.push(technicianAccount.id, customerAccount.id);
    const [technicianProfile, customerProfile] = await Promise.all([
      prisma.technicianProfile.findUnique({ where: { userId: technicianAccount.id } }),
      prisma.customerProfile.findUnique({ where: { userId: customerAccount.id } })
    ]);
    assert(technicianProfile, "technician profile was not created");
    assert(customerProfile, "customer profile was not created");

    const assignedTechnician = await repository.updateTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id,
      serviceArea: "Tokyo 23 wards"
    });
    assert(assignedTechnician?.shopId === shop.id, "technician was not assigned to the shop");
    const approvedTechnician = await repository.approveTechnician({
      scope: "platform",
      technicianId: technicianProfile.id,
      shopId: shop.id,
      approvedAt: new Date()
    });
    assert(approvedTechnician?.status === "published", "technician approval failed");
    const crossShopTechnician = await repository.updateTechnician({
      scope: "merchant",
      shopId: shop.id + 1000000,
      technicianId: technicianProfile.id,
      displayName: "Must Not Update"
    });
    assert(crossShopTechnician === null, "merchant technician write crossed the authenticated shop scope");

    const updatedCustomer = await repository.updateCustomer(customerProfile.id, { city: "Osaka", membershipLevel: "silver" });
    assert(updatedCustomer?.city === "Osaka" && updatedCustomer.membershipLevel === "silver", "customer update was not persisted");

    const service = await repository.createService({
      scope: "platform",
      shopId: shop.id,
      categoryId: category.id,
      name: `Master Service ${marker}`,
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: 12000,
      durationMinutes: 60,
      status: "draft"
    });
    serviceId = service.id;
    const publishedService = await repository.updateService({
      scope: "merchant",
      shopId: shop.id,
      serviceId: service.id,
      priceAmount: 13000,
      status: "published"
    });
    assert(publishedService?.priceAmount === 13000 && publishedService.status === "published", "merchant service update failed");
    const crossShopService = await repository.updateService({
      scope: "merchant",
      shopId: shop.id + 1000000,
      serviceId: service.id,
      priceAmount: 1
    });
    assert(crossShopService === null, "merchant service write crossed the authenticated shop scope");
    const scopedServices = await repository.listServices({ scope: "merchant", shopId: shop.id, page: 1, pageSize: 20 });
    assert(scopedServices.list.some((item) => item.id === service.id), "merchant service list did not return the current shop service");

    await repository.softDeleteCustomer(customerProfile.id);
    await repository.softDeleteTechnician({ scope: "merchant", shopId: shop.id, id: technicianProfile.id });
    await repository.softDeleteShop(shop.id);
    const [deletedShop, deletedService, deletedOwner] = await Promise.all([
      prisma.shop.findUnique({ where: { id: shop.id } }),
      prisma.service.findUnique({ where: { id: service.id } }),
      prisma.user.findUnique({ where: { id: shop.ownerUserId } })
    ]);
    assert(deletedShop?.deletedAt && deletedShop.status === "archived", "shop soft delete failed");
    assert(deletedService?.deletedAt && deletedService.status === "archived", "shop soft delete did not archive its service");
    assert(deletedOwner && !deletedOwner.isActive, "shop soft delete did not deactivate its owner");

    console.log(JSON.stringify({
      database: databaseName,
      shop: { created: true, approved: true, softDeleted: true, ownerDeactivated: true },
      technician: { assigned: true, approved: true, crossShopRejected: true, softDeleted: true },
      customer: { updated: true, softDeleted: true },
      service: { created: true, published: true, crossShopRejected: true, softDeletedWithShop: true },
      status: "ok"
    }, null, 2));
  } finally {
    if (serviceId || shopId || createdUserIds.length > 0) {
      await prisma.$transaction(async (transaction) => {
        if (serviceId) await transaction.service.deleteMany({ where: { id: serviceId } });
        await transaction.auditLog.deleteMany({ where: { targetType: "User", targetId: { in: createdUserIds } } });
        await transaction.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        await transaction.technicianProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
        if (shopId) await transaction.shop.deleteMany({ where: { id: shopId } });
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
