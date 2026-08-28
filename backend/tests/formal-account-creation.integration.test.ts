import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";

const runIntegration = Boolean(process.env.ENV_FILE?.trim());
const describeIntegration = runIntegration ? describe : describe.skip;
const marker = `formal-account-creation-${randomUUID()}`;
const userIds: number[] = [];
const shopIds: number[] = [];
let prisma: PrismaClient;

const requireNeedoTest = (): void => {
  const envFile = process.env.ENV_FILE;
  if (!envFile) throw new Error("ENV_FILE is required for formal account creation integration");
  const loaded = loadDotenv({ path: envFile, override: true });
  const value = loaded.parsed?.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for formal account creation integration");
  const databaseUrl = new URL(value);
  if (
    databaseUrl.protocol !== "mysql:" ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname) ||
    databaseUrl.pathname.replace(/^\/+/, "") !== "needo_test"
  ) {
    throw new Error("formal account creation integration requires local needo_test");
  }
};

describeIntegration("formal account creation integration", () => {
  beforeAll(async () => {
    requireNeedoTest();
    const prismaModule = await import("../src/prisma/client");
    prisma = prismaModule.prisma;
  });

  afterAll(async () => {
    if (prisma && userIds.length > 0) {
      await prisma.$transaction(async (transaction) => {
        await transaction.shop.deleteMany({ where: { id: { in: shopIds } } });
        await transaction.userRole.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.publicIdentifier.deleteMany({
          where: { userIdentity: { is: { userId: { in: userIds } } } }
        });
        await transaction.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
        await transaction.user.deleteMany({ where: { id: { in: userIds } } });
      });
    }
    if (prisma) {
      const { disconnectPrisma } = await import("../src/prisma/client");
      await disconnectPrisma();
    }
  });

  it("persists only U for an admin-created user and U+B for a pending shop owner", async () => {
    const [{ UserRepository }, { BackofficeRepository }] = await Promise.all([
      import("../src/repositories/user.repository"),
      import("../src/repositories/backoffice.repository")
    ]);
    const userRepository = new UserRepository(prisma);
    const backofficeRepository = new BackofficeRepository(prisma);

    const managed = await userRepository.create({
      email: `${marker}-managed@needo.test`,
      passwordHash: "prepared-password-hash",
      username: "Managed User",
      isActive: true
    });
    userIds.push(managed.id);
    expect(managed.needoId).toMatch(/^u\d{10}$/);
    expect(managed.accountNo).toMatch(/^\d{10}$/);
    expect(managed.identities).toEqual([
      expect.objectContaining({
        type: "customer",
        isDefault: true,
        publicIdentifier: expect.objectContaining({
          publicId: managed.needoId,
          kind: "U"
        })
      })
    ]);

    const shop = await backofficeRepository.createShop({
      ownerEmail: `${marker}-owner@needo.test`,
      ownerPasswordHash: "prepared-password-hash",
      ownerUsername: "Shop Owner",
      name: "Formal Integration Shop",
      city: "Tokyo",
      address: "Tokyo"
    });
    if (!shop.ownerUserId) throw new Error("shop owner user was not created");
    userIds.push(shop.ownerUserId);
    shopIds.push(shop.id);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: shop.ownerUserId },
      include: {
        identities: {
          where: { deletedAt: null },
          include: { publicIdentifier: true },
          orderBy: { id: "asc" }
        }
      }
    });
    expect(owner.needoId).toBe(`u${owner.accountNo}`);
    expect(owner.identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "customer",
          isDefault: true,
          publicIdentifier: expect.objectContaining({ publicId: owner.needoId, kind: "U" })
        }),
        expect.objectContaining({
          type: "merchant_owner",
          isDefault: false,
          isActive: false,
          publicIdentifier: expect.objectContaining({
            publicId: `b${owner.accountNo}`,
            kind: "B"
          })
        })
      ])
    );
  });
});
