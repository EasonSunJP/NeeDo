import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";

import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_USERNAME = "NeeDo Super Admin";
const SEED_PRISMA_LOG_LEVELS: Prisma.LogLevel[] = ["error"];

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required before running the User Management seed.");
  }

  return databaseUrl;
};

export interface AdminSeedConfig {
  email: string;
  username: string;
  password: string;
}

interface SeedUserInput {
  email: string;
  username: string;
  phone?: string;
}

interface SeedIdentityInput {
  userId: number;
  type: string;
  scopeType: string;
  scopeId: number | null;
  displayName: string;
  isDefault?: boolean;
}

export const getAdminSeedConfig = (env: NodeJS.ProcessEnv = process.env): AdminSeedConfig => {
  const password = env.ADMIN_DEFAULT_PASSWORD;

  if (!password || password.trim().length === 0) {
    throw new Error("ADMIN_DEFAULT_PASSWORD is required before running the User Management seed.");
  }

  return {
    email: env.ADMIN_DEFAULT_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL,
    username: env.ADMIN_DEFAULT_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME,
    password
  };
};

const createSeedPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaMariaDb(getDatabaseUrl()),
    log: SEED_PRISMA_LOG_LEVELS
  });

const upsertSeedUser = (tx: Prisma.TransactionClient, input: SeedUserInput, passwordHash: string) =>
  tx.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      phone: input.phone ?? null,
      passwordHash,
      username: input.username,
      isActive: true
    },
    update: {
      phone: input.phone ?? null,
      username: input.username,
      isActive: true,
      deletedAt: null
    }
  });

const upsertSeedIdentity = async (
  tx: Prisma.TransactionClient,
  input: SeedIdentityInput
): Promise<void> => {
  const existing = await tx.userIdentity.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });

  if (existing) {
    await tx.userIdentity.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName,
        isDefault: input.isDefault ?? true,
        isActive: true,
        deletedAt: null
      }
    });
    return;
  }

  await tx.userIdentity.create({
    data: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      displayName: input.displayName,
      isDefault: input.isDefault ?? true,
      isActive: true
    }
  });
};

const assignSeedRole = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; roleId: number; scopeType: string; scopeId: number | null }
): Promise<void> => {
  const existing = await tx.userRole.findFirst({
    where: {
      userId: input.userId,
      roleId: input.roleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });

  if (existing) {
    await tx.userRole.update({
      where: { id: existing.id },
      data: { deletedAt: null }
    });
    return;
  }

  await tx.userRole.create({
    data: {
      userId: input.userId,
      roleId: input.roleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });
};

const seedCoreReadData = async (
  tx: Prisma.TransactionClient,
  passwordHash: string,
  roleByCode: Map<string, { id: number }>
): Promise<void> => {
  const wellnessCategory = await tx.category.upsert({
    where: { code: "wellness" },
    create: {
      code: "wellness",
      name: "Wellness",
      nameJa: "ウェルネス",
      nameEn: "Wellness",
      iconUrl: "/images/generated/search-category-salon.jpg",
      sortOrder: 10,
      isActive: true
    },
    update: {
      name: "Wellness",
      nameJa: "ウェルネス",
      nameEn: "Wellness",
      iconUrl: "/images/generated/search-category-salon.jpg",
      sortOrder: 10,
      isActive: true,
      deletedAt: null
    }
  });
  const beautyCategory = await tx.category.upsert({
    where: { code: "beauty" },
    create: {
      code: "beauty",
      name: "Beauty",
      nameJa: "美容",
      nameEn: "Beauty",
      iconUrl: "/images/generated/search-category-beauty.jpg",
      sortOrder: 20,
      isActive: true
    },
    update: {
      name: "Beauty",
      nameJa: "美容",
      nameEn: "Beauty",
      iconUrl: "/images/generated/search-category-beauty.jpg",
      sortOrder: 20,
      isActive: true,
      deletedAt: null
    }
  });
  const shopOwner = await upsertSeedUser(
    tx,
    {
      email: "seed.shop-owner@needo.local",
      username: "Aoyama Care Owner",
      phone: "+81300000001"
    },
    passwordHash
  );
  const technicianUser = await upsertSeedUser(
    tx,
    {
      email: "seed.technician@needo.local",
      username: "Mika Tanaka",
      phone: "+81300000002"
    },
    passwordHash
  );
  const customerUser = await upsertSeedUser(
    tx,
    {
      email: "seed.customer@needo.local",
      username: "Aya Customer",
      phone: "+81300000003"
    },
    passwordHash
  );

  const existingShop = await tx.shop.findFirst({
    where: { name: "Aoyama Care Studio" }
  });
  const shop = existingShop
    ? await tx.shop.update({
        where: { id: existingShop.id },
        data: {
          ownerUserId: shopOwner.id,
          description: "Private care studio for wellness and recovery services in Aoyama.",
          city: "Tokyo",
          address: "3-1 Kita Aoyama, Minato-ku",
          latitude: "35.6721000",
          longitude: "139.7239000",
          phone: "+81300000000",
          status: "published",
          isRecommended: true,
          deletedAt: null
        }
      })
    : await tx.shop.create({
        data: {
          ownerUserId: shopOwner.id,
          name: "Aoyama Care Studio",
          description: "Private care studio for wellness and recovery services in Aoyama.",
          city: "Tokyo",
          address: "3-1 Kita Aoyama, Minato-ku",
          latitude: "35.6721000",
          longitude: "139.7239000",
          phone: "+81300000000",
          status: "published",
          isRecommended: true
        }
      });

  const technician = await tx.technicianProfile.upsert({
    where: { userId: technicianUser.id },
    create: {
      userId: technicianUser.id,
      shopId: shop.id,
      displayName: "Mika Tanaka",
      bio: "Certified body care technician focused on recovery and relaxation.",
      city: "Tokyo",
      serviceArea: "Minato, Shibuya",
      yearsExperience: 8,
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-05-01T00:00:00.000Z")
    },
    update: {
      shopId: shop.id,
      displayName: "Mika Tanaka",
      bio: "Certified body care technician focused on recovery and relaxation.",
      city: "Tokyo",
      serviceArea: "Minato, Shibuya",
      yearsExperience: 8,
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-05-01T00:00:00.000Z"),
      deletedAt: null
    }
  });
  const customer = await tx.customerProfile.upsert({
    where: { userId: customerUser.id },
    create: {
      userId: customerUser.id,
      displayName: "Aya Customer",
      bio: "Prefers evening appointments and quiet private rooms.",
      city: "Tokyo",
      membershipLevel: "standard",
      isPublic: true
    },
    update: {
      displayName: "Aya Customer",
      bio: "Prefers evening appointments and quiet private rooms.",
      city: "Tokyo",
      membershipLevel: "standard",
      isPublic: true,
      deletedAt: null
    }
  });

  await upsertSeedIdentity(tx, {
    userId: shopOwner.id,
    type: "merchant_owner",
    scopeType: "shop",
    scopeId: shop.id,
    displayName: "Aoyama Care Owner"
  });
  await upsertSeedIdentity(tx, {
    userId: technicianUser.id,
    type: "technician",
    scopeType: "technician_profile",
    scopeId: technician.id,
    displayName: technician.displayName
  });
  await upsertSeedIdentity(tx, {
    userId: customerUser.id,
    type: "customer",
    scopeType: "customer_profile",
    scopeId: customer.id,
    displayName: customer.displayName
  });

  const merchantOwnerRole = roleByCode.get("merchant_owner");
  const technicianRole = roleByCode.get("technician");
  const customerRole = roleByCode.get("customer");
  if (merchantOwnerRole) {
    await assignSeedRole(tx, {
      userId: shopOwner.id,
      roleId: merchantOwnerRole.id,
      scopeType: "shop",
      scopeId: shop.id
    });
  }
  if (technicianRole) {
    await assignSeedRole(tx, {
      userId: technicianUser.id,
      roleId: technicianRole.id,
      scopeType: "technician_profile",
      scopeId: technician.id
    });
  }
  if (customerRole) {
    await assignSeedRole(tx, {
      userId: customerUser.id,
      roleId: customerRole.id,
      scopeType: "customer_profile",
      scopeId: customer.id
    });
  }

  const shiatsuService = await upsertSeedService(tx, {
    name: "Shiatsu Recovery",
    categoryId: wellnessCategory.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    description: "60 minute recovery session for shoulders, back, and legs.",
    city: "Tokyo",
    serviceMode: "store",
    priceAmount: "8800.00",
    durationMinutes: 60,
    isRecommended: true,
    sortOrder: 10
  });
  const facialService = await upsertSeedService(tx, {
    name: "Hydration Facial Care",
    categoryId: beautyCategory.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    description: "Moisture-focused facial care for dry skin seasons.",
    city: "Tokyo",
    serviceMode: "store",
    priceAmount: "12800.00",
    durationMinutes: 75,
    isRecommended: true,
    sortOrder: 20
  });
  const seedSlotStarts = [
    new Date("2026-05-26T01:00:00.000Z"),
    new Date("2026-05-26T02:30:00.000Z"),
    new Date("2026-05-27T01:00:00.000Z")
  ];

  for (const startsAt of seedSlotStarts) {
    const endsAt = new Date(startsAt.getTime() + shiatsuService.durationMinutes * 60 * 1000);
    const availability = await upsertSeedAvailability(tx, {
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });

    await upsertSeedScheduleSlot(tx, {
      availabilityId: availability.id,
      serviceId: shiatsuService.id,
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });
  }

  const facialStartsAt = new Date("2026-05-27T03:00:00.000Z");
  const facialEndsAt = new Date(facialStartsAt.getTime() + facialService.durationMinutes * 60 * 1000);
  const facialAvailability = await upsertSeedAvailability(tx, {
    shopId: shop.id,
    technicianProfileId: technician.id,
    startsAt: facialStartsAt,
    endsAt: facialEndsAt,
    capacity: 1
  });

  await upsertSeedScheduleSlot(tx, {
    availabilityId: facialAvailability.id,
    serviceId: facialService.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    startsAt: facialStartsAt,
    endsAt: facialEndsAt,
    capacity: 1
  });

  await upsertSeedMedia(tx, {
    entityType: "shop",
    entityId: shop.id,
    shopId: shop.id,
    usageType: "cover",
    url: "/images/generated/home-merchant-feature.jpg",
    altText: "Aoyama Care Studio private room"
  });
  await upsertSeedMedia(tx, {
    entityType: "technician",
    entityId: technician.id,
    technicianProfileId: technician.id,
    usageType: "avatar",
    url: "/images/generated/profile-technician-mika.jpg",
    altText: "Mika Tanaka portrait"
  });
  await upsertSeedMedia(tx, {
    entityType: "customer",
    entityId: customer.id,
    customerProfileId: customer.id,
    usageType: "avatar",
    url: "/images/generated/profile-customer-aya.jpg",
    altText: "Aya Customer avatar"
  });
  await upsertSeedMedia(tx, {
    entityType: "service",
    entityId: shiatsuService.id,
    serviceId: shiatsuService.id,
    usageType: "cover",
    url: "/images/generated/service-shiatsu-recovery.jpg",
    altText: "Shiatsu recovery session"
  });
  await upsertSeedMedia(tx, {
    entityType: "service",
    entityId: facialService.id,
    serviceId: facialService.id,
    usageType: "cover",
    url: "/images/generated/service-facial-care.jpg",
    altText: "Hydration facial care"
  });

  await upsertSeedReviewSummary(tx, {
    targetType: "shop",
    targetId: shop.id,
    shopId: shop.id,
    ratingAverage: "4.80",
    reviewCount: 128,
    highlights: ["clean", "kind", "private"]
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "technician",
    targetId: technician.id,
    technicianProfileId: technician.id,
    ratingAverage: "4.90",
    reviewCount: 96,
    highlights: ["skilled", "gentle"]
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "customer",
    targetId: customer.id,
    customerProfileId: customer.id,
    ratingAverage: "5.00",
    reviewCount: 12,
    highlights: ["punctual", "respectful"]
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "service",
    targetId: shiatsuService.id,
    serviceId: shiatsuService.id,
    ratingAverage: "4.80",
    reviewCount: 72,
    highlights: ["recovery", "relaxing"]
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "service",
    targetId: facialService.id,
    serviceId: facialService.id,
    ratingAverage: "4.70",
    reviewCount: 41,
    highlights: ["hydrating", "calm"]
  });
};

const upsertSeedService = async (
  tx: Prisma.TransactionClient,
  input: {
    name: string;
    categoryId: number;
    shopId: number;
    technicianProfileId: number;
    description: string;
    city: string;
    serviceMode: string;
    priceAmount: string;
    durationMinutes: number;
    isRecommended: boolean;
    sortOrder: number;
  }
) => {
  const existing = await tx.service.findFirst({
    where: { name: input.name, shopId: input.shopId }
  });
  const data = {
    categoryId: input.categoryId,
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    description: input.description,
    city: input.city,
    serviceMode: input.serviceMode,
    priceAmount: input.priceAmount,
    currency: "JPY",
    durationMinutes: input.durationMinutes,
    status: "published",
    isRecommended: input.isRecommended,
    sortOrder: input.sortOrder,
    deletedAt: null
  };

  return existing
    ? tx.service.update({
        where: { id: existing.id },
        data
      })
    : tx.service.create({
        data: {
          ...data,
          name: input.name
        }
      });
};

const upsertSeedAvailability = async (
  tx: Prisma.TransactionClient,
  input: {
    shopId: number;
    technicianProfileId: number;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }
) => {
  const existing = await tx.availability.findFirst({
    where: {
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      startsAt: input.startsAt,
      endsAt: input.endsAt
    }
  });
  const data = {
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    isActive: true,
    deletedAt: null
  };

  return existing
    ? tx.availability.update({
        where: { id: existing.id },
        data
      })
    : tx.availability.create({ data });
};

const upsertSeedScheduleSlot = async (
  tx: Prisma.TransactionClient,
  input: {
    availabilityId: number;
    serviceId: number;
    shopId: number;
    technicianProfileId: number;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }
) => {
  const existing = await tx.scheduleSlot.findFirst({
    where: {
      serviceId: input.serviceId,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      startsAt: input.startsAt,
      endsAt: input.endsAt
    }
  });
  const data = {
    availabilityId: input.availabilityId,
    serviceId: input.serviceId,
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    bookedCount: 0,
    status: "AVAILABLE" as const,
    deletedAt: null
  };

  return existing
    ? tx.scheduleSlot.update({
        where: { id: existing.id },
        data
      })
    : tx.scheduleSlot.create({ data });
};

const upsertSeedMedia = async (
  tx: Prisma.TransactionClient,
  input: {
    entityType: string;
    entityId: number;
    categoryId?: number;
    serviceId?: number;
    shopId?: number;
    technicianProfileId?: number;
    customerProfileId?: number;
    usageType: string;
    url: string;
    altText: string;
  }
): Promise<void> => {
  const existing = await tx.mediaAsset.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      usageType: input.usageType,
      url: input.url
    }
  });
  const data = {
    categoryId: input.categoryId ?? null,
    serviceId: input.serviceId ?? null,
    shopId: input.shopId ?? null,
    technicianProfileId: input.technicianProfileId ?? null,
    customerProfileId: input.customerProfileId ?? null,
    mimeType: "image/jpeg",
    usageType: input.usageType,
    width: 1200,
    height: 800,
    altText: input.altText,
    sortOrder: 10,
    isActive: true,
    deletedAt: null
  };

  if (existing) {
    await tx.mediaAsset.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await tx.mediaAsset.create({
    data: {
      ...data,
      entityType: input.entityType,
      entityId: input.entityId,
      url: input.url
    }
  });
};

const upsertSeedReviewSummary = (
  tx: Prisma.TransactionClient,
  input: {
    targetType: string;
    targetId: number;
    shopId?: number;
    serviceId?: number;
    technicianProfileId?: number;
    customerProfileId?: number;
    ratingAverage: string;
    reviewCount: number;
    highlights: string[];
  }
) =>
  tx.reviewSummary.upsert({
    where: {
      targetType_targetId: {
        targetType: input.targetType,
        targetId: input.targetId
      }
    },
    create: {
      targetType: input.targetType,
      targetId: input.targetId,
      shopId: input.shopId ?? null,
      serviceId: input.serviceId ?? null,
      technicianProfileId: input.technicianProfileId ?? null,
      customerProfileId: input.customerProfileId ?? null,
      ratingAverage: input.ratingAverage,
      reviewCount: input.reviewCount,
      latestReviewAt: new Date("2026-05-20T00:00:00.000Z"),
      highlights: input.highlights
    },
    update: {
      shopId: input.shopId ?? null,
      serviceId: input.serviceId ?? null,
      technicianProfileId: input.technicianProfileId ?? null,
      customerProfileId: input.customerProfileId ?? null,
      ratingAverage: input.ratingAverage,
      reviewCount: input.reviewCount,
      latestReviewAt: new Date("2026-05-20T00:00:00.000Z"),
      highlights: input.highlights,
      deletedAt: null
    }
  });

export const seedUserManagement = async (
  prisma: PrismaClient = createSeedPrismaClient()
): Promise<void> => {
  const adminConfig = getAdminSeedConfig();
  const adminPasswordHash = await hash(adminConfig.password, BCRYPT_ROUNDS);
  const rolePermissionAssignments = buildRolePermissionAssignments();

  await prisma.$transaction(async (tx) => {
    for (const role of SYSTEM_ROLES) {
      await tx.role.upsert({
        where: { code: role.code },
        create: {
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem
        },
        update: {
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          deletedAt: null
        }
      });
    }

    for (const permission of SYSTEM_PERMISSIONS) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: {
          code: permission.code,
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem
        },
        update: {
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem,
          deletedAt: null
        }
      });
    }

    const roles = await tx.role.findMany({
      where: {
        code: { in: SYSTEM_ROLES.map((role) => role.code) },
        deletedAt: null
      }
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: SYSTEM_PERMISSIONS.map((permission) => permission.code) },
        deletedAt: null
      }
    });
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByCode = new Map(
      permissions.map((permission) => [permission.code, permission])
    );

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissionAssignments)) {
      const role = roleByCode.get(roleCode);
      if (!role) {
        throw new Error(`Role seed failed: missing role ${roleCode}.`);
      }

      for (const permissionCode of permissionCodes) {
        const permission = permissionByCode.get(permissionCode);
        if (!permission) {
          throw new Error(`Permission seed failed: missing permission ${permissionCode}.`);
        }

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id
            }
          },
          create: {
            roleId: role.id,
            permissionId: permission.id
          },
          update: {
            deletedAt: null
          }
        });
      }
    }

    const adminUser = await tx.user.upsert({
      where: { email: adminConfig.email },
      create: {
        email: adminConfig.email,
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true
      },
      update: {
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true,
        deletedAt: null
      }
    });

    const adminIdentity = await tx.userIdentity.findFirst({
      where: {
        userId: adminUser.id,
        type: "platform",
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminIdentity) {
      await tx.userIdentity.update({
        where: { id: adminIdentity.id },
        data: {
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId: adminUser.id,
          type: "platform",
          scopeType: "global",
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true
        }
      });
    }

    const adminRole = roleByCode.get("admin");
    if (!adminRole) {
      throw new Error("Admin user seed failed: missing admin role.");
    }

    const adminUserRole = await tx.userRole.findFirst({
      where: {
        userId: adminUser.id,
        roleId: adminRole.id,
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminUserRole) {
      await tx.userRole.update({
        where: { id: adminUserRole.id },
        data: { deletedAt: null }
      });
    } else {
      await tx.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          scopeType: "global"
        }
      });
    }

    await seedCoreReadData(tx, adminPasswordHash, roleByCode);
  });
};

const runSeed = async (): Promise<void> => {
  const prisma = createSeedPrismaClient();

  try {
    await seedUserManagement(prisma);
    console.log("User Management and Step 08 core read seed completed.");
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
